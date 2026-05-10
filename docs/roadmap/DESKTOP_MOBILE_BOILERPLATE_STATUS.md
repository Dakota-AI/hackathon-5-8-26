# Desktop and Mobile Boilerplate Status

_Last updated: 2026-05-09_

## Purpose

This app is the desktop and mobile app for Agents Cloud.

It is intentionally separate from the web app. The Flutter app should become the desktop and mobile command surface for:

- issuing strategic commands,
- watching autonomous runs live,
- receiving notifications,
- approving/rejecting agent actions,
- opening artifacts and preview websites,
- reviewing agent teams and org charts,
- syncing with web/mobile through the same realtime event stream.

## Location

```text
apps/desktop_mobile
```

## Current status

- [x] Flutter app created for macOS, iOS, and Android.
- [x] `shadcn_flutter` dependency added.
- [x] `flutter_riverpod` dependency added.
- [x] Google/Flutter `genui` dependency added.
- [x] Command-center shell added.
- [x] command-center navigation added.
- [x] Local GenUI/A2UI preview surface added.
- [x] Widget tests added and passing for boot/navigation.
- [x] `flutter analyze` passes.
- [x] `flutter test` passes.
- [ ] Amplify/Cognito Auth is not wired yet.
- [ ] Control API is not wired yet.
- [ ] Cloudflare Durable Object realtime is not wired yet.
- [ ] Push notifications are not wired yet.
- [ ] Miro OAuth/MCP is not wired yet.

## Current screens

The app currently includes planning surfaces for:

- Command Center
- Runs
- Agents & Teams
- Artifacts
- Miro Boards
- Approvals

The Command Center includes:

- CEO command workflow hero panel,
- control-plane status,
- platform metrics,
- autonomous run timeline,
- live GenUI surface.

## Design direction

Use the product standards in this repository as the quality reference.

The UI should feel like:

```text
Linear/Vercel-style autonomous company command center
```

not:

```text
AWS console wrapper
```

and not:

```text
chatbot with logs
```

Principles:

- compact, professional, dense layout,
- clear left navigation,
- workflow-first surfaces,
- raw protocol/debug details hidden by default,
- live status/timeline over raw logs,
- artifacts and previews as first-class outputs,
- approvals as first-class governance,
- GenUI surfaces rendered from validated component catalogs only.

## GenUI direction

Current app:

```text
local genui.SurfaceController
  -> BasicCatalogItems.asCatalog()
  -> seeded A2UI surface
  -> rendered inside Command Center
```

Planned production path:

```text
agent emits A2UI/GenUI patch
  -> Control API validates schema
  -> event stored in DynamoDB/S3
  -> Cloudflare Durable Object fanout
  -> desktop/mobile renders approved components
```

Client-side rule:

Agents should not send arbitrary Dart/Flutter code. They should send declarative, validated UI packets that reference approved components.

Future Agents Cloud component catalog:

- run timeline
- task board
- org chart
- approval card
- artifact gallery
- preview website tile
- Miro board summary
- market/competitor matrix
- code review/test result card
- executive report panel
- notification digest

## Realtime direction

Flutter clients should eventually connect to Cloudflare Durable Objects over hibernatable WebSockets.

Recommended channel model:

```text
workspace:{workspaceId}
run:{runId}
thread:{threadId}
```

Event types:

```text
message.created
run.updated
task.updated
approval.requested
approval.resolved
artifact.created
preview.published
genui.patch
notification.created
```

The app should first support polling against the Control API, then swap to realtime once the Durable Object bridge is built.

## Auth direction

Use Amplify/Cognito as the identity source.

Planned flow:

```text
Flutter app signs in with Cognito
  -> obtains JWT/session
  -> calls Agents Cloud Control API
  -> Control API validates token
  -> all run/artifact/approval access is authorized server-side
```

## Backend dependencies needed next

The Flutter app becomes useful once these backend pieces exist:

1. `ControlApiStack`
   - `POST /runs`
   - `GET /runs`
   - `GET /runs/{runId}`
   - `GET /runs/{runId}/events`
   - `GET /runs/{runId}/artifacts`

2. Real worker event writing
   - ECS worker writes events to DynamoDB.
   - ECS worker writes artifacts to S3.

3. Realtime bridge
   - AWS event publisher.
   - Cloudflare Worker/Durable Object websocket channels.

4. Preview publishing
   - Preview router.
   - Hostname registry.
   - UI preview tile.

5. Miro integration
   - OAuth connection.
   - MCP broker.
   - board/context/tool actions.

## Development commands

From the app directory:

```bash
cd apps/desktop_mobile
flutter pub get
dart format lib test
flutter analyze
flutter test
flutter build macos --debug
```

Run locally:

```bash
cd apps/desktop_mobile
flutter run -d macos
```

## Files added/changed in the boilerplate pass

```text
apps/desktop_mobile/
  lib/main.dart
  test/widget_test.dart
  pubspec.yaml
  pubspec.lock
  macos/
  ios/
  android/
```

Docs:

```text
docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md
```

Related platform architecture:

```text
docs/roadmap/AUTONOMOUS_AGENT_COMPANY_ARCHITECTURE.md
```
