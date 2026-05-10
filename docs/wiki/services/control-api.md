# control-api

[← services](README.md) · [wiki index](../README.md) · related: [ControlApiStack](../infrastructure/stacks.md#controlapistack), [run-creation flow](../flows/run-creation.md)

> HTTP API for the durable run lifecycle, work items, runner state, agent profiles, generated UI surfaces, data sources, and approvals. Deployed as 13 Lambda functions behind API Gateway HttpApi with Cognito JWT authorization.

**Maturity:** ✅ production-shaped (for routes that exist).
**Source:** `services/control-api/src/`
**Tests:** 9 files in `services/control-api/test/`
**Deployment:** [ControlApiStack](../infrastructure/stacks.md#controlapistack)
**Live URL:** `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`

---

## Routes (current)

### Real, working

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/runs` | listRunsHandler | User-scoped listing using `by-user-created-at`. |
| POST | `/runs` | createRunHandler | Transactional ledger, idempotent. See [run-creation.md](../flows/run-creation.md). |
| GET | `/runs/{runId}` | getRunHandler | Owner-scoped via `userId !== user.userId → 404`. |
| GET | `/runs/{runId}/events` | listRunEventsHandler | Owner-scoped. |
| GET | `/admin/runs` | listAdminRunsHandler | Scan, admin-only via `ADMIN_EMAILS`. |
| GET | `/admin/runs/{runId}/events` | listAdminRunEventsHandler | Admin-only. |
| GET | `/admin/runners` | (runner-state) | Admin-only. List host nodes + user runners. |
| POST/GET/PATCH | `/work-items[/{id}][/status][/runs][/events]` | workItemsHandler | 6 routes — full CRUD + child runs. |
| POST/GET/PATCH | `/runner-hosts[/{hostId}/heartbeat]` | runnerStateHandler | Host registration + heartbeat. |
| POST/GET/PATCH | `/user-runners[/{runnerId}][/heartbeat]` | runnerStateHandler | Per-user runner ledger. |
| POST/GET | `/agent-profiles[/drafts][/{id}/versions/{v}[/approve]]` | agentProfilesHandler | Profile lifecycle, S3-backed bundles. |
| GET/POST | `/work-items/{id}/artifacts` | artifactsHandler | List artifacts by WorkItem, owner-scoped. |
| GET | `/runs/{runId}/artifacts` | artifactsHandler | List artifacts by run, owner-scoped. |
| GET | `/runs/{runId}/artifacts/{artifactId}` | artifactsHandler | Retrieve artifact metadata. |
| GET | `/runs/{runId}/artifacts/{artifactId}/download` | artifactsHandler | Presigned S3 download URL. |
| POST/GET | `/data-source-refs[/{id}]` | dataSourceRefsHandler | Create/get/list data source refs. |
| GET | `/work-items/{workItemId}/data-source-refs` | dataSourceRefsHandler | Owner-scoped lookup. |
| GET | `/runs/{runId}/data-source-refs` | dataSourceRefsHandler | Owner-scoped lookup. |
| POST/GET/PATCH | `/surfaces[/{surfaceId}]` | surfacesHandler | Create/read/update surfaces. |
| POST | `/surfaces/{surfaceId}/publish` | surfacesHandler | Publish updates. |
| GET | `/work-items/{workItemId}/surfaces` | surfacesHandler | Owner-scoped lookup. |
| GET | `/runs/{runId}/surfaces` | surfacesHandler | Owner-scoped lookup. |
| POST/GET | `/approvals` | approvalsHandler | Create/get approvals. |
| GET | `/runs/{runId}/approvals` | approvalsHandler | Owner-scoped approval list. |
| POST | `/approvals/{approvalId}/decision` | approvalsHandler | Approve/reject decision endpoint. |

### 501 NotImplemented stubs

No remaining 501 stubs for routes implemented in this phase.

| Method | Path | Status |
|---|---|---|
| `GET /runs/{runId}/tasks` | ❌ not added |

### Routes that don't exist

| Path | Why missing | Hackathon priority |
|---|---|---|
| `GET /runs/{id}/tasks` | Not added; query on TasksTable PK still unimplemented | Low |

---

## Source layout

```
services/control-api/src/
├── handlers.ts            # All 13 Lambda entrypoints
├── create-run.ts          # POST /runs implementation
├── query-runs.ts          # GET run / events / admin runs / GET /runs (user listing)
├── work-items.ts          # WorkItems CRUD + child run create
├── user-runners.ts        # UserRunners + HostNodes routes
├── agent-profiles.ts      # AgentProfiles CRUD + approve
├── artifacts.ts           # Artifact list/get + presigned download (commits 76505c3, 0c60353)
├── data-source-refs.ts    # Data source reference routes (f550bad)
├── surfaces.ts            # Surface CRUD + publish + validation (f550bad, ba54101)
├── approvals.ts           # Approval create/list/get/decision (f550bad)
├── s3-presigner.ts        # GetObjectCommand + getSignedUrl helper for downloads
├── dynamo-store.ts        # All DynamoDB access
├── step-functions.ts      # StartExecution wrapper
├── ports.ts               # Interfaces (Store, ExecutionStarter, etc.)
└── env.ts                 # Env var validation
```

## Authentication & authorization

| Layer | Mechanism | File |
|---|---|---|
| Ingress | API Gateway HttpJwtAuthorizer (Cognito) | infra/cdk/src/stacks/control-api-stack.ts:36 |
| Extract userId | `event.requestContext.authorizer.jwt.claims.sub` | handlers.ts:391 (`userFromEvent`) |
| Run ownership | `record.userId !== user.userId → 404` | query-runs.ts:14 |
| WorkItem ownership | `requireOwnedWorkItem(record, userId)` | work-items.ts:193 |
| AgentProfile ownership | `requireOwnedProfile(record, userId)` | agent-profiles.ts:230 |
| UserRunner ownership | `getUserRunner(userId, runnerId)` keyed lookup | user-runners.ts:121 |
| Admin gate | `ADMIN_EMAILS` env match | query-runs.ts:130 |

**`ADMIN_EMAILS` is hardcoded** in CDK source: `infra/cdk/src/stacks/control-api-stack.ts:63` → `"seb4594@gmail.com"`. To add admins, edit and redeploy.

---

## DynamoDB tables consumed

`dynamo-store.ts:19-36` reads from env:
- `WORK_ITEMS_TABLE_NAME`
- `RUNS_TABLE_NAME`
- `TASKS_TABLE_NAME`
- `EVENTS_TABLE_NAME`
- `ARTIFACTS_TABLE_NAME`
- `DATA_SOURCES_TABLE_NAME`
- `SURFACES_TABLE_NAME`
- `APPROVALS_TABLE_NAME`
- `HOST_NODES_TABLE_NAME`
- `USER_RUNNERS_TABLE_NAME`
- `AGENT_PROFILES_TABLE_NAME`

All five entity families are used by dedicated route handlers in this phase.

---

## Idempotency model

`POST /runs` and `POST /work-items` use a deterministic idempotency scope:

```
idempotencyScope = `${userId}#${workspaceId}#${idempotencyKey}`
```

Stored on the Run/WorkItem row. Lookup via GSI `by-idempotency-scope`. On hit:
- If `executionArn` already set → return 202 with the existing run.
- Otherwise restart Step Functions and patch the row.

Step Functions `StartExecution` uses `name = runId`, so a duplicate-name attempt is treated as `ExecutionAlreadyExists` (a second idempotency layer).

---

## Test coverage

`services/control-api/test/` — 11 test files:
- `create-run.test.ts` — happy path + idempotency duplicate handling
- `query-runs.test.ts` — owner gates + admin
- `work-items.test.ts`
- `user-runners.test.ts`
- `agent-profiles.test.ts` — drafts, list, approve
- `artifacts.test.ts` — listRunArtifacts, listWorkItemArtifacts, getRunArtifact, presigned download URL
- `data-source-refs.test.ts` — create / get / list (run + workitem scoped)
- `surfaces.test.ts` — 11 cases covering type/status validation, 64KiB cap, full CRUD ownership
- `idempotency.test.ts`
- `dynamo-store.test.ts`
- `admin-runs.test.ts`

Run: `pnpm control-api:test`.

---

## Hackathon-relevant notes

- ✅ Cognito JWT auth works end-to-end. New users sign up via web Authenticator and immediately get usable userId.
- ✅ DDB PAY_PER_REQUEST scales unbounded for hackathon load.
- ✅ Per-user filtering uses real GSI queries (no scans for user-facing reads).
- ⚠️ `EventRecord.orgId` field exists in `ports.ts:102` but `create-run.ts:89-105` doesn't populate it. Inert today; may cause confusion if any downstream filter relies on it.
- ⚠️ `GET /runs/{runId}/tasks` still missing for task-level details.

---

## Surface page links

- [Runs & tasks](../surfaces/runs-and-tasks.md)
- [Work items](../surfaces/work-items.md)
- [Artifacts](../surfaces/artifacts.md)
- [Approvals & notifications](../surfaces/approvals-and-notifications.md)
- [Generated UI](../surfaces/generated-ui.md)
- [Data sources](../surfaces/data-sources.md)
