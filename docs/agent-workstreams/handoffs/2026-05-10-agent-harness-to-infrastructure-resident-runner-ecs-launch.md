# Resident Runner ECS Launch Handoff

From: Agent Harness
To: Infrastructure
Status: proposed
Date: 2026-05-10
Urgency: high

## Summary

Agent Harness added a separate ECS-shaped resident runner container and CDK task
definition. Infrastructure now needs to wire task launch, scoped secrets,
snapshot prefixes, and task-to-Control API access before this can be used for
production tenant testing.

## Why It Matters

The resident runner is the long-lived agent execution layer. Without explicit
launch and credential boundaries, it would either remain a local-only test
server or risk receiving broad credentials that arbitrary agent tools could
misuse.

## Requested Action

Implement the launch and runtime environment for the `resident-runner` task:

- start resident runner ECS tasks from the user-runner placement flow,
- inject per-task `ORG_ID`, `USER_ID`, `WORKSPACE_ID`, `RUNNER_ID`, and
  `RUNNER_SESSION_ID`,
- provide a task-scoped `RUNNER_API_TOKEN` or signed local caller identity,
- provide Secrets Manager references for provider credentials rather than raw
  keys where possible,
- define S3 prefixes for runner snapshots, workspace state, logs, and artifacts,
- decide whether Control API calls the runner HTTP API directly, through a
  private service discovery name, or through an internal command channel,
- add heartbeat/stale-runner writes for `UserRunners`,
- confirm whether the resident task needs an internal security group ingress
  rule for port `8787` or a non-HTTP command channel instead.

## Files Or Contracts Affected

- `services/agent-runtime/Dockerfile.resident`
- `services/agent-runtime/src/resident-runner-server.ts`
- `infra/cdk/src/stacks/runtime-stack.ts`
- `UserRunnersTable`
- `RunnerSnapshotsTable`
- `AgentInstancesTable`
- workspace artifacts S3 bucket

## Expected Output

- A non-prod path can launch one resident runner ECS task for a tenant/workspace.
- The task receives only scoped env vars and secret references.
- The task heartbeat is visible in `UserRunnersTable`.
- Snapshot/artifact prefixes are documented and writable by the task role.
- Control API or orchestration has a documented way to wake the runner.

## Validation Needed

Run:

```bash
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
```

Then launch one non-prod resident task and verify:

- `/health` responds only to the scoped token or internal caller,
- `/wake` creates a heartbeat report,
- events and artifacts are durably written once the runtime adapters are wired,
- stale runner behavior is visible after heartbeat timeout.

## Notes

The resident image currently defaults to `AGENTS_RESIDENT_ADAPTER=smoke`.
`AGENTS_RESIDENT_ADAPTER=hermes-cli` is wired in runtime code but requires a
future Hermes-enabled image layer and provider credential injection.

The Hermes adapter child process receives an allowlisted environment. AWS task
credentials, table names, bucket names, and `RUNNER_API_TOKEN` are intentionally
not passed to agent code. Raw provider keys require the explicit
`AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT=1` trusted-runner opt-in.

Do not pass public ChatGPT/Codex OAuth refresh tokens into arbitrary
multi-tenant task env. Production default should be API key, provider service
account, or brokered credential references until the OAuth/session policy is
approved.
