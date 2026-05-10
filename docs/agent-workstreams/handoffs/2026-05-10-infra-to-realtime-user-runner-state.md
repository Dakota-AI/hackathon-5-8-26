# Handoff Template
From: Infrastructure
To: Realtime Streaming
Status: proposed
Date: 2026-05-10
Urgency: medium

## Summary

Infrastructure is adding user-runner state tables for HostNodes, UserRunners, RunnerSnapshots, and AgentInstances. Realtime Streaming should decide how runner operational state should be fanned out without confusing durable user work events.

## Why It Matters

Admin and client surfaces will need to know whether a user's resident runner is online, stale, restoring, or failed. The system also needs to preserve AWS as durable truth while avoiding noisy heartbeat events in the canonical run ledger unless explicitly modeled.

## Requested Action

Confirm the v0 realtime approach for runner state:

1. Should runner heartbeat/status changes become canonical EventsTable records, separate operational messages, or both?
2. What replay cursor semantics should clients/admin use for runner operational state?
3. What metrics/alarms are needed for dropped runner status relay batches or stale connections?
4. Should AgentInstance state changes be streamed immediately or queried on demand for v0?

## Files Or Contracts Affected

- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/test/user-runner-state.test.ts`
- `infra/cdk/src/stacks/realtime-api-stack.ts`
- `infra/cloudflare/realtime`
- `packages/protocol/src/events.ts` if runner status becomes canonical event payloads

## Expected Output

A short Realtime Streaming note or patch defining runner operational message ownership, replay behavior, and whether protocol schemas need extension before Control API or runner heartbeat APIs are built.

## Validation Needed

- If protocol event types are added, run `pnpm contracts:test`.
- If realtime infra changes are made, run `pnpm cloudflare:test` or the relevant realtime package tests.
- Preserve AWS durable state as source of truth; Cloudflare remains fanout/sync only.

## Notes

Infrastructure's current v0 table slice stores current heartbeat/placement fields but does not emit realtime runner status messages yet.
