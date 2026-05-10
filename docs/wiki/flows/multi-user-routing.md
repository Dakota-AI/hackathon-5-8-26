# Flow: Multi-User Routing

[← wiki index](../README.md) · [run-creation flow](run-creation.md) · [agent-runtime](../services/agent-runtime.md)

> The hackathon vision: one ECS resident container per user, multiple logical agents inside, table-routing-by-userId for access control. This page documents what supports vs. blocks that today.

## Vision recap

```
   user A              user B              user C
     │                   │                   │
     ▼                   ▼                   ▼
 ┌────────────┐    ┌────────────┐    ┌────────────┐
 │ ResidentRunner   ResidentRunner   ResidentRunner│
 │ ECS task     │   ECS task     │   ECS task     │
 │              │                │                │
 │ ├ agent: PM  │   ├ agent: ENG │   ├ agent: RES │
 │ ├ agent: ENG │   ├ agent: QA  │   └ agent: WRI │
 │ └ agent: RES │   └ agent: PM  │                │
 └────────────┘    └────────────┘    └────────────┘

Access control = userId filtering on DynamoDB queries.
No AccessCodes, Cognito groups, Workspaces, deep IAM.
```

## Reality today

```
   user A              user B              user C
     │                   │                   │
     ▼                   ▼                   ▼
 ┌─────────────────────────────────────────────────┐
 │ Step Functions simple-run                       │
 │ (one stateless ECS Fargate task per run)        │
 │ launches agent-runtime image (smoke worker)     │
 │ does NOT route by userId, does NOT reuse runner │
 └─────────────────────────────────────────────────┘
```

The resident runner is built (image, TaskDef, in-process server, HTTP API, tests). **Nothing schedules it.**

---

## 1. User identity propagation — ✅ works end-to-end

| Stage | userId source | File |
|---|---|---|
| HTTP ingress | API Gateway HttpJwtAuthorizer | control-api-stack.ts:36 |
| Lambda extracts | `event.requestContext.authorizer.jwt.claims.sub` (throws if missing) | handlers.ts:391 (`userFromEvent`) |
| Run / Task / Event records | written to all three in same transaction | create-run.ts:67 |
| Step Functions input | `{runId, taskId, workspaceId, workItemId, userId, objective}` | step-functions.ts:30 |
| ECS env vars | `USER_ID` injected as `ContainerOverride` | orchestration-stack.ts:50 |
| Worker reads | `mustEnv("USER_ID")` | services/agent-runtime/src/index.ts:34 |
| Worker stamps events | every `run.status` and `artifact.created` carries userId | worker.ts:37, 52, 95 |
| Resident runner | requires USER_ID env, stamps every emitted envelope | resident-runner.ts:178, 493, 514 |
| Realtime fanout | `conn.userId === event.userId` filter | relay.ts:25 |

⚠️ **Where it breaks:**
- `services/control-api/src/dynamo-store.ts:337` `listRecentRuns` is a **Scan** (admin path). Fine for hackathon admin, would leak across tenants if any user-facing list ever hit it.
- `EventRecord.orgId` exists in `ports.ts:97-114` but `create-run.ts:89-105` doesn't populate it. Inert today.
- Resident runner defaults to literal `"user-local-001"` when `USER_ID` env is absent. ECS placement must always set it.

---

## 2. DynamoDB table design for per-user filtering

| Table | userId GSI? | Used by handler? |
|---|---|---|
| WorkItemsTable | ✅ `by-user-created-at` | ✅ `listWorkItemsForUser` |
| RunsTable | ✅ `by-user-created-at` | ❌ admin uses Scan; user `getRun`/`listRunEvents` go via `by-run-id` then filter `userId` in code |
| TasksTable | ❌ | no list-by-user code path |
| EventsTable | ❌ (only `by-workspace-created-at`) | reads are run-scoped |
| ArtifactsTable | ❌ | no read code yet |
| DataSourcesTable | ❌ | not implemented |
| SurfacesTable | ❌ | not implemented |
| ApprovalsTable | ❌ | not implemented |
| RealtimeConnectionsTable | ❌ | (see realtime section) |
| HostNodesTable | n/a (admin) | ✅ |
| **UserRunnersTable** | **PK is `userId`** | ✅ `getUserRunner(userId, runnerId)` |
| RunnerSnapshotsTable | ✅ `by-user-created-at` | ❌ unused in code |
| AgentInstancesTable | ✅ `by-user-status-updated-at` | ❌ unused in code |
| AgentProfilesTable | ✅ `by-user-created-at` | ✅ `listAgentProfilesForUser` |

**Filter pattern in code:** ownership verified in app code, not condition expressions. Examples: `query-runs.ts:14`, `work-items.ts:193`, `agent-profiles.ts:230`. Acceptable for hackathon. **There is no IAM-level row filtering** — every Lambda has full table read/write.

---

## 3. Per-user runner placement — STATE EXISTS, ACTUATOR DOES NOT

### What's there

- ✅ `UserRunnersTable` schema (state-stack.ts:183), keyed `userId / runnerId`. Stores `workspaceId, status, desiredState, hostId, placementTarget, hostStatus, resourceLimits, lastHeartbeatAt`.
- ✅ CRUD endpoints in `services/control-api/src/user-runners.ts`:
  - `POST /user-runners`
  - `GET/PATCH /user-runners/{runnerId}`
  - `POST /user-runners/{runnerId}/heartbeat`
  - Owner enforced as `(userId, runnerId)` lookup on every read.
- ✅ HostNode admin endpoints (`POST /runner-hosts`, heartbeat) gated by `isAdmin`.
- ✅ Resident runner image: `services/agent-runtime/Dockerfile.resident` — **multi-stage build with `nousresearch/hermes-agent:latest` as Stage 2, so the Hermes binary is now baked in at `/opt/hermes/.venv/bin/hermes`** (commit `d8c2a22`).
- ✅ `FargateTaskDefinition` in `runtime-stack.ts` (1 vCPU / 2 GiB, port 8787, task role granted RW on every state table).
- ✅ `services/agent-runtime/src/resident-runner.ts` + `resident-runner-server.ts` — multi-agent registry, `/wake`, `/state`, `/events`, `/health`, `/agents`, `/credentials/hermes-auth`, `/shutdown`, Bearer-token guarded.
- ✅ `runAdapter` defaults to `hermes-cli` (the previous `smoke` adapter was **removed** in commit `d8c2a22`). Spawns real `hermes chat -q ... -Q --source agents-cloud --max-turns 8 --pass-session-id` plus optional `-m / --provider / -t / --resume / --accept-hooks / --yolo`.
- ✅ `assertTenant` refuses agents whose `tenant.userId` mismatches.
- ✅ `1deaf57` hardening: `assertSafeId(runId)` and `assertSafeId(taskId)` in `wake()` close a path-traversal hole; `ResidentRunnerApiToken` Secret is provisioned in CDK.
- ✅ **Live ECS proof**: `agents-cloud-dev-resident-runner:4` was launched manually via `aws ecs run-task` on 2026-05-10. Hermes child reached the OpenAI Codex backend and got `HTTP 429 usage_limit_reached` — proving the container/auth path works end-to-end.

### What's now wired (dispatcher landed in code)

- ✅ **Placement dispatcher.** `services/control-api/src/runner-dispatcher.ts` — pure logic; `services/control-api/src/runner-dispatcher-aws.ts` — AWS SDK adapter. Implements `ExecutionStarter`, so when `RESIDENT_RUNNER_TASK_DEFINITION_ARN` env is set the createRun Lambda boots a per-user resident runner via `ecs:RunTask` instead of starting the SFN smoke worker.
- ✅ **userId → runner routing in `createRun`.** `handlers.ts` auto-picks `DispatcherExecutionStarter` over `StepFunctionsExecutionStarter` when the env is configured. No change needed to `create-run.ts`.
- ✅ **Auto-create UserRunner row.** If a user has no runner, `dispatchRunnerWake` creates one with sensible defaults (`status: "starting"`, `desiredState: "running"`, `placementTarget: "ecs-fargate"`).
- ✅ **Reachability layer (observer-based, no runner code change needed).** `EcsTaskObserver` polls `ecs:DescribeTasks` and pulls the running task's `privateIp` from `containers[].networkInterfaces[].privateIpv4Address` (or attachment ENI details fallback). Writes `privateIp`, `runnerEndpoint = http://<ip>:8787`, `status: "running"` into `UserRunnersTable`.
- ✅ **`UserRunnerRecord` extended** with optional `privateIp`, `runnerEndpoint`, `taskArn`, `lastErrorMessage`, `launchedAt`. Heartbeat route accepts these fields too (via `POST /user-runners/{runnerId}/heartbeat`).
- ✅ **CDK wires the dispatcher**: `ControlApiStack.residentDispatch` props takes `cluster + network + runtime`; createRun Lambda gets `RESIDENT_RUNNER_*` env vars, `ecs:RunTask` IAM (scoped to resident family ARN), `ecs:DescribeTasks/StopTask`, `iam:PassRole` to the resident task role, and read access to the `ResidentRunnerApiToken` Secrets Manager secret.
- ✅ **Tests:** 8-case `runner-dispatcher.test.ts` covering existing-running runner reuse, auto-create + launch, failed-runner relaunch, ENDPOINT_TIMEOUT, LAUNCH_FAILED, WAKE_FAILED, observer-based privateIp discovery, observer STOPPED → UNHEALTHY_RUNNER. All 65 control-api tests + 9 CDK assertion tests pass.

### What's still missing

- ❌ **Durable state mirroring.** Resident runner still persists events/artifacts to local task disk (`/runner/state/events.ndjson`, `/runner/artifacts/...`); needs ports for `EventSink → EventsTable`, `ArtifactSink → S3 + ArtifactsTable`, `RunnerStateStore → UserRunnersTable heartbeats`, `SnapshotStore → S3 + RunnerSnapshotsTable`. The dispatcher launches the runner; persistence is the next slice.
- ❌ `RunnerSnapshotsTable` and `AgentInstancesTable` are provisioned but not written by any code.
- ❌ `createUserRunner` accepts arbitrary `placementTarget` strings without validating `local-docker | ecs-fargate | ecs-ec2` or reserving capacity on a `HostNode`.
- ⚠️ Provider quota: the proof run hit OpenAI Codex `429 usage_limit_reached`. A real demo needs a billing account with quota.

### Dispatcher flow (end-to-end)

```
POST /runs (Cognito-authed)
   │  createRunHandler
   ▼
DispatcherExecutionStarter.startExecution({runId, taskId, workspaceId, userId, objective})
   │
   ▼
dispatchRunnerWake(deps, {objective, runId, taskId})
   │
   ├─ ensureRunnerRow: lookup UserRunner by userId; auto-create if none
   ├─ markRunnerStarting (if previously failed/stopped)
   ├─ launcher.launchRunner: ECS RunTask with overrides {USER_ID, RUNNER_ID, WORKSPACE_ID, ORG_ID}
   │     and secrets {RUNNER_API_TOKEN, HERMES_AUTH_JSON_BOOTSTRAP}
   ├─ poll loop until deadline:
   │     a. observer.describeRunner(taskArn) via ecs:DescribeTasks
   │     b. on RUNNING + privateIp: write {privateIp, runnerEndpoint, status:"running"} to UserRunnersTable
   │     c. on STOPPED: write {status:"failed", lastErrorMessage} → throw UNHEALTHY_RUNNER
   ├─ tokenProvider.getToken: cached secretsmanager:GetSecretValue
   └─ wakeClient.postWake: fetch POST http://<privateIp>:8787/wake with Bearer token
   │
   ▼
returns {executionArn: taskArn} for ledger compatibility
```


### What needs to happen for hackathon

A small dispatcher that on `POST /runs`:
1. Looks up `UserRunner` by `userId` (already real).
2. If missing or status != `running`:
   a. `ecs:RunTask` `ResidentRunnerTaskDefinition` with env `USER_ID, RUNNER_ID, RUNNER_API_TOKEN, table names`.
   b. Wait for `/health` to return ok (poll up to 30s).
   c. Update `UserRunner` row: `status = running, taskArn, runnerEndpoint`.
3. POST `http://<runnerEndpoint>:8787/wake` with `Bearer <RUNNER_API_TOKEN>` body `{agentId, runId, taskId, objective}`.
4. Return 202 with runId.

**Reachability gotcha:** Lambda → resident container needs a network address. Cheapest hackathon path: have the resident task self-register its private IP in the `UserRunner` row on boot. Or use Cloud Map.

See [HACKATHON_CRITICAL_PATH.md#2](../HACKATHON_CRITICAL_PATH.md).

---

## 4. Realtime per-user fanout

- ✅ `services/realtime-api/src/auth.ts:30` verifies Cognito ID token, returns `context.userId = claims.sub`.
- ✅ `$connect` (handlers.ts:33): writes connection row with userId. Rejects 401 if no userId.
- ✅ Relay (relay.ts:24): `listConnectionsForRun` then `.filter(c => !event.userId || c.userId === event.userId)` — cross-user delivery prevented in practice.
- ⚠️ `subscribeRun` (handlers.ts:75) does NOT verify the user owns the run. Topic-squatting is possible if runIds are guessable (they're UUIDs, so low risk).

---

## 5. Concurrency limits

- ECS Fargate task def: no `desiredCount`, no `maxCount`, no concurrency limit. Each `createRun` → one fresh task via `runTask.sync`. ECS account default ~100 Fargate tasks per region, plenty for hackathon.
- Step Functions: no throttle config. Single-state SFN, 2h timeout. No `MaxConcurrency`. Concurrent executions named by `runId` so no collision.
- DynamoDB: every table PAY_PER_REQUEST. No provisioned throttle.
- Realtime: WebSocket API has no per-user connection cap. RealtimeConnections PAY_PER_REQUEST.
- Resident runner: 1024 cpu / 2048 mem per task. No service desired-count since nothing schedules them yet.

For hackathon-scale (≤10 concurrent users), concurrency is **not** the blocker.

---

## Summary checklist

### What works today for multi-user
- [x] Cognito `sub` propagated through HTTP → Dynamo → SFN → ECS env → worker → events
- [x] WorkItems, AgentProfiles, UserRunners listing uses real per-user GSI queries
- [x] WebSocket authorizer verifies Cognito; userId recorded; relay filters fanout
- [x] ResidentRunner enforces tenant on agent registration
- [x] All tables PAY_PER_REQUEST; no quota tuning
- [x] Per-user ownership on read: `requireOwnedX`, `record.userId !== user.userId → 404`

### What partially works
- [ ] Run listing for non-admins — GSI exists, no handler
- [ ] Realtime topic squatting — `subscribeRun` no ownership check (low risk)
- [ ] Admin run list uses Scan
- [ ] `orgId` in EventRecord type but not populated

### What's blocking — sorted by severity
1. ❌ **No userId → resident-runner routing.** `createRun` always launches stateless ECS task; nothing reads `UserRunnersTable` to dispatch to user's resident container.
2. ❌ **No scheduler that starts ResidentRunner tasks.** Image exists, TaskDef exists, no caller.
3. ❌ **`RunnerSnapshotsTable` / `AgentInstancesTable` never written.** Logical agents inside runner not visible to control plane.
4. ❌ **`RUNNER_API_TOKEN` provisioning undefined.** Without it, runner unreachable from dispatcher.
5. ❌ **No `GET /runs` user-listing.**
6. ⚠️ `subscribeRun` ownership check.

### Skip per hackathon scope
- 🗑️ ADR-0010 access-codes / Workspaces / WorkspaceMemberships / Cognito groups
- 🗑️ Cloudflare realtime
- 🗑️ Phase 3 local Docker host supervisor
- 🗑️ Phase 5 ECS-on-EC2

→ See [gaps.md](../gaps.md) for complete skip list.
→ See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md) for what to ship.
