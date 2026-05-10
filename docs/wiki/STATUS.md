# Master Status Checklist

> Single-page checklist of every meaningful component. Linked to its detailed page. Updated 2026-05-10.

[← back to wiki index](README.md)

Legend: ✅ done · ⚠️ partial · ❌ missing/stub · 🗑️ skip for hackathon

---

## Infrastructure (CDK) — see [stacks.md](infrastructure/stacks.md)

- [x] FoundationStack — SSM parameter root ✅
- [x] NetworkStack — VPC, subnets, S3+DDB gateway endpoints ✅
- [x] StorageStack — 4 S3 buckets (workspace-live-artifacts, audit-log w/ Object Lock, preview-static, research-datasets) ✅
- [x] StateStack — 14 DynamoDB tables, all PAY_PER_REQUEST, with required GSIs ✅
- [x] ClusterStack — ECS cluster + CloudWatch log group ✅
- [x] RuntimeStack — agent-runtime + resident-runner Fargate task defs (both Docker images built and pushed) ✅
- [x] OrchestrationStack — `simple-run` Step Function (single state, 2hr timeout) ✅
- [x] ControlApiStack — HttpApi + 11 Lambda handlers + Cognito JWT authorizer ✅
- [x] RealtimeApiStack — WebSocket API + Lambda authorizer + DDB Stream relay ✅
- [ ] PreviewIngressStack — gated by env var; placeholder nginx, not real preview routing ⚠️
- [ ] **PreviewIngress disabled by default** — see [secondary-infra.md](infrastructure/secondary-infra.md) 🗑️ skip
- [ ] Cognito user pool managed by Amplify (not in CDK) — `us-east-1_1UeU1hTME` hardcoded ⚠️

## Secondary infra — see [secondary-infra.md](infrastructure/secondary-infra.md)

- [x] Amplify Auth Gen 2 sandbox deployed ✅
- [x] Amplify Hosting (web frontend deploy pipeline) ✅
- [ ] Cloudflare Realtime worker — built but not deployed 🗑️ skip

---

## Services

### control-api — see [control-api.md](services/control-api.md)
- [x] `POST /runs` (real, transactional, idempotent) ✅
- [x] `GET /runs` user listing (`by-user-created-at` GSI) ✅
- [x] `GET /runs/{runId}` ✅
- [x] `GET /runs/{runId}/events` ✅
- [x] `GET /admin/runs` (Scan, admin-only) ✅
- [x] `GET /admin/runs/{runId}/events` ✅
- [x] WorkItems CRUD (real, by-user GSI) ✅
- [x] Runner state CRUD (heartbeat, hosts, user-runners) ✅
- [x] Agent profiles drafts/list/get/approve ✅
- [x] **Artifacts read + presigned download** — `/runs/{id}/artifacts`, `/work-items/{id}/artifacts`, `/runs/{id}/artifacts/{artifactId}`, `/runs/{id}/artifacts/{artifactId}/download` ✅
- [x] **DataSourceRefs CRUD** — create/list/get ✅
- [x] **Surfaces CRUD + publish** ✅
- [x] **Approvals create/list/decision** ✅
- [ ] `GET /runs/{runId}/tasks` ❌ still missing
- [ ] `ADMIN_EMAILS` hardcoded in CDK source ⚠️

### agent-runtime — see [agent-runtime.md](services/agent-runtime.md)
- [x] Dockerfile builds, pushed to ECR by `cdk deploy` ✅
- [x] Step Functions launches the task on `POST /runs` ✅
- [x] Worker writes run.status, artifact.created events to DDB ✅
- [x] Worker writes Markdown artifact to S3 + ArtifactsTable row ✅
- [ ] **Real model invocation** — `HERMES_RUNNER_MODE=smoke` and image has no `hermes` binary ❌
- [ ] Provider secret broker ❌
- [ ] Resident runner Dockerfile + TaskDef exist ✅ image
- [ ] **Resident runner scheduler / dispatcher** — no code calls `ecs:RunTask` for it ❌
- [ ] Resident runner durable persistence — local FS only, no DDB/S3 mirror ❌
- [ ] Resident runner inbox / wake timers ❌
- [ ] Resident runner concurrent agents — wake() loop is serial ⚠️
- [ ] Real tool execution (file ops, shell, web, MCP) ❌
- [ ] Sandbox / cgroup / network egress policy ❌
- [ ] `RUNNER_API_TOKEN` provisioning ❌
- [ ] Worker seq numbers hardcoded — retry-fragile ⚠️

### realtime-api — see [realtime-api.md](services/realtime-api.md)
- [x] `$connect` WebSocket Lambda authorizer (Cognito ID token) ✅
- [x] Connection records persisted with `userId` ✅
- [x] `subscribeRun` / `unsubscribeRun` actions ✅
- [x] DDB Stream → relay Lambda → `postToConnection` fanout ✅
- [x] Stale-connection cleanup on `GoneException` ✅
- [x] `userId` filter on event delivery (cross-user leak prevented) ✅
- [ ] Subscription ownership check — any auth user can subscribe to any run-id ⚠️
- [ ] Replay / cursor / gap detection ❌

### Other services — see [other-services.md](services/other-services.md)
- [x] agent-creator — workshop CLI, S3 bundling, smoke-tested ✅ (not wired to HTTP)
- [ ] agent-manager — README only, no code ❌
- [ ] builder-runtime — README only ❌
- [ ] event-relay — README only (AWS→Cloudflare not built; not needed if Cloudflare deferred) 🗑️
- [ ] miro-bridge — README only ❌
- [ ] preview-router — README only ❌

---

## Clients

### Web (Next.js) — see [web.md](clients/web.md)
- [x] Amplify Auth (Authenticator modal, sign-in / sign-out / storage cleanup) ✅
- [x] `POST /runs` create run, polling `/events`, WebSocket subscribe ✅
- [x] Admin console: runner-fleet, lineage timeline, agent workshop, failure watch ✅
- [x] Mock + dev-auth-bypass modes for offline self-test ✅
- [ ] WorkDashboard real data (currently fixture-only) ❌
- [ ] Workspace selection (hardcoded `"workspace-web"`) ⚠️
- [ ] Validated GenUI rendering ❌
- [ ] Approvals UI (Approve/Reject hooked up) ❌
- [ ] Voice/call button (placeholder only) ❌
- [ ] User runs listing page (no `/runs` endpoint) ❌

### Flutter (desktop_mobile) — see [flutter.md](clients/flutter.md)
- [x] Amplify config loaded at boot ✅
- [x] Local GenUI surface controller with seeded fixtures ✅
- [x] Fixture WorkRepository + domain models ✅
- [x] Webview for preview URLs ✅
- [ ] **Sign-in UI** ❌
- [ ] **`fetchAuthSession` / ID token retrieval** ❌
- [ ] **Control API calls** (client class exists, never invoked) ❌
- [ ] **WebSocket realtime** ❌
- [ ] GenUI from event stream (currently local seed only) ❌
- [ ] Hardcoded Cognito IDs in source ⚠️
- [ ] Most pages are static literals (Runs, Agents, Approvals, Artifacts, Miro) ⚠️

### agent_console_flutter
- [ ] Orphan/dead — only a build cache 🗑️ delete

---

## Product surfaces

### Work items — see [work-items.md](surfaces/work-items.md)
- [x] DDB table with by-user GSI ✅
- [x] Full CRUD HTTP routes ✅
- [ ] Web fetcher (currently fixture) ❌
- [ ] Flutter fetcher (currently fixture) ❌
- [ ] Canonical `workitem.status.changed` event ❌

### Runs & tasks — see [runs-and-tasks.md](surfaces/runs-and-tasks.md)
- [x] Schema + storage + API + worker + realtime + web ✅
- [ ] `GET /runs` user listing ❌
- [ ] Flutter run live timeline ❌
- [ ] `GET /runs/{runId}/tasks` route ❌

### Artifacts — see [artifacts.md](surfaces/artifacts.md)
- [x] Schema, storage, worker writes (S3 + DDB row + event), realtime ✅
- [x] **HTTP routes (list + get + download)** ✅
- [x] **Signed S3 URL via `/download`** ✅
- [ ] Web standalone artifacts page ❌
- [ ] Flutter live data ❌

### Approvals & notifications — see [approvals-and-notifications.md](surfaces/approvals-and-notifications.md)
- [x] Approvals schema, storage table provisioned ✅
- [x] **Approvals HTTP routes** (create/list/decision) ✅
- [x] **Approvals handler / store** ✅
- [ ] Worker emits `tool.approval` requests ⚠️ harness only
- [ ] Web/Flutter approvals UI ❌
- [ ] Notifications — does not exist at any layer 🗑️ defer

### Generated UI / GenUI — see [generated-ui.md](surfaces/generated-ui.md)
- [x] `a2ui-delta` event schema ✅
- [x] SurfacesTable provisioned ✅
- [ ] Surface record schema ❌
- [x] **HTTP routes** (CRUD + publish) ✅
- [ ] Worker emits a2ui events ❌
- [ ] Realtime carries a2ui events (no producer) ❌
- [ ] Web renderer ❌
- [x] Flutter local-seed renderer ✅ (not wired to events)

### Data sources — see [data-sources.md](surfaces/data-sources.md)
- [ ] Schema ❌ (TS only)
- [x] Table provisioned ✅
- [x] **HTTP routes** (create/list/get) ✅
- [ ] Worker / realtime / web / Flutter ❌

---

## Multi-user concurrent readiness — see [multi-user-routing.md](flows/multi-user-routing.md)

- [x] Cognito `sub` propagated through HTTP → DDB → SFN → ECS env → worker → events ✅
- [x] WebSocket relay filters by event `userId` ✅
- [x] Owner-scoped reads on `getRun`, `requireOwnedWorkItem`, `requireOwnedProfile` ✅
- [x] DDB tables PAY_PER_REQUEST (no quota tuning) ✅
- [x] Step Functions concurrency unbounded; one Fargate task per run ✅
- [ ] **userId → resident-runner dispatch** — does not exist ❌ blocking
- [ ] **`UserRunner` placement scheduler** — does not exist ❌ blocking
- [ ] `RUNNER_API_TOKEN` provisioning per runner ❌ blocking
- [ ] `subscribeRun` ownership check ⚠️
- [ ] Run-listing endpoint per user ❌

---

## Skip list (per hackathon scope) — see [gaps.md](gaps.md)

- 🗑️ ADR-0010 access-codes / Workspaces / WorkspaceMemberships — replace with userId table-routing
- 🗑️ Cognito user groups — not implemented anywhere; skip
- 🗑️ Cloudflare realtime — keep on AWS only
- 🗑️ Preview ingress — disabled
- 🗑️ Deep IAM least-privilege audits
- 🗑️ CI/CD pipelines (run tests locally)
- 🗑️ EFS / hot POSIX workspace — not needed
- 🗑️ EventBridge/SQS event-relay service — not needed without Cloudflare
- 🗑️ Miro / GitHub / Self-improvement — out of hackathon scope
