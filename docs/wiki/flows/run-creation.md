# Flow: Run Creation (end-to-end)

[← wiki index](../README.md) · [ARCHITECTURE](../ARCHITECTURE.md) · [multi-user routing](multi-user-routing.md)

> Forensic step-by-step trace of what happens when a user submits an objective. Every layer cited with file path.

## 0. Canonical event schema (the contract)

Every event is a `CanonicalEventEnvelope<TPayload>` defined in `packages/protocol/src/events.ts:39-64`.
Required fields: `id`, `type` (matching `[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+`), `seq`, `createdAt`, `orgId`, `userId`, `workspaceId`, `runId`, `source.{kind,name}`, `payload`.

Concrete event types in use today:
- `run.status` (`buildRunStatusEvent`, line 142)
- `artifact.created` (`buildArtifactCreatedEvent`, line 168)
- `tool.approval` (line 186, currently used only by local-harness)

The control-api and worker share this builder via the `@agents-cloud/protocol` workspace package — every row in the `EventsTable` is shape-compatible with the realtime relay's parser.

---

## 1. UI → Control API

User submits the objective in `apps/web/components/command-center.tsx:233` (`onSubmit`). Form posts:

```
POST {NEXT_PUBLIC_AGENTS_CLOUD_API_URL}/runs
Authorization: Bearer <Cognito ID token>
Body: { workspaceId: "workspace-web", objective, idempotencyKey }
```

- `createControlApiRun` at `apps/web/lib/control-api.ts:157`.
- ⚠️ `workspaceId` is **hardcoded `"workspace-web"`** at `command-center.tsx:251`. All web users share one workspace key.
- Idempotency key is a deterministic browser hash `web-<base36-time>-<hash>` (`control-api.ts:515`); refresh within the same second collapses to same run.

API Gateway routes `POST /runs` to `CreateRunFunction` Lambda with the `HttpJwtAuthorizer` (Cognito-verified ID token).

✅ **Real.** JWT enforced before Lambda runs.

---

## 2. Control API handler → DynamoDB

`createRunHandler` (`services/control-api/src/handlers.ts:16`) extracts `userId` via `userFromEvent` (`handlers.ts:391`):
```js
event.requestContext.authorizer.jwt.claims.sub  // throws if missing
```

Calls `createRun` (`services/control-api/src/create-run.ts:19`):

1. **Idempotency probe** (lines 32-56):
   - `idempotencyScope = "${userId}#${workspaceId}#${idempotencyKey}"`
   - Query GSI `by-idempotency-scope` on RunsTable (`dynamo-store.ts:324`)
   - On hit with existing `executionArn`: return 202.
   - On hit without: restart Step Functions, patch row.

2. **Build three records** (lines 63-104):
   - `RunRecord` (PK `workspaceId`, SK `runId`)
   - `TaskRecord` (PK `runId`, SK `taskId`)
   - `EventRecord` for `run.status: queued` at `seq=1` (uses `buildRunStatusEvent`)

3. **`createRunLedger` TransactWrite** (`dynamo-store.ts:246-272`):
   - Atomic write of all three rows
   - `attribute_not_exists` conditions on composite keys → no duplicate run, seq=1 unique

Tables: `RUNS_TABLE`, `TASKS_TABLE`, `EVENTS_TABLE`. EventsTable has `StreamViewType.NEW_IMAGE` enabled — that triggers the realtime relay.

✅ **Real.** Idempotent, transactional.

---

## 3. Control API → Step Functions

`createRun` line 108: `executions.startExecution(...)` → `step-functions.ts:18-39`. Issues `StartExecutionCommand` with:
- `name: input.runId` (a re-attempt with same runId → `ExecutionAlreadyExists` error → second idempotency layer)
- `input`: `{runId, taskId, workspaceId, workItemId:"", userId, objective}`

Returned `executionArn` is patched onto the run row via `updateRunExecution` (`dynamo-store.ts:298`).

✅ **Real.**

---

## 4. Step Functions → ECS RunTask

State machine at `infra/cdk/src/stacks/orchestration-stack.ts:26-65`. Single-state `CustomState` of type `Task`:

```
Resource: arn:aws:states:::ecs:runTask.sync
Parameters:
  Cluster: <ClusterName>
  TaskDefinition: agents-cloud-<env>-agent-runtime  (family, not pinned revision)
  LaunchType: FARGATE
  AssignPublicIp: DISABLED
  NetworkConfiguration: WorkerSecurityGroup + private subnets
  Overrides:
    ContainerOverrides:
      - Name: agent-runtime
        Environment:
          RUN_ID, TASK_ID, WORKSPACE_ID, WORK_ITEM_ID, USER_ID, OBJECTIVE  (from input)
Timeout: 2h
```

⚠️ **No Choice / Catch / Retry / Parallel.** Failure to start ECS task fails the whole execution, run row stays at `queued`. No DLQ, no compensation.

✅ **Real but minimal.**

---

## 5. ECS task → agent-runtime worker

Container entrypoint: `services/agent-runtime/src/index.ts:7`. Reads env (`mustEnv("USER_ID")` etc.), constructs `DynamoEventSink`, `AwsArtifactSink`, `CliHermesRunner`, calls `executeRun` (`worker.ts:17`).

Hermes runner gated by `HERMES_RUNNER_MODE`:
- `services/agent-runtime/src/hermes-runner.ts:26-38`: if `smoke`, returns canned `"Hermes smoke runner completed the ECS worker lifecycle."`. **No model call.**
- Lines 40-57: `cli` branch shells out to `hermes chat -q <prompt>` — but **the `hermes` binary is not in the Dockerfile**. So `cli` mode fails at `spawn`.

CDK default: **smoke** (`runtime-stack.ts:120`).

⚠️ **Smoke today.** Structural plumbing (events, artifacts, status) is real; agent intelligence is a placeholder.

---

## 6. Worker → DynamoDB

`executeRun` (`worker.ts:17`) emits a fixed sequence of writes:

| seq | event | other writes |
|---|---|---|
| 2 | `run.status:running` | RUNS row update; TASKS row update |
| 3 | `artifact.created` | S3 PutObject; ArtifactsTable PutItem |
| 4 | `run.status:succeeded` | RUNS row update; TASKS row update |

Or on error catch:

| seq | event |
|---|---|
| 3 | `run.status:failed` |

S3 key: `workspaces/{workspaceId}/runs/{runId}/artifacts/artifact-{taskId}-0001/hermes-report.md`. Bucket is `WorkspaceLiveArtifactsBucket`. Artifact body rendered by `renderHermesReport` (`worker.ts:129`).

⚠️ **Important fragility:**
- `seq` numbers are hardcoded constants (`worker.ts:22, 49, 68`).
- Conditional writes use `attribute_not_exists(runId) AND attribute_not_exists(seq)`.
- Any retry hits `ConditionalCheckFailedException` and crashes.
- `artifactIdForAttempt` is hardcoded `-0001` (`worker.ts:110-113`) — exactly one artifact per run.

✅ **Real plumbing**, ⚠️ fragile under retry/concurrency.

---

## 7. DynamoDB Streams → Realtime relay

CDK wiring: `infra/cdk/src/stacks/realtime-api-stack.ts:114-120`:
```js
new DynamoEventSource(eventsTable, {
  startingPosition: LATEST,
  batchSize: 25,
  retryAttempts: 3,
})
```

Handler `services/realtime-api/src/relay.ts:7-17`:
1. For each `INSERT|MODIFY` record:
   - `unmarshall` NEW_IMAGE.
   - Validate via `isRealtimeEventRecord` (line 99). Malformed → drop.
   - `publishRealtimeEvent` (line 19):
     - `store.listConnectionsForRun(workspaceId, runId)` → query `pk=TOPIC#run:{ws}:{run}`.
     - Filter `c.userId === event.userId`. **Worker events always include userId**, so cross-user delivery is prevented.
     - `postToConnection` via API Gateway Management API.
     - On `GoneException` → cleanup connection row.

✅ **Real.** Authorization at this layer is by-construction.

---

## 8. WebSocket → web client

WebSocket `$connect` goes through `authorizerHandler` (`services/realtime-api/src/auth.ts:30-48`), `aws-jwt-verify` against the same Cognito user pool. Verified `sub` becomes the connection's `userId`, persisted on connect (`handlers.ts:33-46`). `subscribeRun` (handlers.ts:75-83) writes a topic row including `userId`.

Web subscriber: `apps/web/components/command-center.tsx:153-231`:
1. After `createControlApiRun` returns, opens `new WebSocket(buildRealtimeWebSocketUrl(url, idToken))`.
2. Sends `subscribeRun`.
3. Merges incoming events via `parseRealtimeRunEvent` → `mergeRunEvents`.
4. Polls `GET /runs/{runId}/events?afterSeq=...` every 7.5s as backfill.

✅ **Real.** Cognito ID token verified at WS handshake; userId pinned to connection record.

---

## Artifacts produced today

- S3 object: `s3://<workspace-live-artifacts-bucket>/workspaces/{workspaceId}/runs/{runId}/artifacts/artifact-{taskId}-0001/hermes-report.md` (markdown, content-type `text/markdown; charset=utf-8`).
- ArtifactsTable row with bucket/key/uri pointer.
- `artifact.created` event in EventsTable.
- Exactly one artifact per run.

---

## Authentication / authorization summary

| Layer | Mechanism | File |
|---|---|---|
| `POST /runs` (and all HTTP) | API Gateway HttpJwtAuthorizer | control-api-stack.ts:36 |
| Lambda extracts userId | `event.requestContext.authorizer.jwt.claims.sub` | handlers.ts:391 |
| `GET /runs/{runId}` ownership | `run.userId !== user.userId → 404` | query-runs.ts:14 |
| `GET /runs/{runId}/events` ownership | same userId check | query-runs.ts:31-34 |
| `/admin/*` | `isAdminUser` against `ADMIN_EMAILS` | query-runs.ts:130 |
| WebSocket connect | `aws-jwt-verify` Cognito ID token | auth.ts:30-48 |
| Stream relay fanout | drops events whose userId !== connection userId | relay.ts:25 |
| ECS worker | task role; no JWT (trusted because launched only by SFN) | runtime-stack.ts:250-272 |
| **Workspace check** | **Not enforced anywhere.** workspaceId is a label. | — |

---

## "List runs for user X" — does NOT exist

There is **no `GET /runs` user-listing route.** ControlApiStack only provisions `POST /runs`, `GET /runs/{runId}`, `GET /runs/{runId}/events`, `GET /admin/runs`, `GET /admin/runs/{runId}/events`.

The `runsTable` does have a GSI `by-user-created-at` (state-stack.ts:48-53) but `ControlApiStore` (ports.ts:143-159) has no `listRunsForUser` method.

`/admin/runs` uses `listRecentRuns` (dynamo-store.ts:337) which is a **Scan** — does not filter by user.

**Today, a returning user cannot see their prior runs at all.** Web compensates with a per-session local ledger (`lib/run-ledger.ts`) that loses state on refresh.

→ See [HACKATHON_CRITICAL_PATH.md#6](../HACKATHON_CRITICAL_PATH.md) for the fix.

---

## What breaks if 5 users hit this concurrently

1. ⚠️ **Single shared workspace.** Web hardcodes `workspaceId: "workspace-web"`. All five users' runs land in one workspace partition of `runsTable`.
2. ⚠️ **No `GET /runs` listing.** Five users each see only the run they created in their current tab.
3. ✅ Idempotency safe — `(userId, workspaceId, key)` scope prevents collision; UUID runIds avoid SFN name collision.
4. ⚠️ **Smoke worker** — all five "succeed" with canned smoke output.
5. ✅ ECS Fargate concurrency — 5 tasks × (512 CPU / 1024 MiB) is trivial.
6. ⚠️ **No backpressure or queue.** 100 concurrent users would hit Fargate launch quotas (default 100/min).
7. ⚠️ **Hardcoded seq numbers.** Spot interruption / container restart → ConditionalCheckFailed → run crashes.
8. ⚠️ Run/task status updates aren't CAS — concurrent writers can clobber.
9. ⚠️ Realtime relay batchSize=25; one stale connection that doesn't throw `GoneException` blocks delivery to others in batch.
10. ⚠️ Admin `/admin/runs` is `Scan` — fine at hundreds, walks whole table at thousands.
11. ⚠️ `ADMIN_EMAILS` baked into CDK source.
12. ⚠️ WebSocket token in URL query string (logged by API Gateway).
13. ⚠️ No tenant-isolation at IAM layer — row filters are app-enforced only.

### Bottom line

**Pipeline (HTTP → SFN → ECS → DDB → Streams → WebSocket → UI) is real, idempotent, JWT-authenticated end-to-end, and survives 5 concurrent users.** What it actually delivers is a smoke artifact. The worker is brittle on retry, no per-user run listing, all UI lives in one shared workspace string.

→ Continue to [multi-user-routing.md](multi-user-routing.md) for the resident-runner placement gap.
