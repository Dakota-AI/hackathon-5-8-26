# ADR 0009: Proactive Communication Plane

Date: 2026-05-10
Status: Accepted

## Context

Agents Cloud needs agents that can keep working while the user is away and then
reach the user when a useful result, question, approval, failure, audio message,
or call needs attention.

The user-facing experience should stay simple:

- text responses,
- questions,
- approvals,
- artifacts,
- generated UI,
- notifications,
- audio messages,
- live voice calls.

The user should not normally see tool calls, runner internals, provider events,
ECS task details, push-provider details, or message-delivery retries.

The existing durable run loop is intentionally AWS-backed. Cloudflare realtime,
APNs, FCM, PushKit, CallKit, WebRTC, and SIP are delivery and interaction
surfaces. They cannot be the source of product truth.

## Decision

Add a first-class proactive communication plane above runs and work items.

AWS remains the durable source of truth for all user-visible communication:

```text
Agent/runtime intent
  -> durable communication record in AWS
  -> policy and delivery broker
  -> realtime fanout / push / call invite / audio artifact
  -> client fetches canonical state from Control API
  -> user response is written back to AWS
```

Agents and runners must not call APNs, FCM, PushKit, CallKit, Twilio, or
Cloudflare client fanout directly. They emit typed communication requests to the
platform. The communication broker decides whether and how to deliver them.

Use these durable product objects:

```text
CommunicationThread
CommunicationItem
AgentMessage
AgentQuestion
Notification
DeliveryAttempt
DeviceEndpoint
NotificationPreference
CallRequest
CallSession
AudioMessage
ContactPolicy
```

`CommunicationItem` is the user-facing timeline item. Specialized records can
back it when needed:

- `AgentMessage` for text or markdown responses.
- `AgentQuestion` for user input that may block work.
- `AudioMessage` for stored generated audio.
- `CallRequest` for "agent wants to talk" or "start a live call".
- `CallSession` for an actual connected voice session.
- `Notification` for cross-device delivery and attention.

Attach communication to the strongest available anchor:

```text
workspaceId required
userId or recipientUserId required
workItemId preferred when work exists
runId optional
artifactId optional
surfaceId optional
```

Do not require `runId` for communication events. A proactive daily brief, a
follow-up question, or an incoming call can exist at user/workspace scope before
or after any durable run.

## Delivery Rules

Delivery channels are not durable truth:

```text
in_app_realtime
mobile_push
mobile_voip_push
live_activity
email_later
audio_artifact
voice_call
pstn_call_later
```

Cloudflare Durable Objects or AWS WebSocket APIs may coalesce and fan out live
events, but reconnect and replay must come from AWS ledgers.

APNs and FCM are delivery providers only. Payloads should contain routing IDs
and short previews only. Sensitive prompts, transcripts, credentials, artifact
contents, long-lived media credentials, and model/provider tokens must never be
placed in push payloads.

PushKit VoIP pushes are only for real incoming VoIP calls. They are not allowed
for "agent has an update", "artifact ready", "please respond", audio messages,
or generic proactive nudges. Those use normal user notifications and the client
fetches canonical state from Control API.

## Agent Tool Contract

Expose communication to agents as semantic platform tools:

```text
send_user_message
ask_user_question
request_user_attention
create_audio_message
request_voice_call
notify_artifact_ready
notify_run_failed
```

Each tool produces durable records and events. The tool result tells the agent
whether the item was recorded, queued for delivery, blocked by policy, or
requires approval.

Agents must not decide raw notification transport. They can express:

```text
urgency: low | normal | high | time_sensitive
reason: question | approval | completion | failure | call_request
preferredChannel: optional hint
expiresAt: optional deadline
requiresUserResponse: boolean
```

The broker applies user preferences, quiet hours, tenant policy, rate limits,
consent, and channel capability before delivery.

## Call And Audio Rules

Separate three concepts:

```text
AudioMessage: stored audio artifact plus transcript and metadata.
CallRequest: agent asks to start or schedule a live conversation.
CallSession: actual realtime media session after user accepts or joins.
```

Audio messages use S3-backed artifacts and normal notifications.

In-app voice calls use CallKit/PushKit only when a real call is immediately
available. The app receives a VoIP invite, reports the call to CallKit, fetches
short-lived media credentials from Agents Cloud after answer, then joins the
media room/session.

PSTN calls are a later capability behind explicit consent, contact policy,
calling-hour controls, opt-out handling, and legal review.

## Consequences

This adds work before mobile calling can be treated as a platform feature:

- protocol envelopes must support non-run communication events,
- DynamoDB state must add communication, notification, device, and call records,
- Control API must add inbox, device, question, notification, and call routes,
- realtime subscriptions must support user/workspace inbox scopes,
- runners need typed communication/event sinks,
- mobile clients need push token registration, deep links, and call lifecycle
  reporting,
- delivery workers need idempotency, retries, provider error tracking, and DLQs.

This also prevents a fragile design where an ECS runner directly phones a user
or where a push notification is the only record that an agent asked a question.

## Source References

- Apple PushKit VoIP handling: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- Apple UserNotifications: https://developer.apple.com/documentation/usernotifications
- Apple background pushes: https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app
- Apple CallKit VoIP calls: https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls
- OpenAI Realtime overview: https://platform.openai.com/docs/guides/realtime
- OpenAI Realtime WebRTC: https://developers.openai.com/docs/guides/realtime-webrtc
- OpenAI Realtime SIP: https://developers.openai.com/api/docs/guides/realtime-sip
- OpenAI Agents voice transports: https://openai.github.io/openai-agents-js/guides/voice-agents/transport
- Cloudflare Realtime media adapters: https://developers.cloudflare.com/realtime/sfu/media-transport-adapters/
