# WorkItem and GenUI Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Every code-producing task must follow `test-driven-development`: write the failing test, run it and verify RED, implement the smallest GREEN change, run the targeted test, then run the relevant package suite.

**Goal:** Build the product spine for Agents Cloud: `WorkItem -> Run -> Events -> Artifacts -> DataSources -> Surfaces -> Approvals -> Notifications`.

**Architecture:** AWS remains durable truth. Control API owns durable commands and DynamoDB records. Step Functions/ECS own execution. Realtime is fanout only. Agents may propose declarative GenUI Surfaces, but Control API validates them against an allowlisted catalog before clients render them. Web implements the first real product loop; Flutter follows the same contracts with a shadcn-native native renderer.

**Tech Stack:** TypeScript, pnpm, `@agents-cloud/protocol`, AWS CDK, API Gateway HTTP API, Cognito JWT authorizer, Lambda, DynamoDB, Step Functions, S3, Next.js static export, React, Flutter, Riverpod, `shadcn_flutter`, `markdown_widget`.

---

## Read this first

Before implementing any task, read these files in order:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/roadmap/PROJECT_STATUS.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
5. `docs/roadmap/BEST_NEXT_STEPS_EXECUTION_PLAN.md`
6. `docs/roadmap/AGENT_CREATED_INTERFACES_GENUI_PRODUCT_VISION.md`
7. `docs/roadmap/WORK_BOARD_FLUTTER_KANBAN_ROI_AUDIT.md`
8. `docs/roadmap/GENUI_MARKDOWN_CHAT_BROWSER_AUDIT.md`
9. `docs/roadmap/PAPERCLIP_KANBAN_UI_UX_AUDIT.md`

## Current implementation baseline

Current deployed/product baseline:

- Protocol package has `CanonicalEventEnvelope`, `buildRunStatusEvent`, and `buildArtifactCreatedEvent` in `packages/protocol/src/events.ts`.
- Control API has run-centric routes:
  - `POST /runs`
  - `GET /runs/{runId}`
  - `GET /runs/{runId}/events`
  - `GET /admin/runs`
- State tables currently include Runs, Tasks, Events, Artifacts, Approvals, PreviewDeployments, and RealtimeConnections.
- Web command center can create a Run and receive/poll events.
- Flutter has a monolithic but useful shadcn shell in `apps/desktop_mobile/lib/main.dart`.

Current gap:

- There is no durable WorkItem object.
- There are no DataSourceRef or Surface records.
- Artifact listing/download APIs are not productized.
- GenUI exists as product direction/shell, not as a validated saved Surface pipeline.
- Web and Flutter are still mostly run/fixture-centric.

## Product invariant

Never build future product surfaces directly on free-floating Runs.

Correct:

```text
WorkItem
  owns Runs
  owns Artifacts
  owns DataSources
  owns Surfaces
  owns Approvals
  owns Notifications
```

Incorrect:

```text
Run-only dashboard
  -> later retrofits WorkItem
  -> breaks board, artifacts, approvals, GenUI, mobile review
```

## Implementation milestones

### Milestone 1: MVP Work Operating Loop

Definition of done:

1. User can create a WorkItem from an objective.
2. Control API persists WorkItem and creates/links a Run.
3. Step Functions/ECS still runs the current worker path.
4. Run events include/relate to the WorkItem.
5. Web `/work` shows real WorkItems.
6. Web WorkItem detail shows linked run ledger and artifact cards.
7. Current command center remains compatible.
8. Tests cover protocol, Control API, infra synth, and web helper behavior.

### Milestone 2: Validated GenUI Surface Loop

Definition of done:

1. DataSourceRef records can be created/listed under a WorkItem.
2. Surface records can be created/listed under a WorkItem.
3. Surface specs are server-validated against a v0 catalog.
4. Web renders v0 Surface components without arbitrary HTML/JS.
5. Invalid components, unsafe URLs, cross-workspace DataSourceRefs, and oversize specs are rejected by tests.

### Milestone 3: Native Review Loop

Definition of done:

1. Flutter app has first-party shadcn WorkBoard with the same WorkItem shape.
2. Flutter can open WorkItem detail.
3. Flutter can render run ledger, artifact cards, markdown reports, and v0 Surface components.
4. Mobile layout is compact and professional.
5. Widget tests cover desktop and mobile shapes.

---

# Phase 0: Protocol contracts

## Task 0.1: Add protocol tests for hyphenated event types

**Objective:** Allow readable event types like `work-item.created` and `data-source-ref.created` while preserving strict canonical event validation.

**Files:**

- Modify: `packages/protocol/src/events.ts`
- Create: `packages/protocol/test/events.test.ts`
- Modify: `packages/protocol/package.json` if test script does not run node tests yet.

**Step 1: Write failing test**

Create `packages/protocol/test/events.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCanonicalEvent } from "../src/events.js";

describe("canonical event type validation", () => {
  it("accepts hyphenated event type segments", () => {
    const event = buildCanonicalEvent({
      id: "evt-work-1",
      type: "work-item.created",
      seq: 1,
      createdAt: "2026-05-10T00:00:00.000Z",
      userId: "user-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      source: { kind: "control-api", name: "control-api.work-items" },
      payload: { workItemId: "work-1" }
    });

    assert.equal(event.type, "work-item.created");
  });
});
```

**Step 2: Verify RED**

Run:

```bash
cd /Users/sebastian/Developer/agents-cloud
pnpm --filter @agents-cloud/protocol test
```

Expected RED:

- `workItemId` is not accepted by the current type, and/or
- `runId` is required, and/or
- hyphenated event type is rejected.

**Step 3: Implement minimal GREEN**

In `packages/protocol/src/events.ts`:

- Add optional `workItemId?: string` to `CanonicalEventEnvelope` and `CanonicalEventBaseInput`.
- Make `runId` optional only in the generic envelope/input.
- Keep `runId` required in `RunStatusPayload` and `buildRunStatusEvent` input by introducing a narrower type:

```ts
type RunScopedEventBaseInput = CanonicalEventBaseInput & { readonly runId: string };
```

- Add validation that at least one of `runId` or `workItemId` exists.
- Change the event type regex to permit hyphenated segments:

```ts
/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/
```

**Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @agents-cloud/protocol test
pnpm contracts:test
```

Expected GREEN.

**Step 5: Commit**

```bash
git add packages/protocol/src/events.ts packages/protocol/test/events.test.ts packages/protocol/package.json
git commit -m "feat(protocol): allow work-scoped canonical events"
```

## Task 0.2: Add WorkItem protocol types and builders

**Objective:** Define canonical WorkItem event payloads and builders before backend implementation.

**Files:**

- Modify: `packages/protocol/src/events.ts`
- Modify: `packages/protocol/test/events.test.ts`

**Step 1: Write failing tests**

Add tests:

```ts
import { buildWorkItemCreatedEvent, buildWorkItemStatusEvent, buildWorkItemRunLinkedEvent } from "../src/events.js";

it("builds work-item.created events", () => {
  const event = buildWorkItemCreatedEvent({
    id: "evt-work-1",
    seq: 1,
    createdAt: "2026-05-10T00:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    source: { kind: "control-api", name: "control-api.work-items" },
    title: "Track competitor pricing",
    objective: "Track competitor pricing weekly",
    status: "open",
    priority: "normal"
  });

  assert.equal(event.type, "work-item.created");
  assert.equal(event.payload.workItemId, "work-1");
});

it("builds work-item.run-linked events", () => {
  const event = buildWorkItemRunLinkedEvent({
    id: "evt-work-2",
    seq: 2,
    createdAt: "2026-05-10T00:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    runId: "run-1",
    source: { kind: "control-api", name: "control-api.work-items" },
    attempt: 1,
    trigger: "work-item-created"
  });

  assert.equal(event.type, "work-item.run-linked");
  assert.equal(event.payload.runId, "run-1");
});
```

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/protocol test
```

Expected RED: exports missing.

**Step 3: Implement minimal GREEN**

Add:

```ts
export type WorkItemStatus = "open" | "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
export type WorkItemPriority = "low" | "normal" | "high" | "urgent";
export type WorkItemKind = "task" | "request" | "investigation" | "build" | "research" | "approval" | "other";
export type WorkItemRunTrigger = "work-item-created" | "manual" | "retry" | "system";
```

Add payload interfaces and builders:

- `WorkItemCreatedPayload`
- `WorkItemStatusPayload`
- `WorkItemRunLinkedPayload`
- `buildWorkItemCreatedEvent`
- `buildWorkItemStatusEvent`
- `buildWorkItemRunLinkedEvent`

**Step 4: Verify GREEN**

```bash
pnpm --filter @agents-cloud/protocol test
pnpm contracts:test
```

**Step 5: Commit**

```bash
git add packages/protocol/src/events.ts packages/protocol/test/events.test.ts
git commit -m "feat(protocol): add work item event builders"
```

## Task 0.3: Add DataSourceRef and Surface protocol contracts

**Objective:** Define durable declarative data and UI objects for validated GenUI without arbitrary frontend code.

**Files:**

- Modify: `packages/protocol/src/events.ts`
- Modify: `packages/protocol/test/events.test.ts`
- Create: `packages/protocol/schemas/events/data-source-ref.schema.json`
- Create: `packages/protocol/schemas/events/surface.schema.json`
- Modify: `packages/protocol/scripts/validate-schemas.mjs`

**Step 1: Write failing tests**

Add tests that import:

- `buildDataSourceRefCreatedEvent`
- `buildSurfaceCreatedEvent`
- `buildSurfacePublishedEvent`

Use valid payloads:

```ts
const dataSourceEvent = buildDataSourceRefCreatedEvent({
  id: "evt-ds-1",
  seq: 1,
  createdAt: "2026-05-10T00:00:00.000Z",
  userId: "user-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  source: { kind: "control-api", name: "control-api.data-sources" },
  dataSourceId: "ds-1",
  kind: "artifact-ref",
  name: "Competitor pricing dataset",
  artifactId: "artifact-1",
  access: { mode: "private" }
});
```

```ts
const surfaceEvent = buildSurfaceCreatedEvent({
  id: "evt-surface-1",
  seq: 1,
  createdAt: "2026-05-10T00:00:00.000Z",
  userId: "user-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  source: { kind: "control-api", name: "control-api.surfaces" },
  surfaceId: "surface-1",
  title: "Competitor pricing dashboard",
  kind: "dashboard",
  status: "draft",
  version: 1
});
```

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/protocol test
```

Expected RED: exports and schemas missing.

**Step 3: Implement minimal GREEN**

Add types:

```ts
export type DataSourceRefKind = "inline-data" | "artifact-ref" | "run-event-ref" | "control-api-query-ref";
export type DataSourceAccessMode = "private" | "workspace" | "public-read";
export type SurfaceKind = "dashboard" | "report" | "tool" | "artifact-review";
export type SurfaceStatus = "draft" | "published" | "archived";
```

Add payload/builders:

- `DataSourceRefCreatedPayload`
- `SurfaceCreatedPayload`
- `SurfacePublishedPayload`
- `buildDataSourceRefCreatedEvent`
- `buildSurfaceCreatedEvent`
- `buildSurfacePublishedEvent`

Create JSON schemas and include them in `validate-schemas.mjs`.

**Step 4: Verify GREEN**

```bash
pnpm contracts:test
pnpm schemas:validate
```

**Step 5: Commit**

```bash
git add packages/protocol/src/events.ts packages/protocol/test/events.test.ts packages/protocol/schemas/events/data-source-ref.schema.json packages/protocol/schemas/events/surface.schema.json packages/protocol/scripts/validate-schemas.mjs
git commit -m "feat(protocol): add datasource and surface event contracts"
```

---

# Phase 1: CDK state and API routes

## Task 1.1: Add StateStack tests for WorkItems/DataSources/Surfaces tables

**Objective:** Lock the DynamoDB table design before changing the stack.

**Files:**

- Create: `infra/cdk/test/state-stack.test.ts`
- Modify: `infra/cdk/package.json` if no test script exists.

**Step 1: Write failing test**

Use `aws-cdk-lib/assertions` and `node:test`. Assert synthesized template includes:

- `WorkItemsTable`
- `DataSourcesTable`
- `SurfacesTable`
- WorkItems PK `workspaceId`, SK `workItemId`
- WorkItems GSIs:
  - `by-user-created-at`
  - `by-status-updated-at`
  - `by-idempotency-scope`
- DataSources GSIs:
  - `by-workitem-created-at`
  - `by-run-created-at`
  - `by-artifact-id`
- Surfaces GSIs:
  - `by-workitem-updated-at`
  - `by-run-updated-at`
  - `by-status-updated-at`

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/infra-cdk test
```

Expected RED: tables missing or test script missing.

**Step 3: Implement minimal GREEN**

Modify `infra/cdk/src/stacks/state-stack.ts`:

- Add public readonly fields:
  - `workItemsTable`
  - `dataSourcesTable`
  - `surfacesTable`
- Create the three tables.
- Add listed GSIs.
- Add `CfnOutput`s.

Also add Runs/Artifacts GSIs where needed:

- Runs: `by-workitem-created-at` with PK `workItemId`, SK `createdAt`.
- Artifacts: `by-workitem-created-at` with PK `workItemId`, SK `createdAt`.

**Step 4: Verify GREEN**

```bash
pnpm --filter @agents-cloud/infra-cdk test
pnpm infra:synth
```

**Step 5: Commit**

```bash
git add infra/cdk/src/stacks/state-stack.ts infra/cdk/test/state-stack.test.ts infra/cdk/package.json
git commit -m "feat(infra): add work item genui state tables"
```

## Task 1.2: Add ControlApiStack route tests

**Objective:** Define routes, Lambda env vars, and table grants before handler implementation.

**Files:**

- Create: `infra/cdk/test/control-api-stack.test.ts`
- Modify: `infra/cdk/src/stacks/control-api-stack.ts`

**Step 1: Write failing test**

Assert API routes exist:

```text
POST /work-items
GET /work-items
GET /work-items/{workItemId}
PATCH /work-items/{workItemId}
POST /work-items/{workItemId}/status
POST /work-items/{workItemId}/runs
GET /work-items/{workItemId}/runs
GET /work-items/{workItemId}/events
GET /work-items/{workItemId}/artifacts
GET /runs/{runId}/artifacts
GET /runs/{runId}/artifacts/{artifactId}
POST /data-source-refs
GET /data-source-refs/{dataSourceId}
GET /work-items/{workItemId}/data-source-refs
POST /surfaces
GET /surfaces/{surfaceId}
GET /work-items/{workItemId}/surfaces
PATCH /surfaces/{surfaceId}
POST /surfaces/{surfaceId}/publish
```

Assert Lambda environment includes:

- `WORK_ITEMS_TABLE_NAME`
- `ARTIFACTS_TABLE_NAME`
- `DATA_SOURCES_TABLE_NAME`
- `SURFACES_TABLE_NAME`

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/infra-cdk test
```

Expected RED: routes/env missing.

**Step 3: Implement minimal GREEN**

Modify `control-api-stack.ts`:

- Extend `commonEnvironment` with new table names.
- Create function resources or grouped handler functions. Keep v0 simple:
  - `CreateWorkItemFunction`
  - `GetWorkItemFunction`
  - `ListWorkItemsFunction`
  - `PatchWorkItemFunction`
  - `StartWorkItemRunFunction`
  - `ListArtifactsFunction`
  - `DataSourceRefsFunction`
  - `SurfacesFunction`
- Add routes.
- Grant minimum table access per function.

**Step 4: Verify GREEN**

```bash
pnpm --filter @agents-cloud/infra-cdk test
pnpm infra:synth
```

**Step 5: Commit**

```bash
git add infra/cdk/src/stacks/control-api-stack.ts infra/cdk/test/control-api-stack.test.ts
git commit -m "feat(infra): route work item and surface APIs"
```

---

# Phase 2: Control API domain ports and store

## Task 2.1: Extend Control API port types

**Objective:** Add typed records and store methods before use-case logic.

**Files:**

- Modify: `services/control-api/src/ports.ts`
- Create: `services/control-api/test/ports-shape.test.ts` if useful.

**Step 1: Write failing compile-level test**

Create a test that imports the new types and creates typed objects:

- `WorkItemRecord`
- `ArtifactRecord`
- `DataSourceRefRecord`
- `SurfaceRecord`
- `CreateWorkItemRequest`
- `CreateDataSourceRefRequest`
- `CreateSurfaceRequest`

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/control-api test
```

Expected RED: missing exports.

**Step 3: Implement minimal GREEN**

In `ports.ts`, add:

- Work item status/kind/priority unions mirroring protocol.
- New record interfaces.
- Extend `RunRecord` with optional `workItemId`, `attempt`, `trigger`, `projectId`.
- Extend `EventRecord` with optional `workItemId`, `projectId`, `correlationId`, `payloadRef`.
- Extend `ControlApiStore` methods:

```ts
createWorkItemRunLedger(input: { workItem: WorkItemRecord; run?: RunRecord; task?: TaskRecord; events: EventRecord[] }): Promise<void>;
putWorkItem(item: WorkItemRecord): Promise<void>;
updateWorkItem(input: { workspaceId: string; workItemId: string; patch: Partial<WorkItemRecord>; updatedAt: string }): Promise<void>;
getWorkItem(input: { workspaceId: string; workItemId: string }): Promise<WorkItemRecord | undefined>;
getWorkItemById(workItemId: string): Promise<WorkItemRecord | undefined>;
getWorkItemByIdempotencyScope(scope: string): Promise<WorkItemRecord | undefined>;
listWorkItemsByUser(input: { userId: string; limit?: number }): Promise<WorkItemRecord[]>;
listRunsByWorkItem(input: { workItemId: string; limit?: number }): Promise<RunRecord[]>;
listEventsByWorkItem(input: { workItemId: string; limit?: number }): Promise<EventRecord[]>;
listArtifactsByRun(input: { runId: string; limit?: number }): Promise<ArtifactRecord[]>;
listArtifactsByWorkItem(input: { workItemId: string; limit?: number }): Promise<ArtifactRecord[]>;
putDataSourceRef(item: DataSourceRefRecord): Promise<void>;
getDataSourceRef(input: { workspaceId: string; dataSourceId: string }): Promise<DataSourceRefRecord | undefined>;
listDataSourceRefsByWorkItem(input: { workItemId: string; limit?: number }): Promise<DataSourceRefRecord[]>;
putSurface(item: SurfaceRecord): Promise<void>;
getSurface(input: { workspaceId: string; surfaceId: string }): Promise<SurfaceRecord | undefined>;
listSurfacesByWorkItem(input: { workItemId: string; limit?: number }): Promise<SurfaceRecord[]>;
```

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/ports.ts services/control-api/test/ports-shape.test.ts
git commit -m "feat(control-api): define work item store ports"
```

## Task 2.2: Implement Dynamo store methods

**Objective:** Back Control API ports with DynamoDB access patterns.

**Files:**

- Modify: `services/control-api/src/dynamo-store.ts`
- Create: `services/control-api/test/dynamo-store.test.ts` if feasible with mocked DocumentClient, otherwise cover through use-case memory stores first and integration smoke later.

**Step 1: Write failing tests**

At minimum test pure/env behavior:

- `DynamoControlApiStore.fromEnvironment()` requires new env vars.
- `createWorkItemRunLedger` issues a transactional write containing WorkItem and events.
- List methods clamp limit to 1..100.

If mocking DocumentClient is too heavy, add tests at use-case layer and verify Dynamo shape through code review plus `infra:synth`.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

Modify constructor table config:

```ts
readonly workItemsTableName: string;
readonly artifactsTableName: string;
readonly dataSourcesTableName: string;
readonly surfacesTableName: string;
```

Implement:

- `createWorkItemRunLedger` with `TransactWriteCommand`.
- WorkItem get/list/update.
- Run list by WorkItem using GSI.
- Artifact list by Run/WorkItem.
- DataSourceRef create/get/list.
- Surface create/get/list/update.

Important v0 event-table decision:

- EventsTable is keyed by `runId`/`seq`.
- For `POST /work-items` with `autoRun=true`, store WorkItem events under the new Run ID.
- For `autoRun=false`, either:
  - do not write timeline events yet, or
  - create a synthetic entity timeline runId like `workitem-${workItemId}`.
- Recommendation for v0: default `autoRun=true`; `autoRun=false` writes WorkItem only and no event until entity timeline design exists.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
pnpm control-api:build
```

**Step 5: Commit**

```bash
git add services/control-api/src/dynamo-store.ts services/control-api/test/dynamo-store.test.ts
git commit -m "feat(control-api): persist work item genui records"
```

---

# Phase 3: WorkItem use cases and handlers

## Task 3.1: Create WorkItem with optional auto-run

**Objective:** Implement `POST /work-items` as the canonical user delegation endpoint.

**Files:**

- Create: `services/control-api/src/create-work-item.ts`
- Create: `services/control-api/test/create-work-item.test.ts`
- Modify: `services/control-api/src/handlers.ts`

**Step 1: Write failing tests**

Test cases:

1. Missing `workspaceId` returns 400 and writes nothing.
2. Missing `objective` returns 400 and writes nothing.
3. Valid request with `autoRun: true` creates WorkItem, Run, Task, events, and starts Step Functions.
4. Valid request with `autoRun: false` creates WorkItem only, status `open`, no execution.
5. Idempotency key returns existing WorkItem and does not duplicate run/events.
6. Title defaults from objective first sentence if omitted.
7. Invalid priority/kind returns 400.

Expected request:

```json
{
  "workspaceId": "workspace-abc",
  "title": "Track competitor pricing",
  "objective": "Track competitor pricing weekly and produce a dashboard.",
  "description": "Optional detail.",
  "kind": "research",
  "priority": "normal",
  "autoRun": true,
  "idempotencyKey": "request-1"
}
```

Expected response:

```json
{
  "workItemId": "work-idem-...",
  "workspaceId": "workspace-abc",
  "title": "Track competitor pricing",
  "status": "queued",
  "currentRunId": "run-idem-...",
  "runId": "run-idem-...",
  "taskId": "task-idem-..."
}
```

**Step 2: Verify RED**

```bash
pnpm --filter @agents-cloud/control-api test -- create-work-item
```

Expected RED: file/function missing.

**Step 3: Implement minimal GREEN**

`createWorkItem(deps)` should:

1. Trim/validate request.
2. Compute idempotency scope: `${userId}#${workspaceId}#work-item#${idempotencyKey}`.
3. Return existing WorkItem if idempotent duplicate.
4. Create deterministic IDs for idempotent requests or UUIDs otherwise.
5. Create WorkItem.
6. If `autoRun !== false`, create Run/Task and start Step Functions.
7. Events sequence for auto-run:
   - seq 1 `work-item.created`
   - seq 2 `work-item.run-linked`
   - seq 3 `run.status` queued
8. Update Run execution ARN after Step Functions starts.
9. Return compact response.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/create-work-item.ts services/control-api/src/handlers.ts services/control-api/test/create-work-item.test.ts
git commit -m "feat(control-api): create work items with linked runs"
```

## Task 3.2: List/get/update WorkItems

**Objective:** Let web render a real Work page and detail page.

**Files:**

- Create: `services/control-api/src/query-work-items.ts`
- Create: `services/control-api/test/query-work-items.test.ts`
- Modify: `services/control-api/src/handlers.ts`

**Step 1: Write failing tests**

Cases:

- Owner can list their WorkItems.
- List clamps limit to 1..100.
- Owner can get WorkItem by ID.
- Non-owner gets 404.
- PATCH can update title/description/priority/status only for owner.
- PATCH rejects unsupported fields.
- Status transition writes updatedAt and closedAt for terminal status.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

Handlers:

- `createWorkItemHandler`
- `listWorkItemsHandler`
- `getWorkItemHandler`
- `patchWorkItemHandler`
- `updateWorkItemStatusHandler`

Authorization:

```ts
if (workItem.userId !== user.userId) return 404;
```

Use 404 instead of 403 to avoid leaking existence across users.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/query-work-items.ts services/control-api/src/handlers.ts services/control-api/test/query-work-items.test.ts
git commit -m "feat(control-api): query and update work items"
```

## Task 3.3: Start additional Run from WorkItem

**Objective:** Support follow-up work on the same WorkItem.

**Files:**

- Modify: `services/control-api/src/create-run.ts`
- Create/modify: `services/control-api/src/start-work-item-run.ts`
- Modify: `services/control-api/test/create-run.test.ts`
- Create: `services/control-api/test/start-work-item-run.test.ts`

**Step 1: Write failing tests**

Cases:

- `POST /work-items/{workItemId}/runs` creates attempt 2 when one run already exists.
- Missing WorkItem returns 404.
- Other user's WorkItem returns 404.
- WorkItem currentRunId is updated.
- Existing `POST /runs` behavior still passes.
- Optional `workItemId` in `POST /runs` links to WorkItem if authorized.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

- Add `workItemId?: string` to `CreateRunRequest`.
- If `workItemId` is present, fetch and authorize WorkItem.
- Add `workItemId`, `attempt`, and `trigger` to RunRecord.
- Add `workItemId` to Step Functions input if runtime can accept it; if not, add in a follow-up runtime task.
- Add event `work-item.run-linked` before or after queued event.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
pnpm control-api:build
```

**Step 5: Commit**

```bash
git add services/control-api/src/create-run.ts services/control-api/src/start-work-item-run.ts services/control-api/test/create-run.test.ts services/control-api/test/start-work-item-run.test.ts
git commit -m "feat(control-api): start runs from work items"
```

---

# Phase 4: Artifact APIs and runtime linkage

## Task 4.1: Add artifact query use cases

**Objective:** Productize artifacts so WorkItem detail can show outputs beyond event metadata.

**Files:**

- Create: `services/control-api/src/query-artifacts.ts`
- Create: `services/control-api/test/query-artifacts.test.ts`
- Modify: `services/control-api/src/handlers.ts`

**Step 1: Write failing tests**

Cases:

- Owner lists artifacts by Run.
- Non-owner cannot list artifacts by Run.
- Owner lists artifacts by WorkItem.
- Missing Run/WorkItem returns 404.
- Limit is clamped to 1..100.
- Response preserves `artifactId`, `kind`, `name`, `contentType`, `uri`, `previewUrl`, `sha256`, `bytes`, `metadata`.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

Add routes:

- `GET /runs/{runId}/artifacts`
- `GET /runs/{runId}/artifacts/{artifactId}`
- `GET /work-items/{workItemId}/artifacts`

Do not expose raw `s3://` as a browser download link yet. Return metadata. Signed download URL can be later task if S3 client is wired.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/query-artifacts.ts services/control-api/src/handlers.ts services/control-api/test/query-artifacts.test.ts
git commit -m "feat(control-api): query run and work item artifacts"
```

## Task 4.2: Propagate WorkItem ID into runtime artifact records

**Objective:** Ensure worker-produced artifacts attach to WorkItems when the Run is WorkItem-linked.

**Files:**

- Modify: `services/agent-runtime/src/ports.ts`
- Modify: `services/agent-runtime/src/worker.ts`
- Modify: `services/agent-runtime/src/aws-artifact-sink.ts`
- Modify: `services/agent-runtime/test/*`
- Modify: Step Functions/ECS input mapping if necessary in `infra/cdk/src/stacks/orchestration-stack.ts` or runtime stack.

**Step 1: Write failing tests**

Cases:

- RuntimeContext with `workItemId` writes artifact record with `workItemId`.
- `artifact.created` event envelope includes `workItemId`.
- Report S3 key may remain run-scoped, but metadata links WorkItem.

**Step 2: Verify RED**

```bash
pnpm agent-runtime:test
```

**Step 3: Implement minimal GREEN**

- Add optional `workItemId` to runtime context.
- Add `workItemId` to artifact records and event builder input.
- Ensure Step Functions passes WorkItem ID when present.

**Step 4: Verify GREEN**

```bash
pnpm agent-runtime:test
pnpm agent-runtime:build
```

**Step 5: Commit**

```bash
git add services/agent-runtime/src services/agent-runtime/test infra/cdk/src/stacks/orchestration-stack.ts
git commit -m "feat(runtime): link worker artifacts to work items"
```

---

# Phase 5: DataSourceRef API

## Task 5.1: Create/list DataSourceRefs

**Objective:** Give dashboards and reports safe, reusable data pointers.

**Files:**

- Create: `services/control-api/src/data-source-refs.ts`
- Create: `services/control-api/test/data-source-refs.test.ts`
- Modify: `services/control-api/src/handlers.ts`

**Step 1: Write failing tests**

Cases:

- Create DataSourceRef under owned WorkItem.
- Create DataSourceRef under owned Run.
- Reject if neither WorkItem nor Run exists.
- Reject cross-user WorkItem/Run.
- Reject unsafe `external-url` in v0 unless allowlisted; prefer no external-url in v0.
- Reject oversized inline data.
- List DataSourceRefs by WorkItem.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

API:

```text
POST /data-source-refs
GET /data-source-refs/{dataSourceId}
GET /work-items/{workItemId}/data-source-refs
GET /runs/{runId}/data-source-refs
```

Allowed v0 kinds:

- `inline-data`
- `artifact-ref`
- `run-event-ref`
- `control-api-query-ref`

Do not implement arbitrary SQL, broad S3 browsing, or secret-backed external APIs in v0.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/data-source-refs.ts services/control-api/src/handlers.ts services/control-api/test/data-source-refs.test.ts
git commit -m "feat(control-api): add datasource references"
```

---

# Phase 6: Surface API and GenUI validator

## Task 6.1: Add Surface validator

**Objective:** Make GenUI safe by validating schemas before saving or rendering.

**Files:**

- Create: `services/control-api/src/genui/catalog.ts`
- Create: `services/control-api/src/genui/validator.ts`
- Create: `services/control-api/test/genui-validator.test.ts`

**Step 1: Write failing tests**

Cases:

- Accepts minimal dashboard with `metric-card`, `data-table`, `markdown-block`.
- Rejects unknown component type.
- Rejects raw HTML/script fields.
- Rejects `javascript:` URLs.
- Rejects remote component URLs/imports.
- Rejects missing `schemaVersion`.
- Rejects too many components.
- Rejects too deep component tree.
- Rejects DataSourceRef from another workspace.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

Catalog v0:

```ts
const allowedComponents = new Set([
  "metric-card",
  "status-summary",
  "data-table",
  "line-chart",
  "bar-chart",
  "markdown-block",
  "artifact-list",
  "run-ledger",
  "approval-list"
]);
```

Rules:

- Max components: 50.
- Max depth: 8.
- Max text prop length: 8,000.
- Max table rows inline: 100.
- URL protocols allowed: `https:`, `mailto:`, `tel:`, relative paths.
- No `html`, `script`, `style`, `dangerouslySetInnerHTML`, `onClick`, `eval`, `import`, `componentUrl` keys.

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add services/control-api/src/genui services/control-api/test/genui-validator.test.ts
git commit -m "feat(control-api): validate genui surface specs"
```

## Task 6.2: Create/list/publish Surfaces

**Objective:** Persist validated GenUI Surfaces attached to WorkItems.

**Files:**

- Create: `services/control-api/src/surfaces.ts`
- Create: `services/control-api/test/surfaces.test.ts`
- Modify: `services/control-api/src/handlers.ts`

**Step 1: Write failing tests**

Cases:

- Create draft Surface under owned WorkItem.
- Reject invalid spec.
- Reject cross-workspace DataSourceRef binding.
- List Surfaces by WorkItem.
- Get Surface by ID only for owner.
- Patch draft Surface with valid spec.
- Publish Surface changes status to `published` and sets `publishedAt`.
- Cannot patch archived Surface.

**Step 2: Verify RED**

```bash
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

API:

```text
POST /surfaces
GET /surfaces/{surfaceId}
GET /work-items/{workItemId}/surfaces
PATCH /surfaces/{surfaceId}
POST /surfaces/{surfaceId}/publish
```

Surface spec shape:

```ts
type SurfaceSpec = {
  schemaVersion: "surface.v0";
  layout: { type: "stack" | "grid" | "tabs" };
  components: Array<{
    id: string;
    type: string;
    props?: Record<string, unknown>;
    dataSourceId?: string;
    children?: string[];
  }>;
};
```

**Step 4: Verify GREEN**

```bash
pnpm control-api:test
pnpm control-api:build
```

**Step 5: Commit**

```bash
git add services/control-api/src/surfaces.ts services/control-api/src/handlers.ts services/control-api/test/surfaces.test.ts
git commit -m "feat(control-api): persist validated surfaces"
```

---

# Phase 7: Web Work page and detail

## Task 7.1: Add web WorkItem client helpers and pure tests

**Objective:** Give web a typed client model and mock mode before UI.

**Files:**

- Modify: `apps/web/lib/control-api.ts`
- Create: `apps/web/lib/work-items.ts`
- Create: `apps/web/lib/work-store.ts`
- Create: `apps/web/test/work-items.test.ts`
- Create: `apps/web/test/control-api-work-mock.test.ts`

**Step 1: Write failing tests**

Cases:

- `deriveWorkItemStatus` maps latest linked Run status to WorkItem runtime state.
- Artifact counts aggregate across linked Runs.
- WorkItems sort by `updatedAt` descending.
- Mock mode can create/list/get WorkItems.
- Mock mode can link a Run to a WorkItem.

**Step 2: Verify RED**

```bash
pnpm web:test
```

**Step 3: Implement minimal GREEN**

Add client functions:

- `createControlApiWorkItem`
- `listControlApiWorkItems`
- `getControlApiWorkItem`
- `updateControlApiWorkItemStatus`
- `startControlApiWorkItemRun`
- `listControlApiWorkItemArtifacts`
- `listControlApiWorkItemSurfaces`

Mock mode:

- Use in-memory/localStorage fallback only in browser functions.
- Seed a demo WorkItem only when `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1`.

**Step 4: Verify GREEN**

```bash
pnpm web:test
pnpm web:typecheck
```

**Step 5: Commit**

```bash
git add apps/web/lib/control-api.ts apps/web/lib/work-items.ts apps/web/lib/work-store.ts apps/web/test/work-items.test.ts apps/web/test/control-api-work-mock.test.ts
git commit -m "feat(web): add work item client helpers"
```

## Task 7.2: Factor reusable run ledger hook

**Objective:** Reuse polling/realtime/backfill logic across command center and WorkItem detail.

**Files:**

- Create: `apps/web/lib/use-run-ledger.ts` or `apps/web/components/work/use-run-ledger.ts`
- Modify: `apps/web/components/command-center.tsx`
- Modify: existing run ledger tests if needed.

**Step 1: Write failing tests where possible**

Since React hook testing dependencies may not exist, keep most logic pure:

- Extract non-React functions into `apps/web/lib/run-ledger-session.ts`.
- Test backfill parameter decisions, terminal stop decision, and realtime merge behavior.

**Step 2: Verify RED**

```bash
pnpm web:test
```

**Step 3: Implement minimal GREEN**

Hook returns:

```ts
{
  run,
  events,
  ledgerView,
  artifacts,
  loading,
  error,
  refresh
}
```

Command center should keep current UI unchanged after refactor.

**Step 4: Verify GREEN**

```bash
pnpm web:test
pnpm web:typecheck
pnpm web:build
```

**Step 5: Commit**

```bash
git add apps/web/lib apps/web/components/command-center.tsx apps/web/test
git commit -m "refactor(web): share run ledger loading"
```

## Task 7.3: Build `/work` page

**Objective:** Show a real WorkItem board/list page.

**Files:**

- Create: `apps/web/app/work/page.tsx`
- Create: `apps/web/components/work/work-auth-shell.tsx`
- Create: `apps/web/components/work/work-layout.tsx`
- Create: `apps/web/components/work/work-page.tsx`
- Create: `apps/web/components/work/create-work-item-panel.tsx`
- Create: `apps/web/components/work/work-item-list.tsx`
- Create: `apps/web/components/work/work-item-row.tsx`
- Modify: `apps/web/app/globals.css`

**Step 1: Write failing tests**

If render test tooling exists, test page render. If not, test pure helpers and typecheck. Add CSS class names in implementation and verify via typecheck/build.

**Step 2: Verify RED**

```bash
pnpm web:typecheck
```

Expected RED if imports/files missing from page shell.

**Step 3: Implement minimal GREEN**

UX requirements:

- Header: “Work” and concise description.
- Create panel for objective/title.
- Dense list grouped or filterable by status.
- No drag/drop first.
- Link rows to detail.
- Empty state is professional, not playful.
- Hide raw JSON.

Static export constraint:

- `/work/page.tsx` is safe for static export.
- Detail direct deep links need careful handling in Task 7.4.

**Step 4: Verify GREEN**

```bash
pnpm web:typecheck
pnpm web:build
```

**Step 5: Commit**

```bash
git add apps/web/app/work/page.tsx apps/web/components/work apps/web/app/globals.css
git commit -m "feat(web): add work item page"
```

## Task 7.4: Build WorkItem detail route

**Objective:** Show WorkItem overview, linked Runs, artifact cards, and Surface placeholders.

**Files:**

- Create: `apps/web/app/work/[workItemId]/page.tsx`
- Create: `apps/web/components/work/work-item-detail-page.tsx`
- Create: `apps/web/components/work/work-item-detail-header.tsx`
- Create: `apps/web/components/work/work-item-run-composer.tsx`
- Create: `apps/web/components/work/work-item-run-timeline.tsx`
- Create: `apps/web/components/work/work-artifact-panel.tsx`
- Create: `apps/web/components/work/artifact-card.tsx`
- Create: `apps/web/components/work/genui-surface-panel.tsx`

**Step 1: Write failing tests**

Pure tests:

- Detail view model chooses active Run.
- Artifact panel filters smoke artifacts by default.
- WorkItem status derives from terminal/nonterminal Runs.

**Step 2: Verify RED**

```bash
pnpm web:test
pnpm web:typecheck
```

**Step 3: Implement minimal GREEN**

Important static export note:

- Next static export does not naturally support arbitrary dynamic direct deep links unless generated or rewritten.
- For v0, client navigation from `/work` can open detail.
- If direct refresh is required on Amplify static hosting, add rewrite rule or use query/hash route such as `/work?workItemId=...` until hosting changes.
- Document whichever choice is implemented in `docs/roadmap/WEB_APP_STATUS.md`.

**Step 4: Verify GREEN**

```bash
pnpm web:test
pnpm web:typecheck
pnpm web:build
```

**Step 5: Commit**

```bash
git add apps/web/app/work apps/web/components/work apps/web/test docs/roadmap/WEB_APP_STATUS.md
git commit -m "feat(web): add work item detail view"
```

---

# Phase 8: Web GenUI Surface renderer

## Task 8.1: Add web GenUI schema validator

**Objective:** Client-side validation protects rendering even though server validation is authoritative.

**Files:**

- Create: `apps/web/lib/genui-schema.ts`
- Create: `apps/web/test/genui-schema.test.ts`

**Step 1: Write failing tests**

Cases:

- Accepts minimal valid `surface.v0`.
- Rejects unknown component type.
- Rejects `javascript:` link.
- Rejects raw HTML/script fields.
- Rejects too deep tree.
- Rejects too many rows/nodes.

**Step 2: Verify RED**

```bash
pnpm web:test
```

**Step 3: Implement minimal GREEN**

Use manual guards. Do not add new dependencies unless explicitly approved.

Allowed web component types map to server catalog:

- `metric-card`
- `status-summary`
- `data-table`
- `line-chart`
- `bar-chart`
- `markdown-block`
- `artifact-list`
- `run-ledger`
- `approval-list`

**Step 4: Verify GREEN**

```bash
pnpm web:test
```

**Step 5: Commit**

```bash
git add apps/web/lib/genui-schema.ts apps/web/test/genui-schema.test.ts
git commit -m "feat(web): validate genui surfaces client-side"
```

## Task 8.2: Add web Surface renderer

**Objective:** Render the first safe Surface catalog in web.

**Files:**

- Create: `apps/web/components/genui/genui-surface-renderer.tsx`
- Create: `apps/web/components/genui/surface-components.tsx`
- Modify: `apps/web/components/work/genui-surface-panel.tsx`
- Modify: `apps/web/app/globals.css`

**Step 1: Write failing tests**

If pure tests only:

- Test view-model mapping from validated Surface to renderable component descriptors.
- Test unsafe component cannot reach renderer.

**Step 2: Verify RED**

```bash
pnpm web:test
pnpm web:typecheck
```

**Step 3: Implement minimal GREEN**

Renderer rules:

- No `dangerouslySetInnerHTML`.
- No iframe for v0 Surface components.
- All links pass `isSafeHref`.
- Table rows are bounded.
- Unknown components render a blocked component, not crash.

**Step 4: Verify GREEN**

```bash
pnpm web:test
pnpm web:typecheck
pnpm web:build
```

**Step 5: Commit**

```bash
git add apps/web/components/genui apps/web/components/work/genui-surface-panel.tsx apps/web/app/globals.css apps/web/test
git commit -m "feat(web): render validated genui surfaces"
```

---

# Phase 9: Scraper/tracker demo loop

## Task 9.1: Add deterministic demo Surface fixture

**Objective:** Prove the north-star use case without requiring full autonomous scraper implementation.

**Files:**

- Modify: `services/agent-runtime/src/worker.ts` or add fixture mode in runtime.
- Modify: `services/agent-runtime/test/worker.test.ts`
- Modify: `apps/web/lib/control-api.ts` mock mode.

**Step 1: Write failing tests**

Cases:

- Objective containing “competitor pricing” creates or exposes a report artifact and Surface metadata in smoke/demo mode.
- Surface includes metrics/table/chart/markdown components.
- Surface passes server validator and web validator.

**Step 2: Verify RED**

```bash
pnpm agent-runtime:test
pnpm web:test
```

**Step 3: Implement minimal GREEN**

Demo Surface:

- Metric: total competitors tracked.
- Metric: price changes found.
- Data table: competitor, product, price, observedAt.
- Chart placeholder/data: prices over time.
- Markdown block: executive summary and next recommendations.

Do not pretend it is real scraped data unless it is. Label as demo fixture in smoke mode.

**Step 4: Verify GREEN**

```bash
pnpm agent-runtime:test
pnpm web:test
pnpm web:build
```

**Step 5: Commit**

```bash
git add services/agent-runtime/src services/agent-runtime/test apps/web/lib/control-api.ts apps/web/test
git commit -m "feat(demo): add competitor tracker surface fixture"
```

---

# Phase 10: Flutter native WorkBoard and Surface renderer

## Task 10.1: Refactor Flutter monolith safely

**Objective:** Split `main.dart` into feature folders without changing behavior.

**Files:**

- Modify: `apps/desktop_mobile/lib/main.dart`
- Create: `apps/desktop_mobile/lib/src/app/*`
- Create: `apps/desktop_mobile/lib/src/theme/*`
- Create: `apps/desktop_mobile/lib/src/shared/presentation/*`
- Move existing page widgets into `apps/desktop_mobile/lib/src/features/*`
- Modify: `apps/desktop_mobile/test/widget_test.dart`

**Step 1: Write/keep failing guard if possible**

Before refactor, add widget tests asserting current shell still renders:

- Desktop shell shows sidebar.
- Mobile shell shows bottom nav.
- Command Center is default.
- Artifacts page is reachable.

Run before refactor to ensure tests pass, then refactor. This is a characterization-test task.

**Step 2: Refactor in tiny chunks**

Move only constants/theme first, then app shell, then pages.

**Step 3: Verify after each chunk**

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
```

**Step 4: Commit**

```bash
git add apps/desktop_mobile/lib apps/desktop_mobile/test
git commit -m "refactor(flutter): split console app into feature modules"
```

## Task 10.2: Add Flutter WorkItem domain and fixture repository

**Objective:** Model the backend WorkItem shape in Flutter before UI.

**Files:**

- Create: `apps/desktop_mobile/lib/src/features/work/domain/work_item.dart`
- Create: `apps/desktop_mobile/lib/src/features/work/domain/work_board_projection.dart`
- Create: `apps/desktop_mobile/lib/src/features/work/data/work_repository.dart`
- Create: `apps/desktop_mobile/lib/src/features/work/data/fixture_work_repository.dart`
- Create tests under `apps/desktop_mobile/test/features/work/domain/*` and `data/*`.

**Step 1: Write failing tests**

Cases:

- WorkItem JSON roundtrip.
- Board projection groups by status.
- Filter shows running/approval/blocked items.
- Fixture repository returns deterministic data.

**Step 2: Verify RED**

```bash
cd apps/desktop_mobile
flutter test test/features/work/domain
```

**Step 3: Implement minimal GREEN**

Add typed Dart models with immutable copy/update helpers. Avoid new codegen dependencies.

**Step 4: Verify GREEN**

```bash
flutter test test/features/work
flutter analyze
```

**Step 5: Commit**

```bash
git add apps/desktop_mobile/lib/src/features/work apps/desktop_mobile/test/features/work
git commit -m "feat(flutter): add work item domain model"
```

## Task 10.3: Build fixture-backed WorkBoard UI

**Objective:** Native professional board/list UI using `shadcn_flutter`.

**Files:**

- Create: `apps/desktop_mobile/lib/src/features/work/presentation/work_page.dart`
- Create: `apps/desktop_mobile/lib/src/features/work/presentation/work_board/*`
- Create: `apps/desktop_mobile/lib/src/features/work/presentation/work_list/*`
- Modify app nav enum to include `work` as primary page.
- Create widget tests.

**Step 1: Write failing widget tests**

Cases:

- Desktop shows lanes and cards.
- Mobile shows status tabs and stacked cards.
- Board/list toggle works.
- Running filter works.
- Long titles truncate.

**Step 2: Verify RED**

```bash
flutter test test/features/work/presentation
```

**Step 3: Implement minimal GREEN**

UI rules:

- Use shadcn surfaces/buttons/badges where possible.
- Neutral monochrome.
- Dense spacing.
- No drag/drop first.
- Status menu/action is the required interaction.

**Step 4: Verify GREEN**

```bash
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

**Step 5: Commit**

```bash
git add apps/desktop_mobile/lib apps/desktop_mobile/test
git commit -m "feat(flutter): add fixture work board"
```

## Task 10.4: Build Flutter WorkItem detail, artifacts, and Surface renderer

**Objective:** Provide mobile/desktop review experience for one WorkItem.

**Files:**

- Create: `apps/desktop_mobile/lib/src/features/work/presentation/detail/*`
- Create: `apps/desktop_mobile/lib/src/features/artifacts/*`
- Create: `apps/desktop_mobile/lib/src/features/runs/*`
- Create: `apps/desktop_mobile/lib/src/features/surfaces/*`
- Create tests under matching `test/features/*` folders.

**Step 1: Write failing tests**

Cases:

- Detail opens from board card.
- Detail shows overview, linked runs, artifacts, surfaces, activity.
- Mobile detail uses full-screen/tabs.
- Markdown report renders.
- Surface renderer renders metric/table/markdown/artifact/run-ledger components.
- Unknown Surface component renders safe error.

**Step 2: Verify RED**

```bash
flutter test test/features/work/presentation
flutter test test/features/surfaces
```

**Step 3: Implement minimal GREEN**

Renderer catalog mirrors web/server v0:

- `metric-card`
- `status-summary`
- `data-table`
- `line-chart` placeholder
- `bar-chart` placeholder
- `markdown-block`
- `artifact-list`
- `run-ledger`
- `approval-list`

**Step 4: Verify GREEN**

```bash
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

**Step 5: Commit**

```bash
git add apps/desktop_mobile/lib apps/desktop_mobile/test
git commit -m "feat(flutter): add work detail and surface renderer"
```

## Task 10.5: Add API-backed Flutter repositories

**Objective:** Connect native app to Control API after web/backend contracts are stable.

**Files:**

- Create: `apps/desktop_mobile/lib/src/shared/data/control_api_http_client.dart`
- Create: `apps/desktop_mobile/lib/src/shared/data/auth_token_provider.dart`
- Create: `apps/desktop_mobile/lib/src/features/work/data/control_api_work_repository.dart`
- Create: repositories for runs/artifacts/surfaces.
- Create fake HTTP tests.

**Step 1: Write failing tests**

Cases:

- Work repository parses list response.
- Detail repository parses WorkItem detail.
- Run ledger repository parses event list.
- Artifact repository parses artifacts.
- API errors map to user-friendly messages.

**Step 2: Verify RED**

```bash
flutter test test/features/work/data
```

**Step 3: Implement minimal GREEN**

Use existing Amplify config/token patterns. Do not introduce new HTTP package unless necessary; use Dart HTTP primitives or existing dependencies if available.

**Step 4: Verify GREEN**

```bash
dart format lib test
flutter analyze
flutter test
```

**Step 5: Commit**

```bash
git add apps/desktop_mobile/lib apps/desktop_mobile/test
git commit -m "feat(flutter): connect work board to control api"
```

---

# Phase 11: Notifications and approvals v0

## Task 11.1: Approval records attach to WorkItems

**Objective:** Make approvals reviewable at the WorkItem level.

**Files:**

- Modify: `packages/protocol/src/events.ts`
- Modify: `services/control-api/src/ports.ts`
- Add/modify approval use cases/tests.
- Modify UI panels later.

**Step 1: Write failing tests**

Cases:

- Approval request contains `workItemId` and optional `runId`.
- Approval list by WorkItem only returns owned records.
- Approve/reject updates status and emits event.

**Step 2: Verify RED**

```bash
pnpm contracts:test
pnpm control-api:test
```

**Step 3: Implement minimal GREEN**

Add routes:

```text
GET /work-items/{workItemId}/approvals
POST /approvals/{approvalId}/approve
POST /approvals/{approvalId}/reject
```

**Step 4: Verify GREEN**

```bash
pnpm contracts:test
pnpm control-api:test
```

**Step 5: Commit**

```bash
git add packages/protocol services/control-api
git commit -m "feat(control-api): attach approvals to work items"
```

## Task 11.2: Notification event placeholders

**Objective:** Define events now, implement mobile push later.

Events:

- `work-item.ready-for-review`
- `approval.requested`
- `artifact.created`
- `surface.created`
- `run.failed`
- `run.succeeded`

For v0, show these in web/Flutter notification/inbox panels. Do not add APNs/FCM until the app loop is stable.

---

# Final validation matrix

Run the relevant subset after each task. Before claiming the full milestone complete, run:

```bash
cd /Users/sebastian/Developer/agents-cloud
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
pnpm web:test
pnpm web:typecheck
pnpm web:build
pnpm infra:build
pnpm infra:synth
pnpm amplify:hosting:build
```

When Flutter changes are included:

```bash
cd /Users/sebastian/Developer/agents-cloud/apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

Before deploy:

```bash
cd /Users/sebastian/Developer/agents-cloud
git diff --check
git status --short
pnpm infra:diff
```

After deploy:

```bash
scripts/smoke-web-http-e2e.sh
scripts/smoke-websocket-e2e.sh
```

Then browser-dogfood the live web app and verify:

- no browser console errors,
- WorkItem creation works,
- linked Run appears,
- run ledger updates live or via backfill,
- artifact cards appear,
- Surface panel blocks invalid surfaces and renders valid surfaces.

# Execution strategy with subagents

Use one implementation subagent per task. After each task:

1. Dispatch a spec-compliance reviewer with the task text.
2. Fix gaps if any.
3. Dispatch a code-quality/security reviewer.
4. Fix critical/important issues.
5. Run the task validation commands yourself.
6. Commit only the task files.

Never dispatch parallel implementation subagents for tasks touching the same files, especially:

- `packages/protocol/src/events.ts`
- `services/control-api/src/ports.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/handlers.ts`
- `apps/web/lib/control-api.ts`
- `apps/desktop_mobile/lib/main.dart`

Parallelism is safe for planning/review and for independent web/Flutter fixture tasks after backend contracts are stable.

# Non-goals for this implementation pass

Do not build these until Milestone 1 and Milestone 2 are green:

- arbitrary agent-generated React/Dart/HTML/CSS,
- full visual dashboard editor,
- full drag/drop Kanban,
- external credential-backed DataSources,
- Miro integration,
- Codex autonomous coding teams,
- mobile push notification infrastructure,
- marketplace/plugin system,
- production real-model worker mode without scoped secrets and budget policy.

# Final implementation principle

Build the product spine first. Make every future interface hang off the spine.

```text
WorkItem -> Run -> Events -> Artifacts -> DataSources -> Surfaces -> Approvals -> Notifications
```

If a feature cannot say which WorkItem owns it, it is not ready to be a product feature.
