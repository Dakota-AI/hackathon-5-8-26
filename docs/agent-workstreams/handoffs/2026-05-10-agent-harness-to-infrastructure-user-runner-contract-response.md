# Handoff Template
From: Agent Harness
To: Infrastructure
Status: proposed
Date: 2026-05-10
Urgency: high

## Summary

Agent Harness reviewed the proposed user-runner state model and can proceed
with pure runtime work against the current `HostNodes`, `UserRunners`,
`RunnerSnapshots`, and `AgentInstances` tables. No separate placement or
heartbeat history table is required for v0.

## Why It Matters

The harness can build resident runner state, wait/resume behavior, and logical
agent scheduling without blocking on backend implementation as long as the v0
state records support heartbeat, wake, snapshot, and status query patterns.

## Requested Action

Keep the current v0 table/index direction unless infrastructure finds a CDK
blocker. When API/env wiring begins, provide these runtime-facing values:

1. `RUNNER_ID`
2. `USER_ID`
3. `WORKSPACE_ID`
4. `CONTROL_API_URL`
5. `RUNNER_TOKEN`
6. `S3_WORKSPACE_PREFIX`
7. `S3_ARTIFACT_PREFIX`
8. `S3_SNAPSHOT_PREFIX`
9. runtime communication endpoint URL or path
10. call claim signing/audience details

Recommended v0 status fields:

```text
HostNode.status:
  online | draining | offline | unhealthy

UserRunner.desiredState:
  running | stopped | draining

UserRunner.status:
  provisioning | restoring | running | draining | stopped | unhealthy | stale

AgentInstance.status:
  idle | planning | running | waiting | sleeping | blocked | failed | archived

AgentWaitState.reason:
  question | approval | call | audio | timer | agent_dependency
```

Recommended v0 current-state fields:

```text
UserRunner:
  runnerId
  userId
  workspaceId
  status
  desiredState
  placementTarget
  hostId
  hostStatus
  lastHeartbeatAt
  updatedAt
  runtimeVersion
  snapshotId

AgentInstance:
  runnerId
  agentId
  userId
  workspaceId
  userStatus
  status
  profileId
  profileVersion
  currentTaskId
  blockedOn
  nextWakeAt
  wakeBucket
  updatedAt
```

## Files Or Contracts Affected

- `infra/cdk/src/stacks/state-stack.ts`
- `infra/cdk/src/test/user-runner-state.test.ts`
- `docs/adr/0008-user-runner-placement.md`
- `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`
- `services/agent-runtime/src/*` in the later adapter slice

## Expected Output

Infrastructure can continue state-table implementation. Agent Harness will start
with in-memory runtime contracts and later wire DynamoDB/Control API adapters
when endpoints and env vars exist.

## Validation Needed

Infrastructure:

```bash
pnpm --filter @agents-cloud/infra-cdk test
pnpm infra:synth
```

Agent Harness later:

```bash
pnpm agent-runtime:test
pnpm agent-runtime:build
```

## Notes

Agent Harness does not need placement history for v0. Current-state records plus
CloudWatch/DynamoDB streams are enough until operational evidence proves a
history table is required.
