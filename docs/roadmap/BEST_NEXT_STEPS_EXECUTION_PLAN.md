# Best Next Steps Execution Plan

_Last updated: 2026-05-10_

## Purpose

This document turns the current product vision, infrastructure state, web
frontend state, realtime work, WorkBoard research, and GenUI direction into a
single prioritized execution plan.

Read this after:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/roadmap/PROJECT_STATUS.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/roadmap/WORK_BOARD_FLUTTER_KANBAN_ROI_AUDIT.md`
5. `docs/roadmap/AGENT_CREATED_INTERFACES_GENUI_PRODUCT_VISION.md`

## Executive recommendation

The best next step is not a prettier dashboard, not full drag-and-drop Kanban,
not arbitrary GenUI, and not advanced autonomous agents yet.

The best next step is:

```text
WorkItem v0 + real web Work page + run linkage + artifact linkage
```

This should be followed immediately by:

```text
DataSourceRef v0 + Surface v0 + first validated dashboard/report fixture
```

The reason is simple: Agents Cloud already has a durable Run path and a first
live web loop, but the product still lacks the durable business object the user
actually delegates, reviews, and manages.

Runs are execution attempts. WorkItems are the user's work.

Every major future feature becomes cleaner once WorkItem exists:

- Kanban board
- inbox
- approvals
- generated dashboards
- reports
- PDF artifacts
- website/app previews
- mobile notifications
- run ledgers
- comments/activity
- agent/team ownership
- recurring work
- audit trail

Building any of those directly on top of Runs will create the wrong product
model and will need to be rewritten.

## Current product reality

Agents Cloud currently has meaningful foundations:

- deployed AWS CDK foundation,
- deployed Step Functions to ECS worker path,
- deployed Control API run creation/querying,
- deployed AWS-native realtime WebSocket slice,
- web command panel with live run loop and event ledger,
- Flutter desktop/mobile command-center shell,
- schema/protocol package,
- first artifact/report event path,
- reference audits for GenUI, Paperclip/Hermes/Kanban, Flutter Kanban packages,
  and agent-created interfaces.

But the current product is still run-centric. The next product layer must make
it work-centric.

## Product thesis

Agents Cloud should feel like an AI-native operating system for delegated work.

The CEO/user should be able to say:

```text
Track competitor pricing weekly and notify me when something changes.
```

The platform should create and maintain:

- a durable WorkItem,
- one or more Runs under that WorkItem,
- structured status and progress events,
- dataset artifacts,
- report artifacts,
- a dashboard Surface,
- approval requests when needed,
- notification handoff to mobile,
- a reopenable workspace in web/desktop/mobile.

That is the product shape to build toward.

## Highest-ROI implementation sequence

### Slice 1: WorkItem v0

Goal: create the durable work object above Runs.

Minimum fields:

```ts
type WorkItem = {
  workspaceId: string;
  workItemId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  rank: string;
  activeRunId?: string;
  linkedRunIds: string[];
  artifactCount: number;
  approvalCount: number;
  surfaceCount: number;
  createdAt: string;
  updatedAt: string;
};
```

Minimum API:

```text
POST   /work-items
GET    /work-items
GET    /work-items/{workItemId}
PATCH  /work-items/{workItemId}
POST   /work-items/{workItemId}/status
POST   /work-items/{workItemId}/runs
GET    /work-items/{workItemId}/runs
GET    /work-items/{workItemId}/events
```

Minimum events:

```text
work_item.created
work_item.updated
work_item.status_changed
work_item.run_linked
work_item.artifact_linked
```

Implementation notes:

- Add the protocol contracts first.
- Add tests before handlers.
- Add DynamoDB access patterns before UI.
- Keep workspace/user authorization explicit, even if v0 uses the current
  workspace assumptions.
- Link new run creation to an optional `workItemId` so a WorkItem can own a Run.

Likely files:

- `packages/protocol/src/events.ts`
- `packages/protocol/schemas/events/work-item.schema.json`
- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/stacks/control-api-stack.ts`
- `services/control-api/src/handlers.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/ports.ts`
- `services/control-api/test/work-items.test.ts`
- `apps/web/lib/control-api.ts`

Validation:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
```

### Slice 2: Real web Work page

Goal: make the deployed web app show real work, not just a command panel.

Minimum UX:

```text
/work
  -> board/list toggle
  -> status columns
  -> compact WorkItem cards
  -> create WorkItem
  -> open WorkItem detail

/work/[workItemId]
  -> overview
  -> status/priority/owner
  -> linked runs
  -> run ledger
  -> artifact cards
  -> placeholder surfaces section
  -> activity/events
```

Do not start with drag/drop. Use explicit status actions first. Drag/drop should
come after rank/status persistence is correct.

Likely files:

- `apps/web/app/work/page.tsx`
- `apps/web/app/work/[workItemId]/page.tsx`
- `apps/web/components/work-board.tsx`
- `apps/web/components/work-item-card.tsx`
- `apps/web/components/work-item-detail.tsx`
- `apps/web/lib/control-api.ts`
- `apps/web/test/*`

Validation:

```bash
pnpm web:typecheck
pnpm web:build
```

### Slice 3: Run creation from a WorkItem

Goal: connect delegation to execution.

The web command flow should allow:

```text
Create WorkItem from objective
  -> start Run under WorkItem
  -> show live Run events inside WorkItem detail
  -> show terminal status and artifact cards
```

This is the first real product loop:

```text
Objective -> WorkItem -> Run -> Events -> Artifact -> Review
```

Do not add advanced agent planning here. Keep the worker path smoke/Hermes-shaped
until the product loop is reliable.

Validation:

```bash
pnpm control-api:test
pnpm web:typecheck
pnpm web:build
scripts/smoke-web-http-e2e.sh
scripts/smoke-websocket-e2e.sh
```

### Slice 4: Artifact listing/download APIs

Goal: make artifacts first-class work product.

Minimum API:

```text
GET /work-items/{workItemId}/artifacts
GET /runs/{runId}/artifacts
GET /artifacts/{artifactId}/download-url
```

Minimum UI:

- artifact cards on WorkItem detail,
- report preview for Markdown artifacts,
- download/open action,
- safe filename/kind/created-at metadata.

This turns the current smoke report into a visible product object.

### Slice 5: DataSourceRef v0

Goal: let agents create datasets that dashboards and reports can safely use.

DataSources should be references, not arbitrary exposed queries.

Allowed v0 source kinds:

```text
inlineData
artifactRef
runEventRef
controlApiQueryRef
```

Defer arbitrary SQL, external credentials, and broad S3 access.

Minimum object:

```ts
type DataSourceRef = {
  dataSourceId: string;
  workspaceId: string;
  workItemId: string;
  kind: 'inlineData' | 'artifactRef' | 'runEventRef' | 'controlApiQueryRef';
  schema?: unknown;
  previewRows?: unknown[];
  createdAt: string;
};
```

### Slice 6: Surface v0 and GenUI validator

Goal: save validated generated interfaces.

A Surface is a durable UI object attached to a WorkItem.

Minimum surface kinds:

```text
dashboard
report
tool
artifact_review
```

Minimum component catalog:

- `metricCard`
- `statusSummary`
- `dataTable`
- `lineChart`
- `barChart`
- `markdownBlock`
- `artifactList`
- `runLedger`
- `approvalList`

Rules:

- Agent emits declarative JSON only.
- Server validates catalog IDs, props, data bindings, size limits, and auth.
- Web and Flutter render known components.
- No arbitrary React, Dart, JavaScript, CSS, iframe, or raw HTML.

Likely files:

- `packages/protocol/schemas/genui/surface.schema.json`
- `packages/protocol/schemas/genui/components/*.schema.json`
- `services/control-api/src/genui/catalog.ts`
- `services/control-api/src/genui/validator.ts`
- `services/control-api/src/surfaces.ts`
- `services/control-api/test/surfaces.test.ts`
- `apps/web/components/genui/*`

### Slice 7: First scraper/tracker demo surface

Goal: prove the north-star use case end to end.

Create a demo path that produces:

- WorkItem: “Track competitor pricing”
- Run events
- dataset artifact
- Markdown report artifact
- dashboard Surface with metrics/table/chart
- artifact cards
- next-action suggestions

This should be the product demo because it demonstrates why agent-created
interfaces matter.

### Slice 8: Flutter WorkBoard and Surface renderer

Goal: make native app useful after the web product loop exists.

Flutter should render the same WorkItem and Surface concepts using
`shadcn_flutter`.

Order:

1. fixture-backed WorkBoard using final WorkItem shape,
2. API-backed WorkBoard,
3. WorkItem detail with run ledger and artifacts,
4. Surface renderer for the v0 catalog,
5. mobile-first notification/review handoff.

Do not use a full Kanban package as the product core. A first-party shadcn-native
board is better long term. Use Kanban packages only as implementation references
or low-level drag substrates.

Validation:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

### Slice 9: Notifications and approvals

Goal: make the system usable when the user walks away.

Detailed architecture and implementation backlog:

- `docs/adr/0009-proactive-communication-plane.md`
- `docs/roadmap/PROACTIVE_COMMUNICATION_ARCHITECTURE_AUDIT_2026_05_10.md`
- `docs/roadmap/COMMUNICATION_EVENT_CONTRACTS_2026_05_10.md`
- `docs/roadmap/VOICE_CALL_AUDIO_MESSAGE_ARCHITECTURE_2026_05_10.md`
- `docs/roadmap/PROACTIVE_COMMUNICATION_REMAINING_WORK_2026_05_10.md`

Minimum notification events:

```text
work_item.ready_for_review
approval.requested
artifact.created
surface.created
run.failed
run.succeeded
```

Minimum approval model:

- approve publish/send/spend/deploy actions,
- reject with reason,
- require human approval for risky operations,
- attach approvals to WorkItem and Run.

### Slice 10: Production worker/provider hardening

Goal: move beyond smoke/Hermes report worker safely.

Do this after the product loop can show results.

Needs:

- scoped provider secrets,
- workspace policy,
- egress and credential boundaries,
- per-run budget/cost metadata,
- retry/idempotency rules,
- artifact upload contracts,
- transcript/event contracts,
- cancellation and timeout semantics.

## What not to build next

Do not prioritize these before WorkItem v0:

- full arbitrary GenUI builder,
- visual dashboard editor,
- full Kanban drag/drop with swimlanes,
- Miro integration,
- Codex/GitHub autonomous coding teams,
- advanced specialist-agent marketplace,
- broad plugin system,
- arbitrary browser automation UI,
- polished marketing website refresh.

These are valuable later, but they need the work object, event ledger, artifact
model, and authorization boundary first.

## UX principles to preserve

The user wants a professional CEO/CFO-grade system, not toy chatbot behavior.

The UI should therefore be:

- dense but not cluttered,
- monochrome/neutral by default,
- status-rich without noisy debug clutter,
- artifact-first,
- explicit about next actions,
- calm about long-running work,
- clear when human approval is needed,
- consistent across web, desktop, and mobile.

For GenUI:

- hide raw JSON from normal users,
- expose plain-language controls,
- keep generated interfaces modular and reusable,
- allow advanced inspector/debug views only behind developer affordances,
- always bind components to safe data references.

## Architecture rules to keep enforcing

- AWS remains durable truth.
- DynamoDB owns WorkItem, Run, Event, Artifact, Approval, DataSource, and Surface
  records.
- S3 owns large artifacts and generated reports/datasets.
- Step Functions/ECS own execution.
- Realtime is fanout/replay convenience, not durable truth.
- Clients render server-authorized state.
- Agents propose surfaces; servers validate surfaces; clients render validated
  surfaces.
- No user/workspace data crosses tenant boundaries.
- Secrets never reach clients or arbitrary generated UI.

## Suggested immediate milestone

Milestone name:

```text
MVP Work Operating Loop
```

Definition of done:

1. User signs in on web.
2. User creates a WorkItem from an objective.
3. User starts a Run under that WorkItem.
4. Web receives live events over WebSocket and repairs gaps over HTTP.
5. Worker writes a report artifact.
6. WorkItem detail shows run ledger and artifact card.
7. Work page shows WorkItem grouped by status.
8. Tests cover contracts, Control API, web ledger/model behavior, and authz
   assumptions.
9. Docs/status are updated with exact validation evidence.

This milestone is small enough to build, but large enough to make the product
feel real.

## Suggested second milestone

Milestone name:

```text
Validated GenUI Surface Loop
```

Definition of done:

1. Worker or Control API can create a DataSourceRef.
2. Worker or Control API can create a Surface attached to a WorkItem.
3. Surface JSON is validated by catalog/schema/policy.
4. Web renders metric/table/chart/markdown/artifact components.
5. WorkItem detail shows the Surface.
6. Tests reject invalid components, unsafe URLs, oversized inline data,
   cross-workspace DataSourceRefs, and unsupported actions.

This milestone proves the agent-created interface direction without opening the
door to arbitrary generated frontend code.

## Suggested third milestone

Milestone name:

```text
Native Review Loop
```

Definition of done:

1. Flutter shows WorkItems from the API.
2. Flutter opens WorkItem detail.
3. Flutter renders run ledger and artifacts.
4. Flutter renders the v0 Surface catalog natively.
5. User can approve/reject a pending approval from mobile.
6. Mobile layout is dense, professional, and shadcn-native.

## Final answer

Build the missing product spine first:

```text
WorkItem -> Run -> Events -> Artifacts -> DataSources -> Surfaces -> Approvals -> Notifications
```

Then build the board, dashboards, reports, mobile review, and agent-created tools
on top of that spine.

That sequence is the best path to a product that feels like a real AI operating
system for delegated work instead of another chat interface.
