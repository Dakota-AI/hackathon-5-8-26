# Voice Call And Audio Message Architecture

_Last updated: 2026-05-10_

## Decision Summary

Treat voice and audio as interaction channels attached to durable work, not as
the source of agent truth.

Cloudflare Realtime is the selected media layer for this integration. The
existing AI caller work already uses it, so the V1 plan is to adapt that path
into Agents Cloud rather than introduce LiveKit or a separate telephony provider.

Recommended order:

1. Durable audio messages.
2. In-app call request and accept/decline lifecycle.
3. In-app realtime voice call.
4. Call transcript and summary artifacts.
5. PSTN calling only after consent/compliance controls.

## Three Separate Product Objects

Do not merge these concepts:

```text
AudioMessage
  Agent sends a stored audio summary or voice memo.

CallRequest
  Agent asks to speak with the user now or later.

CallSession
  Actual realtime media session after the user accepts or joins.
```

This keeps the product flexible:

- a user can receive an audio summary without taking a call,
- an agent can ask for a call without ringing the phone immediately,
- a call can have a transcript and summary after it ends,
- policy can block or defer an intrusive call request.

## Audio Messages

Audio message flow:

```text
agent creates text summary
  -> server-side TTS creates audio file
  -> S3 artifact written
  -> AudioMessage record written
  -> CommunicationItem(audio_message) appended
  -> normal notification if policy allows
  -> user plays audio from authenticated app
```

Rules:

- Do not use PushKit for audio messages.
- Do not put audio URLs with broad access in push payloads.
- Store transcript, duration, MIME type, content hash, and artifact ID.
- Use Control API to mint short-lived download or streaming URLs.
- Add playback events only if product needs read/listen receipts.

## In-App Call Requests

Default call request flow:

```text
agent emits call.requested
  -> CallRequest record created
  -> policy broker evaluates urgency and preferences
  -> if user is online: realtime call request appears
  -> if user is offline: normal push asks Accept / Not now
  -> user accepts
  -> CallSession is created
  -> media credentials are minted
  -> client joins the session
```

Only send a VoIP push when a real live call is being offered and the app can
report it to CallKit. For "agent wants to talk" without an immediate call, use a
normal notification.

## iOS PushKit And CallKit Rules

Apple's current platform rules make this boundary important:

- PushKit VoIP pushes are for VoIP call services.
- iOS apps built with the iOS 13 SDK or later must report VoIP pushes to CallKit
  or a call/conversation framework.
- Failing to report required VoIP pushes can terminate the app and repeated
  failures can stop future VoIP push delivery.
- Background pushes are low priority, throttled, and not guaranteed.
- Notification service extensions have limited time and are for alert
  modification, not durable background execution.

Implication for Agents Cloud:

```text
agent update        -> normal notification / inbox
artifact ready      -> normal notification / inbox
question            -> normal notification with actions
audio message       -> normal notification / inbox
real incoming call  -> PushKit VoIP + CallKit
```

## Selected Media Infrastructure

For Agents Cloud V1, reuse the existing AI caller Cloudflare Realtime work.
Infrastructure should harden the current Cloudflare session/adapter path rather
than introduce LiveKit.

The internal media interface can still be narrow so callers and runners are not
coupled to raw Cloudflare API details:

```text
createCallSession
createParticipantCredential
connectAgentRunner
endCallSession
refreshMedia
recordOrExportTranscript
```

Cloudflare Realtime fit:

- already used by the AI caller prototype,
- WebRTC fits mobile/browser calls,
- WebSocket media adapters can bridge AI services,
- aligns with the current Cloudflare realtime direction.

Risks to handle in Agents Cloud:

- Realtime SFU has no room abstraction; the app must own participant/session
  state,
- WebSocket adapter is beta,
- call lifecycle, room semantics, and recording/transcript management need more
  platform code.

OpenAI Realtime, local STT/TTS, or another voice model can be used inside the
agent runner, but that is an agent-runtime implementation detail. It does not
change the mobile/infrastructure media layer for this slice.

Twilio/PSTN remains a later compliance-gated product feature, not part of the
AI caller Cloudflare Realtime integration.

## Recommended V1 Media Shape

V1 in-app call:

```text
CallRequest in AWS
  -> iOS VoIP push only for real call
  -> CallKit answer
  -> Control API returns short-lived session credentials
  -> Flutter joins WebRTC media session
  -> ECS/user runner joins as agent participant
  -> runner runs the agent voice loop through Cloudflare media adapters
  -> transcript/events summarized back to AWS
```

Keep the mobile client free of model provider keys.

## Runner Responsibilities

The voice runner should:

- join the media session as the agent,
- run VAD/STT/LLM/TTS or bridge to a realtime speech model,
- emit user-visible transcript snippets only after policy filtering,
- emit internal tool events to debug traces, not user timeline,
- write call summaries and transcripts to S3 when the call ends,
- send structured call state events to Control API,
- handle cancellation, timeout, reconnect, and budget limits.

## Client Responsibilities

The mobile app should:

- register normal APNs token and VoIP token separately,
- ask notification and microphone permissions with clear purpose text,
- report PushKit VoIP invites to CallKit,
- fetch canonical call state after auth,
- accept/decline/end through Control API,
- join media using short-lived credentials,
- render call states like Listening, Thinking, Speaking, Reconnecting, Ended,
- support mute, speaker/Bluetooth route, and end controls,
- recover active calls after app relaunch,
- show transcript as optional captions.

## Backend Responsibilities

Control API and workers should:

- verify workspace/user/device ownership,
- create call request/session records idempotently,
- apply contact policy before ringing,
- mint short-lived media credentials,
- sign runner claim requests,
- track delivery attempts,
- expire stale call requests,
- close media sessions on timeout/end,
- write transcript and summary artifacts,
- expose call history through the inbox/work item.

## Legal And Consent Gate For PSTN

Before outbound phone-number calling:

- explicit user consent,
- opt-out,
- caller ID policy,
- calling-hour controls,
- country/region restrictions,
- DNC/telemarketing review,
- AI-generated voice disclosure where required,
- recording consent where applicable,
- audit logs.

Do not let a general-purpose agent call arbitrary phone numbers until this
gate exists.

## Source References

- Apple PushKit VoIP handling: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- Apple background pushes: https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app
- Apple CallKit VoIP calls: https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls
- OpenAI Realtime overview: https://platform.openai.com/docs/guides/realtime
- OpenAI Realtime WebRTC: https://developers.openai.com/docs/guides/realtime-webrtc
- OpenAI Realtime SIP: https://developers.openai.com/api/docs/guides/realtime-sip
- OpenAI Agents voice transports: https://openai.github.io/openai-agents-js/guides/voice-agents/transport
- Cloudflare Realtime SFU: https://developers.cloudflare.com/realtime/sfu/
- Cloudflare WebSocket adapter: https://developers.cloudflare.com/realtime/sfu/media-transport-adapters/websocket-adapter/
