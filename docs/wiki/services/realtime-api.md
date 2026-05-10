# realtime-api

[← services](README.md) · [wiki index](../README.md) · related: [RealtimeApiStack](../infrastructure/stacks.md#realtimeapistack), [run-creation flow](../flows/run-creation.md)

> AWS-native WebSocket API. Connections are JWT-authorized via API Gateway Lambda authorizer. DynamoDB Streams from `EventsTable` are relayed to subscribed clients with userId-filtered fanout.

**Maturity:** ✅ production-shaped.
**Source:** `services/realtime-api/src/`
**Tests:** 4 files
**Deployment:** [RealtimeApiStack](../infrastructure/stacks.md#realtimeapistack)
**Live URL:** `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`

---

## Source layout

```
services/realtime-api/src/
├── auth.ts            # Lambda REQUEST authorizer (Cognito JWT verify)
├── handlers.ts        # $connect / $disconnect / $default
├── relay.ts           # DDB Stream → postToConnection broadcaster
├── subscriptions.ts   # RealtimeConnections DDB store
└── env.ts             # Env var validation
```

---

## Connection lifecycle

### `$connect`

1. **Authorizer** (`auth.ts:30`) — `WebSocketLambdaAuthorizer` configured with `identitySource: route.request.querystring.token`. Uses `aws-jwt-verify` against Cognito issuer + audience. On success returns IAM allow with `context.userId = claims.sub`.
2. **Connect handler** (`handlers.ts:33`) — writes `RealtimeConnection` row keyed `pk=CONN#{connectionId}, sk=META`, including `userId, email, domainName, stage, connectedAt`. Rejects 401 if no `userId` in authorizer context.

### `$default subscribeRun`

1. Receive payload `{action: "subscribeRun", workspaceId, runId}` (`handlers.ts:75-83`).
2. Write topic-fanout row: `pk=TOPIC#run:{workspaceId}:{runId}, sk=CONN#{connectionId}` carrying `userId, connectedAt`.
3. ⚠️ **Does not verify the user owns the run.** Mitigated only by relay-side `userId` filter on event delivery.

### `$default unsubscribeRun`
Removes the topic row.

### `$disconnect`
Removes META + all topic subscriptions for the connection.

---

## Stream relay

`relay.ts:7-99`. `DynamoEventSource` triggers the relay Lambda from EventsTable Stream:
- `startingPosition: LATEST` — reconnecting clients **don't** get historical events. Web client polls `GET /runs/{runId}/events?afterSeq=...` for backfill.
- `batchSize: 25`
- `retryAttempts: 3`

**Per record:**
1. Validate via `isRealtimeEventRecord(unmarshall(NEW_IMAGE))`. Malformed → drop.
2. `listConnectionsForRun(workspaceId, runId)` → query `pk=TOPIC#run:{workspaceId}:{runId}`.
3. **Filter:** `connections.filter(c => !event.userId || c.userId === event.userId)`.
   - Events from `worker.ts` always include `userId`, so cross-user delivery is prevented.
   - Events without `userId` would broadcast to every subscriber (currently no producer omits userId).
4. `postToConnection` via API Gateway Management API. On `GoneException` → cleanup connection row.

---

## Authentication

| Layer | Mechanism | File |
|---|---|---|
| WebSocket connect | `aws-jwt-verify` Cognito ID token from `?token=` | auth.ts:30 |
| Pin userId | claims.sub stored on connection row | handlers.ts:33 |
| Subscribe run | userId added to topic row | handlers.ts:75 |
| Fan-out filter | `conn.userId === event.userId` | relay.ts:25 |

⚠️ Token in URL query string is logged by API Gateway access logs. Acceptable for hackathon; production would prefer header-based auth.

---

## Authorization gap

**`subscribeRun` does not check ownership.** A user can call `subscribeRun` with any `(workspaceId, runId)` they know — they just won't receive any events because the relay's userId filter drops cross-tenant deliveries.

**Hackathon impact:** none, because runIds are unguessable UUIDs and the relay filter catches it. **To harden:** add a pre-subscription read of the Run row owner in `handlers.ts:75-83`.

---

## Tests

| File | What it exercises |
|---|---|
| `auth.test.ts` | JWT verification, userId extraction |
| `handlers.test.ts` | Connect/disconnect/subscribe lifecycle |
| `relay.test.ts` | Stream record validation, fanout, GoneException cleanup |
| `worker.test.ts` (or similar) | End-to-end smoke at protocol level |

Run: `pnpm realtime-api:test`.

There's also a real wss:// e2e smoke (per `PROJECT_STATUS.md` 2026-05-10) using a temporary Cognito user.

---

## What's wired vs missing — checklist

### Wired
- [x] Cognito JWT verification at `$connect`
- [x] userId pinned to connection row
- [x] `subscribeRun` / `unsubscribeRun` actions
- [x] DDB Stream → relay Lambda → `postToConnection`
- [x] Stale-connection cleanup on `GoneException`
- [x] Cross-user fanout filter via `conn.userId === event.userId`
- [x] Real wss:// e2e smoke

### Missing for hackathon
- [ ] `subscribeRun` ownership check (low severity — runIds are UUIDs)
- [ ] Replay / cursor / gap detection (web compensates with polling backfill)
- [ ] `subscribeWorkspace` topic for cross-run user dashboards (not built)

### Skip for hackathon
- 🗑️ Cloudflare fanout — keep AWS-native only

---

## Hackathon-relevant notes

- ✅ Multi-user safe at hackathon scale. `RealtimeConnections` is PAY_PER_REQUEST. No connection cap.
- ✅ Web client at `apps/web/lib/realtime-client.ts` already subscribes correctly.
- ❌ Flutter has no WebSocket client. See [flutter.md](../clients/flutter.md).

[→ run-creation flow](../flows/run-creation.md)
