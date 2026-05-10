# WorkItem and GenUI Infrastructure Implementation

_Last updated: 2026-05-10_

## Purpose

This document records the infrastructure slice that prepares Agents Cloud for the
WorkItem -> Run -> Events -> Artifacts -> DataSources -> Surfaces product spine.
It is intentionally narrower than the full product implementation plan in
`docs/roadmap/WORKITEM_GENUI_IMPLEMENTATION_PLAN.md`: this slice creates the AWS
state, routes, IAM wiring, runtime environment, orchestration passthrough, and
CDK regression tests that the next Control API, web, Flutter, and runtime phases
will consume.

The goal is not to claim the WorkItem/DataSource/Surface product APIs are fully
implemented. The goal is to safely make the platform shape real and testable:

```text
DynamoDB state exists
  -> Control API routes exist behind Cognito JWT auth
  -> Lambda roles have scoped access to only the tables they need
  -> Step Functions can pass workItemId to ECS runtime tasks
  -> ECS runtime task has table names needed to write/read future work products
  -> CDK tests lock this contract before application code builds on it
```

## Implemented Infrastructure Changes

### 1. StateStack DynamoDB tables

`infra/cdk/src/stacks/state-stack.ts` now provisions three WorkItem/GenUI state
tables:

#### WorkItemsTable

Primary key:

```text
PK: workspaceId
SK: workItemId
```

Global secondary indexes:

```text
by-user-created-at       userId           -> createdAt
by-status-updated-at     workspaceStatus  -> updatedAt
by-idempotency-scope     idempotencyScope
```

Rationale:

- `workspaceId + workItemId` keeps tenant/workspace boundaries in the primary
  access path.
- `by-user-created-at` supports a user's inbox/recent work list.
- `by-status-updated-at` supports board columns and status-filtered work pages
  without scanning.
- `by-idempotency-scope` supports safe create/retry behavior for delegated work
  creation.

#### DataSourcesTable

Primary key:

```text
PK: workspaceId
SK: dataSourceId
```

Global secondary indexes:

```text
by-workitem-created-at   workItemId  -> createdAt
by-run-created-at        runId       -> createdAt
by-artifact-id           artifactId
```

Rationale:

- DataSourceRef records are durable references to allowlisted data, not raw
  arbitrary credentials or SQL.
- WorkItem and Run lookup indexes let clients render dashboards/reports from the
  work object or the specific execution that produced a dataset.
- Artifact lookup supports derived datasets from durable artifacts.

#### SurfacesTable

Primary key:

```text
PK: workspaceId
SK: surfaceId
```

Global secondary indexes:

```text
by-workitem-updated-at   workItemId       -> updatedAt
by-run-updated-at        runId            -> updatedAt
by-status-updated-at     workspaceStatus  -> updatedAt
```

Rationale:

- Surfaces are durable GenUI/A2UI outputs: dashboards, reports, tables, charts,
  forms/tools, review rooms, and preview descriptors.
- WorkItem/run indexes support rendering the latest generated UI for the
  business object and the execution attempt that created or updated it.
- Status lookup supports draft/published/review state without table scans.

### 2. Existing table indexes for WorkItem linkage

Existing tables were extended for WorkItem-oriented query paths:

- `RunsTable` now has `by-workitem-created-at` on `workItemId -> createdAt`.
- `ArtifactsTable` now has `by-workitem-created-at` on `workItemId -> createdAt`.

This is the minimum infrastructure needed for a WorkItem detail page to show:

- all linked run attempts,
- ordered run/event ledgers through existing event APIs,
- linked durable artifacts,
- future generated surfaces and datasets.

### 3. StateStack outputs

The new tables are exported the same way existing state tables are exported:

```text
WorkItemsTableName
DataSourcesTableName
SurfacesTableName
```

These outputs make deployed stack inspection and cross-stack/table discovery
straightforward while keeping application code dependent on environment
variables, not hardcoded names.

### 4. ControlApiStack routes and Lambda wiring

`infra/cdk/src/stacks/control-api-stack.ts` now provisions product-shaped HTTP
routes for the next application phase.

WorkItem routes:

```text
POST  /work-items
GET   /work-items
GET   /work-items/{workItemId}
PATCH /work-items/{workItemId}
POST  /work-items/{workItemId}/status
POST  /work-items/{workItemId}/runs
GET   /work-items/{workItemId}/runs
GET   /work-items/{workItemId}/events
```

Artifact routes:

```text
GET /work-items/{workItemId}/artifacts
GET /runs/{runId}/artifacts
GET /runs/{runId}/artifacts/{artifactId}
```

DataSourceRef routes:

```text
POST /data-source-refs
GET  /data-source-refs/{dataSourceId}
GET  /work-items/{workItemId}/data-source-refs
GET  /runs/{runId}/data-source-refs
```

Surface routes:

```text
POST  /surfaces
GET   /surfaces/{surfaceId}
PATCH /surfaces/{surfaceId}
GET   /work-items/{workItemId}/surfaces
GET   /runs/{runId}/surfaces
POST  /surfaces/{surfaceId}/publish
```

All routes use the existing Cognito JWT authorizer. CORS now includes `PATCH`
for WorkItem and Surface update paths.

The route Lambdas currently point to explicit `501 NotImplemented` handlers in
`services/control-api/src/handlers.ts`. That is deliberate for this infra slice:
clients and tests can see that routes are real and authenticated, while product
logic remains in the next Control API TDD phase instead of being half-built in
CDK.

### 5. Control API environment and scoped grants

All Control API Lambdas now receive:

```text
WORK_ITEMS_TABLE_NAME
RUNS_TABLE_NAME
TASKS_TABLE_NAME
EVENTS_TABLE_NAME
ARTIFACTS_TABLE_NAME
DATA_SOURCES_TABLE_NAME
SURFACES_TABLE_NAME
STATE_MACHINE_ARN
ADMIN_EMAILS
```

Grants are scoped by Lambda purpose:

- CreateRun Lambda: read/write WorkItems, Runs, Tasks, Events; start Step
  Functions.
- WorkItems Lambda: read/write WorkItems, Runs, Tasks, Events; read Artifacts;
  start Step Functions for WorkItem-linked runs.
- Artifacts Lambda: read WorkItems, Runs, Artifacts.
- DataSourceRefs Lambda: read WorkItems/Runs/Artifacts; read/write DataSources.
- Surfaces Lambda: read WorkItems/Runs/DataSources; read/write Surfaces.
- Existing get/list/admin run Lambdas keep their run/event read permissions.

This avoids a single broad product Lambda with every future permission by
default, while still staying simple enough for the first implementation phase.

### 6. Orchestration WorkItem passthrough

`infra/cdk/src/stacks/orchestration-stack.ts` now passes optional WorkItem IDs
into the ECS runtime container as a per-execution environment override:

```text
WORK_ITEM_ID <- $.workItemId
```

The Control API Step Functions starter serializes `workItemId` as an empty string
when not present so the current run-only path remains compatible. Future
WorkItem-linked run creation can pass a real WorkItem ID without changing the
state machine interface again.

### 7. Runtime task environment and IAM

`infra/cdk/src/stacks/runtime-stack.ts` now injects these new table names into
the agent runtime task definition:

```text
WORK_ITEMS_TABLE_NAME
DATA_SOURCES_TABLE_NAME
SURFACES_TABLE_NAME
```

The runtime task role also receives read/write grants on the new tables. This is
needed for the next runtime phase where workers will create artifacts,
DataSourceRefs, and Surface records under the WorkItem boundary.

## CDK Regression Tests Added

A new package-local test file was added:

```text
infra/cdk/src/test/workitem-genui-infra.test.ts
```

It verifies:

1. WorkItems, DataSources, and Surfaces tables exist with the expected primary
   keys and GSIs.
2. Runs and Artifacts tables have WorkItem lookup indexes.
3. Control API Lambdas receive WorkItem/GenUI table environment variables.
4. Control API exposes every product-shaped WorkItem, Artifact, DataSourceRef,
   and Surface route behind API Gateway.
5. Step Functions definition contains `WORK_ITEM_ID` / `$.workItemId` runtime
   passthrough.
6. ECS runtime task definition receives WorkItem/DataSource/Surface table names.

`infra/cdk/package.json` now has a local test script:

```bash
pnpm --filter @agents-cloud/infra-cdk test
```

The repo root now has:

```bash
pnpm infra:test
```

## Sanity / E2E Validation Strategy

This infra slice is validated in three layers.

### Layer 1: CDK unit assertions

```bash
pnpm infra:test
```

Confirms the synthesized constructs include the tables, indexes, routes,
environment variables, and task/state-machine wiring expected by the product
spine.

### Layer 2: Type/build/package compatibility

```bash
pnpm control-api:test
pnpm infra:build
```

Confirms:

- Control API still compiles and existing run tests pass after adding future
  `workItemId` Step Functions compatibility.
- CDK stacks compile with the new cross-stack references.
- Lambda bundling still succeeds with the added route handlers.

### Layer 3: Synthesized template inspection / deployment dry-run

```bash
pnpm infra:synth
```

Then inspect generated CloudFormation templates for:

```text
WorkItemsTable
DataSourcesTable
SurfacesTable
by-workitem-created-at
WORK_ITEM_ID
/work-items
/data-source-refs
/surfaces
```

Optional deploy-time dry-run:

```bash
pnpm infra:diff
```

Expected diff categories:

- new DynamoDB tables,
- new DynamoDB GSIs on Runs/Artifacts,
- new Lambda functions for not-yet-implemented product routes,
- new API Gateway routes/integrations,
- IAM policy additions scoped to the new tables,
- updated ECS task definition environment/IAM,
- updated Step Functions task override for `WORK_ITEM_ID`.

Do not deploy this slice to production without reviewing the diff because adding
GSIs to existing DynamoDB tables can take time and can affect table update
sequencing.

## Follow-on Application Work

This infrastructure unblocks, but does not replace, the next TDD phases:

1. Protocol contracts for WorkItem, DataSourceRef, Surface, and WorkItem-scoped
   events.
2. Control API records, ports, DynamoDB store methods, validation, tenant
   authorization, and real handlers for the provisioned routes.
3. WorkItem-linked `createRun` request payloads and event writes.
4. Artifact listing/download handlers.
5. Server-side DataSourceRef and Surface validators.
6. Web Work page and GenUI renderer.
7. Runtime worker writes for DataSourceRef/Surface metadata.
8. Flutter WorkBoard and Surface renderer.

## Security and Architecture Notes

- AWS remains the durable source of truth.
- Cloudflare remains realtime fanout/sync only.
- No arbitrary generated frontend code is introduced by this infra slice.
- GenUI surfaces are prepared as validated records, not untrusted React/Dart/JS.
- All new routes are behind Cognito JWT auth.
- Application-level workspace membership authorization is still pending and must
  be implemented before product-grade multi-user access.
- The 501 handlers intentionally avoid pretending the product APIs are complete.
  They make route/auth/IAM shape testable without silent placeholder behavior.

## Rollback Notes

If this slice causes deployment issues, rollback strategy is:

1. Do not create application data in the new tables until handlers are complete.
2. Roll back Control API route additions first if API Gateway/Lambda bundling is
   the issue.
3. Roll back Runtime/Orchestration environment changes second if ECS task
   definitions are the issue.
4. Roll back table/GSI additions last. DynamoDB GSI creation/removal can be slow;
   check table status before starting another deployment.

## Definition of Done for This Slice

Validation performed on 2026-05-10:

```text
pnpm infra:test        PASS: 5/5 CDK regression tests
pnpm control-api:test  PASS: 12/12 Control API tests
pnpm contracts:test    PASS: protocol schemas validated
pnpm infra:build       PASS: protocol, control-api, agent-runtime, realtime-api, infra-cdk builds
pnpm infra:synth       PASS: synthesized to infra/cdk/cdk.out
```

Additional synthesized-template inspection confirmed:

```text
agents-cloud-dev-state.template.json:
  WorkItemsTable/DataSourcesTable/SurfacesTable present
  by-workitem-created-at present

agents-cloud-dev-control-api.template.json:
  WORK_ITEMS_TABLE_NAME/DATA_SOURCES_TABLE_NAME/SURFACES_TABLE_NAME present
  /work-items, /data-source-refs, and /surfaces routes present

agents-cloud-dev-runtime.template.json:
  WORK_ITEMS_TABLE_NAME/DATA_SOURCES_TABLE_NAME/SURFACES_TABLE_NAME present

agents-cloud-dev-orchestration.template.json:
  WORK_ITEM_ID and $.workItemId present
```

CloudFormation validation was run against the smaller synthesized templates:

```text
agents-cloud-dev-state.template.json          PASS
agents-cloud-dev-runtime.template.json        PASS
agents-cloud-dev-orchestration.template.json  PASS
```

`agents-cloud-dev-control-api.template.json` was not validated with
`aws cloudformation validate-template --template-body` because the local template
body exceeds the AWS CLI inline body size limit of 51,200 bytes. It is still
covered by CDK synth, Lambda bundling, CDK assertion tests, and local template
inspection. To validate that large template through CloudFormation, upload it to
S3 and call `validate-template --template-url`.

`pnpm infra:diff` reached CDK diff after successful builds but the local CDK CLI
failed before producing a diff because the synthesized assembly references
`cdk.out/*.metadata.json` files that were not emitted in this environment:

```text
ENOENT: no such file or directory, open 'cdk.out/agents-cloud-dev-foundation.metadata.json'
```

Because this is a deploy/diff tooling issue rather than a synth/test failure, the
safe e2e validation for this slice is the combination of CDK tests, full synth,
small-template CloudFormation validation, and explicit cdk.out inspection above.
Do not deploy until `cdk diff` is made reliable or a reviewed change set is
created through the deployment path.

This slice is complete when:

- CDK tests prove the table/index/route/env/orchestration/runtime contract.
- Control API tests still pass.
- `pnpm infra:build` passes.
- `pnpm infra:synth` passes.
- The generated templates are inspected for the expected new resources and route
  keys.
- Roadmap/status docs link this infrastructure slice and keep implementation
  reality clear: infrastructure exists; product handlers are next.
