# CDK Stacks (deep reference)

[← infrastructure](README.md) · [wiki index](../README.md)

Every stack documented from `infra/cdk/src/stacks/`. Composition entrypoint: `infra/cdk/src/bin/agents-cloud-cdk.ts`. Config loader: `infra/cdk/src/config/environments.ts`.

## Global config

Loaded once via `loadConfig()`:

| Env var | Default | Purpose |
|---|---|---|
| `AGENTS_CLOUD_ENV` | `dev` | dev/staging/prod — controls PITR, deletion protection, NAT count, log retention |
| `AGENTS_CLOUD_APP_NAME` | `agents-cloud` | resource name prefix |
| `AGENTS_CLOUD_AWS_REGION` | `us-east-1` | region |
| `AGENTS_CLOUD_MAX_AZS` | `2` | AZ count |
| `AGENTS_CLOUD_NAT_GATEWAYS` | `1` (dev) / `2` (prod) | NAT GW count |
| `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED` | unset | gate `PreviewIngressStack` |
| `AGENTS_CLOUD_PREVIEW_BASE_DOMAIN` | unset | preview ingress |
| `AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN` | unset | preview ingress |
| `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID` | unset | preview ingress |
| `AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME` | unset | preview ingress |
| `AGENTS_CLOUD_COGNITO_USER_POOL_ID` | **hardcoded `us-east-1_1UeU1hTME`** | Amplify sandbox |
| `AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID` | **hardcoded `3kq79rodc3ofjkulh0b31sfpos`** | Amplify sandbox |
| `AGENTS_CLOUD_HERMES_RUNNER_MODE` | `smoke` | worker mode (synth-time) |
| `AGENTS_CLOUD_RESIDENT_ADAPTER` | `smoke` | resident-runner mode (synth-time) |

Stack ids: `${appName}-${envName}-${suffix}` → e.g. `agents-cloud-dev-foundation`.

---

## FoundationStack

`infra/cdk/src/stacks/foundation-stack.ts`

**Resources:** SSM `StringParameter` × 3 — `/agents-cloud/<env>/{app-name, environment, aws-region}`.
**Outputs:** `AppName`, `EnvironmentName`.
**Depends on:** none.
**Status:** ✅ deployable. Pure metadata.

---

## NetworkStack

`infra/cdk/src/stacks/network-stack.ts`

**Resources:**
- `Vpc` — CIDR **`10.40.0.0/16`** hardcoded. Subnets: `public`, `private-egress` (PRIVATE_WITH_EGRESS), `isolated` (PRIVATE_ISOLATED), all `cidrMask: 24`.
- `S3Endpoint` — gateway endpoint.
- `DynamoDbEndpoint` — gateway endpoint.
- `WorkerSecurityGroup` — default SG, `allowAllOutbound: true`.

**Outputs:** `VpcId`, `WorkerSecurityGroupId`.
**Depends on:** Foundation.
**Status:** ✅ deployable.
**Hackathon notes:** Hardcoded CIDR conflicts if reused. NAT GW ~$32/mo each.

---

## StorageStack

`infra/cdk/src/stacks/storage-stack.ts`

**Resources (all SSL enforced, BPA on):**
- `WorkspaceLiveArtifactsBucket` — versioned, S3-managed encryption, lifecycle IA@30d / expire-noncurrent@90d.
- `WorkspaceAuditLogBucket` — versioned, **`objectLockEnabled: true`**, `RemovalPolicy.RETAIN` always (irrespective of env).
- `PreviewStaticBucket` — IA@30d / expire-noncurrent@31d.
- `ResearchDatasetsBucket` — IA@60d / expire-noncurrent@180d.

**Outputs:** Bucket names for all four.
**Depends on:** Foundation.
**Status:** ✅ deployable.
**Hackathon notes:** Object Lock cannot be removed once created. Buckets are tenant-shared; per-user prefix scoping enforced at app layer only.

---

## StateStack

`infra/cdk/src/stacks/state-stack.ts`

All `BillingMode.PAY_PER_REQUEST`; PITR if env != `dev`; deletion protection in `prod`.

| # | Table | PK / SK | GSIs | Used by |
|---|---|---|---|---|
| 1 | `WorkItemsTable` | workspaceId / workItemId | by-user-created-at, by-status-updated-at, by-idempotency-scope | control-api |
| 2 | `RunsTable` | workspaceId / runId | by-user-created-at, by-run-id, by-idempotency-scope, by-workitem-created-at | control-api, worker |
| 3 | `TasksTable` | runId / taskId | by-worker-class-created-at | control-api, worker |
| 4 | `EventsTable` | runId / seq | by-workspace-created-at; **Stream NEW_IMAGE** | worker (write), realtime relay (read) |
| 5 | `ArtifactsTable` | runId / artifactId | by-workspace-kind-created-at, by-workitem-created-at | worker (write); no reads in code yet |
| 6 | `DataSourcesTable` | workspaceId / dataSourceId | by-workitem-created-at, by-run-created-at, by-artifact-id | unused |
| 7 | `SurfacesTable` | workspaceId / surfaceId | by-workitem-updated-at, by-run-updated-at, by-status-updated-at | unused |
| 8 | `ApprovalsTable` | workspaceId / approvalId | by-run-created-at | unused |
| 9 | `PreviewDeploymentsTable` | previewHost / deploymentId | by-workspace-updated-at, by-project-updated-at | unused |
| 10 | `RealtimeConnectionsTable` | pk / sk | by-connection | realtime-api |
| 11 | `HostNodesTable` | hostId / hostRecordType | by-status-last-heartbeat, by-placement-target-status | control-api |
| 12 | `UserRunnersTable` | **userId** / runnerId | by-runner-id, by-host-status, by-status-last-heartbeat, by-desired-state-updated-at | control-api (no actuator) |
| 13 | `RunnerSnapshotsTable` | runnerId / snapshotId | by-user-created-at, by-workspace-created-at | unused |
| 14 | `AgentInstancesTable` | runnerId / agentId | by-user-status-updated-at, by-next-wake-at | unused |
| 15 | `AgentProfilesTable` | workspaceId / profileVersionKey | by-user-created-at, by-lifecycle-updated-at | control-api |

**Outputs:** one per table (`<env>-<suffix>-table-name`).
**Status:** ✅ deployable.
**Hackathon notes:** `dynamo-store.ts:19-36` reads only WorkItems/Runs/Tasks/Events/HostNodes/UserRunners/AgentProfiles env vars. Artifacts/DataSources/Surfaces/Approvals tables are wired (IAM grants, env vars on stub Lambdas) but DynamoControlApiStore doesn't use them yet.

---

## ClusterStack

`infra/cdk/src/stacks/cluster-stack.ts`

**Resources:**
- `Cluster` — ECS cluster `agents-cloud-<env>-cluster` attached to NetworkStack VPC.
- `AgentRuntimeLogGroup` — `/aws/agents-cloud/<env>/ecs/agent-runtime`. Retention 1mo dev / 3mo prod.

**Outputs:** `ClusterName`, `AgentRuntimeLogGroupName`.
**Depends on:** Network.
**Status:** ✅ deployable.

---

## RuntimeStack

`infra/cdk/src/stacks/runtime-stack.ts`

**Two TaskDefinitions, both Fargate:**

### `AgentRuntimeTaskDefinition`
- 512 CPU / 1024 MiB.
- Image: `DockerImageAsset` from `services/agent-runtime/Dockerfile`, `LINUX_AMD64`. `cdk deploy` builds and pushes to bootstrap ECR.
- Container env: `AGENTS_CLOUD_ENV`, `AGENTS_CLOUD_WORKER_KIND=agent-runtime-hermes`, `HERMES_RUNNER_MODE` (default `smoke`), all 7 active table-name vars, `ARTIFACTS_BUCKET_NAME`.
- Used by: OrchestrationStack `simple-run` Step Function.

### `ResidentRunnerTaskDefinition` (NEW, uncommitted)
- 1024 CPU / 2048 MiB.
- Image: `DockerImageAsset` from `services/agent-runtime/Dockerfile.resident`. Adds `ca-certificates curl git openssh-client python3 tini`. Non-root `runner` user uid 10000, port 8787, `tini` entrypoint.
- Container env: `AGENTS_CLOUD_ENV`, `AGENTS_RUNTIME_MODE=ecs-resident`, `AGENTS_RESIDENT_ADAPTER` (default `smoke`), `AGENTS_RUNNER_ROOT=/runner`, `HERMES_HOME=/runner/hermes`, `PORT=8787`, all 14 table names + `ARTIFACTS_BUCKET_NAME`.
- IAM: read/write on all four S3 buckets + all 14 DDB tables.
- **Used by: nothing.** No `ecs:RunTask` caller exists.

**Outputs:** TaskDefinitionArn + ContainerName for both.
**Depends on:** Cluster, Storage, State.
**Status:** ✅ images build + push. ⚠️ resident-runner is dormant TaskDef.
**Hackathon blocker:** see [agent-runtime.md](../services/agent-runtime.md), [multi-user-routing.md](../flows/multi-user-routing.md).

---

## OrchestrationStack

`infra/cdk/src/stacks/orchestration-stack.ts`

**Resources:**
- `RunHermesAgentRuntimeWorker` — Step Functions `CustomState` of type `Task`, resource `arn:aws:states:::ecs:runTask.sync`.
  - TaskDefinition family: `agents-cloud-<env>-agent-runtime` (resident NOT used).
  - LaunchType FARGATE, AssignPublicIp DISABLED.
  - ContainerOverrides inject `RUN_ID, TASK_ID, WORKSPACE_ID, WORK_ITEM_ID, USER_ID, OBJECTIVE` from input.
- `SimpleRunStateMachine` — name `agents-cloud-<env>-simple-run`, timeout 2h.
- IAM: `ecs:RunTask` on the family ARN (revision wildcard), `ecs:StopTask`/`DescribeTasks` on `*`, `iam:PassRole`, EventBridge perms for sync ECS rule.

**Outputs:** `SimpleRunStateMachineArn`.
**Depends on:** Cluster (explicit), Network (implicit).
**Status:** ✅ deployable. ⚠️ single-state, no Choice/Catch/Retry/Parallel. Failure to start ECS task fails the whole execution; run row stays at `queued`.

---

## ControlApiStack

`infra/cdk/src/stacks/control-api-stack.ts`

**Resources:**
- `AmplifyUserPool` — imported from `config.auth.userPoolId` (default `us-east-1_1UeU1hTME`).
- `AmplifyJwtAuthorizer` — `HttpJwtAuthorizer` against Cognito issuer URL.
- `ControlApi` — `HttpApi` with CORS `*`, headers `authorization, content-type, x-idempotency-key`, methods `GET POST PATCH OPTIONS`, max-age 1d.
- 11 `NodejsFunction` Lambdas (Node 22), all entry `services/control-api/src/handlers.ts`:
  - `CreateRunFunction` (createRunHandler)
  - `GetRunFunction` (getRunHandler)
  - `ListRunEventsFunction`
  - `ListAdminRunsFunction`
  - `ListAdminRunEventsFunction`
  - `WorkItemsFunction`
  - `RunnerStateFunction`
  - `AgentProfilesFunction`
  - `ArtifactsFunction` (notImplementedArtifactsHandler — 501)
  - `DataSourceRefsFunction` (notImplemented — 501)
  - `SurfacesFunction` (notImplemented — 501)

**Routes (all behind JWT authorizer):**
- `POST /runs`, `GET /runs/{runId}`, `GET /runs/{runId}/events`
- `GET /admin/runs`, `GET /admin/runs/{runId}/events`
- 6 `/work-items` routes (CRUD + child runs/events)
- 6 runner-state routes (`/runner-hosts`, `/user-runners`, etc., plus `/admin/runners`)
- 4 `/agent-profiles` routes
- 3 `/artifacts` (501)
- 4 `/data-source-refs` (501)
- 5 `/surfaces` including `/publish` (501)

**Lambda commonEnvironment:**
All 14 table-name vars + `PROFILE_BUNDLES_BUCKET_NAME` (= WorkspaceLiveArtifactsBucket) + `STATE_MACHINE_ARN` + **`ADMIN_EMAILS=seb4594@gmail.com` (hardcoded)**.

**IAM grants:** per-Lambda match table reads/writes; `createRunFunction` and `workItemsFunction` get `simpleRunStateMachine.grantStartExecution`.

**Outputs:** `ControlApiUrl`.
**Depends on:** Orchestration, Storage, State.
**Status:** ✅ deployable, partial (501 stubs for product surfaces).
**Hackathon notes:**
- `ADMIN_EMAILS` hardcoded — to add admins, edit source line 63 and redeploy.
- Cognito IDs hardcoded to source-account Amplify sandbox; in a fresh account override via env or JWT verification will fail.
- CORS `*` — open for any frontend.

---

## RealtimeApiStack

`infra/cdk/src/stacks/realtime-api-stack.ts`

**Resources:**
- `RealtimeAuthorizerFunction` — Lambda REQUEST authorizer (`authorizerHandler`).
- `RealtimeConnectFunction` / `Disconnect` / `Default` — handlers for the WS routes.
- `RealtimeWebSocketAuthorizer` — `WebSocketLambdaAuthorizer`, identity from `route.request.querystring.token`.
- `RealtimeWebSocketApi` — `WebSocketApi` with `$connect` (authorized), `$disconnect`, `$default`. Route selection `$request.body.action`.
- `RealtimeWebSocketStage` — name `<envName>` (`dev`).
- `RealtimeEventRelayFunction` — `services/realtime-api/src/relay.ts`. Bound to `EventsTable` DDB Stream (LATEST, batch 25, retries 3).

**IAM:** connections-table RW to all 4 lambdas, `EventsTable.grantStreamRead(relay)`, `webSocketApi.grantManageConnections` to default + relay.

**Outputs:** `RealtimeWebSocketUrl`, `RealtimeWebSocketCallbackUrl`.
**Depends on:** State.
**Status:** ✅ deployable.
**Hackathon notes:** `LATEST` starting position means clients reconnecting **will not** see prior events (no replay). Fine if the web client also polls `/events` for backfill (it does).

---

## PreviewIngressStack (optional)

`infra/cdk/src/stacks/preview-ingress-stack.ts`. Gated by `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true`.

**Resources:**
- ACM cert (imported by ARN or issued via DNS validation against given Route 53 hosted zone). Throws if neither configured.
- `PreviewRouterSecurityGroup` — VPC SG.
- `PreviewRouterService` — `ApplicationLoadBalancedFargateService`, public ALB, 1 task, **image `public.ecr.aws/nginx/nginx:1.27-alpine` (placeholder)**, redirectHTTP, container env from preview config.
- Optional Route 53 A records for base + wildcard.

**Status:** ⚠️ deployable but the container is upstream nginx — it serves the default welcome page, not real previews. **Skip for hackathon.**

---

## Dependency order

```
Foundation
   ↓
Network → Cluster → Runtime → Orchestration
   ↓        ↓          ↓
Storage ────┴──────────┤
   ↓                   ↓
State ─────────→ ControlApi
   ↓                   ↓
   └──────→ RealtimeApi
```

Continue to → [Deployment guide](deployment.md) · [Secondary infra](secondary-infra.md)
