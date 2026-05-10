# AI Caller Cloudflare Realtime Infrastructure Proposal

Workstream: Infrastructure
Status: proposed
Updated: 2026-05-10

## Scope

This proposal is the infrastructure handoff for integrating the existing AI
caller foundation into Agents Cloud.

Assumption from product direction:

```text
Cloudflare Realtime is the selected media layer.
LiveKit is not part of this slice.
Twilio/PSTN is not part of this slice.
```

The mobile client and AI caller code already prove the rough media path. The
infrastructure work is to make that path durable, authenticated, observable, and
compatible with Agents Cloud work items, runs, user runners, and communication
events.

## Existing AI Caller Resources To Treat As Reference

From `/Users/sebastian/Developer/aicaller`:

```text
infra/amplify/functions/call-control
infra/cloudflare
clients/ios
clients/lib/src/calls
clients/lib/src/screens/voice_call_screen.dart
apps/agent_runner
contracts/agent-runner-contract.md
contracts/voice-call-contract.md
```

Current useful behavior:

- mobile app receives iOS VoIP pushes and displays CallKit UI,
- mobile app can join a Cloudflare Realtime WebRTC session,
- backend can create Cloudflare sessions and WebSocket media adapters,
- backend can send APNs VoIP pushes,
- backend can ask a runner to claim a call,
- runner container has a prototype claim/message interface.

Current production blockers:

- runner claim is not signed/authenticated,
- call lifecycle is not attached to Agents Cloud durable records,
- call transcript/messages are not persisted through the platform,
- APNs delivery attempts are not first-class state,
- device token ownership and workspace authorization are not enforced through
  Agents Cloud,
- normal push notification registration is separate from VoIP and still missing
  in the Agents Cloud product path,
- AI caller client/apps need source-control hardening before direct dependency.

## Infrastructure Goal

Create enough infrastructure so an agent can request a user call through Agents
Cloud and the selected Cloudflare Realtime path can be used safely.

Target durable path:

```text
agent/user-runner tool call
  -> Control API runtime communication endpoint
  -> DynamoDB CallRequest + CommunicationItem + Notification records
  -> policy/delivery worker
  -> APNs VoIP push only for a real live call
  -> mobile app reports CallKit and accepts/declines
  -> Control API creates Cloudflare Realtime session/adapters
  -> runner receives signed call claim
  -> runner joins Cloudflare media path
  -> call lifecycle/transcript/summary written back to AWS
```

The durable source of truth remains AWS. Cloudflare Realtime carries live media
and adapter state only.

## Infrastructure Components Needed

### DynamoDB state

Add or map these state objects:

```text
UserDevices
CallRequests
CallSessions
CallParticipants
CallMediaAdapters
CommunicationItems
Notifications
NotificationDeliveries
AudioMessages
```

If the first slice needs to be smaller:

```text
UserDevices
CallRequests
CallSessions
CallMediaAdapters
NotificationDeliveries
```

Required query patterns:

```text
recipientUserId + status + createdAt
workspaceId + callRequestId
workItemId + createdAt
runId + createdAt
callSessionId -> media adapter state
deviceId -> owner/capabilities/token status
notificationId -> delivery attempts
```

### Secrets

Store in Secrets Manager or SSM secure parameters:

```text
Cloudflare Realtime app ID
Cloudflare Realtime API secret
Cloudflare Realtime relay URL or adapter endpoint config
APNs team ID
APNs key ID
APNs private key
APNs bundle/topic values
runner claim signing secret or key material
```

Rules:

- no APNs or Cloudflare API secrets in runner containers,
- no provider secrets in mobile clients,
- no raw device tokens in logs,
- rotate exposed mobile model/provider keys separately.

### Control API routes

Infrastructure should provision and wire routes for the application layer:

```text
POST /devices
DELETE /devices/{deviceId}
POST /call-requests
GET  /call-requests/{callRequestId}
POST /call-requests/{callRequestId}/accept
POST /call-requests/{callRequestId}/decline
POST /call-requests/{callRequestId}/cancel
POST /call-sessions/{callSessionId}/join
POST /call-sessions/{callSessionId}/media/refresh
POST /runtime/calls/{callSessionId}/events
```

The route implementation can come later. The infrastructure agent should own
API Gateway/Lambda env/IAM/table wiring when that slice starts.

### Cloudflare Realtime session wiring

Infrastructure should support these backend operations:

```text
createSession
publishClientTracks
createWebSocketIngestAdapter
createWebSocketEgressAdapter
renegotiateSession
closeAdapter
closeSession
```

State that must be durable in AWS:

```text
cloudflareSessionId
clientTrackName
agentTrackName
ingestAdapterId
egressAdapterId
adapterEndpoint
adapterStatus
lastRefreshAt
expiresAt
```

Do not rely on Cloudflare as the only call-state store.

### Runner claim contract

The infrastructure layer needs a signed server-to-runner claim path:

```text
POST /v1/calls/{callSessionId}/claim
Authorization: Bearer <scoped-runner-token>
X-Agents-Cloud-Signature: <optional request signature>
```

Payload should include:

```json
{
  "workspaceId": "workspace_...",
  "recipientUserId": "user_...",
  "workItemId": "work_...",
  "runId": "run_...",
  "callRequestId": "callreq_...",
  "callSessionId": "callsess_...",
  "cloudflareSessionId": "cf_...",
  "media": {
    "relayUrl": "wss://...",
    "ingestAdapterId": "adapter_...",
    "egressAdapterId": "adapter_...",
    "inputCodec": "pcm",
    "outputCodec": "pcm"
  },
  "expiresAt": "2026-05-10T18:30:00Z"
}
```

The token must be scoped to one user/workspace/call session and short-lived.

### Delivery worker

The first delivery worker should support:

```text
APNs normal push
APNs VoIP push
in-app realtime notification event
delivery attempt updates
invalid-token cleanup
retry and DLQ
```

VoIP push is only for actual immediate calls. Generic "agent wants to talk" can
be normal push or in-app notification.

### IAM and networking

Needed grants:

- call-control Lambda reads Cloudflare/APNs secrets,
- call-control Lambda reads/writes call/device/notification tables,
- delivery worker reads/writes notification delivery state,
- runtime call event endpoint can write scoped call/session events,
- runner task can call Control API/runtime callback endpoint,
- no inbound public runner route unless explicitly fronted and signed.

Networking:

- ECS runner needs outbound access to Control API and Cloudflare adapter
  endpoints,
- Cloudflare WebSocket adapter endpoint must authenticate caller identity,
- no Docker socket or host credentials in runner.

## Out Of Scope For Infrastructure Agent

Do not implement in this infrastructure slice:

- mobile UI,
- CallKit screen behavior,
- model prompt behavior,
- agent tool design,
- STT/TTS internals,
- LiveKit,
- Twilio/PSTN,
- arbitrary generated UI.

## Required Handoffs

Infrastructure -> Agent Harness:

- final runner claim token/env shape,
- call claim endpoint shape,
- media adapter payload shape,
- runtime callback URL and auth method.

Infrastructure -> Realtime Streaming:

- whether call lifecycle events go through AWS-native realtime, Cloudflare
  Durable Objects, or both,
- replay cursor shape for call/session events,
- authorized subscription scope for call sessions.

Infrastructure -> Clients:

- device registration endpoint,
- VoIP payload contract,
- media join endpoint,
- call accept/decline route names,
- deployed URLs and feature flags.

## Validation Plan

Infrastructure validation:

```bash
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
```

Backend smoke once implemented:

```text
register device
create call request
send APNs sandbox VoIP push in dev
accept call request
create Cloudflare Realtime session
create WebSocket adapters
claim runner with signed token
write call connected event
end call and close adapters
```

Manual device smoke:

```text
iPhone locked
VoIP push received
CallKit displayed
accept call
Cloudflare session joins
runner claim succeeds
end call
call summary appears in durable timeline
```

## Completion Criteria

This infrastructure proposal is complete when:

- state tables/indexes are defined,
- secrets are wired through secure stores,
- API routes and Lambda env/IAM are provisioned,
- delivery worker has APNs normal/VoIP separation,
- Cloudflare Realtime adapter state is persisted in AWS,
- runner claim path is signed and scoped,
- validation and manual-device smoke steps are documented.
