# Handoff Template
From: Infrastructure
To: Agent Harness
Status: proposed
Date: 2026-05-10
Urgency: high

## Summary

Infrastructure is adding the first user-runner state model tables for ADR 0008: HostNodes, UserRunners, RunnerSnapshots, and AgentInstances. Agent Harness should review the table/index contract before runner supervisor, heartbeat, snapshot, and logical-agent APIs are implemented.

## Why It Matters

The platform direction is one resident runner boundary per user, hosting many logical agents. The state model must match how the harness will heartbeat, recover, snapshot, and report logical agent state before any ECS resident service or local Docker supervisor is built.

## Requested Action

Review the proposed state contract and confirm or amend:

1. Host heartbeat payload fields and status values.
2. UserRunner desiredState/status values and placement fields.
3. Snapshot manifest fields and recovery metadata.
4. AgentInstance status values, wake scheduling fields, and blocked-on metadata.
5. Whether RunnerPlacement and RunnerHeartbeat can remain current-state fields for v0 or need history tables immediately.

## Files Or Contracts Affected

- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/test/user-runner-state.test.ts`
- `docs/adr/0008-user-runner-placement.md`
- `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`

## Expected Output

A short Agent Harness note or patch confirming the v0 runner payload/status contract and listing any schema/index changes needed before Control API handlers or runner supervisors are built.

## Validation Needed

- Review CDK assertion tests for table keys/indexes.
- Confirm harness query patterns are supported without scans.
- If changing table/index shape, run `pnpm --filter @agents-cloud/infra-cdk test` and update the infra handoff/status docs.

## Notes

This handoff intentionally does not request runtime implementation yet. The current infra slice is state tables only; no local supervisor, ECS resident service, runner tokens, or heartbeat API is included.
