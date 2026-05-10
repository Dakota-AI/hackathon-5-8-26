# Agent Runtime

Hermes-backed ECS worker runtime for Agents Cloud runs.

The package is intentionally small: Step Functions launches the Fargate task with
run context in environment variables, the worker executes a Hermes runner surface,
then writes durable status/events/artifacts back to AWS.

## Runtime contract

Required environment variables:

- `RUN_ID`
- `TASK_ID`
- `WORKSPACE_ID`
- `USER_ID`
- `OBJECTIVE`
- `RUNS_TABLE_NAME`
- `TASKS_TABLE_NAME`
- `EVENTS_TABLE_NAME`
- `ARTIFACTS_TABLE_NAME`
- `ARTIFACTS_BUCKET_NAME`

Optional:

- `HERMES_RUNNER_MODE=smoke|cli`
- `HERMES_COMMAND=hermes`
- `HERMES_TIMEOUT_MS=300000`

## Current deployed behavior

The dev ECS task currently defaults to `HERMES_RUNNER_MODE=smoke`. This still uses
the Hermes runner boundary in code, but avoids attaching model/provider secrets
before the worker IAM, artifact, and event path is proven.

Smoke mode verifies the durable lifecycle:

1. Write `run.status/running` to DynamoDB events.
2. Execute the Hermes runner interface.
3. Write a markdown report to the live artifacts S3 bucket.
4. Write artifact metadata to DynamoDB.
5. Write `artifact.created` and terminal `run.status/succeeded` events.
6. Update run/task rows to `succeeded` or `failed`.
7. Emit a structured CloudWatch log line with run/task/workspace correlation.

`HERMES_RUNNER_MODE=cli` is implemented for the package, but the production image
must be switched to a Hermes-enabled base image or layer before enabling it in
ECS. Provider secrets/session policy still need a scoped broker; do not bake
secrets into the image.

## Validation

```bash
pnpm agent-runtime:test
pnpm infra:build
pnpm infra:synth
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
```

## Active WIP: Docker Build Context

The latest runtime code imports `@agents-cloud/protocol` so runtime events can
use the shared canonical event builders. Local TypeScript builds pass, but the
2026-05-10 CDK deploy exposed a Docker build-context issue: the runtime image did
not include the `packages/protocol` workspace package, and `.dockerignore`
excluded `packages/` from the image build context.

Observed deploy failure:

```text
src/ports.ts: Cannot find module '@agents-cloud/protocol'
src/worker.ts: Cannot find module '@agents-cloud/protocol'
Failed to build asset AgentRuntimeImage
```

Current local WIP files for the fix:

- `.dockerignore`
- `services/agent-runtime/Dockerfile`

Before redeploying runtime, verify the image explicitly:

```bash
docker build --platform linux/amd64 \
  -f services/agent-runtime/Dockerfile \
  -t agents-cloud-agent-runtime:verify .
```

Only after that passes should the CDK runtime/control/realtime deploy be resumed.

Deployed smoke evidence from 2026-05-10:

- Step Functions execution: `run-hermes-ecs-smoke-1778376731`
- State machine status: `SUCCEEDED`
- ECS task definition family/revision: `agents-cloud-dev-agent-runtime:6`
- Events written: canonical `run.status/running`, `artifact.created`, `run.status/succeeded`
- Artifact written: `s3://agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m/workspaces/workspace-smoke/runs/run-hermes-ecs-smoke-1778376731/artifacts/artifact-0001/hermes-report.md`

Current local implementation hardening after the audit:

- Worker events are built through `@agents-cloud/protocol` helpers and include canonical envelope fields.
- Artifact events use protocol `kind: "report"` and `name`, not the earlier smoke-only `kind: "hermes-report"` / `title` shape.
- Artifact ids are deterministic per task attempt (`artifact-<taskId>-0001`) instead of the globally fixed `artifact-0001`.
- DynamoDB event and artifact metadata writes use conditional expressions so duplicate writes fail instead of silently overwriting ledger entries.
