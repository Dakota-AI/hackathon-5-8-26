# Paperclip and Hermes Adapter UI/UX Audit for Agents Cloud

_Last updated: 2026-05-09_

## Purpose

This audit investigates two reference codebases for Agents Cloud product direction:

- `tools/research/paperclip` cloned from `https://github.com/paperclipai/paperclip`
- `tools/research/hermes-paperclip-adapter` cloned from `https://github.com/mattsegura/hermes-paperclip-adapter`

The goal is not to copy the product blindly. The goal is to extract best-in-class control-plane UX patterns for autonomous AI work: Kanban, issue/work item detail, run ledgers, transcripts, approvals, agent org charts, command palettes, onboarding, plugin surfaces, Hermes runtime configuration, and safe autonomy controls.

Agents Cloud should remain aligned with its own architecture:

- AWS is the durable source of truth.
- DynamoDB/S3/Step Functions/ECS own execution truth.
- Cloudflare is realtime fanout/sync only.
- Clients render canonical events and server-validated GenUI/A2UI surfaces.
- Tenant/workspace authorization must be enforced before product data is exposed.
- Flutter desktop/mobile uses `shadcn_flutter` as the primary UI system.

## Executive summary

Paperclip's strongest product insight is that an autonomous agent platform should not be primarily a chatbot. It should feel like an operating system for AI-run work.

The core object is a durable work item/issue:

- it has status, priority, owner, assignee, hierarchy, blockers, documents, comments, attachments, artifacts, approvals, and activity;
- it has one or more execution runs;
- each run has structured transcript events, costs, duration, model/provider/runtime metadata, outputs, and failure states;
- the board/Kanban view is only one projection over those work items;
- the inbox/command center is the daily operational surface for failures, approvals, assignments, completions, and stale work;
- chat is useful, but it belongs inside durable work objects and run contexts.

For Agents Cloud, the right product direction is:

1. Add a durable Work Item layer above Runs.
2. Build Board/List/Detail views over Work Items.
3. Treat Runs as execution attempts linked to Work Items.
4. Treat GenUI/artifacts as generated work products, not free-floating chat decorations.
5. Treat approvals, execution locks, policy, budget, and liveness as first-class UI states.
6. Use Paperclip's UX ideas, but implement them through Agents Cloud's AWS-backed event ledger and tenant-safe runtime model.

## Reference repository findings

### Paperclip product model

Paperclip describes itself as a control plane for autonomous AI companies. Its main abstractions are:

- Company
- Goal hierarchy
- Agents/employees
- Org structure
- Issues/tasks
- Comments/documents/attachments/work products
- Heartbeat runs
- Budgets and cost rollups
- Approvals
- Activity log
- Plugin/adapter system

Relevant files inspected:

- `doc/GOAL.md`
- `doc/PRODUCT.md`
- `doc/SPEC-implementation.md`
- `doc/execution-semantics.md`
- `ui/src/pages/Dashboard.tsx`
- `ui/src/pages/Issues.tsx`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/Inbox.tsx`
- `ui/src/pages/Search.tsx`
- `ui/src/pages/OrgChart.tsx`
- `ui/src/pages/Approvals.tsx`
- `ui/src/pages/PluginManager.tsx`
- `ui/src/components/KanbanBoard.tsx`
- `ui/src/components/IssuesList.tsx`
- `ui/src/components/IssueRow.tsx`
- `ui/src/components/IssueChatThread.tsx`
- `ui/src/components/IssueRunLedger.tsx`
- `ui/src/components/transcript/RunTranscriptView.tsx`
- `ui/src/components/CommandPalette.tsx`
- `ui/src/components/OnboardingWizard.tsx`
- `ui/src/components/ActiveAgentsPanel.tsx`
- `ui/src/plugins/slots.tsx`

### Hermes Paperclip adapter model

The Hermes adapter is a local process bridge:

- adapter type: `hermes_local`
- launches `hermes chat -q "..."`
- uses quiet mode `-Q`
- supports `--resume`, `--source`, `--worktree`, `--checkpoints`, `--max-turns`, `--provider`, `--model`, and `-t` toolsets
- parses stdout into transcript-like entries
- reads local Hermes config/skills from `~/.hermes`
- injects Paperclip runtime API details into the wake prompt
- tells Hermes to use `curl` against Paperclip APIs
- always adds `--yolo` because unattended agents cannot answer TTY prompts

Relevant files inspected:

- `README.md`
- `AGENTS.md`
- `package.json`
- `src/index.ts`
- `src/shared/constants.ts`
- `src/server/execute.ts`
- `src/server/detect-model.ts`
- `src/server/skills.ts`
- `src/server/test.ts`
- `src/ui/build-config.ts`
- `src/ui/parse-stdout.ts`

Important conclusion: the adapter is valuable UX/reference material, but Agents Cloud should not copy its local-host assumptions into cloud production. Agents Cloud should expose Hermes/Pi/Codex-style runtimes as isolated workers with typed audited platform tools, scoped credentials, explicit provider/model config, and cloud approvals instead of prompt-driven `curl` with broad API tokens.

## Kanban / issue board UX audit

### What Paperclip does well

Paperclip's Kanban board is intentionally compact and workflow-oriented:

- columns are workflow statuses:
  - Backlog
  - Todo
  - In progress
  - In review
  - Blocked
  - Done
  - Cancelled
- cards show:
  - issue identifier
  - status/liveness indicators
  - title, clamped to two lines
  - priority icon
  - assignee identity
  - live execution dot
  - "Needs next step" warning chip when a successful run needs follow-up
- empty columns collapse to narrow rails
- active columns have fixed width
- drag/drop changes status
- board is one mode inside a richer IssuesList that also supports list/tree-like dense views
- view state persists locally:
  - filters
  - sort
  - groupBy
  - viewMode
  - nestingEnabled
  - collapsed groups
  - collapsed parents
  - visible columns
- filters support status, priority, assignee, creator, labels, project, workspace, live-only, and routine visibility
- live run state is separate from issue workflow state

This separation is critical:

- workflow status answers: where is the work in the process?
- execution status answers: is an agent currently running/queued/waiting/stale/failed?
- liveness status answers: does the system know what moves this forward next?

Agents Cloud should copy that distinction.

### Kanban gaps to improve on

Paperclip's board is useful but not yet best-in-class in every dimension. Agents Cloud can improve it.

Gaps:

1. Statuses are hardcoded in `KanbanBoard.tsx` instead of generated from one canonical workflow registry.
2. Drag/drop changes status but does not persist true rank/order inside columns.
3. No WIP limits are shown.
4. No swimlanes by agent/team/project/priority/parent objective.
5. Board cards do not show enough audit hints, such as time in status, last actor, last run result, or blocker chain.
6. Drag/drop accessibility appears incomplete; keyboard/context-menu alternatives are required.
7. Mobile behavior relies heavily on horizontal overflow; Agents Cloud should use status tabs or grouped vertical lists on phone.
8. Board query scale is limited; large autonomous systems need paginated/virtualized columns.
9. Status transitions are not rich commands with all side-effect previews.
10. Live dot is binary; Agents Cloud needs richer states like queued, starting, running, waiting for approval, stale, retrying, failed, timed out, cancelling.

### Agents Cloud board principles

The board should be a flow view, not the whole app.

Agents Cloud should offer:

- Board view for bottlenecks and flow.
- List/table view for triage, sorting, filters, and audit density.
- Tree view for plans/subtasks.
- Detail view for chat, transcript, artifacts, approvals, and decisions.
- Inbox/Command Center for pending human attention.

The board card should answer at a glance:

- What is this?
- Who owns it?
- What status is it in?
- Is an agent actively doing something?
- What is the next action path?
- Is it blocked, stale, failed, waiting for approval, or done?
- Is there an output/artifact/preview to inspect?

## Recommended Agents Cloud work model

Agents Cloud currently has a durable Run path. The missing layer is a durable Work Item model above Runs.

Recommended model:

- Workspace has many WorkItems.
- WorkItem has many Runs.
- Run may be linked to one primary WorkItem.
- WorkItem has comments, activity, assignee, status, priority, order, parent/subitems, blockers, approvals, and artifacts.
- Kanban is a projection over WorkItems grouped by status.
- Run ledger is a projection over Runs linked to a WorkItem.
- GenUI/artifacts are outputs attached to WorkItems/Runs.

Suggested user-facing term: Work Items.

Backend entity can be `WorkItem`. Avoid overloading `Task`, because Agents Cloud already uses runtime tasks in the run/execution path.

### WorkItem fields

Minimum fields:

- `workItemId`
- `workspaceId`
- `projectId?`
- `parentId?`
- `title`
- `descriptionMarkdown?`
- `status`: `backlog | todo | in_progress | in_review | done | blocked | cancelled`
- `priority`: `critical | high | medium | low`
- `assigneeAgentId?`
- `assigneeUserId?`
- `createdByUserId?`
- `createdByAgentId?`
- `identifier`, e.g. `AC-42`
- `rank` or order key for board sorting
- `executionRunId?`
- `executionLockedAt?`
- `executionAgentId?`
- `startedAt?`
- `completedAt?`
- `cancelledAt?`
- `createdAt`
- `updatedAt`

Later fields:

- `goalId?`
- `blockedByWorkItemIds`
- `labels`
- `workspaceEnvironmentId?`
- `artifactRefs`
- `approvalRefs`
- `budgetPolicyRef?`
- `executionPolicy`
- `visibilityPolicy`
- `lastActivityAt`
- `lastRunStatus`
- `timeInStatus`

### Canonical workflow registry

Do not scatter status arrays across clients.

Define one canonical workflow registry with:

- id
- label
- description
- order
- icon
- neutral/status color token
- terminal flag
- counts as active WIP?
- allowed transitions
- required actor/permission
- side effects
- audit reason requirements
- default WIP limit
- GenUI rendering token

This registry should drive:

- protocol schemas
- Control API validation
- board columns
- filter chips
- status picker
- docs
- analytics
- GenUI validation

### Liveness contract

Every non-terminal agent-owned WorkItem should show one clear next-action path:

- active run
- queued run
- deferred wakeup
- waiting on approval
- waiting on human answer
- blocked by another WorkItem
- scheduled monitor/check
- recovery WorkItem
- human owner explicitly holding it
- no known next action

`No known next action` should be a first-class warning and filter.

## Run/execution orchestration implications

Paperclip's most important execution rule is single active execution ownership per issue.

Agents Cloud should implement:

- one active execution lock per WorkItem;
- transactionally acquire lock before starting a linked Run;
- same-agent self-wake while active should coalesce or attach to existing run;
- different-agent wake while active should defer;
- terminal run releases lock;
- oldest valid deferred wakeup can promote;
- stale lock repair creates visible events;
- destructive transitions require preview/confirmation.

Status transitions must be commands, not silent field edits.

Examples:

- Move to `in_progress` requires assignee and no unresolved blocking WorkItems.
- Move `in_progress -> cancelled` must cancel/stop linked run or require user choice.
- Move `in_review -> done` may require an approval/result.
- Reopen `done -> todo` should ask for a reason.
- Move `blocked -> in_progress` requires blockers resolved or override reason.

## UI surfaces to implement

### 1. Command Center / Inbox

This should become the daily home screen.

Rows should include:

- work assigned to me
- failed/timed-out runs
- pending approvals
- stale/silent runs
- completed outputs needing review
- blocked work
- new comments/mentions
- agent join/runtime requests
- budget or policy alerts

Actions:

- open
- approve/reject
- retry
- wake agent
- assign
- mark read/archive
- create recovery task
- request changes

Desktop:

- dense list/table
- keyboard navigation
- hover actions
- filters and saved views

Mobile:

- segmented tabs
- swipe actions
- bottom-sheet filters/actions
- compact rows with attention chips

### 2. Work board / Kanban

Desktop/tablet:

- horizontal board columns
- compact columns
- collapsible empty lanes
- WIP/count badges
- optional swimlanes
- drag/drop after backend transition validation exists
- card context menu
- status-age and last-run hints

Mobile:

- do not rely on horizontal scrolling
- use status tabs or a status picker
- vertical list for selected lane
- card action sheet for move/assign/wake/retry

Board card content:

- identifier
- title
- priority
- assignee
- run/liveness state
- blocker/approval/stale chips
- last activity age
- artifact/preview indicator

### 3. Work item detail

Desktop ideal layout:

- left/main: title, description, comments/chat, documents, subitems
- right: properties, status, assignee, priority, workspace, policy, timestamps
- bottom/tab region: runs, artifacts, activity, related work

Mobile:

- full-screen route
- sticky header with status chips
- tabs for Chat / Activity / Runs / Artifacts / Related
- properties in bottom sheet
- sticky bottom action bar

Tabs:

- Chat/Comments
- Activity
- Runs
- Artifacts
- Approvals
- Related Work

### 4. Run ledger and transcript viewer

Agents Cloud should preserve typed transcripts rather than raw logs.

Transcript event types:

- assistant message
- thinking/reasoning
- tool call started/completed/failed
- command started/completed/failed
- stdout/stderr
- diff
- artifact created
- approval requested/resolved
- checkpoint created
- session resumed
- usage/cost
- run state changed

UI modes:

- Nice mode: grouped cards, default.
- Raw mode: virtualized log stream.
- Density: comfortable/compact.
- Jump to live.
- Collapse tool groups.
- Stderr warning accordions.
- Diff cards.
- Changed files summary.
- Model/provider/session/toolset metadata.

### 5. Approvals

Approvals should appear in:

- Command Center
- Work item detail
- Run transcript
- dedicated Approvals page

Approval card fields:

- request type
- requester agent/user
- linked WorkItem/Run
- risk level
- command/action preview
- diff/file/network preview when relevant
- approval options
- reject/request changes
- audit trail

### 6. Agent org chart

Agents should feel like workers/teams, not merely model names.

Node card:

- agent name
- role/title
- status
- model/provider secondary metadata
- active work
- capabilities
- spend/runtime health

Interactions:

- pan/zoom/focus
- filter by status/team/project
- click node -> agent detail
- show reporting/delegation edges

### 7. Search and command palette

Global Cmd/Ctrl+K should support:

- create work item
- search work items
- search runs/transcripts
- search agents
- search artifacts/docs
- search approvals
- jump to identifiers
- run commands: wake agent, create task, open board, open live runs

### 8. Onboarding

The first-run flow should create value quickly:

1. create workspace/org
2. connect provider/runtime
3. environment check
4. create first agent
5. create first WorkItem/objective
6. launch first run
7. land in WorkItem detail with live run and transcript

## GenUI implications

GenUI should generate safe components inside durable work contexts, not mutate arbitrary UI state.

Add catalog candidates:

- `work_board_summary`
- `work_column_summary`
- `work_item_card`
- `work_item_list`
- `work_item_properties`
- `work_item_activity_timeline`
- `execution_lock_card`
- `deferred_wakeup_card`
- `approval_card`
- `run_timeline`
- `artifact_card`
- `markdown_document`
- `browser_preview_card`

Rules:

- Agents can suggest work plans and summaries.
- Agents cannot directly mutate board state through GenUI.
- Mutations route through allowlisted Control API actions.
- Server validates catalog ID/version, component count/depth, URL policy, markdown/table/log sizes, and action policy.
- Unknown components render safe fallback cards.
- Raw JSON/details stay hidden outside debug/developer mode.

## Hermes integration implications

Do not copy the adapter's local assumptions directly.

Avoid in production:

- shared `~/.hermes` state across tenants
- inheriting full process environment
- broad API tokens in shell
- prompt-instructed `curl` as the main platform mutation path
- silent `--yolo` without cloud policy/approval compensation
- regex-only model/provider detection as the final authority

Agents Cloud should provide:

- isolated Hermes home per tenant/agent/run
- generated config from explicit provider/model settings
- scoped secrets injected only for the run
- per-run short-lived platform tokens if unavoidable
- typed platform tools instead of raw `curl`
- cloud approval events for dangerous actions
- explicit display of model/provider/session/toolsets/checkpoints
- skill registry scoped to org/workspace/agent
- run metadata showing resolved provider/model and source of resolution

Runtime configuration UI:

- provider dropdown
- model combobox/freeform
- credential source selector
- timeout/max-turns controls
- toolset policy selector
- workspace/checkpoint/session controls
- environment test panel
- advanced extra args gated to admins

Safety UI:

- unattended mode banner when applicable
- sandbox profile
- filesystem roots
- network egress policy
- toolsets enabled
- secrets scope
- stop run / revoke token / rollback checkpoint actions

## Implementation plan for Agents Cloud

### Milestone A: contracts and state

Add protocol schemas/builders:

- `work_item.created`
- `work_item.updated`
- `work_item.status_changed`
- `work_item.assigned`
- `work_item.priority_changed`
- `work_item.reordered`
- `work_item.comment.created`
- `work_item.execution_locked`
- `work_item.execution_deferred`
- `work_item.execution_released`
- `work_item.execution_promoted`
- `work_item.run_linked`

Important architecture issue: current run event envelopes assume `runId`. Work item events may not have a run. We should either:

1. introduce a workspace/entity event envelope where `runId` is optional, or
2. add a separate WorkItemEvents/WorkspaceEvents stream keyed by workspace/entity.

Recommended: introduce a broader entity event envelope with `entityType`, `entityId`, optional `runId`, and optional `workItemId`.

### Milestone B: DynamoDB/Control API

Add:

- WorkItemsTable
- WorkItemCommentsTable
- Workspace/WorkItem event storage decision

Endpoints:

- `POST /work-items`
- `GET /work-items`
- `GET /work-items/{workItemId}`
- `PATCH /work-items/{workItemId}`
- `POST /work-items/{workItemId}/status`
- `POST /work-items/{workItemId}/assign`
- `POST /work-items/{workItemId}/comments`
- `GET /work-items/{workItemId}/comments`
- `POST /work-items/{workItemId}/runs`
- `POST /work-items/{workItemId}/reorder`
- `GET /work-items/{workItemId}/events`
- `GET /workspace/{workspaceId}/events?afterSeq=`

### Milestone C: web board/list/detail fixture and API path

Add components under `apps/web/components/work-items/`:

- `work-board.tsx`
- `work-column.tsx`
- `work-card.tsx`
- `work-list.tsx`
- `work-toolbar.tsx`
- `work-filter-bar.tsx`
- `work-item-detail.tsx`
- `work-item-properties.tsx`
- `work-item-comments.tsx`
- `new-work-item-dialog.tsx`

Keep static export constraints: all product API calls must be client-side fetches to Control API with Cognito JWT.

### Milestone D: Flutter Work/Board feature

Split the current monolithic Flutter `main.dart` into feature files before the board grows.

Suggested files:

- `lib/src/domain/work_item_models.dart`
- `lib/src/data/control_api_client.dart`
- `lib/src/features/work/work_page.dart`
- `lib/src/features/work/work_board.dart`
- `lib/src/features/work/work_column.dart`
- `lib/src/features/work/work_card.dart`
- `lib/src/features/work/work_item_detail_page.dart`
- `lib/src/features/work/work_item_properties_panel.dart`
- `lib/src/features/work/new_work_item_sheet.dart`
- `lib/src/realtime/realtime_client.dart`

Start with a status picker/context menu instead of desktop drag/drop. Add drag/drop after APIs and tests are stable.

Mobile should use status tabs/vertical lane lists, not horizontal board scroll as the main interaction.

### Milestone E: execution locks and run linkage

Implement:

- WorkItem -> Run creation
- transactional execution lock
- self-wake coalescing
- different-agent wake deferral
- terminal run lock release
- deferred wake promotion
- stale lock repair
- visible event stream

### Milestone F: realtime board

Wire clients to workspace events:

- board updates
- work item status changes
- run state changes
- approval requests
- artifact creation
- reconnect gap repair via durable query

### Milestone G: polish

Add:

- drag/drop on web
- saved filters/views
- WIP limits
- swimlanes
- board analytics
- time-in-status
- keyboard navigation
- command palette entries
- mobile action sheets

## Test plan

Protocol tests:

- work item schema validation
- event builders
- invalid status/priority rejection
- canonical envelope compatibility
- GenUI catalog rejection for unknown work components

Control API tests:

- create/list/get/update WorkItems
- cross-tenant/workspace denial
- status validation
- reorder validation
- comment create/list
- execution lock acquisition
- self-wake coalescing
- different-agent deferral
- terminal run release
- deferred wake promotion
- stale lock repair
- idempotency

Realtime tests:

- workspace event fanout
- run event fanout
- reconnect gap repair
- dedupe
- stale connection cleanup

Web tests:

- board grouping
- card rendering
- filters/sort/view reducer
- optimistic status update and rollback
- detail tabs
- static export build

Flutter tests:

- model JSON parsing
- board grouping provider
- mobile board layout switches to status tabs/list
- WorkCard rendering
- status picker callback
- detail markdown/comments/properties
- safe GenUI unknown-component fallback

Validation commands when implementing:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm realtime-api:test
pnpm web:typecheck
pnpm web:build
pnpm infra:build
pnpm infra:synth
cd apps/desktop_mobile && dart format lib test
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

## Product quality bar

Agents Cloud should feel more like Linear/Jira/GitHub Projects plus a live agent mission-control console than a chatbot demo.

The user should always be able to answer:

- What is the company/workspace trying to do?
- What work is active now?
- Which agent owns it?
- What did the agent do?
- What did it cost?
- What is blocked/stale/failed?
- What needs my approval?
- What artifacts/previews were created?
- What will happen next?
- Can I stop, retry, reassign, approve, or inspect it safely?

That is the product standard for this layer.
