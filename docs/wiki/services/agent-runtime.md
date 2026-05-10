# agent-runtime

[← services](README.md) · [wiki index](../README.md) · related: [RuntimeStack](../infrastructure/stacks.md#runtimestack), [run-creation flow](../flows/run-creation.md), [multi-user routing](../flows/multi-user-routing.md)

> Worker runtime that runs inside ECS Fargate. **Two images, two task families, one caller.** A stateless Hermes-shaped smoke worker (live, called by Step Functions on every `POST /runs`) and a long-running resident runner (image+task def deployed and self-tested in dev, but **still has no production caller**).

**Maturity:** ⚠️ partial.
- Stateless worker: ✅ wired end-to-end on ECS, ❌ smoke-only (no model call).
- Resident runner: ✅ image baked with real Hermes, ✅ task def deployed (`agents-cloud-dev-resident-runner:4`), ✅ live one-shot self-test reached OpenAI Codex backend, ❌ **still no dispatcher** — only operator-driven `aws ecs run-task` triggers it today.

**Source:** `services/agent-runtime/src/`
**Container:** `services/agent-runtime/Dockerfile` (smoke), `services/agent-runtime/Dockerfile.resident` (resident), `services/agent-runtime/docker/resident-entrypoint.sh`
**Tests:** 3 files in `services/agent-runtime/test/` (worker, resident-runner, local-harness)

---

## Headline answer

> "Is the resident runner now actually launched by anything? Or still dormant TaskDef?"

**Still dormant from the platform's point of view.** The recent commits (`febccc1`, `1deaf57`, `d8c2a22`) made the resident container *real*: it bakes in the Hermes CLI, defaults to `hermes-cli` adapter, fail-closes without a token in ECS mode, accepts an authenticated `/wake` over HTTP, and has been exercised once in AWS by a manual `aws ecs run-task`. But:

- No new `ecs:RunTask` call site exists for the resident family. The only `ecs:RunTask` in the repo is `infra/cdk/src/stacks/orchestration-stack.ts:70` — that policy is scoped by ARN to `task-definition/agents-cloud-{env}-agent-runtime:*` (the *smoke* family), not `resident-runner`.
- No `Lambda` dispatcher, no `EcsService`, no `ApplicationLoadBalancedFargateService`, no Cloud Map / Service Connect registration, and no `RunTaskCommand` import in `services/control-api/src/`.
- `services/control-api/src/user-runners.ts` writes `UserRunner` Dynamo rows that *describe* desired/current state, but never starts a Fargate task. There is no `runner-dispatcher.ts` in `services/control-api/src/` (verified by directory listing on 2026‑05‑10).

So the answer is: the resident runner is now a real Hermes-capable runtime that has been proven to work inside a Fargate task in the dev account, but the *router* that picks a tenant, finds/creates a `UserRunner`, calls `ecs:RunTask` with per-tenant env overrides, and reaches `/wake` over the network is still missing.

---

## Two execution modes

### Mode A: stateless smoke worker (LIVE)

Image: `services/agent-runtime/Dockerfile` (Node 22 slim, no Hermes binary).
Family: `agents-cloud-{env}-agent-runtime`.
Caller: Step Functions `simple-run` state machine (`infra/cdk/src/stacks/orchestration-stack.ts`) via `arn:aws:states:::ecs:runTask.sync`.

```
Step Functions  →  ecs:runTask.sync  →  Fargate task (agent-runtime image)
                                              ↓
                                  services/agent-runtime/src/index.ts
                                              ↓
                                  worker.ts → hermes-runner.ts
                                              ↓
                                  HERMES_RUNNER_MODE=smoke  →  canned text
                                              ↓
                                  PutObject S3 hermes-report.md
                                  PutItem ArtifactsTable
                                  PutItem EventsTable (artifact.created, run.status:succeeded)
```

Source files: `src/index.ts`, `src/worker.ts`, `src/hermes-runner.ts`, `src/dynamo-event-sink.ts`, `src/aws-artifact-sink.ts`. Stack-injected env (from `RuntimeStack` in `infra/cdk/src/stacks/runtime-stack.ts:118-130`): `AGENTS_CLOUD_ENV`, `AGENTS_CLOUD_WORKER_KIND=agent-runtime-hermes`, `HERMES_RUNNER_MODE` (default `smoke`), seven table names, `ARTIFACTS_BUCKET_NAME`. Per-execution env (from Step Functions): `RUN_ID`, `TASK_ID`, `WORKSPACE_ID`, `WORK_ITEM_ID`, `USER_ID`, `OBJECTIVE`.

Fragility (unchanged): `seq` numbers in `worker.ts` are hardcoded; any retry/restart hits a conditional-check failure on `EventsTable`. Run/task status updates are not compare-and-swap.

### Mode B: resident runner (BUILT, REAL HERMES, NO DISPATCHER)

Image: `services/agent-runtime/Dockerfile.resident`. **Multi-stage build.** Stage 1 is `node:22-bookworm-slim` and pnpm-builds the workspace's `@agents-cloud/protocol` and `@agents-cloud/agent-runtime` packages. Stage 2 is `nousresearch/hermes-agent:latest` — that's where the Hermes CLI is actually baked in. The runtime stage:

- runs as the existing `hermes` non-root user (the base image's user),
- adds `ca-certificates curl git openssh-client tini` via `apt-get`,
- creates `/runner/{workspace,state,artifacts,profiles,logs,hermes}` and `chown`s them to `hermes`,
- copies the pnpm build output from stage 1 into `/app`,
- copies `services/agent-runtime/docker/resident-entrypoint.sh` to `/usr/local/bin/agents-cloud-resident-entrypoint` (mode 0755),
- exposes port `8787`,
- entrypoint `/usr/bin/tini -g -- /usr/local/bin/agents-cloud-resident-entrypoint`,
- default CMD `node dist/src/resident-runner-server.js`.

Image-baked env defaults: `NODE_ENV=production`, `AGENTS_RUNTIME_MODE=ecs-resident`, `AGENTS_RESIDENT_ADAPTER=hermes-cli`, `AGENTS_RUNNER_ROOT=/runner`, `AGENTS_MODEL_PROVIDER=openai-codex`, `AGENTS_HERMES_MAX_TURNS=8`, `HERMES_COMMAND=/opt/hermes/.venv/bin/hermes`, `HERMES_HOME=/runner/hermes`, `PATH` extended with `/opt/hermes/.venv/bin:/opt/hermes`, `PORT=8787`. There is no `python3` install line — Hermes is already installed in the base image's venv.

#### `docker/resident-entrypoint.sh` — what runs at boot

```sh
mkdir -p $AGENTS_RUNNER_ROOT/{workspace,state,artifacts,profiles,logs}  $HERMES_HOME

if [ "${HERMES_AUTH_JSON_BOOTSTRAP:-}" != "" ]; then
  printf '%s' "$HERMES_AUTH_JSON_BOOTSTRAP" > "$HERMES_HOME/auth.json"
  chmod 600 "$HERMES_HOME/auth.json"
  unset HERMES_AUTH_JSON_BOOTSTRAP
fi

exec "$@"
```

The interesting part: if Secrets Manager injected `HERMES_AUTH_JSON_BOOTSTRAP` as a task env var, the entrypoint materializes it as `$HERMES_HOME/auth.json` (mode 0600) and unsets the env var before exec'ing the server. This is the auth path used by the live ECS exercise on 2026‑05‑10.

#### `src/resident-runner-server.ts` — HTTP shape

A tiny Node `http.createServer` (no Express), Bearer-token gated. Module-top-level `await runner.initialize(defaultProfilesFromEnvironment())` runs before the server starts listening. Routes:

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/health` | Bearer | `{status:"ok", runner: state.runner}` |
| `GET` | `/state` | Bearer | full `ResidentRunnerState` snapshot |
| `GET` | `/events` | Bearer | replays `state/events.ndjson` |
| `POST` | `/agents` | Bearer | registers/updates a logical agent (calls `runner.registerAgent`) |
| `POST` | `/credentials/hermes-auth` | Bearer **always required, even in dev mode** | writes `$HERMES_HOME/auth.json` with mode 0600; never echoes content |
| `POST` | `/wake` | Bearer | runs `runner.wake({objective, agentId?, runId?, taskId?, wakeReason?})` |
| `POST` | `/shutdown` | Bearer | replies `202` then `server.close()` |

Auth flow (`authorize()` at line 94–99): if `RUNNER_API_TOKEN` is set, every request must carry `Authorization: Bearer <token>`. If unset and `AGENTS_RUNTIME_MODE !== "ecs-resident"`, the server allows unauthenticated localhost access (dev mode). If `AGENTS_RUNTIME_MODE === "ecs-resident"` and `RUNNER_API_TOKEN` is unset, the process throws at startup with `"RUNNER_API_TOKEN is required when AGENTS_RUNTIME_MODE=ecs-resident."` — fail closed. JSON bodies are capped at 1 MiB; non-JSON content types reject `415`; malformed JSON rejects `400`.

Env vars consumed by the server module:

- `AGENTS_RUNNER_ROOT` (default `/runner`)
- `ORG_ID`, `USER_ID`, `WORKSPACE_ID`, `RUNNER_ID`, `RUNNER_SESSION_ID` — runner identity
- `AGENT_ID`, `AGENT_PROFILE_ID`, `AGENT_PROFILE_VERSION`, `AGENT_ROLE` — default agent profile
- `AGENTS_MODEL`, `AGENTS_MODEL_PROVIDER`, `HERMES_TOOLSETS` — default agent shape
- `AGENTS_RESIDENT_PROFILES_JSON` — optional JSON array overriding the default profile set
- `AGENTS_RESIDENT_ADAPTER` — must be `hermes-cli` or absent; **`smoke` now throws** (was the default before `d8c2a22`)
- `AGENTS_RUNTIME_MODE` — `ecs-resident` enables fail-closed token check
- `HERMES_COMMAND` (default `hermes`), `HERMES_HOME`
- `RUNNER_API_TOKEN` (required in ECS mode)
- `PORT` (default `8787`)

#### `src/resident-runner.ts` — flow + `runAdapter`

The big change in `d8c2a22` ("Run resident runner with real Hermes CLI"):

- `ResidentAdapterKind` was `"smoke" | "hermes-cli"`; now it is just `"hermes-cli"`.
- `residentRunnerConfigFromPartial` previously defaulted `adapterKind` to `"smoke"`; **now it defaults to `"hermes-cli"`**.
- `adapterKindFromEnv()` previously fell back silently to smoke when `AGENTS_RESIDENT_ADAPTER` was absent or unrecognized; now it throws if anything other than `"hermes-cli"` is supplied. There is no smoke fallback anywhere.
- `runAdapter()` previously had a `if (adapterKind === "smoke")` branch that returned canned text. That branch is deleted. The function unconditionally spawns the real Hermes CLI.

The current `runAdapter()` invocation (`resident-runner.ts:387-437`) builds:

```
hermes chat -q <prompt> -Q --source agents-cloud
       --max-turns ${AGENTS_HERMES_MAX_TURNS:-8} --pass-session-id
       [-m <model>] [--provider <provider>] [-t <toolsets>]
       [--resume <sessionId>]
       [--accept-hooks]   # if HERMES_ACCEPT_HOOKS=1
       [--yolo]           # if AGENTS_HERMES_YOLO=1
```

`provider` is passed only when not `"custom"`. `--resume` reuses a session id parsed out of a previous heartbeat's stdout (`session_id: <id>`). The prompt template is rendered with tenant + run/task identifiers and the user objective, with the explicit guardrails: don't publish, don't spend, don't delete, don't contact users, don't change infra, don't write to source control without platform approval; emit progress as canonical events, not as noisy tool calls.

Subprocess env is **allowlisted** via `buildAdapterEnvironment()` (lines 666–691): only `PATH/HOME/LANG/LC_ALL/TERM/HERMES_HOME/HERMES_CONFIG_DIR/AGENTS_MODEL_PROVIDER/AGENTS_MODEL` pass through. Raw provider keys (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `NOUS_API_KEY`, `COPILOT_API_KEY`) are stripped *unless* `AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT=1` (explicit trusted-runner opt-in). AWS task creds and `RUNNER_API_TOKEN` never reach the Hermes child. Verified by `test/resident-runner.test.ts:163-224`.

`wake()` flow (`resident-runner.ts:264-371`):

1. Resolve agent set (one named agent, or all registered).
2. `assertSafeId` on `runId` and `taskId` — added in `1deaf57`. Identifiers must match `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`. This closed a path-traversal hole where `runId="../escape"` would have written artifacts/logs outside `/runner`.
3. Mark runner `running`, persist state.
4. Emit canonical `run.status` (planning, progress 0.1).
5. For each agent (serially — not concurrent):
   - emit `run.status` (running, 0.35)
   - render prompt, spawn Hermes (1 800 000 ms default timeout)
   - on failure: emit `run.status` (failed) with retryable `RESIDENT_HEARTBEAT_FAILED`
   - write a Markdown heartbeat artifact under `/runner/artifacts/<runId>/<artifactId>/heartbeat-report.md`, emit `artifact.created`
   - persist heartbeat record + agent state + metrics
6. Emit terminal `run.status` (succeeded or partial failure).

Durable events are intentionally limited to `run.status` and `artifact.created` per `RUNTIME_AUTONOMY_AND_EVENT_POLICY.md` — routine internal tool calls are deliberately *not* persisted as canonical events.

Local-only state (no DDB/S3 writes from the resident runner yet):
- `/runner/state/resident-runner-state.json` — runner+agents+heartbeats+metrics
- `/runner/state/events.ndjson` — append-only canonical event log
- `/runner/artifacts/<runId>/<artifactId>/heartbeat-report.md`
- `/runner/logs/<heartbeatId>.log` — raw adapter stdout/stderr
- `/runner/profiles/<agentId>.json` — registered profiles, with any nested `env` map redacted

`RunnerSnapshotsTable`, `AgentInstancesTable`, `EventsTable`, `ArtifactsTable` are reachable by the resident task role (broad grants in `runtime-stack.ts:281-294`) but the resident runner code path itself never calls Dynamo or S3.

---

## CDK wiring (`infra/cdk/src/stacks/runtime-stack.ts`)

`febccc1` added the resident task definition and image asset alongside the existing smoke task. `1deaf57` added the bearer-token Secret. `d8c2a22` added the Hermes auth bootstrap secret and the `HERMES_*` defaults. The current shape:

- `ResidentRunnerTaskDefinition` — Fargate, 1024 cpu / 2048 MiB, family `agents-cloud-{env}-resident-runner`. (Smoke worker is 512/1024 by comparison.)
- `ResidentRunnerImage` — `DockerImageAsset` from `services/agent-runtime/Dockerfile.resident`, linux/amd64.
- `ResidentRunnerApiToken` — generated `Secret` (48 chars, no punctuation), described as "Bearer token placeholder ... Replace with brokered supervisor tokens before public launch." Injected as `RUNNER_API_TOKEN` via ECS `secrets`.
- `ResidentRunnerHermesAuthJson` — `Secret.fromSecretNameV2` referencing `agents-cloud/{env}/resident-runner/hermes-auth-json` (overridable by `AGENTS_CLOUD_HERMES_AUTH_SECRET_NAME`). Injected as `HERMES_AUTH_JSON_BOOTSTRAP`. `resident-entrypoint.sh` materializes this to `$HERMES_HOME/auth.json` and unsets the env var.
- Container env (lines 234–260): runtime mode, adapter kind, runner root, model/provider/toolset defaults, `HERMES_COMMAND=/opt/hermes/.venv/bin/hermes`, `HERMES_HOME=/runner/hermes`, `PORT=8787`, **all** state-stack table names (work-items/runs/tasks/events/artifacts/data-sources/surfaces/approvals/preview-deployments/host-nodes/user-runners/runner-snapshots/agent-instances/agent-profiles), and `ARTIFACTS_BUCKET_NAME`.
- `portMappings: [{ containerPort: 8787 }]` — the only port wiring. There is **no** task-attached load balancer, **no** Cloud Map registration, and **no** ECS Service. The task can only be reached by IP-on-AWSVPC from within the VPC, by anything that holds both the IP and the bearer token.
- IAM grants: read-write to all four storage buckets and all fourteen state tables; CloudWatch `PutMetricData` scoped to namespace `agents-cloud/{env}`.
- CfnOutputs: `ResidentRunnerTaskDefinitionArn`, `ResidentRunnerContainerName`. (No service-discovery output, no LB DNS output.)

There is no `EcsService`, `FargateService`, `ApplicationLoadBalancedFargateService`, `Service Connect`, or `CloudMap` namespace anywhere referencing the resident task definition. The only ECS service in the entire CDK app is `PreviewRouterService` in `preview-ingress-stack.ts`, unrelated to runtimes. The orchestration stack's `ecs:RunTask` resource ARN is locked to the smoke family by string interpolation (`taskFamily = logicalName(props.config, "agent-runtime")`), so even if Step Functions tried to launch the resident family it would be denied.

---

## Live AWS evidence (per `RESIDENT_RUNNER_PRODUCTION_ROUTING_PLAN.md`)

On 2026‑05‑10 the dev stacks were deployed and a single resident task was launched manually:

```
Task definition: arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-resident-runner:4
Task:            arn:aws:ecs:us-east-1:625250616301:task/agents-cloud-dev-cluster/264c24cc42374834b3c006a56822069b
Hermes auth secret: agents-cloud/dev/resident-runner/hermes-auth-json
```

The task pulled the image, started the HTTP server, materialized `auth.json`, served `/health` and `/wake` from inside the task, invoked `/opt/hermes/.venv/bin/hermes`, produced one heartbeat, one local report artifact, five local canonical events, and exited `0` after `/shutdown`. The Hermes child reached the OpenAI Codex backend and failed visibly with `HTTP 429 usage_limit_reached` for `gpt-5.5`. So the *infrastructure* path (image, ECR pull, task role, networking, logs, secret bootstrap, server, Hermes process, model API reach) is proven; the *blocker* is provider quota and the missing dispatcher.

---

## Test coverage (`services/agent-runtime/test/`)

| File | What it exercises |
|---|---|
| `worker.test.ts` | Smoke worker happy path + hermes throw → run.status:failed |
| `resident-runner.test.ts` | (1) Multi-agent wake with fake hermes, (2) tenant boundary rejection, (3) unsafe agent id / cwd rejection, (4) **unsafe runId/taskId rejection** (added in `1deaf57`), (5) failed-heartbeat path, (6) provider/AWS env stripping in subprocess (`hermes-cli` mode), HTTP routes: (7) authenticated register/wake/events/state/shutdown, (8) malformed JSON → 400, (9) ecs-resident mode without `RUNNER_API_TOKEN` exits non-zero with `RUNNER_API_TOKEN is required`, (10) `AGENTS_RESIDENT_ADAPTER=smoke` exits with `Unsupported resident adapter: smoke` (added in `d8c2a22`), (11) `/credentials/hermes-auth` writes file mode 0600 and never echoes auth contents |
| `local-harness.test.ts` | Approved/pending/rejected scenarios + CLI smoke + interactive stdin |

All against in-memory or local-FS implementations with a fake-hermes node script (`writeFakeHermesCommand`). No real Bedrock/OpenAI/Anthropic/Codex call in tests.

---

## What's wired vs missing — current state

### Wired
- [x] Both Dockerfiles build via `cdk deploy`, pushed to ECR.
- [x] Smoke family launched by Step Functions on every `POST /runs`.
- [x] Resident image now contains the real Hermes CLI (`/opt/hermes/.venv/bin/hermes`) via `nousresearch/hermes-agent:latest` base.
- [x] Resident task definition deployed (`agents-cloud-dev-resident-runner:4`).
- [x] `RUNNER_API_TOKEN` and `HERMES_AUTH_JSON_BOOTSTRAP` flow from Secrets Manager → ECS env → entrypoint → `auth.json`.
- [x] Resident server fail-closes in `ecs-resident` mode without a token.
- [x] `hermes-cli` is now the only adapter; `smoke` adapter fully removed.
- [x] Path-traversal hardening on `runId`/`taskId`.
- [x] Bearer auth on every route incl. localhost `/credentials/hermes-auth`.
- [x] Tenant boundary checks at agent registration; allowlisted subprocess env.
- [x] One live AWS exercise reaching Codex backend (provider 429, not container failure).

### Still missing
- [ ] **Resident-runner dispatcher.** Nothing in `services/control-api/src/` or anywhere in `infra/cdk/src/` calls `ecs:RunTask` against `task-definition/agents-cloud-{env}-resident-runner:*`. There is no `runner-dispatcher.ts`. `user-runners.ts` only persists Dynamo state.
- [ ] **Resident-runner reachability.** No ALB, no Cloud Map, no Service Connect. The container exposes 8787 on its task ENI but no public/private endpoint resolves to it. Any caller would need to look up the running task's ENI IP and hold the bearer token.
- [ ] **Per-runner brokered tokens.** Today the CDK mints **one** static placeholder bearer Secret for the whole resident task definition. The CDK comment explicitly says "Replace with brokered supervisor tokens before public launch."
- [ ] **Per-tenant env injection at task launch.** Whoever ends up calling RunTask must override `ORG_ID/USER_ID/WORKSPACE_ID/RUNNER_ID/RUNNER_SESSION_ID/AGENT_*` per tenant. The image bakes only `org-local-001`-style local defaults.
- [ ] **Resident-runner durable persistence.** `EventsTable`, `ArtifactsTable`, `RunnerSnapshotsTable`, `AgentInstancesTable`, `UserRunnersTable` are granted but never written by the resident runtime path. State and events are still local-FS only and lost on task exit.
- [ ] **Concurrent agents per runner.** `wake()` iterates serially.
- [ ] **Inbox / wake timer / scheduled heartbeats.** Today only on-demand HTTP `/wake`.
- [ ] **Approval / question / message events** from the resident runner. Spec'd in `RUNTIME_AUTONOMY_AND_EVENT_POLICY.md`, not implemented.
- [ ] **Cancellation / no-progress timeout / stuck detection.** `runProcess` has a single per-spawn timeout (default 30 min); there is no cooperative cancel.
- [ ] **Stale-runner sweeper + `UserRunners` heartbeat writes.**
- [ ] **Tool policy enforcement** before enabling real terminal/file/web/git tools.
- [ ] **Public-multi-tenant credential model.** The placeholder is one shared `auth.json` from Secrets Manager; not safe for cross-user launch.
- [ ] **Provider quota.** OpenAI Codex returned `429 usage_limit_reached` for `gpt-5.5` in the live exercise — orthogonal to wiring, but blocks end-to-end success today.
- [ ] **Smoke worker `seq` hardcoding.** Pre-existing fragility in `worker.ts`; retries hit conditional-check-failed.

---

## How a request reaches each mode (today)

```
POST /runs (control-api)
   │
   ├──► simple-run state machine ──► ecs:runTask.sync
   │                                     │
   │                                     ▼
   │                            agent-runtime smoke task   (Mode A, live)
   │
   └──► (no path)                    resident-runner task   (Mode B, only via aws ecs run-task by an operator)
```

To make Mode B reachable from a user request, the missing pieces are: a resolver that maps `(orgId, userId, workspaceId)` to a `UserRunners` row + active `taskArn`; a dispatcher Lambda or Step Function (or a control-api code path) that calls `ecs:RunTask` against the resident family with per-tenant overrides; a way to discover the running task's address (Service Connect / Cloud Map / private ALB); a brokered per-runner bearer token; and a wake/inbox channel that's safe to expose. None of that is in the repo yet.

---

## Local development

Image and run scripts (in root `package.json`):

- `pnpm agent-runtime:resident:server` — build + run `node dist/src/resident-runner-server.js` directly (no Docker, dev mode).
- `pnpm agent-runtime:resident:docker:build` — build `agents-cloud-agent-runtime-resident:local`.
- `pnpm agent-runtime:resident:docker` — `docker run --rm -p 127.0.0.1:8787:8787 -e RUNNER_API_TOKEN=test-token agents-cloud-agent-runtime-resident:local`.

In dev mode (no `AGENTS_RUNTIME_MODE=ecs-resident`), the server accepts unauthenticated requests if `RUNNER_API_TOKEN` is unset, but `/credentials/hermes-auth` *always* requires the token (server returns 403 otherwise).

`services/agent-runtime/src/local-harness.ts` and `local-runner-cli.ts` remain the deterministic scripted scenario for in-process iteration: a Manager + Specialist pair, six tool calls, one approval gate around `preview.register_static_site`, and a Markdown report (plus a static-site artifact when approved). Used by tests and `pnpm agent-runtime:local`. Not a deployment target.

---

## Comparison: smoke vs resident, today

| Concern | Smoke worker | Resident runner |
|---|---|---|
| Image built by `cdk deploy` | ✅ | ✅ |
| Pushed to ECR | ✅ | ✅ |
| Fargate TaskDefinition deployed | ✅ | ✅ (`:4` in dev) |
| Has IAM to Dynamo/S3 | ✅ | ✅ (broader: 14 tables) |
| Anyone calls `ecs:RunTask` from code | ✅ via Step Functions | ❌ (only manual `aws ecs run-task`) |
| Reachable from control-api over network | ✅ (start by SFN) | ❌ (no ALB, no Cloud Map, ENI-only) |
| Calls a real model | ❌ smoke string | ✅ spawns real `hermes chat` |
| Hermes binary in image | ❌ | ✅ `/opt/hermes/.venv/bin/hermes` (Hermes base image) |
| Persists run.status / artifact.created to DDB | ✅ | ❌ (local NDJSON only) |
| Provider auth path | ❌ none | ✅ Secrets Manager → entrypoint → `auth.json` 0600 |
| Bearer-token auth on HTTP API | n/a | ✅ fail-closed in ecs-resident mode |

---

## Hackathon plan

The two highest-leverage items are unchanged in priority but the resident-side cost has dropped because the container is now real:

1. **Replace smoke with a real model call** in `worker.ts` for the simple stateless path — single PR, ~half a day.
2. **Implement the resident-runner dispatcher** — pick a `UserRunner` row, call `ecs:RunTask` against the resident family with per-tenant env overrides, store `taskArn`, expose a way for control-api to `POST /wake` (Service Connect or a private ALB plus a per-runner bearer Secret). With the image and task definition already proven in AWS, this is now a control-plane and networking task, not a container task. ~1–2 days.

See `docs/agent-workstreams/agent-harness/RESIDENT_RUNNER_PRODUCTION_ROUTING_PLAN.md` for the full target shape (Runner Router → UserRunners → ECS RunTask → Resident Runner → Inbox + Events + Artifacts → Realtime relay) and `RESIDENT_ECS_CONTAINER.md` for the container contract.
