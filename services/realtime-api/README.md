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

Deployed dev stack:

- Stack: `agents-cloud-dev-realtime-api`
- WebSocket URL: `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`
- Callback URL for API Gateway Management API: `https://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`

2026-05-10 deployed smoke evidence:

- Missing-token authorizer invocation returned a Deny policy.
- Connect/default/disconnect Lambda invocations saved a connection, subscribed to `run-idem-191fa7003b2441188aa1ebbc`, returned `pong`, and removed the connection.
- Direct relay invocation against a malformed stored connection id returned success after deleting the stale/fake connection.
- Regression test covers both `GoneException`/410 and API Gateway `BadRequestException: Invalid connectionId` stale-connection cleanup.

## Current limitations

- Browser/native WebSocket smoke with a real Cognito ID token is still pending.
- Workspace membership authorization is not implemented yet.
- Replay/gap repair is expected through Control API event query, but clients are not wired yet.
- Notification-specific event schemas still need to be added to `packages/protocol`.
