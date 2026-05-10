# Proactive Communication Remaining Work

_Last updated: 2026-05-10_

This is the implementation backlog for making Agents Cloud capable of proactive
text, questions, artifacts, notifications, audio messages, and calls without
overcomplicating the first version.

## P0: Architecture And Contract Foundation

### 1. Accept the communication ADR

Status: documented in `docs/adr/0009-proactive-communication-plane.md`.

Why:

- prevents direct runner-to-phone hacks,
- keeps AWS as durable truth,
- makes PushKit/CallKit a channel, not the product state,
- creates a stable shape for web, Flutter, runtime, and notification workers.

### 2. Extend protocol envelopes

Files likely touched:

```text
packages/protocol/src/events.ts
packages/protocol/schemas/event-envelope.schema.json
packages/protocol/schemas/events/*
packages/protocol/scripts/validate-schemas.mjs
```

Work:

- make `runId` optional when another stream anchor exists,
- add `threadId`, `communicationItemId`, `recipientUserId`, `notificationId`,
  `callRequestId`, `callSessionId`,
- add schemas and helpers for:
  - `agent.message.created`,
  - `agent.question.requested`,
  - `agent.question.answered`,
  - `notification.requested`,
  - `notification.delivery_updated`,
  - `audio_message.created`,
  - `call.requested`,
  - `call_session.updated`.

Tests:

```bash
pnpm contracts:test
```

Add positive and negative fixtures for every new event.

### 3. Add durable state tables

Files likely touched:

```text
infra/cdk/src/stacks/state-stack.ts
infra/cdk/test/*
```

Minimum state:

```text
CommunicationItems
Notifications
NotificationDeliveries
UserDevices
NotificationPreferences
Questions
CallRequests
CallSessions
AudioMessages
```

If keeping the first slice smaller, start with:

```text
CommunicationItems
Notifications
NotificationDeliveries
UserDevices
Questions
```

Do not start with PSTN tables.

Tests:

```bash
pnpm infra:build
pnpm infra:synth
```

### 4. Add workspace/member authorization

This blocks safe proactive communication.

Work:

- define workspace membership source of truth,
- enforce it in Control API,
- enforce it in realtime subscriptions,
- verify recipient access to every linked work item, run, artifact, surface, and
  call,
- verify device ownership for token registration and delivery actions.

Without this, notifications can leak cross-tenant work metadata.

## P1: Minimal Product Communication Loop

### 5. Add Control API communication routes

Minimum routes:

```text
GET  /workspaces/{workspaceId}/inbox
POST /workspaces/{workspaceId}/communication-items
POST /workspaces/{workspaceId}/questions/{questionId}/answer
POST /workspaces/{workspaceId}/communication-items/{itemId}/read
POST /devices
DELETE /devices/{deviceId}
GET  /notification-preferences
PUT  /notification-preferences
```

Agent/runtime-facing route:

```text
POST /runtime/communication
```

This route should require a scoped runner token, not a user Cognito token.

Tests:

- request validation,
- JWT claim handling,
- runner token scope,
- workspace membership,
- idempotency,
- DynamoDB item shapes,
- duplicate creation.

### 6. Add runtime communication sink

Files likely touched:

```text
services/agent-runtime/src/*
```

Work:

- add typed helpers for messages, questions, audio messages, call requests, and
  artifact-ready notices,
- keep raw model/tool events out of the user timeline unless projected,
- provide idempotency keys per semantic event,
- report failures to the run ledger and communication ledger.

Agent-facing tools:

```text
send_user_message
ask_user_question
request_user_attention
notify_artifact_ready
create_audio_message
request_voice_call
```

### 7. Add notification delivery worker

Recommended shape:

```text
DynamoDB stream or EventBridge
  -> SQS queue
  -> delivery Lambda/worker
  -> APNs/FCM/WebSocket provider
  -> NotificationDelivery update
  -> retry or DLQ
```

Work:

- implement APNs token auth,
- store provider credentials in Secrets Manager,
- hash/encrypt device tokens,
- keep APNs payloads small,
- track retryable vs terminal failures,
- mark invalid tokens inactive,
- emit delivery update events.

First channels:

```text
in_app_realtime
mobile_push_apns
```

Add FCM after Flutter Android is ready.

### 8. Add realtime inbox subscriptions

Current realtime is run-scoped. Add:

```text
subscribeInbox(workspaceId)
subscribeWorkItem(workItemId)
subscribeThread(threadId)
```

Requirements:

- ACL check on subscribe,
- replay cursor or documented HTTP backfill,
- fanout of `CommunicationItem` projections,
- gap repair after reconnect,
- tests for rejected unauthorized subscription.

## P2: Client Integration

### 9. Web inbox/question rendering

Work:

- render `CommunicationItem` projections as normal chat/timeline items,
- show questions with answer controls,
- show artifact-ready cards,
- show audio-message cards with disabled state until audio URLs exist,
- show call request cards with Accept / Not now,
- hide delivery internals by default.

Tests:

- reducer merge/order,
- question answer action,
- read state,
- reconnect/backfill.

### 10. Flutter device registration and inbox

Work:

- register normal APNs token separately from VoIP token,
- register device capability metadata,
- fetch inbox through Control API,
- handle deep links to work item, artifact, question, audio, and call request,
- keep local state as cache only,
- add notification permission UX,
- add quiet-hours/preferences UX later.

Tests:

```bash
cd apps/desktop_mobile
flutter analyze
flutter test
```

### 11. Pull useful AI caller pieces into the product app

Do not blindly copy the prototype.

Bring in:

- CallKit/PushKit native setup,
- WebRTC call screen patterns,
- TTS/STT lessons,
- Cloudflare media adapter lessons,
- call contracts.

Replace:

- direct OpenAI mobile keys,
- public runner URL calls,
- in-memory transcript as source of truth,
- loose call payload parsing,
- placeholder tests.

## P3: Calls And Audio

### 12. Audio messages

Work:

- server-side TTS or model-generated audio,
- S3 artifact storage,
- `AudioMessage` event,
- authenticated playback URL,
- normal notification,
- transcript display.

This is the safest first voice-adjacent capability.

### 13. In-app call request lifecycle

Routes:

```text
POST /call-requests
POST /call-requests/{id}/accept
POST /call-requests/{id}/decline
POST /call-requests/{id}/cancel
GET  /call-requests/{id}
```

States:

```text
requested
policy_checking
queued
ringing
accepted
declined
timeout
cancelled
failed
```

### 14. In-app realtime call session

Work:

- Cloudflare Realtime session/adapter interface,
- short-lived media credentials,
- signed runner claim,
- agent runner media bridge,
- call transcript,
- call summary artifact,
- reconnect/timeout,
- locked/backgrounded iOS testing.

### 15. PSTN later

Do not build first.

Prerequisites:

- explicit opt-in,
- opt-out and suppression lists,
- region/calling-hour policy,
- legal/compliance review,
- PSTN/SIP provider decision,
- webhook signature verification,
- cost controls,
- call recording consent.

## P4: Operations

### 16. Observability

Metrics:

- communication item created count,
- notification queued/sent/failed,
- invalid device tokens,
- question answer latency,
- call accept rate,
- call setup failures,
- audio generation failures,
- delivery worker DLQ depth.

Logs:

- never log raw device tokens,
- never log sensitive prompt/output payloads in push delivery logs,
- log provider error code and notification ID,
- correlate with work item, run, and recipient safely.

### 17. Abuse and rate limits

Add limits:

- per-agent notifications per hour,
- per-workspace high-urgency notifications,
- per-user call requests,
- quiet-hours enforcement,
- model/tool approval for intrusive contact,
- tenant admin policy overrides.

### 18. Documentation

Update after implementation starts:

- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`,
- `docs/roadmap/PROJECT_STATUS.md`,
- `docs/IMPLEMENTATION_READINESS_AUDIT.md`,
- `docs/PROJECT_STRUCTURE.md`,
- `docs/roadmap/DESKTOP_MOBILE_IMPLEMENTATION_PLAN.md`,
- package/service READMEs.

## Suggested Execution Order

```text
1. Protocol events
2. State tables
3. Workspace membership authorization
4. Control API inbox/question/device routes
5. Runtime communication sink
6. Realtime inbox subscription
7. Web rendering
8. Flutter inbox and normal APNs token
9. Notification delivery worker
10. Audio messages
11. Call request lifecycle
12. iOS PushKit/CallKit integration
13. Realtime call sessions
14. PSTN calling
```

This keeps the system useful early while avoiding a fragile direct-call path.
