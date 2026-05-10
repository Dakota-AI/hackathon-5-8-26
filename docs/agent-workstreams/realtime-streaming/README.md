# Realtime Streaming Workstream

## Mission

Own live event delivery, subscription authorization, replay, cursors, streaming
status, and fanout from durable AWS state to connected clients.

AWS-native API Gateway WebSocket realtime is the primary implementation path for
the current phase. Cloudflare Durable Objects stay as an alternate/fallback edge
plane until their auth, envelope, replay, and client behavior match the AWS
contract.

## Primary Paths

- `infra/cloudflare/realtime/`
- `services/realtime-api/`
- realtime-facing code in `services/control-api/`
- event contracts in `packages/protocol/`
- realtime docs under `docs/adr/` and `docs/roadmap/`

## Current Focus

1. Connect durable AWS run/work events to realtime fanout.
2. Enforce workspace membership before subscription.
3. Define cursor and replay behavior from durable event storage.
4. Support reconnect and missed-event recovery.
5. Standardize stream progress events for clients.
6. Add metrics for connections, subscriptions, dropped events, replay misses,
   and authorization failures.

## Current Audit Findings

P0/P1 gaps found on 2026-05-10:

- `$connect` validates a Cognito token, but `subscribeRun` must load the run and
  authorize `run:read` against the stored workspace before saving the
  subscription.
- The current WebSocket URL passes the Cognito token in the query string. The
  safer target is a short-lived Control API-issued realtime ticket scoped to a
  run/workspace and capability.
- AWS and Cloudflare realtime envelopes are different today. Clients need one
  adapter/parser contract before Cloudflare can be called a fallback.
- Replay/gap repair should use durable Control API event queries, not in-memory
  socket state.

## Must Coordinate With

- Infrastructure for stream sources, relay permissions, deployment outputs, and
  environment variables.
- Clients for websocket protocol, reconnect behavior, optimistic UI, and replay
  rendering.
- Agent Harness for event volume, event type shape, progress updates, and
  long-running work semantics.
- Product Coordination for user-visible status and notification boundaries.

## Do Not Own

- Durable business records.
- Client visual design.
- Runtime tool execution.
- Cloud table design except indexes needed for replay.

## Required Validation

Use the relevant subset:

```bash
pnpm realtime-api:test
pnpm realtime-api:build
pnpm cloudflare:test
pnpm cloudflare:build
pnpm contracts:test
```

When subscription or replay contracts change, add protocol examples and client
fixture notes.

## Handoff Triggers

Create a handoff when:

- clients need new reconnect/replay behavior,
- authorization requires new membership data,
- event payloads are missing fields for streaming UI,
- infrastructure needs to wire a stream, queue, route, or secret,
- runtime event volume requires batching or throttling.
