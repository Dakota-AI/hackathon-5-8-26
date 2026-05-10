# Hackathon Critical Path

> What to ship to demo "multiple users running agents concurrently". Ordered by leverage, not nice-to-haves.

[← back to wiki index](README.md)

Goal recap (per user spec):
- Multiple users running agents concurrently.
- One ECS resident container per user, with multiple logical agents inside that container.
- Access control = `userId` filtering on DynamoDB queries. **No** AccessCodes, Cognito groups, Workspaces, deep IAM.
- Stay on AWS. **No** Cloudflare.

---

## What works already (no work needed)

- ✅ Cognito JWT propagates from web → Control API → DynamoDB rows → Step Functions → ECS env vars → events. See [run-creation.md](flows/run-creation.md).
- ✅ DDB tables PAY_PER_REQUEST; no per-user quota tuning needed. See [stacks.md](infrastructure/stacks.md#statestack).
- ✅ WebSocket relay filters fan-out by `userId` — cross-user leak prevented. See [realtime-api.md](services/realtime-api.md).
- ✅ ECS Fargate concurrency: one task per run, no manual cap; safe at hackathon scale.
- ✅ **Web client redesigned and wired to real backend** (commit `b515e14`): real Cognito, real Control API for every product surface (work-items / runs / artifacts / approvals / surfaces / agent-profiles / admin), real GenUI renderer, workspace switcher.
- ✅ All Control API surfaces real (no more 501 stubs): `GET /runs`, artifacts read + presigned download, data-source-refs CRUD, surfaces CRUD with validation, approvals CRUD + decision.
- ✅ **Resident runner real Hermes** (commit `d8c2a22`): image baked with `nousresearch/hermes-agent:latest`, `runAdapter` defaults to `hermes-cli`, manual ECS task `agents-cloud-dev-resident-runner:4` reached OpenAI Codex backend.
- ✅ Flutter auth + transport layer real (commit `b4d18fc`): Cognito sign-in, `ControlApi` HTTP client, `RealtimeClient` wss client. (Render paths still consume fixtures — see #4 below.)

---

## Critical path (in order)

### 1. Make the worker actually call a model — see [agent-runtime.md](services/agent-runtime.md)

✅ **Resolved for the resident runner.** Commit `d8c2a22` baked Hermes into `Dockerfile.resident` (Stage 2 = `nousresearch/hermes-agent:latest`). The smoke adapter was removed; `runAdapter` defaults to `hermes-cli`. Live ECS task reached OpenAI Codex backend (`agents-cloud-dev-resident-runner:4`).

⚠️ **Stateless smoke worker (the SFN-driven path) still uses smoke mode.** If the demo flow goes through `POST /runs` → SFN → stateless ECS (which is what web's "Create run" does today), it returns canned text. To fix:

- [ ] Bake Hermes into `services/agent-runtime/Dockerfile` like the resident did, OR
- [ ] Stop using SFN/stateless worker entirely once #2 (resident dispatcher) ships.
- [ ] Stop hardcoding `seq=2,3,4` in `worker.ts` — use a counter so retries don't crash on conditional writes.

⚠️ Provider quota: the live exercise hit `429 usage_limit_reached` on Codex. Demo needs a billing account with quota.

### 2. ~~Per-user resident runner dispatch~~ — ✅ DONE (see [multi-user-routing.md](flows/multi-user-routing.md))

**Implemented.** `services/control-api/src/runner-dispatcher.ts` (pure logic) + `runner-dispatcher-aws.ts` (AWS adapter with `EcsRunTaskLauncher`, `EcsTaskObserver`, `FetchWakeClient`, `CachedSecretsManagerTokenProvider`). Implements `ExecutionStarter` so `create-run.ts` is unchanged; `handlers.ts` auto-picks it when `RESIDENT_RUNNER_TASK_DEFINITION_ARN` is set. CDK grants IAM (ecs:RunTask, ecs:DescribeTasks/StopTask, iam:PassRole, secretsmanager:GetSecretValue) and injects env vars. 8 dedicated tests pass.

**To activate after `cdk deploy`:** the new env vars are auto-set by CDK; no manual override needed. See [HACKATHON_CRITICAL_PATH.md#deployment-checklist](#deployment-checklist) below.

### 2. ARCHIVED scope (kept for reference)

Implement the missing dispatcher in `services/control-api/src/`:

```
on POST /runs (or new POST /agents/{agentId}/wake):
  1. lookup UserRunner by userId  (already real)
  2. if missing or status != "running":
       a. ecs:RunTask  ResidentRunnerTaskDefinition
          with overrides: USER_ID, RUNNER_ID, ORG_ID, WORKSPACE_ID
          inject RUNNER_API_TOKEN from ResidentRunnerApiToken secret
          inject HERMES_AUTH_JSON_BOOTSTRAP from HERMES_AUTH_SECRET
       b. write UserRunner row { status: starting, taskArn, privateIp }
       c. wait for /health to return ok (poll up to 30s)
  3. POST  http://<privateIp>:8787/wake
       Authorization: Bearer <RUNNER_API_TOKEN>
       body: { agentId, runId, taskId, objective }
  4. respond 202 with runId
```

- [ ] Add `RunTaskCommand` (`@aws-sdk/client-ecs`) caller to `services/control-api/src/runner-dispatcher.ts` (new file)
- [ ] Add IAM permission to the createRun Lambda role: `ecs:RunTask` scoped to resident family ARN, `iam:PassRole` to resident task role
- [ ] **Reachability:** simplest hackathon path — have the resident task self-register its private IP in the `UserRunner` row on boot via `POST /user-runners/{runnerId}/heartbeat`. Lambda reads the row and uses the IP. (No ALB, no Cloud Map.)
- [ ] Update `query-runs.ts` and `create-run.ts` to optionally route through the dispatcher
- [ ] Add CDK route binding for `POST /agents/{agentId}/wake` → dispatcher Lambda

### 3. Resident runner durable adapters + concurrent agents — see [agent-runtime.md](services/agent-runtime.md)

`services/agent-runtime/src/resident-runner.ts` still writes events to local NDJSON only. If the task dies, work is lost. Realtime relay never sees resident events because nothing puts them in `EventsTable`.

- [ ] Add injectable `EventSink` port → mirrors NDJSON events to `EventsTable` (so realtime relay sees them)
- [ ] Add `ArtifactSink` port → mirrors artifacts to S3 + `ArtifactsTable` row
- [ ] Add `RunnerStateStore` port → heartbeats to `UserRunnersTable.lastHeartbeatAt`
- [ ] Add `SnapshotStore` port → S3 + `RunnerSnapshotsTable` (provisioned, never written today)
- [ ] Replace serial `for (agent of agents)` loop in `wake()` with `Promise.all` (or worker pool)
- [ ] Wire `AgentInstancesTable` writes per registered agent

### 4. Make Flutter pages consume real providers — see [flutter.md](clients/flutter.md)

✅ **Auth + transport layer is real after `b4d18fc`.** Sign-in, sign-up, confirm, sign-out, ID token fetch, `controlApiProvider`, `realtimeClientProvider` — all wired.

❌ **Page bodies still call `FixtureWorkRepository`.** The remaining work is migrating each render path:

- [ ] Replace `FixtureWorkRepository`/`kanbanWorkRepositoryProvider` calls with reads against `controlApiProvider.listWorkItems(...)` and friends
- [ ] Wire `_AgentDetailPage` Activity tab to `realtimeClientProvider.subscribeRun(runId)` instead of fixture events
- [ ] Wire `_ArtifactsTab` to `controlApiProvider.listArtifacts(workItemId)`
- [ ] Wire `_ApprovalsTab` to a new `ControlApi.listApprovals` (add it — currently `ControlApi` has 8 endpoints, no approvals)
- [ ] Wire `_GenUiLabPage._LiveGenUiSurfaceCard` to subscribe to `a2ui.delta` events from the realtime client (would also need a producer; see #5)

If time-boxed, pick **just** the Agents workspace migration. Demo from web for everything else.

### 5. Have agents emit `tool.approval` and `a2ui.delta` events

The clients render both, but no producer fires them in the wild today. Local harness emits `tool.approval` already (`services/agent-runtime/src/local-harness.ts:365`); generalizing to the live worker is the work.

- [ ] In resident runner adapter, gate medium/high-risk tools on a `tool.approval` request envelope (`buildToolApprovalEvent({kind: "request", ...})`).
- [ ] Resident runner pauses agent until `POST /approvals/{id}/decision` writes the decision back into `EventsTable`.
- [ ] In resident runner, after a successful tool/output that should yield UI, emit `buildCanonicalEvent({type: "a2ui.delta", payload: {surfaceId, catalogId, message: {createSurface | updateComponents}}})`.
- [ ] Web `<GenUiSurface/>` already renders surfaces fetched via `/work-items/:id/surfaces`; for live patches, subscribe to `a2ui.delta` events on the run channel.

### 6. ~~`GET /runs` user-listing~~

✅ Done in commit `f550bad`.

### 7. ~~Artifacts read endpoints~~

✅ Done in commits `76505c3` (read endpoints) and `0c60353` (presigned download). Web `<ArtifactsBoard/>` consumes them.

### 8. ~~Approvals~~

✅ Done in commit `f550bad` (API) and `b515e14` (web `<ApprovalsBoard/>` UI). Outstanding: worker producer (covered in #5).

---

## Explicit non-goals (skip for hackathon)

See [gaps.md](gaps.md) for the full skip list.

- 🗑️ AccessCodes / WorkspaceMemberships / Cognito groups (table-routing by userId is enough)
- 🗑️ Cloudflare realtime (stay on AWS WebSocket)
- 🗑️ Preview ingress / wildcard preview hosting
- 🗑️ Miro, GitHub, self-improvement
- 🗑️ Builder runtime, agent-manager, event-relay (services with README only — keep the READMEs as design docs, don't implement)
- 🗑️ EFS / hot POSIX workspace
- 🗑️ Production observability (CloudWatch logs are enough)
- 🗑️ CI/CD (run tests locally before commit)
- 🗑️ Deep IAM least-privilege

---

## Deployment checklist

After `cdk deploy agents-cloud-dev-control-api` (which now depends on runtime/cluster/network):

1. The createRun Lambda automatically receives `RESIDENT_RUNNER_TASK_DEFINITION_ARN` and friends as env vars; `DispatcherExecutionStarter.isConfigured()` returns true and the dispatcher path activates.
2. First `POST /runs` from a user with no `UserRunner` row will:
   - Auto-create a row with status=`starting`, placementTarget=`ecs-fargate`.
   - Call `ecs:RunTask` against the resident family with overrides `USER_ID/RUNNER_ID/WORKSPACE_ID/ORG_ID`.
   - Inject `RUNNER_API_TOKEN` and `HERMES_AUTH_JSON_BOOTSTRAP` via Secrets Manager.
   - Poll `ecs:DescribeTasks` until `lastStatus=RUNNING` and the container ENI exposes a `privateIp`.
   - Persist `privateIp`, `runnerEndpoint=http://<ip>:8787`, status=`running`, taskArn into `UserRunnersTable`.
   - POST `/wake` with the bearer token.
3. Subsequent `POST /runs` from the same user reuse the existing runner — no relaunch.
4. **Pre-req:** the Hermes auth secret at `agents-cloud/<env>/resident-runner/hermes-auth-json` must contain a valid Hermes auth.json (the runner already pulls it via `HERMES_AUTH_JSON_BOOTSTRAP`). Without it, the container starts but the model call fails. See [agent-runtime.md](services/agent-runtime.md).

## Suggested time budget

| # | Task | Rough size | Status |
|---|---|---|---|
| 1 | Stateless smoke worker → real (or retire path) | 0–6 hr | resident already real; smoke can be retired |
| 2 | **Resident runner dispatcher** | 1–2 days | ✅ **shipped** |
| 3 | Resident runner durable adapters | half day | remaining |
| 4 | Flutter render paths consume real providers | half day per page | remaining |
| 5 | Worker producers for `tool.approval` and `a2ui.delta` | half day | remaining |

If you have **1 day**, ship #3 (durable adapters) so multi-user actually persists.
If you have **2 days**, add #5 (real approval / GenUI events).
If you have **3+ days**, add #4 (Flutter parity) and #1 (retire the SFN smoke path).
