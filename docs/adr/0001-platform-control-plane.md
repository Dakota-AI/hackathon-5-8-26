# ADR 0001: Platform Control Plane

Date: 2026-05-09
Status: Accepted

## Context

The platform must run autonomous agent teams 24/7, survive client disconnects, support human approvals, recover from worker failure, archive artifacts, and coordinate isolated ECS containers.

An in-memory agent framework or WebSocket session cannot be the source of truth for run state.

## Decision

Use AWS as the durable control plane:

- DynamoDB stores authoritative run, task, event, artifact, and approval records.
- Step Functions orchestrates durable run lifecycles and ECS task callbacks.
- EventBridge and SQS move durable backend events.
- ECS runs actual agent, coding, builder, eval, and preview workloads.
- S3 stores durable workspace artifacts and audit archives.

Cloudflare owns realtime client fanout only. It must not own durable run truth.

## Consequences

- Runs continue if web, Flutter, or WebSocket sessions disconnect.
- Long-running ECS work can report back through task tokens or durable callbacks.
- Approval state can survive process death.
- Implementation requires clear event schemas and idempotency from the start.
