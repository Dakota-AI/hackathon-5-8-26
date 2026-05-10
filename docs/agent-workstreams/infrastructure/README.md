# Infrastructure Workstream

## Mission

Own the durable cloud and deployment architecture: state, storage, compute,
networking, orchestration, auth infrastructure, local/ECS runner placement, and
operational safety.

## Primary Paths

- `infra/cdk/`
- `infra/amplify/`
- deployment scripts under `scripts/`
- infrastructure docs under `docs/adr/` and `docs/roadmap/`
- runtime deployment contract touchpoints in `services/agent-runtime/`
- Control API deployment contract touchpoints in `services/control-api/`

## Current Focus

1. Keep CDK asset staging safe and minimal.
2. Finish infrastructure support for WorkItems, artifacts, data sources, and
   generated surfaces.
3. Add user-runner state tables and indexes.
4. Add local host placement records.
5. Add ECS Fargate user-runner service/task definitions.
6. Add scoped task roles and runtime environment variables.
7. Add alarms and metrics for failed runs, stale runners, failed snapshots, and
   high error rates.

## Required Planning File

Maintain:

```text
docs/agent-workstreams/infrastructure/CURRENT_PLAN.md
```

Before changing implementation files, update that plan with current state, gaps,
risks, expected files, handoffs, validation, and completion criteria. Other
agents use this file to understand what infrastructure is changing and what
contracts they should expect.

## Must Coordinate With

- Agent Harness for task env vars, runner token shape, snapshot prefixes, and
  worker/container lifecycle.
- Realtime Streaming for event relay permissions, stream sources, and replay
  contracts.
- Clients for deployed URLs, auth outputs, preview URLs, and feature flags.
- Product Coordination for ADR changes and rollout sequence.

## Do Not Own

- Client UI implementation.
- Agent planning/tool behavior inside the runtime.
- Product copy and interaction design except when infrastructure constraints
  affect it.

## Required Validation

Use the relevant subset:

```bash
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

When changing deployment assets, also verify:

```bash
find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research' -o -name '.vibecode' \) -print
du -sh infra/cdk/cdk.out
```

Expected result: no sensitive/local path matches and a small generated output.

## Handoff Triggers

Create a handoff when:

- a new table/index changes API query patterns,
- a task environment variable changes runtime behavior,
- a role/policy change affects runtime or client capabilities,
- a deployment output changes a client configuration,
- an infrastructure constraint changes product scope.
