# Environment Variables Reference

[← reference](README.md) · [wiki index](../README.md)

> Every environment variable consumed across the stack. Grouped by subsystem.

---

## Quick bootstrap (local dev / fresh deploy)

```bash
# AWS
export AWS_PROFILE=agents-cloud-source
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1

# CDK synth
export AGENTS_CLOUD_ENV=dev
export AGENTS_CLOUD_AWS_REGION=us-east-1

# Optional: override Cognito (defaults point at Amplify sandbox)
# export AGENTS_CLOUD_COGNITO_USER_POOL_ID=us-east-1_xxxxx
# export AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID=xxxxx

# Optional: real Hermes execution (requires hermes binary in image)
# export AGENTS_CLOUD_HERMES_RUNNER_MODE=cli
```

---

## CDK synth-time variables

Read by `infra/cdk/src/config/environments.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `AGENTS_CLOUD_ENV` | `dev` | dev / staging / prod — drives PITR, deletion protection, NAT count, log retention |
| `AGENTS_CLOUD_APP_NAME` | `agents-cloud` | Resource name prefix |
| `AGENTS_CLOUD_AWS_REGION` | `us-east-1` | Region (falls back to `CDK_DEFAULT_REGION`) |
| `CDK_DEFAULT_REGION` | — | Standard AWS env, fallback for region |
| `CDK_DEFAULT_ACCOUNT` | — | Standard AWS env, account id |
| `AGENTS_CLOUD_MAX_AZS` | `2` | AZ count |
| `AGENTS_CLOUD_NAT_GATEWAYS` | `1` (dev) / `2` (prod) | NAT GW count |
| `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED` | unset | Enables `PreviewIngressStack` if `"true"` |
| `AGENTS_CLOUD_PREVIEW_BASE_DOMAIN` | unset | Preview base domain |
| `AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN` | unset | ACM cert ARN (us-east-1) |
| `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID` | unset | Route 53 hosted zone id |
| `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME` | = base domain | Route 53 hosted zone name |
| `AGENTS_CLOUD_COGNITO_USER_POOL_ID` | **hardcoded `us-east-1_1UeU1hTME`** | Amplify sandbox |
| `AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID` | **hardcoded `3kq79rodc3ofjkulh0b31sfpos`** | Amplify sandbox |
| `AGENTS_CLOUD_HERMES_RUNNER_MODE` | `smoke` | Worker mode injected into ECS env |
| `AGENTS_CLOUD_RESIDENT_ADAPTER` | `smoke` | Resident-runner adapter mode |
| `AGENTS_CLOUD_RESIDENT_MODEL_PROVIDER` | `openai-codex` | Provider for resident-runner |
| `AGENTS_CLOUD_RESIDENT_MODEL` | `""` | Model name for resident-runner |
| `AGENTS_CLOUD_RESIDENT_HERMES_MAX_TURNS` | `8` | Max turns inside resident-runner |
| `AGENTS_CLOUD_HERMES_AUTH_SECRET_NAME` | `agents-cloud/{env}/resident-runner/hermes-auth-json` | Secrets Manager secret for Hermes credentials |

---

## Control API Lambda runtime

Read by `services/control-api/src/dynamo-store.ts` (`fromEnvironment()`) and handler files.

| Variable | Source | Purpose |
|---|---|---|
| `WORK_ITEMS_TABLE_NAME` | CDK | DDB table name |
| `RUNS_TABLE_NAME` | CDK |  |
| `TASKS_TABLE_NAME` | CDK |  |
| `EVENTS_TABLE_NAME` | CDK |  |
| `ARTIFACTS_TABLE_NAME` | CDK | (granted but not read in store) |
| `DATA_SOURCES_TABLE_NAME` | CDK | (granted but not read in store) |
| `SURFACES_TABLE_NAME` | CDK | (granted but not read in store) |
| `HOST_NODES_TABLE_NAME` | CDK |  |
| `USER_RUNNERS_TABLE_NAME` | CDK |  |
| `AGENT_PROFILES_TABLE_NAME` | CDK |  |
| `PROFILE_BUNDLES_BUCKET_NAME` | CDK | = WorkspaceLiveArtifactsBucket |
| `STATE_MACHINE_ARN` | CDK | Step Functions ARN |
| `ADMIN_EMAILS` | CDK | **hardcoded `seb4594@gmail.com`** |

---

## Agent runtime (ECS task) — stateless worker

Read by `services/agent-runtime/src/index.ts` and friends.

### Run-time env (set by Step Functions ContainerOverrides)

| Variable | Required | Purpose |
|---|---|---|
| `RUN_ID` | yes | run identifier |
| `TASK_ID` | yes | task identifier |
| `WORKSPACE_ID` | yes | workspace label |
| `WORK_ITEM_ID` | yes (may be `""`) | parent work item |
| `USER_ID` | yes | Cognito sub |
| `OBJECTIVE` | yes | natural-language goal |

### Container env (set by RuntimeStack at synth time)

| Variable | Default | Purpose |
|---|---|---|
| `AGENTS_CLOUD_ENV` | `dev` |  |
| `AGENTS_CLOUD_WORKER_KIND` | `agent-runtime-hermes` | classifier |
| `HERMES_RUNNER_MODE` | `smoke` | smoke vs cli |
| `HERMES_COMMAND` | `hermes` | path to binary |
| `HERMES_TIMEOUT_MS` | `120000` | spawn timeout |
| `HERMES_MODEL` | unset | model name passed to hermes |
| `HERMES_PROVIDER` | unset | provider name |
| `HERMES_TOOLSETS` | `web,file,terminal` | comma toolset names |
| `WORK_ITEMS_TABLE_NAME` | (CDK) |  |
| `RUNS_TABLE_NAME` | (CDK) |  |
| `TASKS_TABLE_NAME` | (CDK) |  |
| `EVENTS_TABLE_NAME` | (CDK) |  |
| `ARTIFACTS_TABLE_NAME` | (CDK) |  |
| `DATA_SOURCES_TABLE_NAME` | (CDK) |  |
| `SURFACES_TABLE_NAME` | (CDK) |  |
| `ARTIFACTS_BUCKET_NAME` | (CDK) | WorkspaceLiveArtifactsBucket |

---

## Resident runner (ECS task) — `Dockerfile.resident`

Read by `services/agent-runtime/src/resident-runner.ts` and `resident-runner-server.ts`.

### Container identity

| Variable | Default | Purpose |
|---|---|---|
| `AGENTS_RUNTIME_MODE` | `ecs-resident` | `resident-dev` for local |
| `AGENTS_RUNNER_ROOT` | `/runner` | working dir |
| `AGENTS_RESIDENT_ADAPTER` | `smoke` | `hermes-cli` for real |
| `AGENTS_MODEL_PROVIDER` | `openai-codex` | provider for adapter |
| `AGENTS_MODEL` | `""` | model name |
| `AGENTS_HERMES_MAX_TURNS` | `8` | max iterations |
| `AGENTS_RESIDENT_PROFILES_JSON` | `[]` | JSON array of seeded profiles |
| `AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT` | unset | ⚠️ if `"1"`, do NOT strip provider keys |
| `AGENTS_HERMES_YOLO` | unset | ⚠️ disable safety checks |
| `HERMES_HOME` | `${AGENTS_RUNNER_ROOT}/hermes` | hermes config dir |
| `HERMES_ACCEPT_HOOKS` | unset | enable hermes hooks |

### Network/identity

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP server port |
| `RUNNER_API_TOKEN` | required in `ecs-resident` mode | Bearer token for HTTP API |
| `RUNNER_ID` | `runner-local-001` | runner identifier (override per task) |
| `RUNNER_SESSION_ID` | `session-{timestamp}` | session label |
| `ORG_ID` | `org-local-001` | org scope |

### Tables (granted RW)

Resident runner has IAM grants on every table; env vars must be passed:
`WORK_ITEMS_TABLE_NAME`, `RUNS_TABLE_NAME`, `TASKS_TABLE_NAME`, `EVENTS_TABLE_NAME`, `DATA_SOURCES_TABLE_NAME`, `SURFACES_TABLE_NAME`, `APPROVALS_TABLE_NAME`, `PREVIEW_DEPLOYMENTS_TABLE_NAME`, `HOST_NODES_TABLE_NAME`, `USER_RUNNERS_TABLE_NAME`, `RUNNER_SNAPSHOTS_TABLE_NAME`, `AGENT_INSTANCES_TABLE_NAME`, `AGENT_PROFILES_TABLE_NAME`. ⚠️ Resident runner doesn't actually use these yet — local FS only.

### Per-agent env (set by `/wake` API)

| Variable | Purpose |
|---|---|
| `AGENT_ID` | logical agent id |
| `AGENT_PROFILE_ID` | profile id |
| `AGENT_PROFILE_VERSION` | version |
| `AGENT_ROLE` | role |

---

## Realtime API Lambda runtime

| Variable | Source | Purpose |
|---|---|---|
| `REALTIME_CONNECTIONS_TABLE_NAME` | CDK | DDB connections table |
| `WEBSOCKET_CALLBACK_URL` | CDK | for `postToConnection` |
| `COGNITO_USER_POOL_ID` | CDK | JWT verify |
| `COGNITO_USER_POOL_CLIENT_ID` | CDK | JWT verify |

---

## Web app (Next.js)

Read at build time (Next.js inlines `NEXT_PUBLIC_*`). `apps/web/.env.example` lists them.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AMPLIFY_REGION` | `us-east-1` | Cognito region |
| `NEXT_PUBLIC_AMPLIFY_USER_POOL_ID` | `us-east-1_1UeU1hTME` | Cognito User Pool |
| `NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID` | `3kq79rodc3ofjkulh0b31sfpos` | Cognito User Pool Client |
| `NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID` | `us-east-1:5562c7da-...` | Identity Pool |
| `NEXT_PUBLIC_AGENTS_CLOUD_API_URL` | required | Control API endpoint |
| `NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL` | required | WebSocket endpoint (`wss://...`) |
| `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK` | unset | `1` to enable mock mode |
| `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS` | unset | `1` to skip Authenticator |

---

## AWS credentials & deployment

| Variable | Used by | Purpose |
|---|---|---|
| `AWS_PROFILE` | aws-cli, CDK | named profile (default `agents-cloud-source`) |
| `AWS_REGION` | aws-cli | region |
| `AWS_DEFAULT_REGION` | aws-cli (legacy) | region fallback |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | sdk | credentials (usually from `~/.aws/credentials`) |

---

## Third-party services

| Variable | Used by | Purpose |
|---|---|---|
| `EXA_API_KEY` | research helpers (CLI) | Exa search API key |
| `OPENROUTER_API_KEY` | resident runner (when wired) | OpenRouter API key — **stripped from subprocess unless `AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT=1`** |

---

## Where each is set

| Origin | What it sets |
|---|---|
| `~/.aws/credentials` or `aws sso login` | `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, etc. |
| `.env.local` (root) | Local CDK / build env: `AGENTS_CLOUD_*`, `EXA_API_KEY`, etc. |
| `apps/web/.env.local` | `NEXT_PUBLIC_*` for Next.js |
| `infra/cdk/src/stacks/runtime-stack.ts` | All ECS container env vars (via `containerEnvironment` and synth-time `process.env`) |
| `infra/cdk/src/stacks/control-api-stack.ts:50-64` | Lambda commonEnvironment + `ADMIN_EMAILS` |
| `infra/cdk/src/stacks/realtime-api-stack.ts` | Realtime Lambda env |
| Step Functions input | `RUN_ID, TASK_ID, USER_ID`, etc. (per-execution) |
| ECS task secrets | `RUNNER_API_TOKEN` (would come from Secrets Manager — currently undefined) |

[← reference](README.md)
