# ADR 0003: Realtime Plane

Date: 2026-05-09
Status: Accepted

## Context

The platform needs synchronized desktop, mobile, and web clients with live messages, run status, approvals, notifications, and generated UI.

Cloudflare Durable Objects are a strong fit for low-latency WebSocket coordination, but they are single-threaded per object and should not be the permanent event store.

## Decision

Use Cloudflare Workers plus Durable Objects or Cloudflare Agents SDK for realtime sync:

- `UserHubDO` for user/device session fanout.
- `WorkspaceDO` for workspace presence and hot state.
- `SessionDO` for run/session WebSocket fanout and replay cursors.
- `NotificationDO` for notification coalescing and push fanout.
- `RateLimiterDO` for edge-side throttles.

Use AWS DynamoDB/S3 as the authoritative ordered event ledger.

Use Cloudflare Queues only for small at-least-once command envelopes and notification work.

## Consequences

- Clients get low-latency sync.
- Event truth stays recoverable from AWS.
- Queue messages require idempotency keys and cannot assume ordering.
- Large payloads must be stored in S3 and referenced by pointer.
