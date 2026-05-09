# Event Relay

AWS-to-Cloudflare event relay placeholder.

Responsibilities:

- Read authoritative run/task events from EventBridge, SQS, DynamoDB Streams, or API calls.
- Convert to canonical event envelopes.
- Push small hot events to Cloudflare Durable Objects.
- Store or reference large payloads in S3.
- Preserve idempotency and sequence handling.
