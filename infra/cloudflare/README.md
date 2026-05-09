# Cloudflare

Cloudflare realtime plane placeholder.

Implement either raw Durable Objects or Cloudflare Agents SDK wrappers for:

- `UserHubDO`
- `WorkspaceDO`
- `SessionDO`
- `NotificationDO`
- `RateLimiterDO`

Rules:

- Cloudflare is realtime coordination, not long-running compute.
- Durable Objects hold hot state and replay cursors.
- DynamoDB/S3 remain the authoritative run and event ledger.
- Queues carry small at-least-once command envelopes with idempotency keys.
