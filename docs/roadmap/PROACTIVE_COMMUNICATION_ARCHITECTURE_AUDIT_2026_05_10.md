# Proactive Communication Architecture Audit

_Last updated: 2026-05-10_

## Executive Summary

Agents Cloud needs a proactive communication layer before the agent harness can
reliably ask users questions, notify them, send audio, or initiate calls.

The minimal architecture should not be complex. It should introduce one durable
communication spine and a small number of channel adapters:

```text
agent/runtime intent
  -> CommunicationItem in AWS
  -> Notification/DeliveryAttempt records
  -> Cloudflare/AWS realtime, APNs/FCM, or voice-call adapter
  -> clients fetch canonical state and respond through Control API
```

The most important missing pieces are:

1. `packages/protocol` is currently run-centric and requires `runId`.
2. CDK state has no durable inbox, notification, device, audio, or call tables.
3. Control API has no device registration, inbox, question answer, or call
   accept/decline routes.
4. Realtime subscriptions are run-scoped, not user/workspace inbox-scoped.
5. The runtime can emit run status and artifacts, but cannot request user
   attention through typed communication tools.
6. The AI caller prototype has useful CallKit/WebRTC work, but it bypasses the
   durable ledger and still has prototype-level secret, auth, state, and test
   gaps.

Do this before letting agents directly trigger phone calls. The agent should ask
the platform to contact the user; the platform decides the channel and records
the lifecycle.

## Product Target

The end user sees only product-level communication:

```text
Agent: I finished the report.
Artifact: report.md

Agent: I need one decision before I publish this.
Question: approve publishing to preview.domain.com?

Agent: I can explain the tradeoff in a call.
Call request: Accept / Not now

Agent sent an audio summary.
Audio: 42 seconds, transcript available
```

The default UI should not expose:

- raw tool calls,
- ECS task IDs,
- event sequence numbers,
- push token details,
- APNs/FCM provider status,
- Cloudflare adapter IDs,
- model provider transport events.

Those belong in debug/admin views.

## Current Agents Cloud Reality

The deployed foundation already has the right durable execution direction:

```text
authenticated command
  -> Control API
  -> DynamoDB run/event records
  -> Step Functions
  -> ECS worker
  -> events/artifacts
  -> realtime plus HTTP backfill
```

But proactive communication is not represented yet.

Current gaps:

- The protocol envelope requires `runId`, so user/workspace communication
  without an active run does not fit.
- Existing event helpers are focused on `run.status` and `artifact.created`.
- `tool-approval` is too narrow for normal user questions.
- State tables cover runs, tasks, events, artifacts, approvals, previews,
  WorkItems/DataSources/Surfaces, and realtime connections, but not inbox,
  device registration, notification delivery, calls, or audio messages.
- Control API does not expose routes for inbox query, mark-read, answer
  question, register device, set preferences, accept call, decline call, or
  query call lifecycle.
- Realtime accepts run subscription messages and relays run events. It does not
  yet provide a user/workspace inbox stream with replay cursor semantics.
- Web currently maps run events into chat-like messages. Flutter is not yet
  wired to authenticated API/realtime flows.

## Current AI Caller Reality

`/Users/sebastian/Developer/aicaller` is useful as a prototype reference:

- Flutter client has Amplify Auth/API, `flutter_webrtc`, CallKit incoming-call
  integration, speech-to-text, TTS, and a call screen.
- iOS `AppDelegate.swift` initializes PushKit and reports incoming VoIP pushes
  through `flutter_callkit_incoming`.
- The Amplify call-control Lambda stores VoIP tokens, starts calls, sends APNs
  VoIP pushes, creates Cloudflare Realtime sessions/adapters, and calls a public
  runner claim endpoint.
- `apps/agent_runner` is a FastAPI container scaffold with health, claim, relay,
  and text-message endpoints.
- `contracts/agent-runner-contract.md` and `contracts/voice-call-contract.md`
  already sketch a useful runner/call state vocabulary.

It is not ready to be copied into production as-is:

- Generated Flutter/Xcode files under the iOS client contain an encoded
  `OPENAI_API_KEY` in `DART_DEFINES`. Rotate that key if it was committed,
  shared, backed up, or uploaded.
- Mobile LLM calls and runner calls are not behind the Agents Cloud durable
  control plane.
- `VoiceCallScreen` posts to a hardcoded public runner URL without authenticated
  request signing.
- In-call text transcript is local in-memory state.
- Call accept/decline/timeout/failed events are not durably reported end to end.
- The PushKit payload identity is loose. A strict `callId` contract is needed.
- Normal APNs notification token registration and preferences are missing.
- Live calls need `audio` background mode and real locked/backgrounded-device
  testing.
- Tests are placeholders.
- `clients/` and `apps/` are not under a discovered git repository root, so the
  mobile and runner code should be brought under source control before becoming
  a dependency.

## Core Primitives

Add these product-level primitives:

```text
CommunicationThread
  A workspace/user/work-item scoped timeline.

CommunicationItem
  A user-visible message, question, audio item, artifact notice, status update,
  or call request.

AgentQuestion
  A blocking or non-blocking request for user input.

Notification
  A request to get user attention across one or more devices/channels.

DeliveryAttempt
  One attempt through one provider/channel.

DeviceEndpoint
  A user's registered web/mobile/native device token and capabilities.

CallRequest
  A request to start, schedule, or offer a voice conversation.

CallSession
  The actual realtime media session once accepted or joined.

AudioMessage
  S3-backed audio artifact plus transcript and playback metadata.

ContactPolicy
  Quiet hours, urgency limits, allowed channels, and consent.
```

A `CommunicationItem` should be the timeline object clients render. Specialized
records can provide details without forcing the client to understand every
transport.

## Minimal State Shape

Recommended DynamoDB tables or single-table entity families:

```text
CommunicationThreads
CommunicationItems
Questions
Notifications
NotificationDeliveries
UserDevices
NotificationPreferences
CallRequests
CallSessions
AudioMessages
```

Minimum indexes:

```text
CommunicationItems:
  PK workspaceId#threadId, SK createdAt#itemId
  GSI recipientUserId#createdAt
  GSI workItemId#createdAt
  GSI runId#createdAt

Notifications:
  PK notificationId
  GSI recipientUserId#status#createdAt
  GSI communicationItemId

NotificationDeliveries:
  PK notificationId, SK attemptId
  GSI deviceId#createdAt
  GSI status#nextAttemptAt

UserDevices:
  PK userId, SK deviceId
  GSI tokenHash

CallRequests:
  PK callRequestId
  GSI recipientUserId#status#createdAt
  GSI workItemId#createdAt

CallSessions:
  PK callSessionId
  GSI callRequestId
  GSI roomId
```

Keep large content in S3:

- audio files,
- long transcripts,
- attachment previews,
- generated reports,
- call recordings if enabled and consented.

DynamoDB records should keep metadata, routing, lifecycle, checksums, and S3
object references.

## Event Flow

Agent asks a question:

```text
runtime emits agent.question.requested
  -> Control API/runtime sink validates and writes AgentQuestion
  -> CommunicationItem(question) appended
  -> Notification created if policy says user should be interrupted
  -> realtime fanout to connected clients
  -> APNs/FCM delivery if user is away
  -> user answers through Control API
  -> question answered event resumes blocked work
```

Agent sends a normal update:

```text
runtime emits agent.message.created
  -> CommunicationItem(message)
  -> realtime fanout
  -> optional push based on urgency and preferences
```

Agent says artifact is ready:

```text
artifact.created
  -> CommunicationItem(artifact_ready)
  -> notification policy checks importance
  -> push or inbox badge
```

Agent requests a live call:

```text
runtime emits call.requested
  -> CallRequest created with reason, urgency, expiry
  -> policy checks quiet hours, consent, rate limits
  -> if immediate live call allowed:
       create media room/session placeholder
       send VoIP push for real incoming call
     else:
       send normal notification with Accept / Not now
  -> user accepts
  -> short-lived media credentials minted
  -> CallSession connected
  -> call summary/transcript attached after end
```

Agent sends an audio message:

```text
runtime creates TTS/audio artifact in S3
  -> AudioMessage metadata written
  -> CommunicationItem(audio_message)
  -> normal notification, not PushKit
```

## Delivery Policy

Delivery should be policy-driven, not agent-driven.

Inputs:

```text
recipient user
workspace
work item
urgency
reason
quiet hours
device capabilities
online presence
recent notification volume
requires response
expiresAt
tenant policy
channel consent
```

Recommended first policy:

- Connected web/native client: realtime event.
- Normal update: inbox only, no push unless user opted in.
- Artifact ready: push if the work item is watched or user requested notify.
- Approval/question: push if not connected or not acknowledged quickly.
- Failure: push if the failure blocks requested work.
- Audio message: push with short text preview and S3-backed playback in app.
- Live call: only when explicitly requested by user, pre-authorized by user, or
  high-urgency workflow allows it. Otherwise send a normal call request.

## Reliability Requirements

All communication writes need idempotency:

```text
producerId
semanticEventId
recipientUserId
workspaceId
channel
```

Provider delivery attempts must track:

```text
queued
sending
sent
provider_accepted
delivered_if_available
opened
read
accepted
declined
expired
failed_retryable
failed_terminal
```

Not every provider exposes delivered/read. Use `unknown` instead of inventing
certainty.

Use DLQs for:

- push provider failures,
- delivery worker crashes,
- call invite setup failures,
- media-room credential failures,
- webhook verification failures.

## Security Requirements

- Device tokens are sensitive. Store encrypted at rest and never log raw tokens.
- Push payloads contain routing IDs, expiry, and short previews only.
- Media credentials are short-lived and fetched after auth.
- Runners receive scoped platform tokens, not push-provider credentials.
- Generated UI must not be able to invoke arbitrary call or notification actions.
- Call accept/decline/answer routes must verify workspace membership and device
  ownership.
- Webhook endpoints from providers must verify signatures.
- Any PSTN calling path needs consent, caller ID, opt-out, quiet hours, and
  compliance controls before launch.

## Recommended First Slice

Do not start with PSTN or full realtime voice. Start with one durable inbox path:

1. Add non-run communication event schemas.
2. Add `CommunicationItems`, `Notifications`, `NotificationDeliveries`, and
   `UserDevices` state.
3. Add Control API routes for inbox query, mark read, answer question, register
   device, and create an agent-originated communication item.
4. Add runtime communication sink helpers.
5. Add realtime user/workspace inbox subscription with ACL checks.
6. Render messages/questions/artifact-ready items in web.
7. Wire Flutter to fetch the inbox and register normal push tokens.
8. Then wire iOS VoIP call request using the AI caller code as reference.

## Source References

- Apple APNs provider requests: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- Apple background pushes: https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app
- Apple notification service extension: https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension
- Apple actionable notifications: https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types
- Apple Live Activities push updates: https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications
- Apple PushKit VoIP handling: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- OpenAI Realtime server controls: https://developers.openai.com/api/docs/guides/realtime-server-controls
- Cloudflare Durable Object WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
