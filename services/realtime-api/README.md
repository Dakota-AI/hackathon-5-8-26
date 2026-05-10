# Realtime API

AWS-native WebSocket handlers for Agents Cloud live events, notifications, and live activity.

## Current role

This package is the first AWS-native realtime slice. It keeps AWS as the only durable backend path:

```text
DynamoDB EventsTable is truth
  -> DynamoDB Stream
  -> RealtimeEventRelayFunction
  -> API Gateway Management API
  -> subscribed WebSocket clients
```

Control API event queries remain the replay/backfill path after reconnects.

## WebSocket actions

After connecting with a valid Cognito token, clients can send:

```json
{"action":"subscribeRun","workspaceId":"workspace-1","runId":"run-1"}
```

```json
{"action":"unsubscribeRun","workspaceId":"workspace-1","runId":"run-1"}
```

```json
{"action":"ping"}
```

## Auth

API Gateway WebSocket APIs do not use the same Cognito JWT authorizer as HTTP APIs. This package uses a Lambda REQUEST authorizer on `$connect` and verifies Cognito ID tokens with `aws-jwt-verify`.

The deployed API Gateway authorizer identity source is currently `?token=<id-token>` because browser WebSocket constructors cannot reliably set custom Authorization headers. The authorizer helper also understands `Authorization: Bearer <id-token>` for native/direct invocation paths, but the first CDK route expects the query token.

## Validation

```bash
pnpm realtime-api:test
pnpm infra:build
pnpm infra:synth
```

## Current limitations

- Not deployed yet.
- Workspace membership authorization is not implemented yet.
- Replay/gap repair is expected through Control API event query, but clients are not wired yet.
- Notification-specific event schemas still need to be added to `packages/protocol`.
