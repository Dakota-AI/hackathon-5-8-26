# Infrastructure Workstream Current Plan

Date: 2026-05-10
Owner: Infrastructure Workstream
Status: WorkItem/user-runner state deployed; obsolete sandbox cleanup complete

## Session Goal

Create the infrastructure workstream coordination plan, audit the current infrastructure state, then finish the active WorkItem handler slice before moving to the next infrastructure slice.

The user explicitly prioritized completing WorkItem handler work first. Existing unrelated docs/frontend/workstream changes are still preserved and not swept into this slice.

## Required Startup Checks Completed

Read in order:

1. `AGENTS.md`
2. `docs/agent-workstreams/README.md`
3. `docs/agent-workstreams/infrastructure/README.md`
4. `docs/agent-workstreams/COORDINATION.md`
5. `docs/roadmap/PROJECT_REMAINING_WORK_AUDIT_2026_05_10.md`
6. `docs/adr/README.md`
7. `docs/adr/0008-user-runner-placement.md`
8. `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`
9. `infra/cdk/README.md`

Repository check:

```text
git status --short --branch
## main...origin/main
```

Active working-tree changes observed before this plan was written:

```text
M AGENTS.md
M docs/README.md
M docs/adr/README.md
M docs/roadmap/BEST_NEXT_STEPS_EXECUTION_PLAN.md
M docs/roadmap/README.md
M infra/cdk/src/stacks/control-api-stack.ts
M services/control-api/src/dynamo-store.ts
M services/control-api/src/handlers.ts
M services/control-api/src/ports.ts
M services/control-api/test/admin-runs.test.ts
M services/control-api/test/create-run.test.ts
M services/control-api/test/dynamo-store.test.ts
M services/control-api/test/idempotency.test.ts
M services/control-api/test/query-runs.test.ts
?? docs/adr/0009-proactive-communication-plane.md
?? docs/agent-workstreams/
?? docs/plans/2026-05-10-agent-creator-hermes-profiles-apify.md
?? docs/roadmap/AICALLER_IOS_FOUNDATION_AUDIT_2026_05_10.md
?? docs/roadmap/COMMUNICATION_EVENT_CONTRACTS_2026_05_10.md
?? docs/roadmap/PROACTIVE_COMMUNICATION_ARCHITECTURE_AUDIT_2026_05_10.md
?? docs/roadmap/PROACTIVE_COMMUNICATION_REMAINING_WORK_2026_05_10.md
?? docs/roadmap/VOICE_CALL_AUDIO_MESSAGE_ARCHITECTURE_2026_05_10.md
?? services/control-api/src/work-items.ts
?? services/control-api/test/work-items.test.ts
```

Infrastructure-owned active diffs inspected:

- `infra/cdk/src/stacks/control-api-stack.ts`
  - WorkItems Lambda handler is changed from `notImplementedWorkItemsHandler` to `workItemsHandler`.
- `services/control-api/src/dynamo-store.ts`
  - Adds WorkItem table env lookup and DynamoDB store methods.
- `services/control-api/src/handlers.ts`
  - Adds WorkItem create/list/detail/status/run/event route handling.
- `services/control-api/src/ports.ts`
  - Adds `WorkItemRecord`, `CreateWorkItemRequest`, optional run/task `workItemId`, and store methods.
- Control API tests add no-op WorkItem store methods to existing fakes.
- Untracked `services/control-api/src/work-items.ts` and `services/control-api/test/work-items.test.ts` implement and test WorkItem create/list/get/status/run/event logic.
- `docs/adr/README.md` indexes untracked ADR 0009.

Asset hygiene check completed before writing this plan:

```text
find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research' -o -name '.vibecode' \) -print
# no output

du -sh infra/cdk/cdk.out
1.4M infra/cdk/cdk.out
```


## Production-Shaped Infrastructure Direction

The user explicitly clarified that Agents Cloud should use one production-shaped CDK path: no alternate dev/prod architecture, no duplicate experimental CDK stack family, and no "sandbox stack" as a long-term product path. Current `agents-cloud-dev-*` names are legacy/bootstrap environment names for the already-deployed stack family, not a license to create a parallel production architecture. Future work should evolve this stack family in place unless a deliberate migration plan is written and approved.

Rules for future agents:

- Do not add a second CDK app or alternate stack family for production.
- Do not create separate dev/prod feature stacks with different architecture.
- Keep environment variables for names, removal policy, capacity, and external DNS/certificate inputs only.
- Keep AWS as durable truth and Cloudflare/Amplify as edge/auth/hosting integrations, not parallel state planes.
- If current `dev` naming must be removed later, treat it as a controlled rename/migration, not as a new architecture.

## Cleanup Completed

Obsolete Amplify template sandbox deleted on 2026-05-10:

```text
amplify-amplifybackendapptemplate-sebastian-sandbox-43886d8444
```

That sandbox owned old template AppSync/Data/Lambda/Auth resources and was not referenced by the current Agents Cloud app. Verification after delete:

- AWS account checked: `625250616301`.
- Deleted stack now returns `ValidationError: Stack ... does not exist`.
- Current Agents Cloud Amplify Auth sandbox remains intact:
  - `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec`
  - user pool `us-east-1_1UeU1hTME`
  - app client `3kq79rodc3ofjkulh0b31sfpos`
- Current CDK stacks remain active and are not alternate architectures.

Cleanup still pending:

- Move Cognito/Auth ownership from the current Amplify Auth sandbox into the main CDK path when ready, update web/native config, then delete the remaining Amplify sandbox. Do not delete it before auth migration because current web/native config uses its user pool/client.

## Current Infrastructure State

### Durable AWS foundation

Implemented in `infra/cdk` and documented as deployed/synthesizing:

- Foundation stack with app/environment SSM metadata.
- Network stack with VPC, public/private/isolated subnets, S3/DynamoDB gateway endpoints, and worker security group.
- Storage stack with private encrypted buckets for live artifacts, audit logs, preview static assets, and research datasets.
- State stack with DynamoDB tables for WorkItems, Runs, Tasks, Events, Artifacts, DataSources, Surfaces, Approvals, PreviewDeployments, and RealtimeConnections.
- Cluster stack with ECS cluster and agent-runtime log group.
- Runtime stack with the current smoke-shaped Fargate task definition and Docker image asset built from `services/agent-runtime/Dockerfile`.
- Orchestration stack with Step Functions `ecs:runTask.sync` path into the smoke/runtime task.
- Control API stack with Cognito-protected HTTP API routes for runs, admin runs, admin run event lineage, and product-shaped WorkItem/Artifact/DataSourceRef/Surface routes.
- Realtime API stack with API Gateway WebSocket API, Cognito query-token authorizer, connection handlers, DynamoDB stream relay Lambda, and realtime connection table permissions.
- Optional PreviewIngress stack exists in code but is not deployed in the current stack list; future preview work should keep the same CDK app/path and avoid alternate stack families.

### Deployment reality from docs and recent session evidence

- AWS remains durable source of truth.
- Cloudflare remains realtime/fanout or DNS edge only.
- Current runtime can prove the durable run path but is still smoke/report mode, not a full resident user runner or real model/tool execution harness.
- WorkItem/DataSource/Surface infrastructure exists. The active WorkItem handler slice now implements create/list/get/status/run/event behavior locally; artifact, DataSourceRef, and Surface handlers remain intentionally not implemented.
- Admin request lineage is deployed via `GET /admin/runs/{runId}/events` and should remain admin-only.
- `admin.solo-ceo.ai` still depends on external Cloudflare DNS, not CDK.
- Obsolete old Amplify template sandbox has been deleted; the remaining Amplify sandbox is the active auth provider until Cognito is migrated into CDK.

## What Is Complete

- CDK foundation stacks exist and are organized around durable AWS state.
- Docker asset hygiene has been significantly improved; current synthesized output has no `.env`, `.env.*`, `.research`, or `.vibecode` matches and is approximately 1.4 MiB.
- WorkItems, DataSources, Surfaces, artifact indexes, and WorkItem lookup indexes are provisioned in CDK.
- Runtime task receives WorkItem/DataSource/Surface table names and optional `WORK_ITEM_ID` via Step Functions overrides.
- API Gateway routes for product APIs exist behind Cognito auth.
- Admin run summary and per-run event lineage routes exist behind Cognito auth plus admin allowlist.
- AWS-native realtime infrastructure exists for WebSocket connections and DynamoDB EventsTable stream relay.
- Preview registry and optional preview ingress shape exist.
- Infra CDK assertion tests exist for WorkItem/GenUI tables, routes, runtime env vars, and Step Functions WorkItem override.

## What Is Missing

### Product API infrastructure/application boundary

- WorkItem handlers are active in the working tree and validated locally for create/list/get/status/run/event behavior, but not yet committed/deployed in this session.
- WorkItem artifact query plus run artifact list/download APIs still return explicit not-implemented responses.
- DataSourceRef APIs still return explicit not-implemented responses.
- Surface APIs still return explicit not-implemented responses.
- Workspace membership authorization is not yet a real shared model; current WorkItem ownership checks are user-owned, not full workspace membership.
- API/state reference docs are missing.

### User-runner infrastructure

Missing state model resources:

- `HostNode` - implemented in state-only CDK slice
- `UserRunner` - implemented in state-only CDK slice
- `RunnerPlacement` - represented as current-state fields/indexes in v0
- `RunnerHeartbeat` - represented as current-state fields/indexes in v0
- `RunnerSnapshot` - implemented in state-only CDK slice
- `AgentInstance` - implemented in state-only CDK slice

Missing placement/deployment resources:

- local Docker host registration/placement APIs and supervisor behavior,
- ECS Fargate user-runner task definition or resident service shape,
- runner-placement scheduler infrastructure,
- runner heartbeat/stale detection alarms,
- snapshot bucket/prefix policy and failed snapshot alarms,
- scoped runner task role/environment contract.

### Realtime and event relay hardening

- AWS-native WebSocket relay exists, but product docs still call out event relay integration and deployed client usage as incomplete.
- Cloudflare realtime Worker package exists outside CDK, but production Cloudflare relay/deployment wiring is still incomplete.
- Metrics/alarms for dropped relay events, stale connections, replay failures, and high runtime error rates are missing.

### Operational safety

Missing alarms/metrics:

- failed Step Functions runs,
- ECS task failures/high runtime error rates,
- stale runners,
- failed runner snapshots,
- failed realtime relay batches,
- malformed event/write failures,
- high Control API error rate.

## What Is Risky Or Blocked

1. Active uncommitted infrastructure-owned changes exist.
   - This session continued the WorkItem handler/store/test sections after the user explicitly redirected ownership here.
   - Still do not sweep unrelated docs/ADR/frontend changes into the WorkItem commit.

2. WorkItem API route has been switched in CDK from not-implemented to `workItemsHandler` in the active tree.
   - This means the next infra validation must confirm handler bundling, Lambda env vars, IAM, and tests all agree before any deploy.

3. Workspace authorization is still incomplete.
   - Any product route implemented before workspace membership exists must be clearly documented as user-owned MVP behavior, not production multi-tenant authorization.

4. User-runner model requires contract alignment before infra resources are added.
   - Agent Harness must confirm heartbeat, snapshot, desired-state, runner token, and local supervisor payloads.
   - Realtime Streaming must confirm whether runner heartbeats/status changes become canonical events or separate operational messages.

5. Cloudflare DNS remains externally managed.
   - Infra cannot complete `admin.solo-ceo.ai` or preview DNS without a Cloudflare DNS token or manual DNS changes.

6. Runtime task role is broad for current smoke runtime.
   - Future user-runner roles must be scoped to user/workspace prefixes and must not expose broad cross-user access.

7. The current Step Functions worker path is short-run task oriented.
   - Resident user runners require separate service/placement shape, not just extending the existing one-shot run state machine.

## Files Expected To Touch In The Next Infra Slice

If the next slice is user-runner state model infrastructure only:

- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/test/*runner*.test.ts` or a new `infra/cdk/src/test/user-runner-state.test.ts`
- `infra/cdk/README.md`
- `docs/agent-workstreams/infrastructure/CURRENT_PLAN.md`
- possibly `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md` only if implementation details diverge from the current plan.

Avoid touching unless coordinated after the WorkItem slice is committed/deployed:

- `services/control-api/src/work-items.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/handlers.ts`
- `services/control-api/src/ports.ts`
- `packages/protocol`
- client apps
- realtime handler internals

## Cross-Workstream Dependencies

### Agent Harness

Needs to define or confirm:

- runner heartbeat payload,
- runner desired-state payload,
- snapshot manifest shape,
- agent instance status values,
- local supervisor authentication contract,
- runner token requirements and rotation expectations,
- runtime environment variables for resident user runners.

### Realtime Streaming

Needs to define or confirm:

- whether runner heartbeat/status/snapshot events are emitted into canonical event ledger,
- replay cursor semantics for operational runner events,
- event relay error metric expectations,
- Cloudflare vs AWS WebSocket ownership for production fanout.

### Clients

Needs to confirm:

- whether any client-visible feature flag or endpoint config is required for WorkItems, realtime URL, or runner status,
- deployed URL expectations for admin and preview hosts,
- whether clients consume WorkItem state directly or only through run/event views in the first product slice.

### Product Coordination

Resolved this session:

- the user prioritized finishing WorkItem API support before starting user-runner state tables.

Still needs to resolve:

- how to document temporary user-owned authorization before workspace membership exists,
- whether ADR 0009 proactive communication plane changes infrastructure priorities.

## Handoffs Needed

No handoff file was created for the WorkItem handler slice because it completes the already-provisioned route skeleton and does not require another workstream to unblock it.

Expected handoffs before or during the user-runner infra slice:

1. Infrastructure -> Agent Harness: confirm runner heartbeat/snapshot/agent-instance payloads.
2. Infrastructure -> Realtime Streaming: confirm runner operational event relay and cursor model.
3. Infrastructure -> Product Coordination: confirm ordering between WorkItem API completion and user-runner state model.

Use `docs/agent-workstreams/HANDOFF_TEMPLATE.md` and place files in `docs/agent-workstreams/handoffs/`.

## Proposed Next Smallest Infrastructure Slice

Recommended next slice after WorkItem handler deployment: add user-runner state model infrastructure only, no runtime behavior yet.

Scope:

1. Add DynamoDB tables and indexes for HostNodes, UserRunners, RunnerSnapshots, and AgentInstances. - in progress
2. Model RunnerPlacement and RunnerHeartbeat as current-state fields/GSIs on HostNodes/UserRunners for v0. - in progress
3. Add CDK assertion tests for table keys, GSIs, and stack outputs. - passing locally
4. Add outputs only for future Control API/runtime wiring. - in progress
5. Document the state model and explicitly mark APIs/placement scheduler as not implemented. - in progress

Why this is the smallest coherent infra slice:

- It comes after the active WorkItem handler code has been completed and validated.
- It implements ADR 0008's first missing infra requirement.
- It gives Agent Harness and Product Coordination concrete table/index contracts to review.
- It avoids premature ECS service creation before heartbeat/token/snapshot contracts are settled.

Do not include in that slice:

- local supervisor implementation,
- ECS Fargate user-runner service deployment,
- task role/token broker implementation,
- client UI,
- realtime transport internals.

## Validation Commands For Future Infra Changes

Required for infra/CDK changes:

```bash
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

When changing Docker/CDK assets:

```bash
find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research' -o -name '.vibecode' \) -print
du -sh infra/cdk/cdk.out
```

When changing contracts with runtime, realtime, Control API, or clients:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
```

Recommended before deploy:

```bash
AWS_PROFILE=${AWS_PROFILE:-agents-cloud-source} aws sts get-caller-identity
AWS_PROFILE=${AWS_PROFILE:-agents-cloud-source} aws configure get region
```

## Validation Results In This Session

Validation was run after creating this plan document and against the then-current working tree, including the active uncommitted WorkItem changes from other agents.

Passed after completing the WorkItem handler slice:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

Observed results:

- Control API: 20/20 tests passing.
- Protocol schemas validated.
- Infra CDK tests: 5/5 passing.
- Infra build/typecheck/synth passed.
- Amplify infra typecheck passed.

Asset hygiene after synth:

```text
find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research' -o -name '.vibecode' \) -print
# no output

du -sh infra/cdk/cdk.out
1.5M infra/cdk/cdk.out
```

Notes:

- `pnpm infra:synth` emitted two CDK deprecation warnings for `aws_iam.GrantOnPrincipalOptions#scope`; synth still succeeded.
- Deployment completed for `agents-cloud-dev-control-api` after rebuilding CDK from the repo root.
- Before commit, stage selectively and avoid unrelated working-tree docs/ADR/frontend changes.

## User-Runner State Slice Progress

Implemented locally in this session:

- `HostNodesTable` keyed by `hostId + hostRecordType` with status/heartbeat and placement target/status indexes.
- `UserRunnersTable` keyed by `userId + runnerId` with runner-id, host/status, status/heartbeat, and desired-state indexes.
- `RunnerSnapshotsTable` keyed by `runnerId + snapshotId` with user/workspace created-at indexes.
- `AgentInstancesTable` keyed by `runnerId + agentId` with user/status and next-wake indexes.
- Table outputs for all four resources.
- CDK assertions in `infra/cdk/src/test/user-runner-state.test.ts`.
- Handoffs to Agent Harness and Realtime Streaming.
- Deployed `agents-cloud-dev-state`; all four new DynamoDB tables are ACTIVE with expected GSIs.

Not included in this slice:

- local Docker supervisor,
- ECS resident runner service,
- runner token broker,
- heartbeat API,
- placement scheduler,
- realtime runner-status relay.


Latest user-runner state validation/deploy:

```bash
pnpm infra:build                                      # passed
pnpm infra:synth                                      # passed, same CDK deprecation warnings
pnpm --filter @agents-cloud/infra-cdk test            # passed, 8/8 tests
pnpm --filter @agents-cloud/infra-amplify run typecheck # passed
find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research' -o -name '.vibecode' \) -print # no output
du -sh infra/cdk/cdk.out                              # 2.1M
```

Deployed:

```text
agents-cloud-dev-state UPDATE_COMPLETE
HostNodesTable ACTIVE
UserRunnersTable ACTIVE
RunnerSnapshotsTable ACTIVE
AgentInstancesTable ACTIVE
```


## Next Slice Plan: Runner Registration And Heartbeat Control API

Recommended immediate next build slice after cleanup:

```text
Control API -> HostNodes/UserRunners tables -> admin runner visibility
```

Scope:

1. Add Control API use cases for HostNode registration/update and heartbeat.
2. Add Control API use cases for UserRunner create/update/get and heartbeat.
3. Add bounded admin list/query views for online/stale/failed/restoring runners.
4. Wire routes into the existing `agents-cloud-dev-control-api` stack only.
5. Use the deployed runner table GSIs; avoid product-path scans.
6. Keep auth production-shaped: Cognito/admin for operator views, trusted-supervisor/runner auth contract for heartbeat writes. If the trusted-supervisor token broker is not ready, keep heartbeat writes behind an explicit not-yet-production test/admin path and document it.

Non-scope:

- no alternate CDK app or stack family,
- no ECS resident service yet,
- no local Docker supervisor yet,
- no realtime runner-status relay yet,
- no frontend UI unless Clients request a minimal admin read view.

Coordination:

- Handoff created: `docs/agent-workstreams/handoffs/2026-05-10-infra-to-control-api-runner-registration-heartbeat.md`.
- Existing handoffs to Agent Harness and Realtime Streaming remain relevant.

## Definition Of Done For This Work Session

This WorkItem-first infrastructure session is done when:

- required startup docs have been read,
- `git status --short --branch` has been run,
- active infra-owned diffs have been inspected and documented,
- this `CURRENT_PLAN.md` exists,
- current infra state, completed work, missing work, risks, dependencies, expected files, validations, and next smallest slice are documented,
- no unrelated changes are overwritten or reverted,
- WorkItem handler changes are selectively staged/committed/deployed or clearly reported as pending deployment.

## Current Recommendation

WorkItem handler deployment is complete. User-runner state model CDK tables/tests are now deployed as an infrastructure-only slice, with handoffs created for Agent Harness and Realtime Streaming. Next recommended slice: implement Control API/admin read/write endpoints for HostNode registration and UserRunner heartbeat/state using the deployed runner tables. Keep this in the existing Control API/CDK stack family, add tests first, deploy, and smoke real AWS. Auth migration into CDK should follow soon after so the remaining Amplify auth sandbox can be removed.
