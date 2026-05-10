# Communication Event Contracts

_Last updated: 2026-05-10_

This document sketches the protocol changes needed before proactive
communication, mobile notifications, questions, calls, and audio messages are
implemented.

## Current Contract Gap

The protocol package is currently too run-bound for proactive communication.
Events that are user/workspace scoped need to exist without `runId`:

- proactive agent message,
- daily brief,
- question requiring user input,
- artifact-ready notification,
- audio summary,
- call request,
- call declined/accepted/failed,
- delivery attempt update.

The event envelope should support:

```text
workspaceId required
recipientUserId optional, required for user-targeted communication
workItemId optional
runId optional
threadId optional
communicationItemId optional
eventId required
eventType required
createdAt required
producer required
sequence scoped by stream
```

Recommended stream scopes:

```text
run:{runId}
workItem:{workItemId}
thread:{threadId}
userInbox:{userId}:{workspaceId}
call:{callSessionId}
notification:{notificationId}
```

Do not use one global event sequence across all communication. Use scoped
ordering plus created-at/idempotency for merge.

## Event Groups

### Agent Messages

```text
agent.message.created
agent.message.updated
agent.message.redacted
```

Payload:

```json
{
  "messageId": "msg_...",
  "threadId": "thread_...",
  "communicationItemId": "item_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "format": "plain | markdown",
  "body": "I finished the first draft.",
  "summary": "First draft ready",
  "visibility": "user | team | debug",
  "requiresUserResponse": false,
  "idempotencyKey": "..."
}
```

### Questions

```text
agent.question.requested
agent.question.answered
agent.question.expired
agent.question.cancelled
```

Payload:

```json
{
  "questionId": "question_...",
  "threadId": "thread_...",
  "communicationItemId": "item_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "prompt": "Should I publish the preview?",
  "answerKind": "free_text | single_choice | multi_choice | confirm",
  "options": [
    { "id": "approve", "label": "Publish" },
    { "id": "reject", "label": "Do not publish" }
  ],
  "blocking": true,
  "expiresAt": "2026-05-10T18:30:00Z",
  "answer": null
}
```

Questions are not the same as tool approvals. Tool approvals authorize a risky
action. Questions are a broader user input primitive.

### Notifications

```text
notification.requested
notification.queued
notification.delivery_attempted
notification.delivery_updated
notification.opened
notification.read
notification.dismissed
notification.expired
```

Payload:

```json
{
  "notificationId": "notif_...",
  "communicationItemId": "item_...",
  "recipientUserId": "user_...",
  "workspaceId": "workspace_...",
  "reason": "question | approval | artifact_ready | run_failed | message",
  "urgency": "low | normal | high | time_sensitive",
  "channels": ["in_app_realtime", "mobile_push"],
  "title": "Agent needs a decision",
  "preview": "Approve publishing the preview?",
  "deepLink": {
    "kind": "work_item",
    "workItemId": "work_..."
  },
  "expiresAt": "2026-05-10T18:30:00Z"
}
```

Delivery attempt payload:

```json
{
  "attemptId": "attempt_...",
  "notificationId": "notif_...",
  "deviceId": "device_...",
  "channel": "mobile_push",
  "provider": "apns | fcm | websocket",
  "status": "queued | sent | provider_accepted | failed_retryable | failed_terminal",
  "providerMessageId": "optional",
  "errorCode": "optional",
  "nextAttemptAt": "optional"
}
```

### Audio Messages

```text
audio_message.created
audio_message.played
audio_message.transcript_updated
audio_message.failed
```

Payload:

```json
{
  "audioMessageId": "audio_...",
  "communicationItemId": "item_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "workItemId": "work_...",
  "artifactId": "artifact_...",
  "durationMs": 42000,
  "mimeType": "audio/mpeg",
  "transcript": "Short summary...",
  "s3Ref": {
    "bucket": "agents-cloud-dev-storage-workspaceliveartifacts...",
    "key": "workspaces/.../audio/audio_....mp3"
  }
}
```

Audio payloads should not be embedded in the event. Store audio in S3 and use
signed download/streaming URLs through Control API.

### Call Requests

```text
call.requested
call.policy_blocked
call.invite_queued
call.invite_sent
call.accepted
call.declined
call.timeout
call.cancelled
call.failed
```

Payload:

```json
{
  "callRequestId": "callreq_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "reason": "question | approval | explanation | follow_up",
  "urgency": "normal | high | time_sensitive",
  "mode": "in_app_voice",
  "displayName": "Agents Cloud",
  "summary": "The agent wants to explain a tradeoff.",
  "expiresAt": "2026-05-10T18:30:00Z",
  "requiresImmediateCall": false
}
```

### Call Sessions

```text
call_session.created
call_session.ringing
call_session.connecting
call_session.connected
call_session.reconnecting
call_session.muted
call_session.unmuted
call_session.ended
call_session.summary_created
call_session.failed
```

Payload:

```json
{
  "callSessionId": "callsess_...",
  "callRequestId": "callreq_...",
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "provider": "cloudflare_realtime | livekit | twilio | openai_sip",
  "roomId": "room_...",
  "state": "ringing | connecting | connected | ended | failed",
  "startedAt": "2026-05-10T18:10:00Z",
  "endedAt": null,
  "summaryArtifactId": null,
  "transcriptArtifactId": null
}
```

Provider-specific IDs stay in nested provider metadata and should not become
primary product IDs.

### Work And Artifact Notices

```text
work_item.ready_for_review
artifact.ready_for_review
surface.ready_for_review
run.requires_attention
run.failed_user_visible
```

These events should create or update `CommunicationItem` rows so clients can
render a consistent inbox/timeline instead of hardcoding every source event.

## Idempotency

Every producer-facing creation request should include:

```text
idempotencyKey
producerId
producerType
workspaceId
recipientUserId
semanticSourceEventId
```

Recommended keys:

- question: `runId#stepId#questionName#recipientUserId`
- artifact ready: `artifactId#recipientUserId#artifact_ready`
- call request: `workItemId#reason#recipientUserId#createdByEventId`
- audio message: `artifactId#recipientUserId#audio_message`
- notification delivery: `notificationId#deviceId#channel`

Duplicate requests must return the existing product object.

## Authorization

Before returning or accepting any communication event:

- verify workspace membership,
- verify recipient ownership or team visibility,
- verify device ownership for device-specific actions,
- verify the user can access linked `workItemId`, `runId`, `artifactId`, and
  `surfaceId`,
- verify agent/runner token scope when the producer is a runtime.

Realtime subscriptions must use the same authorization checks as HTTP queries.

## Protocol Package Work

Required `packages/protocol` work:

1. Relax the event envelope so `runId` is optional when another stream anchor is
   present.
2. Add `workspaceId`, `recipientUserId`, `threadId`, `workItemId`,
   `communicationItemId`, `notificationId`, and `callSessionId` fields where
   relevant.
3. Add JSON schemas for all event groups above.
4. Add positive and negative fixtures.
5. Add producer helpers that allocate stable IDs and validate payloads.
6. Add TypeScript exports for clients, runtime, Control API, and tests.

## Client Rendering Rule

Clients should render `CommunicationItem` projections, not raw delivery events.

Delivery events update metadata:

- unread count,
- "sent" or "failed" debug state,
- notification badge,
- call ringing/declined/ended state.

The visible timeline should stay:

- agent message,
- question,
- artifact ready,
- audio message,
- call request/session,
- approval.
