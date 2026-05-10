# Handoff: Local Docker And ECS User-Runner Runtime Contract

From: Agent Harness
To: Infrastructure
Status: proposed
Date: 2026-05-10
Urgency: medium

## Summary

Agent Harness needs the local Docker resident runner and ECS resident runner to
share one environment, secret, mount, heartbeat, snapshot, and health contract.
This lets runtime code be developed locally while still matching ECS behavior.

## Why It Matters

The current `services/agent-runtime` image builds, but it is a one-shot root
smoke worker with AWS sinks. Resident user runners need stable placement,
identity, scoped credentials, snapshots, and health semantics before the
runtime can safely support long-running logical agents.

## Requested Action

Please review the proposed contract in:

```text
docs/agent-workstreams/agent-harness/LOCAL_DOCKER_ECS_RUNTIME_PLAN.md
```

Confirm or adjust:

- required runner env vars,
- runner token delivery method,
- task role permissions,
- profile/artifact/snapshot S3 prefixes,
- heartbeat endpoint/table fields,
- health check command/endpoint expectations,
- resource limits for light/code/builder/eval worker classes,
- whether ECS metadata is required by runtime code or only optional telemetry.

## Files Or Contracts Affected

- `services/agent-runtime/Dockerfile`
- future resident runner task definition
- user runner state tables
- runner snapshot S3 prefixes
- task role IAM policies
- local Docker/Compose developer contract

## Expected Output

Infrastructure should produce or update docs for:

- final ECS task env vars,
- task secrets and secret file names,
- runtime IAM permissions,
- heartbeat/stale-runner behavior,
- snapshot/artifact/profile bundle prefixes,
- local ECS-emulation launch command or Compose shape.

## Validation Needed

When infrastructure wires the contract, request:

```bash
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
```

Agent Harness will validate runtime behavior with:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
```

## Notes

Agent Harness does not need Infrastructure to block on every future feature.
The immediate need is enough stability to implement local `resident-dev` and
future `ecs-resident` modes against the same contract.

