# AWS-Native Realtime WebSocket Implementation Plan

> **For Hermes:** Use test-driven-development for handler behavior and CDK synth checks for infrastructure.

**Goal:** Add the first AWS-native realtime streaming layer for run events, notifications, and live activity while keeping DynamoDB/Control API as durable truth.

**Architecture:** API Gateway WebSocket handles live client connections. A DynamoDB `RealtimeConnectionsTable` stores connection/subscription metadata. A Lambda REQUEST authorizer validates Cognito JWTs on `$connect`. Route handlers support connect, disconnect, subscribe, unsubscribe, and ping. A DynamoDB Streams relay Lambda reads new event rows from the authoritative events table and publishes them to subscribed WebSocket connections via the API Gateway Management API. Control API event queries remain the replay/backfill path.

**Tech Stack:** AWS CDK v2 TypeScript, API Gateway WebSocket API, Lambda Node.js 22, DynamoDB, DynamoDB Streams, Cognito JWT verification, AWS SDK v3.

---

## Research notes

Current AWS docs and examples support this approach:

- API Gateway WebSocket APIs use `$connect`, `$disconnect`, `$default`, and custom routes selected by `$request.body.action`.
- WebSocket auth happens at `$connect`; API Gateway WebSocket APIs use Lambda REQUEST authorizers rather than the HTTP API Cognito JWT authorizer.
- `$connect` is the right place to validate tokens and store connection IDs.
- `$disconnect` is best-effort, so stale connections must also be cleaned up when `PostToConnection` returns gone.
- Backend services push messages using the API Gateway Management API `PostToConnection` operation.
- DynamoDB Streams are a standard way to broadcast table changes to WebSocket clients.

## Simplifying constraints

- Do not add AppSync.
- Do not deploy Cloudflare yet.
- Keep Amplify as Auth/Hosting only.
- Keep Control API as durable command/query API.
- Keep WebSocket as live enhancement; replay comes from Control API.
- Do not introduce workspace authorization beyond current owner/user checks in this first slice; document the gap.

## First slice acceptance criteria

- CDK creates a WebSocket API and stage.
- CDK creates a realtime connections/subscriptions table.
- CDK enables streams on the authoritative events table.
- CDK wires a stream relay Lambda from EventsTable stream to WebSocket connections.
- CDK grants `execute-api:ManageConnections` to the relay/default handler.
- Unit tests cover token extraction, subscribe/unsubscribe connection table mutations, event-to-message conversion, and stale connection cleanup behavior.
- `pnpm realtime-api:test`, `pnpm infra:build`, and `pnpm infra:synth` pass.

## Implementation tasks

### Task 1: Create realtime-api workspace package

Files:

- Create `services/realtime-api/package.json`
- Create `services/realtime-api/tsconfig.json`
- Add root scripts in `package.json`

Expected scripts:

- `realtime-api:build`
- `realtime-api:test`

### Task 2: Add realtime handler ports and store tests

Files:

- Create `services/realtime-api/src/ports.ts`
- Create `services/realtime-api/src/subscriptions.ts`
- Create `services/realtime-api/test/subscriptions.test.ts`

Behavior:

- Save connection metadata on connect.
- Delete connection on disconnect.
- Subscribe connection to `run:<workspaceId>:<runId>`.
- Unsubscribe from the same topic.
- Query connections by topic.

### Task 3: Add WebSocket route handlers

Files:

- Create `services/realtime-api/src/handlers.ts`
- Create `services/realtime-api/test/handlers.test.ts`

Routes:

- `$connect`: persist connection from authorizer context.
- `$disconnect`: remove connection.
- `$default`: parse JSON body and dispatch actions:
  - `subscribeRun`
  - `unsubscribeRun`
  - `ping`

### Task 4: Add Cognito Lambda authorizer

Files:

- Create `services/realtime-api/src/auth.ts`
- Create `services/realtime-api/test/auth.test.ts`

Behavior:

- Extract bearer token from Authorization header or `token` query param.
- Deny missing token.
- Verify Cognito JWT using configured pool/client through `aws-jwt-verify`.
- Return IAM policy with context: `userId`, `email`.

### Task 5: Add relay publisher

Files:

- Create `services/realtime-api/src/relay.ts`
- Create `services/realtime-api/test/relay.test.ts`

Behavior:

- Convert DynamoDB stream INSERT/MODIFY records into canonical client messages.
- Compute topic `run:<workspaceId>:<runId>`.
- Query subscribed connections.
- Post JSON to each connection.
- Delete stale connections on Gone/410 errors.

### Task 6: Add RealtimeApiStack

Files:

- Modify `infra/cdk/src/stacks/state-stack.ts`
- Create `infra/cdk/src/stacks/realtime-api-stack.ts`
- Modify `infra/cdk/src/bin/agents-cloud-cdk.ts`

Resources:

- `RealtimeConnectionsTable`
- WebSocket API: `agents-cloud-dev-realtime-api`
- stage: env name, e.g. `dev`
- Lambda authorizer function
- connect/disconnect/default functions
- stream relay function
- event source mapping from EventsTable stream
- outputs for WebSocket URL and callback URL

### Task 7: Documentation and validation

Files:

- Update `docs/roadmap/PROJECT_STATUS.md`
- Update `docs/IMPLEMENTATION_READINESS_AUDIT.md`
- Update `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
- Update `infra/cdk/README.md`

Validation:

- `pnpm realtime-api:test`
- `pnpm contracts:test`
- `pnpm infra:build`
- `pnpm infra:synth`

## Future follow-up after this slice

- Authenticated browser/native smoke test with real Cognito token.
- Custom domain for WebSocket endpoint, likely `realtime.solo-ceo.ai`, if AWS route is chosen.
- Workspace membership authorization.
- Replay/gap repair protocol in clients using `GET /runs/{runId}/events?afterSeq=`.
- Dedicated notification event schemas.
- Client libraries for web and Flutter.
