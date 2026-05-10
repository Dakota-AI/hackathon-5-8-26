# Proactive Communication Agent Interface Audit

Workstream: Agent Harness
Status: proposed
Updated: 2026-05-10

## Scope

This is the agent-harness side of the proactive communication/calling feature.

The agent-harness workstream should focus only on what agents need in order to
communicate with the user through platform-owned tools. It should not implement
mobile UI, APNs delivery, Cloudflare Realtime infrastructure, or Control API
table wiring.

Selected media assumption:

```text
Live voice calls use the existing Cloudflare Realtime AI caller path.
The agent harness only requests/joins calls through platform contracts.
```

## Agent Capability Goal

Agents need to be able to:

- send a user-visible text update,
- ask a user a blocking or non-blocking question,
- request user attention without choosing the push transport,
- notify that an artifact/report/surface is ready,
- create an audio summary message,
- request a voice call,
- receive user answers and call outcomes,
- continue or pause work based on the response.

The end user sees the projected communication item. The agent can still keep
internal tool traces, but those traces are not the default user experience.

## Required Agent Tools

### `send_user_message`

Purpose:

```text
Add a user-visible message to the workspace/work-item thread.
```

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "threadId": "thread_...",
  "body": "I finished the draft.",
  "format": "plain | markdown",
  "urgency": "low | normal | high",
  "requiresUserResponse": false,
  "idempotencyKey": "..."
}
```

Output:

```json
{
  "communicationItemId": "item_...",
  "status": "recorded | queued_for_delivery | blocked_by_policy"
}
```

### `ask_user_question`

Purpose:

```text
Ask the user for input that may block a run, task, or agent plan.
```

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "prompt": "Should I publish the preview?",
  "answerKind": "free_text | single_choice | multi_choice | confirm",
  "options": [
    { "id": "publish", "label": "Publish" },
    { "id": "cancel", "label": "Do not publish" }
  ],
  "blocking": true,
  "expiresAt": "2026-05-10T18:30:00Z",
  "urgency": "normal",
  "idempotencyKey": "..."
}
```

Agent behavior:

- if `blocking=true`, transition the task into a wait state,
- resume only after `agent.question.answered`,
- handle timeout as an explicit branch.

### `request_user_attention`

Purpose:

```text
Tell the platform that the user should be notified.
```

The agent does not choose APNs, VoIP, email, or realtime. It expresses why the
user is needed.

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "reason": "question | approval | artifact_ready | failure | status",
  "summary": "Approval needed before publishing.",
  "urgency": "low | normal | high | time_sensitive",
  "expiresAt": "2026-05-10T18:30:00Z",
  "idempotencyKey": "..."
}
```

### `notify_artifact_ready`

Purpose:

```text
Project an artifact event into the user communication timeline.
```

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "artifactId": "artifact_...",
  "summary": "Research report is ready.",
  "recommendedNextAction": "Review the report",
  "idempotencyKey": "..."
}
```

### `create_audio_message`

Purpose:

```text
Create a short audio summary the user can play later.
```

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "script": "Here is the short summary...",
  "voiceStyle": "calm | concise | neutral",
  "transcript": "Here is the short summary...",
  "urgency": "low | normal",
  "idempotencyKey": "..."
}
```

Agent-harness responsibility:

- request TTS through a scoped provider/tool adapter,
- store the audio as an artifact through the existing artifact path,
- emit `audio_message.created`,
- never embed audio bytes in events.

### `request_voice_call`

Purpose:

```text
Ask the platform to start or offer a live voice call with the user.
```

Input:

```json
{
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "reason": "question | approval | explanation | follow_up",
  "summary": "I can explain the deployment risk in a short call.",
  "urgency": "normal | high | time_sensitive",
  "preferredMode": "in_app_voice",
  "expiresAt": "2026-05-10T18:30:00Z",
  "idempotencyKey": "..."
}
```

Output:

```json
{
  "callRequestId": "callreq_...",
  "status": "recorded | queued | policy_blocked | already_active",
  "agentAction": "wait_for_acceptance | continue_without_call"
}
```

Agent behavior:

- do not call APNs or Cloudflare directly,
- do not assume the call will be accepted,
- continue asynchronously unless the plan explicitly requires the call,
- when accepted, receive a signed call-claim payload from the platform.

## Runtime State Needed

Add wait/resume support for:

```text
waiting_for_user_answer
waiting_for_call_acceptance
in_user_call
waiting_for_audio_generation
```

Each wait state needs:

```json
{
  "waitId": "wait_...",
  "workspaceId": "workspace_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "reason": "question | call | approval | audio",
  "createdAt": "...",
  "expiresAt": "...",
  "resumeEventType": "agent.question.answered",
  "timeoutAction": "continue | fail | ask_again | escalate"
}
```

## Runtime Callback Events To Consume

The agent harness should be able to consume:

```text
agent.question.answered
agent.question.expired
call.accepted
call.declined
call.timeout
call_session.connected
call_session.ended
call_session.failed
audio_message.created
notification.policy_blocked
```

These should route to the logical agent that created the request.

## Call Session Runtime Contract

When the platform accepts a call and assigns it to a runner, the runner receives
a signed claim payload. The agent harness then creates a call worker inside the
user runner.

Call worker responsibilities:

- connect to the Cloudflare Realtime adapter path from the claim payload,
- bridge user audio to STT/model/VAD or a realtime voice model adapter,
- send generated audio back through the Cloudflare Realtime media path,
- emit call lifecycle events back to Control API,
- produce transcript and summary artifacts,
- end cleanly on user hangup, timeout, cancellation, or budget stop.

The call worker does not own:

- APNs,
- CallKit,
- Cloudflare session creation,
- device token storage,
- client media join credentials.

## Policy Boundaries

Agent tools must respect:

- workspace authorization from the runner token,
- per-run and per-work-item budget,
- user contact policy,
- quiet hours,
- high-urgency rate limits,
- approval requirements for intrusive contact,
- no raw provider credentials in tool arguments or events.

The platform can reject or downgrade a request:

```text
request_voice_call -> normal notification
time_sensitive push -> normal push
push request -> inbox only
audio request -> text-only message if TTS unavailable
```

The agent should handle that result explicitly.

## Implementation Work Owned By Agent Harness

1. Define TypeScript tool schemas for the six tools above.
2. Add runtime communication client that calls the platform runtime endpoint.
3. Add idempotency key helpers.
4. Add wait/resume state for questions and call requests.
5. Add call-worker boundary that accepts a signed Cloudflare Realtime claim
   payload.
6. Add transcript/summary artifact production after calls.
7. Add tests for policy-blocked, duplicate, timeout, declined, and answered
   outcomes.

## Work Not Owned By Agent Harness

- CDK tables and IAM.
- APNs delivery worker.
- Cloudflare Realtime session/adapters.
- Mobile device registration.
- CallKit UI.
- Web/Flutter rendering.
- Notification preference UI.

## Validation

Agent harness validation:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
```

Runtime smoke once infrastructure exists:

```text
agent asks question
question event recorded
agent enters wait state
user answer callback resumes agent
agent requests voice call
platform returns queued/policy result
accepted call claim starts call worker
call worker emits connected/ended summary events
```

## Open Inputs Needed From Infrastructure

- runtime communication endpoint URL,
- runner token shape,
- call claim signing method,
- Cloudflare media claim payload,
- call session lifecycle route names,
- artifact prefix for call transcripts and summaries.
