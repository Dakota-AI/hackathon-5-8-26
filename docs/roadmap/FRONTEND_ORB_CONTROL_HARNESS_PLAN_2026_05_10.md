# Frontend Orb Control Harness Plan

Date: 2026-05-10
Status: implementation-refined
Owner: Clients workstream

## Executive recommendation

Start the orb/control work in the Flutter desktop/mobile client now, but do it as a frontend harness layer first. Do not wait for the full realtime/control-plane infrastructure, and do not wire the orb directly to the current WebSocket helper. Build the local/mock mode and live mode behind the same client-side reducer/controller boundary so the UI can be staged, visually tested, and later reconnected to real Control API + realtime events without rewriting the product shell.

The first implementation should be a shell-level assistant-control harness with
quiet default presence:

- no always-on floating orb in normal desktop browsing;
- a compact top-bar text strip when the main agent asks, "can I show you something?";
- a draggable logo-mark assistant only while voice walkthrough mode is active;
- local mock scripts that actually drive navigation/focus across the shell (Agents -> Kanban -> Browser -> Inbox), not just update status text;
- pure state models that later accept real WebSocket/client-control events,
- no production dependency on ordinary tool-call telemetry.

This gets us to the user-visible “agent is present and can guide/control/review” experience quickly while leaving infra/runtime transport details swappable.

## What the user means by orb control

This is not just a decorative glowing button. The orb is the user-facing manifestation of the main/delegator agent’s control session.

It should communicate:

- whether the agent is idle, listening, thinking, speaking, controlling, waiting for approval, paused, or blocked;
- what high-signal thing just happened: delegated work, created artifact, published page, asked for approval, recorded feedback;
- whether the agent currently has a UI control lease or has yielded to the user;
- what surface/work item/artifact the agent is focused on;
- how the user can stop, pause, resume, speak, approve, reject, or inspect.

It should not show every terminal/search/file/browser tool call. Those stay in debug logs/artifacts unless a special action creates a user-visible milestone.

## Two modes from day one

### 1. Local/mock harness mode

Purpose: fast UI iteration without backend dependency.

Characteristics:

- deterministic in-Dart scenario scripts;
- no network and no auth required;
- works in widget tests and local screenshots;
- drives the same reducers/presentation widgets that live mode will use;
- can simulate staged events:
  - planning started,
  - delegated work item,
  - artifact created,
  - webpage published,
  - approval requested,
  - user takeover/yield,
  - review feedback recorded.

### 2. Live mode

Purpose: connect to real Control API + realtime when infra is ready.

Characteristics:

- reads durable WorkItems, runs, events, artifacts, approvals;
- receives realtime events from an adapter, initially AWS-native WebSocket and later Cloudflare if needed;
- sends client observation snapshots and command results;
- applies only authorized client-control commands from the main/delegator agent;
- backfills from Control API on reconnect or event gaps.

## Frontend architecture

```text
ConsoleShell
  Stack
    existing page body: Work / Kanban / Browser / Artifacts / GenUI / Chat
    OrbControlLayer
      hidden by default
      voice-only draggable logo-mark assistant
      thinking bubble above the mark instead of tooltip text
  TopBar
    OrbTopBarStatus
      optional text prompt/status strip
      local harness buttons
      approval/review controls when needed

OrbControlController (Riverpod Notifier)
  AssistantControlState
  local mock script runner
  later: live event ingestion

AssistantControlRepository
  MockAssistantControlRepository now
  HarnessFileAssistantControlRepository next
  RealtimeAssistantControlRepository later

Reducers
  high-signal event reducer
  client-command reducer
  control-lease reducer
  surface patch reducer later
```

## Current Flutter insertion points

Current client state from audit:

- `apps/desktop_mobile/lib/main.dart` owns `ConsoleShell`, page routing, sidebar/mobile nav, GenUI lab, artifacts, browser, and page chrome.
- `apps/desktop_mobile/lib/src/ui/agent_orb.dart` provides the animated app-logo presence mark used for the voice assistant.
- `apps/desktop_mobile/lib/src/screens/voice_mode_screen.dart` already has STT/TTS/voice-state ideas, but it is full-screen voice mode, not the global control layer.
- `apps/desktop_mobile/lib/src/widgets/kanban_board.dart` is already first-party WorkItem board UI backed by `workRepositoryProvider`.
- `apps/desktop_mobile/lib/src/domain/work_item_models.dart` already contains WorkItem, artifacts, approvals, events, surfaces.
- `apps/desktop_mobile/lib/src/realtime/realtime_client.dart` is a minimal live helper and should remain behind a future repository adapter.

Safe first insertion:

- Add `lib/src/assistant_control/` for controller/models/presentation.
- Add one import to `main.dart`.
- Add `OrbTopBarStatus` to the desktop top bar for text-mode guidance.
- Keep `OrbControlLayer` in the shell stack, but render it only for voice mode.
- Keep all orb/control logic outside `main.dart`.

## State model v0

Core mode enum:

- `idle`
- `listening`
- `thinking`
- `controlling`
- `speaking`
- `awaitingApproval`
- `paused`
- `error`

Presence enum:

- `hidden`: default; no floating assistant UI.
- `topBar`: normal desktop guidance as text and small actions in the top bar.
- `voice`: draggable flat/blob orb appears for voice walkthrough only.

Panel enum:

- `minimized`
- `expanded` (legacy/debug only; not the primary UX)

Event types:

- `message`
- `delegation`
- `artifact`
- `webpage`
- `approval`
- `feedback`
- `control`
- `error`

State fields:

- current presence: hidden, topBar, or voice;
- current mode;
- panel state;
- latest status line;
- whether a mock script is running;
- whether control is paused/yielded;
- latest high-signal events;
- staged artifact cards;
- optional pending approval text;
- optional floating position;
- optional client-control target surface (`agents`, `kanban`, `browser`, `approvals`) plus revision so the shell can navigate/focus from the same reducer that live mode will use.

## Staged implementation slices

### Slice 1: Local orb harness foundation

Definition of done:

- Assistant control is hidden by default.
- Desktop text-mode guidance appears in the top bar after a local offer/prompt.
- The floating assistant appears only in voice mode, uses the app-logo mark, and has a small thinking bubble above its head instead of a tooltip.
- “Show me” simulates a control session that visibly moves the app from Agents to Kanban to Browser to Inbox.
- High-signal status, approval, and latest artifact appear in the top-bar strip.
- “Pause” / “Resume” changes state without touching backend.
- Widget tests prove default hidden state, top-bar prompt, mock sequence, and voice-only orb behavior.

### Slice 2: Local harness file importer

Definition of done:

- Developer can point the client at local harness output or load bundled fixture JSON.
- Client reads `events.ndjson`, transcript/report metadata, and artifact paths.
- The orb panel shows the same event/artifact state as the local mock reducer.
- Markdown artifacts can open in the existing artifact/report preview path.
- Local website artifacts are previewed in a deliberately scoped local preview widget, not the general HTTPS browser input.

### Slice 3: WorkItem/Kanban projection

Definition of done:

- High-signal orb events can create/update local WorkItem view state in mock mode.
- Delegation events appear on the Kanban board.
- Artifact events appear in the agent detail/artifacts surface.
- User can switch from orb event to related WorkItem/artifact.

### Slice 4: Client-control command dispatcher

Definition of done:

- Local mock commands can request navigation/focus/highlight/open artifact/open browser.
- Dispatcher validates commands against allowlist.
- User manual navigation/tap/scroll can mark control interrupted/yielded.
- Commands produce accepted/rejected results in local state.

### Slice 5: Live adapter

Definition of done:

- Same controller ingests live Control API/realtime high-signal events.
- Backfill runs before subscribe.
- Reconnect/gap repair is represented in state.
- Auth/live mode failures fall back gracefully and do not block fixture/local harness mode.

## Non-goals for now

- No full stdout/tool-call parser.
- No UI feed of every ordinary tool call.
- No graph database or heavyweight Paperclip clone before WorkItem/Kanban proves it needs one.
- No arbitrary generated Flutter/React code execution.
- No direct coupling between orb UI and current low-level WebSocket helper.
- No background wake-word listening.
- No multi-agent simultaneous UI control.

## Validation strategy

Local harness validation should be lightweight but real:

```bash
cd apps/desktop_mobile
flutter analyze --no-fatal-warnings --no-fatal-infos
flutter test test/widget_test.dart
```

When visual UI changes are material:

```bash
cd apps/desktop_mobile
flutter build macos --debug
open build/macos/Build/Products/Debug/desktop_mobile.app
```

Full live mode validation can wait until the backend contract is ready.

## Implementation checkpoint started

The first code checkpoint should add only:

- assistant control models/controller;
- top-bar guidance/status widget;
- voice-only floating blob/orb layer;
- shell overlay integration;
- widget tests for hidden default, top-bar prompt, local sequence, and voice-only orb.

That keeps the work frontend-first, reversible, and ready for staging/live adapter work later.
