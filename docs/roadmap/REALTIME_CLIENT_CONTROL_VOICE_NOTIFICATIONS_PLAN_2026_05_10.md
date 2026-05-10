# Realtime Client Control, Voice, Notifications, and Preview Tools Plan

Date: 2026-05-10
Status: first WebSocket-backed client-control slice implemented locally
Owner: Clients + Agent Runtime + Realtime workstreams

## Goal

Make the resident agent feel present and useful in the client, not just like a
background job. The agent should be able to:

- show a concise orb/top-bar prompt when it has something useful;
- enter voice/call mode when the user accepts a call;
- speak concise realtime responses through TTS;
- drive allowlisted client UI actions such as opening a report, switching pages,
  highlighting an artifact, or opening the embedded browser;
- drive a bounded embedded browser for research/preview interactions;
- notify/text the user when work finishes, needs approval, or produces an
  artifact;
- expose a local web app server from a resident runner through a public preview
  tunnel;
- keep all of this replayable through durable EventsTable rows plus WebSocket
  fanout/backfill.

## Current implemented pieces

### 1. Durable run loop and realtime fanout

The deployed run loop already proves the core event spine:

```text
POST /runs
  -> Control API durable run/task/event rows
  -> async VPC dispatch Lambda
  -> resident ECS runner wake
  -> Hermes subprocess
  -> EventsTable + ArtifactsTable + S3
  -> WebSocket relay + HTTP backfill
```

Verified deployed smoke commands now pass:

```bash
AWS_PROFILE=agents-cloud-source AWS_REGION=us-east-1 bash scripts/smoke-web-http-e2e.sh
AWS_PROFILE=agents-cloud-source AWS_REGION=us-east-1 AGENTS_CLOUD_E2E_TIMEOUT_MS=300000 bash scripts/smoke-websocket-e2e.sh
```

The smoke asserts final `succeeded`, ordered status events,
`artifact.created`, artifact list, and artifact download URL.

### 2. Flutter orb/control harness

Current Flutter WIP adds a frontend harness under:

- `apps/desktop_mobile/lib/src/assistant_control/orb_control_controller.dart`
- `apps/desktop_mobile/lib/src/assistant_control/orb_control_layer.dart`
- `apps/desktop_mobile/lib/src/ui/agent_orb.dart`
- shell integration in `apps/desktop_mobile/lib/main.dart`

Shape:

- hidden by default;
- top-bar-first prompt/status strip for normal desktop use;
- draggable orb/blob only in voice walkthrough mode;
- local deterministic mock sequence for show/report/approval/navigation;
- pure controller boundary that can later ingest live WebSocket/client-control
  events.

This is the right frontend boundary: keep the product UI fast and testable, then
attach live transport through an adapter.

### 3. Embedded browser control bridge

Current Flutter WIP adds browser control under:

- `apps/desktop_mobile/lib/src/browser/agent_browser_protocol.dart`
- `apps/desktop_mobile/lib/src/browser/agent_browser_control.dart`
- `apps/desktop_mobile/lib/src/browser/agent_browser_websocket_bridge.dart`
- `apps/desktop_mobile/tool/agent_browser_bridge_probe.dart`

Capabilities:

- page snapshot with title/URL/text/markdown-ish extraction/scroll state;
- find visible controls by selector or text;
- click, fill, scroll, reload, back, forward, navigate;
- deterministic smoke page;
- dev-only local WebSocket bridge on `127.0.0.1:48765`;
- CLI probe for local testing;
- token option and redacted structured logs.

Dev launch:

```bash
cd apps/desktop_mobile
flutter run -d macos \
  --dart-define=AGENTS_CLOUD_AUTH_BYPASS=true \
  --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true \
  --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true
```

Probe:

```bash
cd apps/desktop_mobile
dart run tool/agent_browser_bridge_probe.dart --verbose
```

### 4. Runtime user engagement hook

Current agent runtime WIP adds a local CLI and resident endpoints:

- `services/agent-runtime/bin/agents-cloud-user.mjs`
- `POST /engagement/notify`
- `POST /engagement/call`

Resident Hermes subprocesses can call:

```bash
agents-cloud-user notify --body "Report is ready" --title "Agents Cloud"
agents-cloud-user call --summary "Need approval to publish the preview"
```

The resident runner records durable events:

- `user.notification.requested`
- `user.call.requested`

These events can land in EventsTable and flow through the existing realtime
relay. Today they are request events only; real APNS/SMS/VoIP delivery is still a
future delivery-worker slice.

### 5. TTS/voice client hooks

Current Flutter WIP adds provider hooks for:

- Apple local TTS default;
- OpenAI TTS;
- ElevenLabs TTS through `apps/desktop_mobile/lib/src/tts/elevenlabs_tts.dart`;
- speech/voice/call dependencies in `apps/desktop_mobile/pubspec.yaml`.

This is enough for hackathon voice-mode scaffolding, but not yet a full
low-latency duplex voice stack.

### 6. Dynamic preview tunnel package

Current WIP adds Cloudflare preview tunnel scaffolding under:

- `infra/cloudflare/preview-tunnels/`
- `services/agent-runtime/bin/agents-cloud-preview.mjs`
- `services/agent-runtime/src/preview-tunnel-agent.ts`
- `services/agent-runtime/skills/agents-cloud-preview-tunnels/SKILL.md`

Intended resident command:

```bash
agents-cloud-preview expose --port 3000 --label app
```

Shape:

```text
public preview URL
  -> Cloudflare Worker
  -> Durable Object per tunnel
  -> outbound WebSocket from resident runner
  -> http://127.0.0.1:<port>
```

This is for agent-created website previews, not browser DOM control.

### 7. WebSocket-backed orb control adapter

This slice now wires the foreground Flutter shell to the existing realtime
client. When signed in, `_RealtimeOrbControlBridge` connects to the deployed
WebSocket endpoint and routes incoming durable events into
`OrbControlController.applyRealtimeEvent(...)`.

Currently handled event types:

- `client.control.requested`: shows the top-bar/orb state and moves the client to
  an allowlisted surface such as Browser, Kanban, Inbox, or Agents.
- `browser.control.requested`: moves the client to the Browser surface and shows
  concise control status.
- `user.call.requested`: shows a top-bar approval prompt that can lead into voice
  mode.
- `user.notification.requested`: shows a concise top-bar update.
- `artifact.created`: surfaces the artifact as an orb/top-bar update.

The runtime allowlist also accepts `client.control.requested` and
`browser.control.requested` from fenced `agents-cloud-event` blocks, so a Hermes
resident run can write those events into the same durable ledger that WebSocket
fanout already streams.


Use the existing durable ledger/realtime path as the transport. Add typed events
instead of inventing a second messaging system.

Recommended high-signal event families:

```text
assistant.message.delta / assistant.message.final
assistant.thinking.started / assistant.thinking.finished
client.control.requested
client.control.accepted
client.control.rejected
client.control.completed
client.control.failed
client.observation.snapshot
browser.control.requested
browser.control.completed
browser.control.failed
user.notification.requested
user.notification.delivered
user.notification.failed
user.notification.response_received
user.call.requested
user.call.started
user.call.transcript.delta
user.call.transcript.final
user.call.ended
preview.tunnel.requested
preview.tunnel.ready
preview.tunnel.failed
```

For hackathon v0, the minimum useful subset is:

- `client.control.requested/completed/failed`
- `browser.control.requested/completed/failed`
- `user.notification.requested`
- `user.call.requested`
- `preview.tunnel.ready`

## Client-control command allowlist v0

Do not allow arbitrary eval or arbitrary UI mutation. Commands should be data
messages validated by the client:

```json
{
  "commandId": "cmd_...",
  "kind": "open_artifact",
  "args": { "runId": "...", "artifactId": "..." }
}
```

Initial allowed `kind` values:

- `show_page`: work, kanban, browser, artifacts, approvals, agents, chat;
- `open_artifact`: focus an artifact/report card;
- `open_report`: open the markdown/report preview;
- `open_browser`: switch to browser and optionally navigate to HTTPS URL;
- `browser_snapshot`: ask the browser bridge for a snapshot;
- `browser_click`: click a previously observed element id;
- `browser_fill`: fill a previously observed input id;
- `browser_scroll`: bounded scroll;
- `highlight`: visually point to a card/button/surface for a short time;
- `enter_voice_mode`: show the orb and start concise voice conversation mode;
- `exit_voice_mode`: stop speaking/listening and return to top-bar mode.

Each command result should be written back as a durable event and shown only as a
high-signal client status, not raw JSON in product UI.

## Voice/call mode v0

For hackathon speed, voice mode should be conversation-oriented but bounded:

1. Agent emits `user.call.requested` with a concise reason.
2. Client receives it through WebSocket/backfill and shows a call prompt.
3. User accepts.
4. Client enters voice mode and shows the orb.
5. Speech-to-text produces short user turns.
6. Client posts the user turn as a durable response/control event.
7. Agent/runtime generates concise answer text.
8. Client plays TTS and shows a small thinking/speaking state.

Do not block on fully-duplex WebRTC. Start with turn-based voice because it is
simpler, demoable, and compatible with durable events.

Latency rule:

- immediate client state: listening/thinking/speaking within <100ms;
- first text response target: 1-3s when using local/fast model path;
- TTS should stream or start playback as soon as provider output is ready;
- if slow, speak a short acknowledgement first and continue with the real answer.

## Notifications/text v0

The runtime can already request a notification/call event. The missing product
slice is delivery and response:

1. Add typed protocol events for notification/call request/delivered/failed/response.
2. Add device token registration in Control API.
3. Add a tiny delivery worker that consumes `user.notification.requested` and
   writes `delivered` or `failed`.
4. Add an inbound response endpoint that writes
   `user.notification.response_received`.
5. Later add SMS/VoIP providers.

For hackathon, push delivery can be stubbed if the client is foregrounded: the
WebSocket event itself can trigger an in-app banner/orb prompt. Native APNS/FCM
can follow.

## Validation matrix for the current WIP

Already green in this audit:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @agents-cloud/cloudflare-preview-tunnels run build
pnpm --filter @agents-cloud/cloudflare-preview-tunnels run test
pnpm cloudflare:build
pnpm cloudflare:test
pnpm web:typecheck
pnpm web:test
pnpm web:build
pnpm agent-runtime:test
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
cd apps/desktop_mobile && dart run tool/agent_browser_bridge_probe.dart --dry-run
cd apps/desktop_mobile && flutter build macos --debug
```

Live bridge still needs manual app+probe validation:

```bash
cd apps/desktop_mobile
flutter run -d macos \
  --dart-define=AGENTS_CLOUD_AUTH_BYPASS=true \
  --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE=true \
  --dart-define=AGENTS_CLOUD_BROWSER_BRIDGE_AUTO_OPEN_BROWSER=true

# second terminal
cd apps/desktop_mobile
dart run tool/agent_browser_bridge_probe.dart --verbose
```

## Remaining next slice

The first WS-backed local client-control slice is implemented. Next, tighten the
loop into a full E2E harness:

1. Add result events for `client.control.completed/failed` and
   `browser.control.completed/failed` after the client executes a command.
2. Add a small resident CLI command for emitting `client.control.requested` and
   `browser.control.requested` without hand-writing fenced JSON.
3. Add a deployed smoke:
   - create run;
   - agent emits a control request;
   - signed-in client receives it over WebSocket;
   - client/orb applies the surface transition;
   - browser bridge executes a deterministic smoke command;
   - result is written back to the ledger.

## Hackathon truth

The current system is enough to demo the concept if we keep scope tight:

- durable agent run works;
- realtime event fanout works;
- Flutter has a local orb/control harness;
- embedded browser control has a local bridge and CLI probe;
- runtime has notification/call request hooks;
- preview tunnel package builds/tests locally.

It is not yet production messaging/telephony. Native push, SMS, VoIP, device-token
registration, and full-duplex voice sessions are still follow-up slices.
