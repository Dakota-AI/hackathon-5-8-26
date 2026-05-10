# Work Board, Flutter Kanban, and Highest-ROI Product Slice Audit

_Last updated: 2026-05-09_

## Purpose

This audit answers two product/implementation questions for Agents Cloud:

1. What is the highest-ROI thing to implement next?
2. If we want Paperclip-style Kanban/work-board UI in Flutter, what should we use, borrow, vendor, or avoid?

Research inputs:

- Existing Agents Cloud docs and implementation state.
- `docs/roadmap/PAPERCLIP_KANBAN_UI_UX_AUDIT.md`.
- `docs/roadmap/GENUI_MARKDOWN_CHAT_BROWSER_AUDIT.md`.
- Reference clone: `tools/research/paperclip`.
- Reference clone: `tools/research/hermes-paperclip-adapter`.
- Public Flutter package research for Kanban/drag board options.
- Public UX pattern research from Linear, Jira, GitHub Projects, Trello, Plane, AppFlowy, Focalboard/Mattermost Boards, and Kanboard.

Note: the request mentioned EXA-style research. This environment does not expose a named EXA tool, so the research was performed with available web search/extraction tools plus local clone/code inspection.

## Executive conclusion

The highest-ROI next implementation is not a beautiful standalone Kanban widget.

The highest-ROI next implementation is:

```text
Durable WorkItem v0
  -> Control API CRUD/status routes
  -> web Work page with real grouped board/list projection
  -> later Flutter shadcn-native WorkBoard using the same model
```

Reason: Agents Cloud already has a durable Run path, but Runs are execution attempts. Users need a durable work object above Runs: something like `WorkItem`. Kanban, inbox, approvals, run ledger, transcript, artifacts, generated UI, browser previews, comments, and status transitions should all attach to that object.

If we build a fancy Kanban board before WorkItem exists, it will be another fixture. If we build WorkItem first, every future UI surface becomes real.

## Ranked ROI options

| Rank | Slice | ROI | Why | Risk |
|---:|---|---|---|---|
| 1 | WorkItem model/API + simple real web board/list | Highest | Creates missing product object and unlocks board, inbox, approvals, artifacts, GenUI, run linkage | Requires protocol/API/CDK changes |
| 2 | First-party shadcn Flutter WorkBoard fixture backed by local sample data | High visual value, medium architecture value | Lets user feel Paperclip/Linear-style UX quickly | Fixture-only unless WorkItem API exists |
| 3 | Web board UI over existing run data | Medium | Fast visible progress on deployed web app | Wrong abstraction if based on Runs only |
| 4 | Transcript/run ledger viewer | Medium | Useful for trust/debugging | Needs richer worker transcript events to be compelling |
| 5 | Approval inbox | Medium-high after WorkItem | Great command-center UX | Needs target object/policy context |
| 6 | GenUI catalog expansion | High future upside, lower immediate ROI | Powerful but needs durable context/validation | Security/catalog complexity |
| 7 | Full Flutter Kanban drag/drop package integration | Medium | Looks good quickly | Dependency/license/style risk; not durable alone |

## Highest-ROI implementation slice

### Name

`WorkItem v0: durable work layer and real board projection`

### Scope

Add one durable work object above Runs.

Minimal v0 fields:

```ts
WorkItem {
  workspaceId: string;
  workItemId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  rank: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  parentWorkItemId?: string;
  labels?: string[];
  linkedRunIds?: string[];
  activeRunId?: string;
  artifactCount?: number;
  approvalCount?: number;
  commentCount?: number;
  blockedBy?: string[];
  createdAt: string;
  updatedAt: string;
}
```

Minimal API:

```text
POST   /work-items
GET    /work-items
GET    /work-items/{workItemId}
PATCH  /work-items/{workItemId}
POST   /work-items/{workItemId}/status
```

Minimal event family:

```text
work_item.created
work_item.updated
work_item.status_changed
```

Minimal UI:

```text
Work page
  -> Board/List toggle
  -> columns grouped by status
  -> compact WorkItem card
  -> create work item
  -> status dropdown/actions, no drag/drop first
  -> filters: Mine, Running, Failed, Waiting approval, Blocked, Stale
```

### Why this beats building Kanban first

A Kanban package solves interaction mechanics. It does not solve product semantics.

Agents Cloud needs:

- durable work identity,
- workflow state,
- execution/liveness state,
- approvals,
- artifact pointers,
- run linkage,
- comments/activity,
- tenant/workspace authorization,
- backend validation of transitions,
- replayable event history.

A board is only a projection over that state.

## Flutter Kanban package audit

### Recommendation summary

Do not adopt a complete Kanban package as the long-term core UI.

Build a first-party `WorkBoard` in Flutter using `shadcn_flutter`, Riverpod, and a small internal board/reorder domain. Borrow interaction/API ideas from the best packages. If we need a quick spike, prototype with `voo_kanban`; if we need a low-level drag substrate, evaluate `drag_and_drop_lists`; if we want code to vendor/rip, prefer MIT/BSD sources such as `kanban_board` or `drag_and_drop_lists` over MPL/GPL sources.

### Package matrix

| Rank | Package | License | Strengths | Weaknesses | Recommendation |
|---:|---|---|---|---|---|
| 1 | `voo_kanban` | MIT | Best feature set on paper: generic cards, swimlanes, WIP limits, keyboard navigation, undo/redo, selection, serialization, mobile tab layout | New/immature, Material 3 oriented, low adoption | Best UX/API reference and spike candidate; do not blindly depend for production |
| 2 | `drag_and_drop_lists` | BSD-3-Clause | Mature two-level drag/reorder, horizontal/vertical, slivers, handles/long/short press, expandable lists, strong adoption | Not Kanban-specific; no WIP/swimlanes/product semantics | Best low-level drag substrate/reference if custom-building |
| 3 | `kanban_board` | MIT | Kanban-specific groups/items/controller, movement callbacks, auto-scroll config, simple to inspect/vendor | Smaller maintainer footprint, no swimlanes/WIP, likely needs heavy restyling | Best MIT Kanban mechanics source to borrow/rip from |
| 4 | `appflowy_board` | MPL-2.0 / AGPL-3.0 | Known AppFlowy-origin board, controller/builders, group/item moves, decent reference | License complexity, no WIP/swimlanes, package owns some visual/interaction assumptions | Good reference; avoid vendoring/modifying unless legal accepts MPL obligations |
| 5 | `aatex_board` | MPL-2.0 / AGPL-3.0 inherited | AppFlowy fork with auto-scroll, phantom items, active/highlight states, cross-column animation | Tiny adoption, same license complexity | Strong interaction reference only |
| 6 | `flutter_boardview` | MIT | Simple Trello/Jira-style BoardView/List/Item, drag columns/cards | Low adoption, basic UX, no modern workflow features | Avoid for production; historical reference only |
| 7 | `boardview_flutter` | MIT | Similar simple board/list/item API | Very low adoption, confusing package docs/naming | Avoid |
| 8 | `clean_kanban` | GPL-3.0 | WIP limits, storage, dialogs, responsive claims | GPL-3.0 is disqualifying for this product, Material/opinionated architecture | Avoid; do not copy code |
| 9 | `super_drag_and_drop` | MIT | Excellent native cross-app drag/drop, active package | Not a Kanban board, Rust/NDK/native build complexity | Future enhancement for dropping files/URLs onto cards, not core board |

### Practical package decision

Use this sequence:

1. Spike `voo_kanban` in a throwaway branch or local experiment to observe best interactions.
2. Inspect `kanban_board` and `drag_and_drop_lists` source for mechanics that can be reimplemented cleanly.
3. Build a first-party `WorkBoard` using shadcn components.
4. Do not use GPL code.
5. Do not copy AppFlowy/AATex files unless we are comfortable with MPL file-level obligations.
6. Keep `super_drag_and_drop` for later native file/URL drops, not internal board reordering.

## Why first-party shadcn WorkBoard is the right long-term choice

Agents Cloud's board is not a generic Kanban board. It is an autonomous-work control surface.

The board needs first-class concepts most Flutter packages do not model:

- workflow status,
- rank/order,
- execution state,
- liveness state,
- approval state,
- active run,
- linked artifacts,
- cost/budget hints,
- policy gates,
- agent/team ownership,
- provider/model metadata,
- workspace/tenant-safe actions,
- run retry/cancel/resume commands,
- transition side-effect preview,
- realtime event repair.

A custom board lets us keep:

- shadcn visual consistency,
- dense CFO/CEO-grade layout,
- neutral/professional styling,
- mobile-specific UX,
- keyboard accessibility,
- safe backend transition model,
- future native drag/drop without lock-in.

## Proposed Flutter architecture

Target structure:

```text
apps/desktop_mobile/lib/features/work_board/
  domain/
    work_item.dart
    work_board_models.dart
    work_board_filter.dart
    work_board_reorder.dart
    workflow_registry.dart
  data/
    work_item_fixture_repository.dart
    work_item_api_client.dart      # later
  presentation/
    work_board_page.dart
    work_board_view.dart
    work_board_lane.dart
    work_board_card.dart
    work_board_swimlane.dart
    work_board_toolbar.dart
    work_board_filter_sheet.dart
    work_item_detail_sheet.dart
    work_board_empty_state.dart
    work_board_keyboard_shortcuts.dart
```

Public widget shape:

```dart
class WorkBoard<T> extends ConsumerWidget {
  const WorkBoard({
    required this.lanes,
    required this.cardBuilder,
    required this.onMove,
    this.swimlanes = const [],
    this.config = const WorkBoardConfig(),
  });

  final List<WorkLane<T>> lanes;
  final List<WorkSwimlane<T>> swimlanes;
  final WorkBoardConfig config;
  final WorkCardBuilder<T> cardBuilder;
  final ValueChanged<WorkBoardMove<T>> onMove;
}
```

Core model:

```dart
class WorkLane<T> {
  final String id;
  final String title;
  final List<WorkCard<T>> cards;
  final int? wipLimit;
  final bool canReceiveCards;
}

class WorkCard<T> {
  final String id;
  final String laneId;
  final String? swimlaneId;
  final int index;
  final T data;
}

class WorkBoardMove<T> {
  final String cardId;
  final String fromLaneId;
  final String toLaneId;
  final int fromIndex;
  final int toIndex;
  final String? fromSwimlaneId;
  final String? toSwimlaneId;
}
```

First-party board features, in order:

1. Board grouped by workflow status.
2. Compact shadcn WorkItem cards.
3. Status action menu; no drag required for v0.
4. Drag within/across lanes.
5. WIP indicators and invalid drop state.
6. Mobile lane tabs instead of forced horizontal scroll.
7. Swimlanes by agent/project/priority/runtime state.
8. Keyboard navigation and context-menu move actions.
9. Saved views and filters.
10. Native file/URL drop onto WorkItem cards later.

## Best external UI/UX patterns to borrow

### Paperclip

Borrow:

- Work item is the durable object.
- Board/list/detail are projections.
- Runs attach to work items.
- Run ledger and transcript live in detail view.
- Inbox is for human attention: approvals, failures, stale work, completed artifacts.
- Separate workflow status from execution/liveness state.

Improve:

- Make workflows configurable through a registry, not hardcoded columns.
- Persist rank/order in columns.
- Add WIP limits and swimlanes.
- Add keyboard/context-menu alternatives to drag/drop.
- Build mobile-first status tabs.

### Linear

Borrow:

- Fast issue/work-item list as the primary power-user surface.
- Board/list toggle over the same data.
- Saved views.
- Keyboard shortcuts.
- Low-chrome, dense cards.
- Triage/inbox separation.

Avoid:

- Over-optimizing for software-engineering issue semantics only. Agents Cloud is broader autonomous work.

### GitHub Projects

Borrow:

- Board/table views over custom fields.
- Group by and slice by as separate concepts.
- Field visibility per view.
- Saved project views.

Avoid:

- Making too much feel like a spreadsheet first. Agents Cloud should feel operational and agent-native.

### Jira

Borrow:

- Workflow statuses mapped to board columns.
- Quick filters.
- Swimlanes by assignee/epic/project/query.
- WIP/bottleneck operational review.

Avoid:

- Admin/configuration sprawl in v1.
- Heavy, slow enterprise feel.

### Trello

Borrow:

- Simple mental model for board/cards.
- Micro-badges for comments, attachments, checklists, due dates.
- Easy filtering.
- Mobile card ergonomics.

Avoid:

- Decorative card covers and playful styling as default.
- Board-only product model.

### Plane / AppFlowy / Focalboard

Borrow:

- Multiple projections: list, board, table, calendar/timeline.
- Property toggles and display density.
- Open-source inspectable implementations for details/panels/forms.

Avoid:

- Copying generic project-management UI without agent/run semantics.

### Kanboard

Borrow:

- WIP limits.
- Collapsible swimlanes.
- Compact mode.
- Automation rules triggered by board events.

Avoid:

- Old-school visual density and dated look.

## Agents Cloud board/card UX specification

### Desktop board

Top toolbar:

```text
[Work] [Board/List/Table/Tree] [Filter] [Group by: Status] [Slice by: Agent] [Display] [Save view] [New work item]
```

Quick filters:

```text
Mine | Running | Failed | Waiting approval | Blocked | Stale | Has artifacts | Budget risk
```

Columns:

```text
Backlog | Todo | In progress | In review | Blocked | Done | Cancelled
```

Each column header:

- title,
- item count,
- WIP limit indicator if configured,
- sum/count metadata later,
- collapse action,
- column action menu.

### Card anatomy

```text
AC-123                         High ▲
Build preview deploy registry
Parent: Launch generated website support

Running · claude-sonnet · 7m        Agent: Builder
2 artifacts · 1 approval · $0.42    Needs next step
```

Visual style:

- shadcn `Card` surface,
- neutral border,
- tight 8-12px spacing,
- title max 2 lines,
- semantic color only for action-critical states,
- `OutlineBadge` for runtime/status/approval/artifacts,
- no loud label rainbow.

Runtime/liveness chip states:

```text
Queued
Starting
Running
Waiting approval
Blocked
Failed
Timed out
Cancelling
Cancelled
Stale
Completed
Needs next step
```

### Mobile board

Do not squeeze the full desktop board onto phone.

Phone layout:

```text
Top app bar: Work / filters / new
Segmented status tabs: Todo | Running | Review | Blocked | Done
Vertical cards inside active status
Bottom sheet for filters/display/grouping
Full-screen work item detail route
Sticky approval/retry/action bar in detail
```

Tablet layout:

- horizontal board allowed,
- detail opens as side sheet,
- filters can be side panel.

## Backend/API implications

The UI decision requires the backend to avoid run-only thinking.

Needed entities:

```text
WorkItemsTable
WorkItemEvents or generalized EventsTable support
WorkItemComments later
WorkItemRelations later
SavedViews later
```

Initial DynamoDB shape:

```text
PK: workspaceId
SK: workItemId
GSI1: ownerUserId / updatedAt
GSI2 later: workspaceId#status / rank
```

Status transition validation should happen server-side. Drag/drop must call the same transition endpoint as menu moves.

Rank/order must be persisted, not inferred from client array order only.

## Implementation plan

### Phase 0: optional board package spike, half day

Goal: learn, not ship.

- Try `voo_kanban` locally in a throwaway route/branch.
- Inspect `kanban_board` and `drag_and_drop_lists` source.
- Confirm touch, mouse, desktop scroll, keyboard, and mobile behavior.
- Do not commit dependency unless it survives source/license/build audit.

### Phase 1: WorkItem protocol/API, 2-4 days

- Add protocol WorkItem types and workflow registry.
- Add WorkItemsTable to CDK.
- Add Control API routes.
- Add tests for auth, validation, status transition, cross-user denial.
- Do not require drag/drop yet.

Validation:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
```

### Phase 2: web real Work page, 1-2 days

- Add Work page to `apps/web`.
- Add real API-backed create/list/status update.
- Render grouped columns and list toggle.
- Add quick filters.
- Keep status movement as dropdown/action menu first.

Validation:

```bash
pnpm web:typecheck
pnpm web:build
pnpm amplify:hosting:build
```

### Phase 3: Flutter shadcn WorkBoard fixture/API-ready, 2-5 days

- Refactor away from monolithic `main.dart` for work-board components.
- Add `features/work_board` directory.
- Implement fixture WorkBoard with shadcn cards and mobile status tabs.
- Add widget tests for desktop board and mobile list.
- Wire to API once WorkItem endpoints are stable.

Validation:

```bash
cd apps/desktop_mobile
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

### Phase 4: drag/drop + rank, 2-4 days

- Add internal drag/reorder mechanics.
- Persist rank/status through backend.
- Add optimistic update + rollback.
- Add keyboard/context-menu move alternative.
- Add WIP invalid drop state.

### Phase 5: product-grade operations, 1-2 weeks

- Inbox.
- Work item detail with run ledger/transcript/artifacts/approvals.
- Saved views.
- Swimlanes.
- Realtime fanout/backfill for board events.
- Native file/URL drops later with `super_drag_and_drop` if needed.

## What not to do next

Do not:

- build a full Trello clone before WorkItem exists,
- adopt `clean_kanban` because of GPL-3.0,
- copy AppFlowy/AATex source without license review,
- ship mobile as horizontal-scroll-only Kanban,
- make Runs the board cards,
- let clients mutate workflow status without server validation,
- claim fixture Kanban as product-complete,
- overload chat as the root of the app.

## Final recommendation

Build WorkItem v0 first. Then build the board as a projection.

For Flutter, do not depend on a full Kanban package long-term. Build a first-party shadcn-native `WorkBoard`, using:

- `voo_kanban` as feature/API inspiration,
- `drag_and_drop_lists` as low-level reorder inspiration or possible dependency,
- `kanban_board` as MIT mechanics reference,
- Paperclip for product semantics,
- Linear/GitHub Projects/Jira/Trello/Plane/Kanboard for UX patterns.

That is the highest ROI path because it converts Agents Cloud from “can run agents” into “can manage autonomous work.”
