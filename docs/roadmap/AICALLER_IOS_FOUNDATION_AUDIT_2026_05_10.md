# AI Caller iOS Foundation Audit

_Last updated: 2026-05-10_

Audited path:

```text
/Users/sebastian/Developer/aicaller/clients/ios
/Users/sebastian/Developer/aicaller/clients/lib
/Users/sebastian/Developer/aicaller/apps/agent_runner
/Users/sebastian/Developer/aicaller/infra/amplify
/Users/sebastian/Developer/aicaller/contracts
```

## Verdict

The AI caller project is a useful prototype foundation for mobile AI calling. It
already proves several hard pieces:

- iOS PushKit token setup,
- CallKit incoming-call display,
- Flutter WebRTC call screen,
- Amplify Auth/API integration,
- Cloudflare Realtime session/adapters,
- APNs VoIP push from backend,
- a containerized runner scaffold.

It should not yet be treated as the production communication foundation for
Agents Cloud. It needs to be pulled into a durable event/control model, have
secrets removed from mobile builds, and gain lifecycle tests before agents can
proactively call users.

## Repository And Source-Control Risk

`/Users/sebastian/Developer/aicaller` did not resolve as a single git repository
root during the audit. The `infra` directory appears to be under git, while the
`clients` and `apps` areas were not verified as tracked source.

Before Agents Cloud depends on this code:

- put the mobile client and runner under source control,
- ignore generated Flutter/Xcode outputs,
- add CI scripts for Flutter, CocoaPods, iOS archive checks, Python runner tests,
  and Amplify/CDK deploy checks,
- document which repo owns the caller foundation long term.

## Critical Credential Finding

Generated Flutter/Xcode files under the iOS client contain an encoded
`OPENAI_API_KEY` in `DART_DEFINES`:

```text
/Users/sebastian/Developer/aicaller/clients/ios/Flutter/Generated.xcconfig
/Users/sebastian/Developer/aicaller/clients/ios/Flutter/flutter_export_environment.sh
```

These files are generated and ignored, but the local copy is still sensitive.

Required action:

- rotate the key if these files were ever committed, shared, backed up, uploaded,
  sent to another tool, or included in logs,
- remove provider keys from mobile builds,
- broker model and TTS access through backend APIs or short-lived scoped tokens.

## iOS Native Status

Current native path:

- `Runner/AppDelegate.swift` imports `PushKit` and
  `flutter_callkit_incoming`.
- It creates a `PKPushRegistry`, assigns `.voIP`, and stores the VoIP token in
  the CallKit plugin.
- It receives incoming VoIP pushes, extracts caller fields, creates a
  `flutter_callkit_incoming.Data` object, and reports incoming UI.
- `Info.plist` contains microphone and speech recognition descriptions.
- `Info.plist` has `voip` and `remote-notification` background modes.
- Debug/release entitlements include APNs environments.

Gaps:

- The native code does not itself acknowledge push receipt to the backend.
- The payload uses flexible fields like `id`, `callId`, `uuid`, and `extra.id`
  across native/Dart code. Production needs one strict `callId`.
- The app does not validate call expiry before opening the call screen.
- `audio` background mode is missing for real locked/backgrounded voice calls.
- There is no native test coverage for PushKit/CallKit event paths.
- PushKit is only suitable for real calls. Normal agent nudges must use
  UserNotifications.

## Flutter Client Status

Useful pieces:

- Amplify bootstrap configures Auth/API and starts `CallCoordinator`.
- `CallCoordinator` registers the VoIP token through GraphQL.
- `CallCoordinator` listens for CallKit accept/decline/end/timeout events.
- `VoiceCallScreen` establishes WebRTC, publishes mic tracks, handles bot track
  subscription, and has speech-to-text plus TTS support.
- Local chat and voice-mode screens demonstrate conversational UX pieces.

Production gaps:

- Signed-in routing goes to `ChatScreen`, while call readiness UX is in
  `HomeScreen`; the proactive call flow is hidden unless invoked by push.
- Local `ConversationStore` talks directly to the configured LLM client and
  stores messages in memory.
- `VoiceCallScreen` posts text to `https://runner.solo-ceo.ai` by default and
  does not send Cognito auth or a platform-signed runner token.
- Agent replies in call mode are local text replies spoken by client TTS, not
  authenticated durable realtime agent events.
- Decline, timeout, connected, muted, failed, and ended states are not fully
  persisted to backend state.
- There is no offline/reconnect replay from a durable call transcript.
- Tests are placeholders.

## Backend Status

The Amplify call-control function provides a strong prototype:

- `registerDevice` stores VoIP tokens.
- `startCall` creates a call record, asks the runner to claim it, and sends VoIP
  pushes.
- `joinCall`, `publishTracks`, `renegotiate`, and `refreshMedia` coordinate
  Cloudflare Realtime sessions and adapters.
- `endCall` closes media adapters and marks status ended.
- `getCall` and `getIceServers` support client call setup.

Production gaps:

- The runner claim endpoint is public and should be signed/authenticated.
- No durable communication item is created for call requests.
- Call records are not integrated with Agents Cloud `WorkItem`, `Run`,
  `CommunicationItem`, or `Notification` ledgers.
- Delivery attempts for APNs are not modeled as first-class retryable records.
- Normal APNs device tokens and notification preferences are missing.
- Device tokens should be encrypted and raw values should not be logged.
- Call lifecycle events should be idempotent and append-only.

## Agent Runner Status

The runner scaffold is useful but prototype-level:

- FastAPI health endpoint.
- Claim endpoint.
- Message endpoint.
- In-memory runner state.
- Optional command backend for local text generation.
- Relay task scaffold.

Production gaps:

- No durable AppSync/Control API event write-back.
- No runner authentication.
- No real ECS-safe STT/LLM/TTS loop.
- No persistent transcript.
- No media lifecycle recovery.
- No policy separation between user messages, agent internal tool calls, and
  call/media events.

## Strict Call Payload Contract

Use one payload shape for VoIP invites:

```json
{
  "type": "call.invite",
  "callRequestId": "callreq_...",
  "callSessionId": "callsess_...",
  "callId": "callsess_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "deviceId": "device_...",
  "displayName": "Agents Cloud",
  "reason": "question | approval | explanation | follow_up",
  "expiresAt": "2026-05-10T18:30:00Z",
  "nonce": "..."
}
```

Rules:

- `callId` is the backend session ID, not a randomly interpreted plugin UUID.
- `callRequestId` tracks the product-level request.
- `callSessionId` tracks media once a real call is being established.
- Payload includes no model keys, no long-lived room tokens, no transcript, no
  user secrets, and no broad media URLs.
- The client fetches canonical call details after auth.

## Required Mobile Work Before Production Use

1. Remove mobile provider secrets and rotate exposed keys.
2. Bring `clients` and `apps` into source control.
3. Replace direct runner REST calls with authenticated Control API calls.
4. Add a typed API client instead of scattered raw GraphQL strings.
5. Persist call lifecycle and transcript events through the durable platform.
6. Add normal APNs token registration for non-call notifications.
7. Add notification permissions, preferences, quiet hours, and deep links.
8. Add `audio` background mode and physical-device tests.
9. Add strict call payload validation and expiry handling.
10. Add unit, widget, API-client, and manual-device tests.

## Tests To Add

Flutter:

- device registration success/failure,
- token refresh,
- auth loss during registration,
- CallKit accept/decline/timeout event mapping,
- malformed push payload handling,
- call readiness surface,
- background/foreground recovery.

iOS manual device:

- sandbox APNs VoIP push,
- production APNs VoIP push,
- lock-screen answer,
- decline,
- timeout,
- no-network recovery,
- Bluetooth route,
- interruption by normal phone call,
- app killed then VoIP push,
- background audio while locked.

Backend:

- device ownership,
- user/workspace authorization,
- idempotent `startCall`,
- signed runner claim,
- APNs response handling,
- delivery retries and DLQ,
- media adapter failure cleanup,
- call expiry.

Runner:

- authenticated claim,
- duplicate claim,
- message idempotency,
- relay reconnect,
- transcript write-back,
- STT/TTS failure events.

## Source References

- Apple PushKit VoIP handling: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- Apple CallKit VoIP calls: https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls
- Apple AVAudioSession play and record: https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord
- Apple notification permissions: https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
