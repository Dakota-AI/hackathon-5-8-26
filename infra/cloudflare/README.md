# Agents Cloud Cloudflare Realtime Plane

This directory now contains the first serverless WebSocket/Durable Object package
for Agents Cloud.

## Current implementation

Package:

```text
infra/cloudflare/realtime
```

Implemented:

- `GET /health`
- `GET /ws` WebSocket entrypoint
- Cognito JWT validation helpers
- internal AWS event relay endpoint: `POST /internal/events`
- canonical realtime event validation
- `UserHubDO` for user/device hot sockets
- `SessionHubDO` for run-scoped fanout
- `WorkspaceHubDO` shell for workspace presence/hot state
- Wrangler config for `realtime.solo-ceo.ai/*`
- node:test coverage for protocol, auth helpers, and Worker routing

Not implemented yet:

- deployed Cloudflare Worker route
- DNS record for `realtime.solo-ceo.ai`
- AWS event relay Lambda/queue integration
- client WebSocket integration in web/desktop/mobile
- durable replay from DynamoDB cursors after reconnect
- `NotificationDO` and `RateLimiterDO` dedicated implementations

## Architecture boundary

Cloudflare is realtime fanout only. It is not the source of truth.

```text
Clients
  -> wss://realtime.solo-ceo.ai/ws
  -> Cloudflare Worker
  -> Durable Object hot fanout

AWS Control API / ECS workers
  -> DynamoDB authoritative event ledger
  -> EventBridge/SQS/Lambda relay, later
  -> POST /internal/events
  -> SessionHubDO broadcast
```

The authoritative run/event/artifact state remains in AWS:

- DynamoDB runs/tasks/events/artifacts/approvals tables
- S3 artifact buckets
- Step Functions
- ECS workers

## Package commands

From repo root:

```bash
pnpm cloudflare:build
pnpm cloudflare:test
pnpm cloudflare:dev
pnpm cloudflare:deploy
pnpm cloudflare:tail
```

Package-local equivalents:

```bash
pnpm --filter @agents-cloud/cloudflare-realtime run build
pnpm --filter @agents-cloud/cloudflare-realtime run test
pnpm --filter @agents-cloud/cloudflare-realtime run dev
pnpm --filter @agents-cloud/cloudflare-realtime run deploy
```

## Current Cognito config

The Worker is configured to validate JWTs from the current Amplify Auth sandbox:

```text
User pool: us-east-1_1UeU1hTME
App client: 3kq79rodc3ofjkulh0b31sfpos
Issuer: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_1UeU1hTME
JWKS: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_1UeU1hTME/.well-known/jwks.json
```

These values are in `infra/cloudflare/realtime/wrangler.toml` as non-secret
configuration.

## Required Cloudflare setup

Before deploy, authenticate Wrangler to the Cloudflare account that owns
`solo-ceo.ai`:

```bash
pnpm --filter @agents-cloud/cloudflare-realtime exec wrangler login
```

Set the relay secret. Generate a real value and store the same value later in AWS
Secrets Manager or Lambda environment for the AWS relay service:

```bash
openssl rand -base64 32
pnpm --filter @agents-cloud/cloudflare-realtime exec wrangler secret put RELAY_SHARED_SECRET
```

Deploy:

```bash
pnpm cloudflare:deploy
```

Cloudflare DNS should have a proxied record for the route host:

```text
Type: CNAME or A
Name: realtime
Target: can be 192.0.2.1 for Worker routes or a Workers custom domain target
Proxy: Proxied / orange cloud
```

For Workers routes, the important part is that the hostname exists in the
Cloudflare zone and is proxied so Cloudflare can route `realtime.solo-ceo.ai/*`
to the Worker.

## Runtime endpoints

Health:

```bash
curl https://realtime.solo-ceo.ai/health
```

Client WebSocket:

```text
wss://realtime.solo-ceo.ai/ws?token=<cognito-jwt>&workspaceId=<workspace-id>&runId=<run-id>&client=web
```

If `runId` is present, the socket is attached to a run-scoped `SessionHubDO`.
If `runId` is omitted, the socket is attached to user-scoped `UserHubDO`.

Internal AWS event relay endpoint:

```bash
curl -X POST https://realtime.solo-ceo.ai/internal/events \
  -H 'content-type: application/json' \
  -H 'x-agents-cloud-relay-secret: <secret>' \
  --data '{
    "eventId":"evt-1",
    "runId":"run-123",
    "workspaceId":"workspace-abc",
    "seq":1,
    "type":"run.status",
    "payload":{"status":"running"},
    "createdAt":"2026-05-10T00:00:00.000Z"
  }'
```

This endpoint validates the event envelope and routes it to:

```text
SessionHubDO name = <workspaceId>:<runId>
```
