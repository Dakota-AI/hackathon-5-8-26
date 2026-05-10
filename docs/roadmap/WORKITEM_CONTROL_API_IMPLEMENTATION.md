# WorkItem Control API Implementation

Date: 2026-05-10

## What changed

The first non-placeholder Control API slice for the WorkItem product spine is now implemented.

This moves the platform from infrastructure-only WorkItem routes to real authenticated WorkItem command/query behavior for the first WorkItem product slice:

```text
POST /work-items
  -> validate request
  -> enforce authenticated owner from Cognito JWT claims
  -> create durable WorkItem record in DynamoDB
  -> return 201 with WorkItem payload

GET /work-items?workspaceId=...
  -> query WorkItems for the authenticated user
  -> optionally filter by workspace
  -> return newest-first WorkItems

GET /work-items/{workItemId}?workspaceId=...
  -> load WorkItem by workspace/workItem id
  -> return it only when owned by authenticated user

PATCH /work-items/{workItemId}
POST /work-items/{workItemId}/status
  -> update allowlisted WorkItem status
  -> maintain workspaceStatus and updatedAt

POST /work-items/{workItemId}/runs
  -> verify WorkItem ownership
  -> create a run linked to the WorkItem
  -> persist workItemId on Run and Task records
  -> pass workItemId into Step Functions / ECS runtime

GET /work-items/{workItemId}/runs
  -> list authenticated user's runs for the WorkItem

GET /work-items/{workItemId}/events
  -> return ordered events for runs linked to the WorkItem
```

The remaining product route families intentionally remain explicit `501 NotImplemented` placeholders until their TDD slices are implemented. In this slice, the only WorkItem route still intentionally not implemented is `GET /work-items/{workItemId}/artifacts`, because artifact listing/download semantics need the artifact API slice.

## Files changed

- `services/control-api/src/ports.ts`
  - Added `WorkItemRecord` and `CreateWorkItemRequest` contracts.
  - Extended Run/Task records and create-run requests with optional `workItemId`.
  - Extended `ControlApiStore` with WorkItem persistence/query methods plus WorkItem-linked run and event lookup methods.

- `services/control-api/src/work-items.ts`
  - Added WorkItem use cases:
    - `createWorkItem`
    - `listWorkItems`
    - `getWorkItem`
    - `updateWorkItemStatus`
    - `createWorkItemRun`
    - `listWorkItemRuns`
    - `listWorkItemEvents`
  - Adds deterministic idempotency handling when `idempotencyKey` is supplied.
  - Derives a title from objective when title is omitted.
  - Clamps list limits to safe bounds.

- `services/control-api/src/dynamo-store.ts`
  - Reads `WORK_ITEMS_TABLE_NAME` from Lambda environment.
  - Implements WorkItem DynamoDB writes and queries.
  - Uses the deployed `by-idempotency-scope` and `by-user-created-at` indexes.
  - Implements WorkItem-linked run and event queries over the deployed `by-work-item-created-at` indexes.

- `services/control-api/src/handlers.ts`
  - Replaced the WorkItems placeholder Lambda handler with a real `workItemsHandler` for:
    - `POST /work-items`
    - `GET /work-items`
    - `GET /work-items/{workItemId}`
    - `PATCH /work-items/{workItemId}`
    - `POST /work-items/{workItemId}/status`
    - `POST /work-items/{workItemId}/runs`
    - `GET /work-items/{workItemId}/runs`
    - `GET /work-items/{workItemId}/events`
  - Leaves unsupported artifact/data-source/surface subroutes as honest 501 responses.

- `infra/cdk/src/stacks/control-api-stack.ts`
  - Points the WorkItems Lambda at `workItemsHandler`.

- `services/control-api/test/work-items.test.ts`
  - Covers create, idempotency, missing objective, owner-filtered list, and cross-user get isolation.

- Existing Control API test fakes were updated to satisfy the extended store contract.
- `services/control-api/src/create-run.ts`
  - Persists optional `workItemId` on Run and Task records.
  - Passes optional `workItemId` into Step Functions execution input.

## Security and boundary behavior

- The user boundary is derived from Cognito JWT claims in the Lambda event.
- `GET /work-items/{workItemId}` returns `404` for another user's WorkItem rather than leaking existence.
- `GET /work-items` filters to the authenticated user in the use case and Dynamo query path.
- WorkItem status updates, WorkItem-linked runs, and WorkItem-linked run/event lists all verify WorkItem ownership before returning or mutating records.
- Creation records `userId` and optional `ownerEmail` from the authenticated user.
- The route is still behind the existing API Gateway JWT authorizer from the CDK stack.

## Idempotency behavior

`POST /work-items` accepts an optional `idempotencyKey`.

The idempotency scope is:

```text
<userId>#<workspaceId>#<idempotencyKey>
```

When the same authenticated user repeats the same idempotency key in the same workspace, the API returns the existing WorkItem with HTTP 200 instead of creating a duplicate.

## Validation performed

Local validation after implementation:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

Results:

- Control API: 20/20 tests passing.
- Protocol schemas: validated.
- Infra CDK regression tests: 5/5 passing.
- Infra build: passed protocol, Control API, agent runtime, realtime API, and CDK TypeScript builds.
- Infra synth: passed with two existing CDK deprecation warnings for `aws_iam.GrantOnPrincipalOptions#scope`.
- Amplify infra typecheck: passed.
- CDK asset hygiene: no `.env`, `.env.*`, `.research`, or `.vibecode` matches; synthesized output about 1.5 MiB.

## Deployment expectation

This slice has been deployed to `agents-cloud-dev-control-api`; the deployed HTTP API now exposes the real WorkItem handler for create/list/get/status/run/event routes while artifact, DataSourceRef, and Surface APIs continue returning explicit `501 NotImplemented` until their own slices land.

Deployed smoke checks performed:

1. Verified unauthenticated `GET /work-items?workspaceId=workspace-smoke` returns HTTP 401 through API Gateway.
2. Invoked deployed `WorkItemsFunction` with Cognito-shaped dev claims and created WorkItem `work-idem-0afed2c76f048c7c66649ed9` with HTTP 201.
3. Replayed the same create event and verified idempotent HTTP 200 with the same WorkItem id.
4. Updated the WorkItem status to `in_progress` and verified HTTP 200.
5. Created a WorkItem-linked run and verified HTTP 202 plus Step Functions execution ARN.
6. Listed WorkItem runs and verified HTTP 200 with the linked run persisted as `succeeded`.
7. Listed WorkItem events and verified HTTP 200 with four ordered run events.

## Remaining Control API work

Next slices:

1. WorkItem artifact query:
   - `GET /work-items/{workItemId}/artifacts`
   - should share authorization and response shapes with the run artifact APIs

2. Artifact APIs:
   - `GET /runs/{runId}/artifacts`
   - `GET /runs/{runId}/artifacts/{artifactId}`

3. DataSourceRef v0:
   - constrained `inline-data`, `artifact-ref`, `run-event-ref`, and `control-api-query-ref` records
   - no arbitrary SQL or credentials

4. Surface v0:
   - draft/published Surface records
   - server-side GenUI catalog validation
   - safe data binding to approved DataSourceRefs
