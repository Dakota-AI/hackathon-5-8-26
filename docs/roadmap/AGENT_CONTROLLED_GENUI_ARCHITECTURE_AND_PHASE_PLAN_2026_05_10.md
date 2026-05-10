# Agent-Controlled GenUI Architecture and Phase Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Every code-producing task must follow `test-driven-development`: write the failing test, run it and verify RED, implement the smallest GREEN change, run the targeted test, then run the relevant package suite.

**Goal:** Turn Agents Cloud from a chat/run console into a live agent-operated work interface where the main user-facing agent can speak, navigate, open artifacts, build validated GenUI surfaces, patch layouts in realtime, and yield immediately when the user takes over.

**Architecture:** AWS remains durable truth for WorkItems, Runs, Events, Artifacts, DataSources, Surfaces, Approvals, and audit logs. AWS-native realtime is the primary live stream for this phase. Clients never execute arbitrary generated frontend code; they render server-validated declarative Surface specs and apply a small allowlisted Client Control command set. The main/delegator agent is the only agent with user-interface control capability; worker agents produce artifacts, events, and suggested surfaces for the main agent to present.

**Tech Stack:** TypeScript, pnpm, `@agents-cloud/protocol`, Control API, AWS API Gateway HTTP/WebSocket APIs, Cognito, DynamoDB, S3, Step Functions, ECS resident/user runners, Next.js/React, Flutter/Riverpod, `shadcn_flutter`, `genui`, `fl_chart`, `markdown_widget`, WebSocket client-control tools.

---

## Executive decision

The feature should be treated as a new product spine, not as a small GenUI widget enhancement.

The product thesis is:

```text
Agents Cloud is not a chatbot with dashboards.
Agents Cloud is an agent-operated work OS.
```

The user should be able to speak or type a high-level objective and watch the main agent act like a remote collaborator inside the app:

- create or open the right WorkItem,
- start/delegate work,
- show progress and live status,
- pull up artifacts from subagents,
- create charts/tables/reports/dashboards,
- move and refine components live,
- open a browser or note surface,
- export results as Markdown, CSV, or PDF,
- pause/yield when the user manually navigates or taps Back.

This requires five durable layers:

1. **Surface protocol:** validated declarative UI artifacts.
2. **Layout engine:** grid/rules/min-max constraints so generated UIs never become absurd.
3. **Streaming patch protocol:** components can appear, load, move, update, and finalize live.
4. **Client-control protocol:** main agent can safely navigate/focus/open/update client UI.
5. **Agent presence model:** voice/orb/control-state UX that makes the agent feel present but interruptible.

## Current baseline

As of 2026-05-10, the project has pieces of this but not the integrated system.

Implemented or partially implemented:

- Deployed Control API for run creation/querying.
- Deployed AWS-native WebSocket API at `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`.
- Canonical run/artifact events and realtime smoke tests.
- WorkItem/DataSource/Surface infrastructure planning and route skeleton direction.
- Web command center first live run loop.
- Flutter desktop/mobile shell with shadcn UI, GenUI Lab, browser page, Kanban, artifacts, approvals, and realtime tail wiring.
- Research/docs for GenUI, A2UI, Markdown, browser, WorkItem, and agent-created interfaces.

Still missing:

- Durable product-level Surface records and server-side Surface validator.
- Shared protocol for component catalog/layout/data binding/export actions.
- Web and Flutter renderers for the same validated Surface spec.
- Realtime Surface patch events beyond run-event tails.
- Client observation messages: active page, viewport, selected component, user gestures.
- Client-control command messages: navigate, open artifact, focus, patch surface, open browser, update note, export.
- Runtime tool that lets the main agent call those client-control commands.
- Explicit main-agent-vs-worker-agent authority boundary.
- User takeover/yield semantics.
- Floating voice/orb/presence UX.

## Product object hierarchy

This plan preserves the existing product spine:

```text
Workspace
  -> WorkItem
      -> Runs
      -> Events
      -> Artifacts
      -> DataSourceRefs
      -> Surfaces
      -> Approvals
      -> Notifications
      -> Client Sessions
```

Do not build new dashboards directly on free-floating runs. The surface should answer: "what WorkItem is this helping the user understand or act on?"

## Core concepts

### WorkItem

The durable user-facing objective or task. Example: "Research competitors", "Build landing page", "Track scraper status", "Prepare board memo".

### Surface

A saved generated interface under a WorkItem. Examples:

- status dashboard,
- report view,
- artifact review room,
- scrape monitor,
- generated form/tool,
- note/workspace page,
- browser-backed research panel.

### Component

A safe, allowlisted block inside a Surface. v0 catalog:

- `markdown`
- `metric-grid`
- `table`
- `chart.line`
- `chart.bar`
- `chart.area`
- `chart.donut`
- `artifact-card`
- `artifact-list`
- `approval-card`
- `timeline`
- `note`
- `browser-preview`
- `status-card`

### DataSourceRef

A server-owned reference to data that components can bind to. v0 kinds:

- `inline-data`
- `artifact-ref`
- `run-event-ref`
- `work-item-query-ref`
- `control-api-query-ref`

No arbitrary SQL, no raw S3, no secret-backed external APIs, no broad cross-workspace reads in v0.

### SurfacePatch

A validated operation that changes a Surface:

- create component,
- update props,
- update data binding,
- move component,
- resize component,
- remove component,
- focus/highlight component,
- set loading/error/done state.

### ClientSession

A live user client connection. Tracks:

- user ID,
- workspace ID,
- platform: web/desktop/mobile,
- active WorkItem/surface/page,
- viewport,
- selected component,
- last user gesture,
- current control lease.

### Main Agent

The only agent allowed to use client-control tools. It may delegate work to subagents, but subagents do not directly drive the user's phone/desktop UI.

## Surface schema v0

A conceptual v0 Surface record should look like:

```json
{
  "surfaceId": "surface_123",
  "workspaceId": "workspace_123",
  "workItemId": "work_123",
  "title": "Project status dashboard",
  "version": 7,
  "layout": {
    "kind": "grid",
    "columns": 12,
    "density": "compact"
  },
  "components": [
    {
      "componentId": "status-summary",
      "type": "metric-grid",
      "title": "Status summary",
      "layout": { "x": 0, "y": 0, "w": 4, "h": 2 },
      "dataSourceRef": "ds_status_summary",
      "capabilities": ["export.markdown"]
    },
    {
      "componentId": "run-table",
      "type": "table",
      "title": "Active runs",
      "layout": { "x": 4, "y": 0, "w": 8, "h": 4 },
      "dataSourceRef": "ds_runs",
      "props": {
        "sortable": true,
        "filterable": true,
        "defaultSort": [{ "field": "updatedAt", "direction": "desc" }]
      },
      "capabilities": ["sort", "filter", "export.csv", "export.markdown"]
    }
  ]
}
```

This is a product contract, not a renderer-specific shape. Web and Flutter both render it using native components.

## Layout rules

Generated layout must be rule-based and client/server validated.

Global rules:

- Desktop/web use a 12-column grid.
- Tablet uses 8 columns.
- Mobile uses 4 columns or stacked sections.
- No overlap.
- No negative coordinates.
- No component outside grid bounds.
- Every component has min/max span by type.
- Related components should stay near each other.
- Empty whitespace should be minimized.
- If content is crowded, create sections/tabs instead of shrinking below readability.
- User-pinned/locked components cannot be moved without explicit permission.

Suggested min/max spans:

| Component | Desktop min | Desktop max | Mobile behavior |
| --- | ---: | ---: | --- |
| metric card | 2x1 | 4x2 | 2 columns or full width |
| metric grid | 3x2 | 12x3 | full width |
| table | 6x3 | 12x8 | full width, horizontal scroll if needed |
| line/bar/area chart | 4x3 | 12x6 | full width |
| donut chart | 3x3 | 6x5 | full width with legend below |
| markdown/report | 4x3 | 12x10 | full width |
| artifact list | 4x3 | 12x8 | full width |
| browser preview | 8x5 | 12x10 | full width, explicit height |
| note | 4x3 | 12x10 | full width |
| approval card | 4x2 | 8x4 | full width |

Validation should happen in both places:

- Control API validates stored surfaces and durable patches.
- Client validates again before rendering/applying patches.

A rejected patch should return a useful reason and optional suggested layout.

## Streaming event model

The user should see the interface being built live.

Recommended event sequence:

```text
surface.plan.started
surface.created
component.placeholder.created
component.data.loading
component.created
component.data.bound
component.patch.applied
component.layout.moved
component.focused
surface.finalized
surface.error
```

Example:

```json
{
  "type": "component.placeholder.created",
  "surfaceId": "surface_123",
  "componentId": "latency-chart",
  "componentType": "chart.line",
  "title": "Agent latency",
  "layout": { "x": 0, "y": 2, "w": 6, "h": 4 }
}
```

Clients should animate these states:

- placeholder/skeleton appears,
- loading shimmer,
- chart/table fades in,
- layout moves with animation,
- agent highlights what it is talking about,
- final state settles.

## Client observation protocol

For natural language references like "this chart" to work, the runtime needs a semantic snapshot of what the user sees.

Client sends observation messages:

```json
{
  "type": "client.observation",
  "sessionId": "client_session_123",
  "platform": "mobile",
  "activePage": "work.surface",
  "workspaceId": "workspace_123",
  "workItemId": "work_123",
  "surfaceId": "surface_123",
  "viewport": { "width": 390, "height": 844, "scale": 3 },
  "visibleComponents": [
    {
      "componentId": "latency-chart",
      "type": "chart.line",
      "title": "Agent latency",
      "bounds": { "x": 12, "y": 180, "w": 366, "h": 220 },
      "selected": true,
      "focused": false
    }
  ],
  "lastUserGesture": {
    "kind": "tap",
    "targetComponentId": "latency-chart",
    "timestamp": "2026-05-10T06:30:00.000Z"
  }
}
```

Observation should be throttled and privacy-aware:

- send on navigation,
- send on component selection/focus,
- send on meaningful viewport change,
- send on user takeover gestures,
- avoid streaming every pixel/scroll tick unless needed.

## Client-control command protocol

The main agent can request UI actions through a WebSocket tool. The client validates and applies or rejects them.

v0 command set:

- `client.navigate`
- `client.openWorkItem`
- `client.openArtifact`
- `client.openSurface`
- `client.patchSurface`
- `client.focusComponent`
- `client.highlightComponent`
- `client.scrollToComponent`
- `client.openBrowser`
- `client.openNote`
- `client.appendNote`
- `client.exportSurface`
- `client.setOrbState`
- `client.showToast`
- `client.requestApproval`
- `client.pauseControl`

Command envelope:

```json
{
  "type": "client.command",
  "commandId": "cmd_123",
  "sessionId": "client_session_123",
  "issuedBy": {
    "agentId": "main-delegator",
    "role": "main-agent"
  },
  "action": "client.openArtifact",
  "args": {
    "artifactId": "artifact_123"
  },
  "reason": "User asked for the latest status report.",
  "requiresControlLease": true,
  "createdAt": "2026-05-10T06:30:00.000Z"
}
```

Client response:

```json
{
  "type": "client.command.result",
  "commandId": "cmd_123",
  "status": "applied",
  "activePage": "artifact.detail",
  "visible": true
}
```

or:

```json
{
  "type": "client.command.result",
  "commandId": "cmd_123",
  "status": "rejected",
  "reason": "user_took_control"
}
```

## Control lease and user takeover

The agent cannot fight the user. Client-control requires a lease.

Lease states:

- `idle`: no agent control.
- `suggesting`: agent proposes actions, no direct UI motion.
- `active`: agent can apply safe navigation/focus/surface patches.
- `awaiting-approval`: blocked on user confirmation.
- `user-interrupted`: user gesture paused control.
- `revoked`: user stopped control.

User takeover triggers:

- Back navigation.
- Manual route change.
- Manual scroll during agent scroll.
- Text editing in an agent-controlled field.
- Tapping another nav item.
- Dragging/moving a component.
- Pressing Stop/Pause on the orb.
- App backgrounding during an active control command.

When takeover happens:

1. Client rejects pending commands with `user_took_control`.
2. Client sends `client.control.interrupted`.
3. Orb changes to paused/yielded state.
4. Main agent stops issuing UI commands.
5. Agent may ask: "Want me to keep driving?"

Destructive or external actions always require explicit approval:

- delete,
- publish,
- send message/email,
- commit/push,
- deploy,
- purchase/pay,
- grant permissions,
- external browser form submit.

## Agent presence / orb UX

Desktop/mobile should have a first-class agent presence, not just chat.

States:

- `idle`: subtle small orb.
- `listening`: microphone/listening pulse.
- `transcribing`: waveform/typing dots.
- `thinking`: slow pulse/spinner.
- `speaking`: audio waveform pulse.
- `acting`: halo or directional pointer; agent is controlling UI.
- `awaiting-approval`: attention state but not alarming.
- `paused`: user took over.
- `blocked`: action failed or needs permission.

Rules:

- Always has Stop/Pause.
- Can expand to transcript/control panel.
- Avoids blocking selected/active components.
- Moves to a corner when keyboard opens or content is selected.
- Can point/highlight the component it is discussing.
- Does not cover approval buttons or destructive controls.
- On mobile, defaults to a small docked floating button and expands into a bottom sheet.
- On desktop, can become a side presence panel attached to the selected agent.

## Voice loop

Voice is not a separate feature. It is input/output for the same client-control session.

Flow:

```text
Push/tap orb
  -> client streams transcript
  -> main agent receives transcript + observation snapshot
  -> main agent delegates or acts
  -> runtime streams text/speech + UI commands + surface patches
  -> client speaks, moves UI, highlights components, renders updates
```

The spoken response and UI actions should be synchronized. If the agent says "I’m opening the latest report," the artifact should open at that moment.

Start with push-to-talk. Wake/background listening is later and must be permissioned.

## Main agent authority model

Only the main user-facing agent gets client-control tools.

Worker agents may produce:

- artifacts,
- data sources,
- status events,
- suggested surface specs,
- proposed patches,
- reports,
- approval requests.

Main agent decides what to show and when. This prevents multiple subagents from fighting over the UI.

Runtime policy:

```text
Worker agent output
  -> durable event/artifact/suggested surface
  -> main agent reviews/contextualizes
  -> main agent invokes client-control or surface-patch tool
  -> client validates/applies
```

## Security and privacy boundaries

Required safeguards:

- Client-control commands are capability-scoped.
- Commands are allowlisted by action and platform.
- Commands are auditable as events.
- Client validates every command.
- Server validates durable Surface specs/patches.
- Client validates again before rendering.
- No arbitrary Flutter/React/JS/HTML/CSS generated by agents.
- No direct credential exposure to clients or arbitrary agent code.
- Workspace membership and capability checks gate WorkItems, Surfaces, DataSources, Artifacts, and realtime subscriptions.
- Browser control starts sandboxed: navigation/open/read/highlight first; form submit later with approval.
- Notes/doc editing should support undo/version history.

## Platform split

### Web

Web supports:

- render validated surfaces,
- stream patches,
- navigate app routes,
- open artifacts,
- focus/highlight components,
- browser-safe preview panes,
- exports through server/client artifact flows.

Web does not initially support deep native OS control.

### Flutter desktop/mobile

Flutter supports everything web supports plus:

- stronger floating orb/presence,
- voice-first control,
- native navigation control,
- local app state observation,
- mobile takeover gestures,
- native notifications later,
- more fluid artifact/browser/note switching.

Flutter is the flagship for the "agent remote collaborator" feeling.

## Implementation phases

### Phase 0: Decide and document protocol ownership

Objective: make this architecture discoverable and prevent ad-hoc client-only shapes.

Tasks:

1. Add this document to roadmap docs.
2. Link it from master/status/readiness docs.
3. Update Clients current plan to call out Agent-Controlled GenUI as a major future lane.
4. Create handoffs to Realtime and Agent Harness only when concrete contract work begins.

Definition of done:

- Docs link to this plan.
- Existing WorkItem/GenUI plan remains the immediate product spine.
- This plan is explicitly layered after tenant/workspace authorization and Surface validation foundations.

### Phase 1: Surface protocol and validator

Objective: durable validated generated UI surfaces.

Likely files:

- `packages/protocol/src/surfaces.ts`
- `packages/protocol/test/surfaces.test.ts`
- `services/control-api/src/surfaces.ts`
- `services/control-api/test/surfaces.test.ts`
- `docs/roadmap/WORKITEM_GENUI_IMPLEMENTATION_PLAN.md`

Build:

- Surface spec types.
- Component catalog v0.
- Layout schema.
- DataSourceRef binding schema.
- Export capability schema.
- Validator rejecting unknown/unsafe/oversized/cross-workspace specs.

Validation:

```bash
pnpm contracts:test
pnpm control-api:test
```

Definition of done:

- Invalid surfaces fail closed.
- Valid metric/table/chart/markdown/artifact/approval specs pass.
- Stored surfaces remain scoped to WorkItem/workspace.

### Phase 2: Web and Flutter Surface renderers

Objective: same Surface spec renders on web and Flutter.

Likely files:

- `apps/web/lib/surfaces.ts`
- `apps/web/components/surface-renderer.tsx`
- `apps/web/test/surfaces.test.ts`
- `apps/desktop_mobile/lib/src/surfaces/`
- `apps/desktop_mobile/test/surface_renderer_test.dart`

Build:

- Web renderer for v0 catalog.
- Flutter renderer for v0 catalog.
- Table sort/filter interactions.
- Chart labels/legends/tooltips.
- Markdown renderer.
- Artifact/approval components.
- Defensive client-side validation.

Validation:

```bash
pnpm web:test
pnpm web:typecheck
pnpm web:build
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

Definition of done:

- Same fixture Surface renders in both clients.
- Invalid payloads render a safe error state.
- No arbitrary HTML/script/widget code execution exists.

### Phase 3: Streaming Surface patches

Objective: agent can visibly build and revise UI live.

Likely files:

- `packages/protocol/src/surface-events.ts`
- `services/realtime-api/src/relay.ts`
- `apps/web/lib/realtime-client.ts`
- `apps/desktop_mobile/lib/src/realtime/`
- renderer state reducers in both clients.

Build:

- `surface.created` / `component.created` / `component.patch.applied` event shapes.
- Reducers that apply patches idempotently by version/seq.
- Placeholder/loading/final/error visual states.
- Animation hooks in clients.
- Reconnect backfill via durable Surface GET/list endpoint.

Validation:

```bash
pnpm contracts:test
pnpm realtime-api:test
pnpm web:test
cd apps/desktop_mobile && flutter test
```

Definition of done:

- Surface can be built from an event stream.
- Reconnect can repair state from durable truth.
- Duplicate/out-of-order patch handling is safe.

### Phase 4: Client observation channel

Objective: main agent understands what the user is looking at.

Build:

- `client.observation` protocol.
- Session registration/subscription shape.
- Client-side active page / viewport / visible component reporting.
- Selected/focused/last gesture reporting.
- Throttling and privacy rules.

Likely files:

- `packages/protocol/src/client-control.ts`
- `services/realtime-api/src/subscriptions.ts`
- `apps/web/lib/client-observation.ts`
- `apps/desktop_mobile/lib/src/client_control/observation.dart`

Definition of done:

- User can tap/select a component and the main agent receives a stable component reference.
- Observation is scoped to the active user/workspace/session.
- Observation messages are not persisted as high-volume durable events unless summarized/audited intentionally.

### Phase 5: Client-control command channel

Objective: main agent can safely navigate/open/focus/patch the user client.

Build:

- command envelope,
- command result envelope,
- action allowlist,
- platform capability matrix,
- client reducer/dispatcher,
- command audit events,
- applied/rejected responses.

Likely tools exposed to main agent:

- `client.navigate`
- `client.open_artifact`
- `client.open_surface`
- `client.patch_surface`
- `client.focus_component`
- `client.open_browser`
- `client.open_note`
- `client.export_surface`
- `client.set_presence_state`

Definition of done:

- Runtime can issue a safe command to a connected test client.
- Client validates and applies/rejects.
- Agent receives result.
- User can interrupt and commands stop.

### Phase 6: Main agent runtime tool integration

Objective: make client-control a real tool available to the main/delegator agent, not generic workers.

Likely files:

- `services/agent-runtime/src/resident-runner.ts`
- `services/agent-runtime/src/resident-runner-server.ts`
- `services/agent-runtime/src/client-control-tool.ts`
- agent profile/tool policy files.

Build:

- tool implementation that writes command messages to realtime/control plane,
- session targeting by user/workspace/client session,
- capability checks,
- tool result wait/timeout,
- audit logging,
- policy: main agent only.

Definition of done:

- Main agent can open a known artifact in a connected client during a smoke test.
- Worker agent cannot invoke client-control tools directly.
- Tool timeouts/failures are visible to the agent and user.

### Phase 7: Agent orb and voice-first Flutter UX

Objective: make desktop/mobile feel like an agent is present and controllable.

Likely files:

- `apps/desktop_mobile/lib/src/agent_presence/`
- `apps/desktop_mobile/lib/src/client_control/`
- `apps/desktop_mobile/lib/src/voice/`
- `apps/desktop_mobile/test/agent_presence_test.dart`

Build:

- floating orb/presence widget,
- state machine for idle/listening/thinking/speaking/acting/paused/blocked,
- Stop/Pause/Resume controls,
- collision avoidance v0,
- push-to-talk transcript flow,
- synchronized UI command display.

Definition of done:

- User can tap orb, speak/type, see transcript, see agent thinking/speaking/acting state.
- User can stop control instantly.
- Back/manual nav pauses control.
- Orb does not block active content in common mobile/desktop layouts.

### Phase 8: Browser, notes, and exports

Objective: make the agent useful beyond dashboards.

Build:

- browser preview control: open URL, back/forward/reload/read-visible/summarize.
- notes: create/open/append/edit with undo/version history.
- exports: CSV/Markdown/PDF artifact creation from component/surface.
- artifact provenance: source surface/component/query/version.

Definition of done:

- User says "export this as PDF" and gets an artifact.
- User says "open the source page" and browser preview opens safely.
- User says "write this down" and a note appears/updates.

### Phase 9: Polish, governance, and production readiness

Objective: make it safe enough for real use.

Build:

- workspace authorization everywhere,
- replay/gap repair UX,
- command audit log,
- abuse/rate limits,
- approval gates,
- accessibility pass,
- E2E tests with test client sessions,
- design QA on mobile/desktop/web.

Definition of done:

- No client-control route trusts client-supplied workspace IDs alone.
- Every command is auditable.
- Reconnect repairs surface/client-control state.
- Destructive actions require explicit user approval.
- Accessibility and mobile takeover behavior are tested.

## Immediate next work recommendation

Do not build the orb first. The orb will feel fake unless the protocol underneath exists.

Recommended next order:

1. Finish WorkItem v0 and Surface/DataSource API foundations.
2. Define `packages/protocol` Surface + Client Control schemas.
3. Build web/Flutter Surface renderers with fixtures.
4. Add streaming Surface patches over current AWS-native WebSocket path.
5. Add client observation snapshots.
6. Add client-control commands and main-agent tool.
7. Build Flutter orb/voice UX on top.

## Critical non-goals for v0

- No arbitrary agent-generated React/Dart/Flutter/HTML/CSS.
- No broad OS remote control.
- No background wake-word listening.
- No multiple agents controlling the same client.
- No direct worker-agent UI control.
- No destructive/external actions without approval.
- No cross-workspace surface/data-source references.

## Open architecture questions

1. Should client-control messages route through the existing AWS-native WebSocket API first, or introduce a separate client-control socket namespace?
   - Recommendation: same AWS-native realtime API initially, with distinct message types and subscriptions. Split later only if scale/security demands it.

2. Should client observations be durable events?
   - Recommendation: not raw high-frequency observations. Persist summarized command/audit events only.

3. Should Surface patches be stored as events or materialized state only?
   - Recommendation: both. Store durable Surface materialized state, and store meaningful patch events for replay/audit where useful.

4. Should web support the same control level as Flutter?
   - Recommendation: web gets route/surface/artifact control. Flutter gets the richer voice/orb/native experience.

5. Should client-control be owned by Control API or Realtime API?
   - Recommendation: Control API owns durable permissions, session registration, and audit; Realtime API transports live commands/results.

## Quality gates

Before any implementation milestone is called complete:

- Protocol tests cover valid/invalid event and command shapes.
- Server validators reject unsafe specs/commands.
- Web and Flutter reject invalid payloads defensively.
- Realtime tests cover duplicate/out-of-order/reconnect behavior.
- Client tests cover user takeover and command rejection.
- Security review confirms workspace authorization and no secret exposure.
- UX review confirms dense, professional layout and no raw JSON in normal UI.

Suggested broad validation matrix once code changes begin:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm realtime-api:test
pnpm agent-runtime:test
pnpm web:test
pnpm web:typecheck
pnpm web:build
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

## Why this matters

This architecture is the difference between:

```text
User asks a chatbot and manually opens tabs/cards.
```

and:

```text
User talks to a trusted AI operator that understands the current screen, opens the right work, builds the right interface, explains what it is doing, updates artifacts live, and respectfully yields when the user takes over.
```

That second product is the right north star for Agents Cloud.
