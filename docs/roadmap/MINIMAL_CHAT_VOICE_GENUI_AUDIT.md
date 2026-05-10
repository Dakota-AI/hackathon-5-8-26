# Minimal Chat, Voice Call, Local LLM, and GenUI Audit

_Last updated: 2026-05-10_

## User Direction

The feature should not feel like a standalone mock command-center app. It should feel like one high-quality feature inside the main product:

- bare-minimum chat UI first;
- remove agent-presence/status-pill/dashboard clutter;
- avoid exposing infrastructure concepts to normal users;
- call mode should feel like a real realtime AI conversation, not a text box with fake echo responses;
- voice should use VAD/continuous speech interaction rather than forcing typed-enter loops;
- local LLM execution is acceptable for the near-term voice/assistant loop if that gets the experience working faster;
- agent should be able to generate live UI, then revise that UI through conversation.

## Current Implementation Reality

### Web app

Current file: `apps/web/components/command-center.tsx`

The current web UI is too much of an infrastructure/demo dashboard:

- left sidebar: Command, Runs, Agents, Artifacts, Approvals;
- topbar has multiple environment/config status pills;
- hero copy explains Cognito, Control API, WebSocket, replay/backfill;
- metric cards expose AWS/realtime/A2UI/client concepts;
- fixture panels show recent runs, teams, artifacts;
- GenUI panel is static/future-facing;
- run result exposes run id, event numbers, backend source labels, polling/realtime labels.

This is useful for engineering verification, but it is not the desired product UX.

### Desktop/mobile Flutter app

Current file: `apps/desktop_mobile/lib/main.dart`

The current conversation surface is also too implementation-shaped:

- `_ChatSurfacePanel` describes a "chat/timeline hybrid";
- chat bubbles render role pills;
- `_ToolCallCard` exposes `Tool call: preview.publish` and approval badges;
- input is a read-only text area fixture;
- there is no VAD/voice loop;
- no real local LLM call path exists.

### Backend/runtime

Current deployed run loop is valuable and should be kept:

- Cognito auth;
- Control API `POST /runs`;
- DynamoDB run/event ledger;
- Step Functions -> ECS runtime;
- canonical `run.status` and `artifact.created` events;
- realtime WebSocket fanout.

But the user-facing chat should hide almost all of that unless the user opens a debug/details view.

## UX Target

### Default screen

Make the default interaction dead simple:

```text
┌─────────────────────────────────────────────┐
│ Agents Cloud                         Account │
├─────────────────────────────────────────────┤
│                                             │
│  You: build me a report on X                │
│                                             │
│  Agent: I’ll put together the report.       │
│                                             │
│  [Generated report card / chart / table]    │
│                                             │
│  Agent: I drafted this. Want changes?       │
│                                             │
├─────────────────────────────────────────────┤
│  Message Agents Cloud...              [↑] [☎]│
└─────────────────────────────────────────────┘
```

Remove from default:

- environment status pills;
- agent org chart;
- fixture runs;
- fixture artifacts;
- exposed event sequence numbers;
- exposed Control API/WebSocket labels;
- raw source/kind/internal ids;
- tool call cards unless approval is genuinely needed.

### When a run is happening

Use human language only:

- “Working on it…”
- “Drafting the report…”
- “Report ready.”
- “I need approval before publishing this.”

Keep technical details in a collapsible developer/debug drawer, not default UI.

### Call mode

Call mode should not look like chat with a text field.

Target:

- full-height focused call surface;
- central animated waveform/orb;
- high-quality mute/end/minimize controls;
- state labels like “Listening”, “Thinking”, “Speaking”;
- live transcript as optional small captions, not the primary control;
- no send button;
- no multiline text input;
- VAD starts/stops turns automatically;
- interruption/barge-in should stop agent speech and listen again.

Good enough first local implementation:

```text
Browser/Flutter mic
  -> local VAD turn detection
  -> local STT or browser SpeechRecognition for prototype
  -> local LLM adapter on localhost
  -> local/browser TTS
  -> transcript + assistant messages
  -> optional Control API run only when the user asks for durable work/artifacts
```

This avoids pretending Lambda is doing realtime voice/LLM. Lambda/ECS remains for durable work. Local loop handles low-latency conversation.

## Architecture Recommendation

Split the feature into two planes:

### 1. Interactive conversation plane

Purpose: low-latency back-and-forth.

Near-term local path:

```text
UI mic/text
  -> conversation client state
  -> local assistant bridge at localhost
  -> local LLM/provider/Hermes adapter
  -> streamed assistant text/audio
  -> UI message stream
```

This can run locally for dogfooding without deploying model secrets to Lambda.

### 2. Durable work plane

Purpose: anything that should be tracked, archived, replayed, or turned into artifacts.

Keep current deployed path:

```text
chat objective
  -> Control API run
  -> DynamoDB ledger
  -> Step Functions/ECS worker
  -> canonical events/artifacts
  -> WebSocket + HTTP backfill
  -> chat-visible messages and generated UI
```

The chat UI should translate durable events into friendly messages, not render raw ledger rows.

## GenUI Recommendation

Add a server-validated generated UI event contract above the current event ledger.

Recommended event types:

- `assistant.message.delta`
- `assistant.message.completed`
- `genui.component.created`
- `genui.component.updated`
- `genui.component.removed`
- `genui.layout.updated`
- `approval.requested`
- `artifact.created`

Safe component catalog for first slice:

- `markdown_card`
- `metric_grid`
- `report_card`
- `table`
- `bar_chart`
- `line_chart`
- `checklist`
- `preview_link`

Do not let workers send arbitrary React/Flutter code. Workers emit declarative JSON matching shared protocol schemas. Control API/runtime validates. Clients render from an allowlisted catalog.

Example product behavior:

```text
User: make me a report on revenue risk
Agent: I drafted a quick risk summary.
UI: report_card appears with metric_grid + table
User: make it more CFO-grade and add downside scenario
Agent: Updated the report with a downside case.
UI: same component id updates in place
```

Important model detail: component ids must be stable so revision commands update existing UI instead of appending duplicate cards.

## Immediate Build Slices

### Slice 1: Simplify web into minimal chat

Scope:

- remove sidebar/topbar/metric/team/artifact fixture panels from default web UI;
- keep Authenticator;
- keep Control API create-run and event backfill internally;
- render events as friendly chat messages;
- render artifact cards as generated UI cards;
- hide run ids/event sequence/source labels by default.

Acceptance:

- page looks like a clean chat product, not an infra dashboard;
- user can type an objective and create a durable run;
- run progress appears as assistant messages;
- artifact appears as a simple generated report card;
- no React object-render errors.

### Slice 2: Add generated UI model/reducer

Scope:

- define shared GenUI protocol types/schemas;
- add client reducer for component create/update/remove;
- add mock/self-test events;
- render markdown/report/table/metric components in web;
- mirror renderer shape in Flutter later.

Acceptance:

- assistant can create a card and update it by component id;
- no raw JSON shown to normal users;
- tests cover create/update/remove and duplicate event handling.

### Slice 3: Local conversation bridge

Scope:

- local-only `services/local-assistant-bridge` package;
- websocket or HTTP streaming endpoint on localhost;
- provider adapter for local Ollama/llama.cpp/OpenAI-compatible endpoint/Hermes;
- no AWS deployment required;
- web client env var enables local bridge.

Acceptance:

- typed chat can get a real assistant response locally;
- durable run creation remains separate;
- secrets stay local.

### Slice 4: Voice call prototype

Scope:

- call screen UI state machine: idle/listening/thinking/speaking/error;
- browser mic capture;
- VAD turn detection;
- local STT/TTS prototype;
- barge-in handling;
- transcript optional.

Acceptance:

- user clicks call once, speaks naturally, and receives real assistant responses;
- no text box in call mode;
- UI feels like a realtime AI call surface.

## Product Guardrails

- Default UX should be user-level language only.
- Infrastructure/debug state belongs behind a debug drawer.
- Durable runs are for work; realtime voice/chat is for interaction.
- Local model bridge is acceptable for dogfooding, but should be explicit and opt-in.
- GenUI must be declarative and allowlisted across web/native.
- UI should feel minimal, professional, and high-confidence, not like a dev console.
