# Agent Harness Workstream

## Mission

Own the runtime that executes agent work: user runners, logical agents, tools,
workspace policy, snapshots, artifacts, approvals, retries, cancellation,
resume, and safe execution.

## Primary Paths

- `services/agent-runtime/`
- future runner/supervisor services
- runtime-facing protocol contracts in `packages/protocol/`
- runtime architecture docs under `docs/adr/` and `docs/roadmap/`

## Current Focus

1. Split short smoke jobs from resident user-runner behavior.
2. Define and implement logical agent state inside a user runner.
3. Add runner inbox, wake timers, wait states, delegation, and approval gates.
4. Add S3 snapshot/restore for runner state and workspaces.
5. Add heartbeat and stale-runner handling.
6. Emit canonical events and artifact records.
7. Keep tool execution scoped by workspace, credential, and approval policy.

Current proposal docs:

- `PROACTIVE_COMMUNICATION_AGENT_INTERFACE_AUDIT.md`
- `LOCAL_DOCKER_ECS_RUNTIME_PLAN.md`
- `TOOL_CATALOG_AND_POLICY_PLAN.md`
- `AGENT_BUILDER_RUNTIME_INTEGRATION_PLAN.md`
- `RUNTIME_WORKFLOW_VISUALS.md`
- `LOCAL_RUNTIME_TESTING_PLAYBOOK.md`
- `RUNTIME_AUTONOMY_AND_EVENT_POLICY.md`
- `RESIDENT_ECS_CONTAINER.md`
- `RESIDENT_RUNNER_PRODUCTION_ROUTING_PLAN.md`
- `AGENT_RUNTIME_NEXT_WORK_AUDIT_2026_05_10.md`

## Must Coordinate With

- Infrastructure for task definitions, environment variables, IAM scope,
  placement, snapshots, and local/ECS runtime boundaries.
- Realtime Streaming for event shape, status updates, progress streaming, and
  replay expectations.
- Clients for artifact metadata, approval UI payloads, generated surface payloads,
  and user-visible runtime states.
- Product Coordination for agent role definitions and demo workflows.

## Do Not Own

- Client rendering.
- Cloud table/index design except runtime-required fields.
- Realtime transport implementation.
- Product docs outside runtime behavior unless behavior changes.

## Required Validation

Use the relevant subset:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
```

When runtime event shapes change, add or update protocol examples and run:

```bash
pnpm contracts:test
```

## Handoff Triggers

Create a handoff when:

- runtime needs new task env vars or permissions,
- runtime emits a new event type,
- clients need to render a new status/artifact/approval shape,
- snapshot storage paths or restore semantics change,
- a tool requires a new credential or approval boundary.
