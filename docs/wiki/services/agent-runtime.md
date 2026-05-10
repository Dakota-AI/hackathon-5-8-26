# agent-runtime

[← services](README.md) · [wiki index](../README.md) · related: [RuntimeStack](../infrastructure/stacks.md#runtimestack), [run-creation flow](../flows/run-creation.md), [multi-user routing](../flows/multi-user-routing.md)

> Worker runtime that runs inside ECS Fargate. Two modes: **stateless smoke worker** (deployed and live) and **resident runner** (built but unwired).

**Maturity:** ⚠️ partial.
- Stateless worker: ✅ wired end-to-end on ECS, ❌ smoke-only (no model call).
- Resident runner: ✅ image + task def + in-process server + tests, ❌ **no caller**.

**Source:** `services/agent-runtime/src/`
**Tests:** 3 files in `services/agent-runtime/test/`

---

## Headline answer to the user's suspicion

> "I don't think the ECS instance / Docker image is wired up..."

**Partially correct.**

1. **The committed Dockerfile is wired.** `cdk deploy` builds and pushes to ECR. Step Functions invokes it on every `POST /runs`. Smoke evidence: ARN like `agents-cloud-dev-agent-runtime:7` is the live revision.
2. **But the worker inside is smoke-mode by default** — `HERMES_RUNNER_MODE=smoke` and the image has no `hermes` binary baked in. So it returns canned text and writes a stub Markdown artifact. No model is invoked.
3. **The resident-runner mode (the "one ECS instance per user" vision) is built but inert.** Dockerfile.resident, FargateTaskDefinition, an HTTP server with `/health /state /agents /wake /events /shutdown`, multi-tenant boundary checks — all written and tested. **But nothing in the system ever calls `ecs:RunTask` against the resident task family.** It's a dormant TaskDef.

---

## Two execution modes

### Mode A: stateless smoke worker (LIVE)

```
Step Functions  →  ecs:runTask.sync  →  Fargate task (agent-runtime image)
                                              ↓
                                  services/agent-runtime/src/index.ts
                                              ↓
                                  worker.ts → hermes-runner.ts
                                              ↓
                                  HERMES_RUNNER_MODE=smoke → canned text
                                              ↓
                                  PutObject S3 hermes-report.md
                                  PutItem ArtifactsTable
                                  PutItem EventsTable (artifact.created, run.status:succeeded)
```

**Source files:**
- `services/agent-runtime/src/index.ts` — entrypoint, reads env, builds sinks, calls `executeRun`.
- `services/agent-runtime/src/worker.ts` — orchestrates: writes events, calls hermes, writes artifacts.
- `services/agent-runtime/src/hermes-runner.ts:26-38` — smoke branch returns canned string. Lines 40–57: `cli` branch shells out to `hermes chat -q <prompt>` (binary not in image).
- `services/agent-runtime/src/dynamo-event-sink.ts` — DynamoDB writer for events + run/task status.
- `services/agent-runtime/src/aws-artifact-sink.ts` — S3 + DynamoDB writer for artifacts.
- `services/agent-runtime/Dockerfile` — Node 22 slim, pnpm install + build, CMD `node dist/src/index.js`.

**Container env (set by RuntimeStack):**
`AGENTS_CLOUD_ENV`, `AGENTS_CLOUD_WORKER_KIND=agent-runtime-hermes`, `HERMES_RUNNER_MODE` (default `smoke`), all 7 active table names, `ARTIFACTS_BUCKET_NAME`.

**Container env (set by Step Functions per execution):**
`RUN_ID`, `TASK_ID`, `WORKSPACE_ID`, `WORK_ITEM_ID`, `USER_ID`, `OBJECTIVE`.

**What it actually produces today:**
1. `seq=2 run.status:running` event + Run+Task row update to `running`.
2. S3 object: `s3://<workspace-live-artifacts-bucket>/workspaces/{workspaceId}/runs/{runId}/artifacts/artifact-{taskId}-0001/hermes-report.md`.
3. ArtifactsTable row keyed `(runId, artifactId)`.
4. `seq=3 artifact.created` event.
5. `seq=4 run.status:succeeded` event + Run+Task → `succeeded`.

**Fragility:**
- ⚠️ `seq` numbers are hardcoded constants (`worker.ts:22, 49, 68`). Any retry/restart of the worker hits `attribute_not_exists(seq)` conditional check failure and crashes. Step Functions `runTask.sync` has implicit retry on Fargate failures — this means a Spot interruption or container restart will currently fail the run.
- ⚠️ Run/task status updates are not compare-and-swap on previous status — concurrent writers could clobber each other (e.g., set `succeeded` after `failed`).

### Mode B: resident runner (BUILT, UNWIRED)

```
[ Lambda (does not exist yet) ]
        │
        ▼
[ ecs:RunTask  ResidentRunnerTaskDefinition ]   ← no caller exists
        │
        ▼
[ Fargate task (resident-runner image) ]
        │
        ▼
[ resident-runner-server.ts  on  :8787 ]
   - GET  /health
   - GET  /state
   - POST /agents          register a logical agent
   - POST /wake            run one or all agents on an objective
   - GET  /events
   - POST /shutdown
        │
        ▼
[ resident-runner.ts ]
   - Multi-agent registry (orgId/userId/workspaceId/runnerId/agentId scoped)
   - wake() iterates agents SERIALLY (not concurrent)
   - State on local FS only (no DDB writes!)
        │
        ▼
[ adapter ]
   - smoke → canned text (default)
   - hermes-cli → spawn `hermes chat -q ...`  (binary not in image)
```

**Source files:**
- `services/agent-runtime/src/resident-runner.ts` — class + adapter logic. ~700 LOC.
- `services/agent-runtime/src/resident-runner-server.ts` — Bearer-token-gated HTTP server, ~150 LOC.
- `services/agent-runtime/Dockerfile.resident` — adds `ca-certificates curl git openssh-client python3 tini`. Non-root user `runner` uid 10000. Port 8787. CMD `node dist/src/resident-runner-server.js`.

**Tenant model:**
- One container = one (orgId, userId, workspaceId, runnerId).
- Multiple `ResidentAgentProfile`s per container, identified by `agentId`/`profileId`/`profileVersion`.
- `assertTenant()` rejects agent registrations whose tenant tuple doesn't match container.

**State model:**
- Container-local files under `AGENTS_RUNNER_ROOT` (`/runner`):
  - `state/resident-runner-state.json` — registered agents + status
  - `state/events.ndjson` — append-only event log
  - `artifacts/<runId>/<artifactId>/heartbeat-report.md`
  - `logs/<heartbeatId>.log`
- ⚠️ **No DynamoDB or S3 writes** — if the task dies, all state is lost. `RunnerSnapshotsTable` and `AgentInstancesTable` are provisioned by CDK but never written.

**Adapter sandboxing (good):**
`buildAdapterEnvironment()` in `resident-runner.ts:664-689` strips provider keys (`OPENROUTER_API_KEY` etc.) before subprocess. Only `PATH/HOME/LANG/LC_ALL/TERM/HERMES_HOME/HERMES_CONFIG_DIR/AGENTS_MODEL_PROVIDER/AGENTS_MODEL` pass through. AWS task credentials never leak into the subprocess. Verified by `resident-runner.test.ts:136-198`.

**Why nothing calls it:**
There is no scheduler or dispatcher. `services/control-api/src/user-runners.ts` writes `UserRunner` Dynamo rows describing desired/current state, but it never calls `ecs:RunTask`. A "host supervisor" component that reads `UserRunnersTable.desiredState` and starts/stops Fargate tasks **does not exist in code**. The hackathon critical path is to write this. See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#2).

---

## Local harness (dev only)

`services/agent-runtime/src/local-harness.ts` and `local-runner-cli.ts` are a deterministic scripted scenario for development:
- Manager + Specialist agent pair
- 6 tool calls (`workspace.plan_task`, `research.summarize_context`, `communication.ask_user_question`, `preview.register_static_site`, `artifact.create`, `workspace.generate_static_site`)
- One approval gate around `preview.register_static_site` with three branches (approved/rejected/pending)
- Markdown report + (if approved) static site artifact

**Not a deployment target.** Used by tests + manual runs (`pnpm agent-runtime:local`).

---

## Test coverage

`services/agent-runtime/test/`:

| File | What it exercises |
|---|---|
| `worker.test.ts` | Smoke worker: happy path + hermes throw → run.status:failed |
| `resident-runner.test.ts` (new) | Multi-agent wake, tenant rejection, hermes-cli env sandboxing, HTTP routes, fail-closed without RUNNER_API_TOKEN |
| `local-harness.test.ts` | Approved/pending/rejected scenarios + CLI smoke + interactive stdin |

All against in-memory or local-FS implementations. **No real AWS / Bedrock / OpenAI / Anthropic call anywhere in tests.**

---

## What's wired vs missing — checklist

### What's wired
- [x] Dockerfile builds, pushed to ECR by `cdk deploy`
- [x] Step Functions `simple-run` launches the smoke worker via `ecs:runTask.sync`
- [x] Container reads RUN_ID/TASK_ID/WORKSPACE_ID/USER_ID/OBJECTIVE env
- [x] Worker writes canonical `run.status` and `artifact.created` events to EventsTable
- [x] Worker writes Markdown artifact to S3 + ArtifactsTable row
- [x] Resident-runner Dockerfile builds, image pushed by CDK
- [x] Resident-runner Fargate TaskDefinition created with broad table grants
- [x] Resident-runner HTTP server enforces Bearer-token in ECS mode
- [x] Tenant-boundary checks on agent profile registration
- [x] Provider keys stripped from subprocess env in hermes-cli mode
- [x] Test coverage on all the above

### Missing for hackathon
- [ ] **Real model invocation** — replace smoke or rebuild image with `hermes` baked in (or call SDK directly)
- [ ] **Provider secret broker** — Secrets Manager + IAM session policy (or simple ECS env injection for hackathon)
- [ ] **Resident-runner scheduler/dispatcher** — Lambda or Step Function that calls `ecs:RunTask` on the resident family per user
- [ ] **Resident-runner reachability** — Cloud Map or internal ALB so Lambda can `POST /wake`
- [ ] **`RUNNER_API_TOKEN` minting + injection** per user
- [ ] **Resident-runner durable persistence** — mirror events to DDB EventsTable, artifacts to S3 + ArtifactsTable
- [ ] **Concurrent agents per runner** — current `wake()` is `for (agent of agents)` serial loop. Use `Promise.all`.
- [ ] **Real tool execution** — file ops, shell, web fetch, browser, MCP. Today only smoke + hermes-cli adapter (no binary).
- [ ] **Sandbox / cgroup / network egress policy** for tool execution
- [ ] **Cancellation / heartbeat-based stuck detection / no-progress timeout**
- [ ] **Inbox / wake timer / event-driven wake** — currently HTTP-only on-demand
- [ ] **Idempotent durable writes** — fix hardcoded `seq=2,3,4` in worker.ts
- [ ] **Snapshot/restore** — `RunnerSnapshotsTable` is unused
- [ ] **Cost/budget guardrails**
- [ ] **Observability** — CloudWatch logs work, no metrics, no dashboards

---

## Comparison: what's on ECS today

| Concern | Smoke worker | Resident runner |
|---|---|---|
| Image built by `cdk deploy` | ✅ | ✅ |
| Pushed to ECR | ✅ | ✅ |
| Fargate TaskDefinition | ✅ | ✅ |
| Has IAM to Dynamo/S3 | ✅ | ✅ (broader) |
| Anyone calls `ecs:RunTask` | ✅ via Step Functions | ❌ |
| Reachable from control-api | ✅ | ❌ |
| Calls a model | ❌ smoke string | ❌ smoke string |
| `hermes` binary in image | ❌ | ❌ |
| Persists to Dynamo/S3 | ✅ | ❌ (local FS only) |

---

## Hackathon plan

See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md). The two highest-leverage items here are:
1. Replace smoke with a real model call (Anthropic/Bedrock/etc.) in `worker.ts` — single PR, ~half a day.
2. Implement the resident-runner dispatcher in `services/control-api/src/create-run.ts` — bigger lift, ~1–2 days.
