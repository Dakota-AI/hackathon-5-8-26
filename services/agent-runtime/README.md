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

The separate resident user-runner task definition now uses
`services/agent-runtime/Dockerfile.resident`, which is based on
`nousresearch/hermes-agent:latest` and defaults to
`AGENTS_RESIDENT_ADAPTER=hermes-cli`. The dev resident runner receives
`RUNNER_API_TOKEN` and `HERMES_AUTH_JSON_BOOTSTRAP` through Secrets Manager,
writes `$HERMES_HOME/auth.json` at container startup, and invokes
`/opt/hermes/.venv/bin/hermes` from the resident `/wake` path. The latest live
ECS exercise reached the OpenAI Codex backend but failed on provider quota
(`HTTP 429 usage_limit_reached`).

Resident Hermes subprocesses also receive the `agents-cloud-user` CLI. It posts
to the local resident-runner API and records durable `user.notification.requested`
or `user.call.requested` events for the active run:

```bash
agents-cloud-user notify --body "I need a decision on the deployment."
agents-cloud-user call --summary "Discuss the blocked deployment."
```

Those events are ledger/realtime-ready. Native APNS banner and VoIP delivery
still require the device-token table and APNS sender wiring.

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

## Deployed smoke evidence

Latest deployed audit smoke from 2026-05-10:

- Control API-created run: `run-idem-191fa7003b2441188aa1ebbc`
- State machine status: `SUCCEEDED`
- ECS task definition family/revision: `agents-cloud-dev-agent-runtime:7`
- Events written: canonical `run.status/queued`, `run.status/running`, `artifact.created`, `run.status/succeeded`
- Duplicate create-run smoke with the same idempotency key returned the existing run and event count remained `4`.
- Artifact written: `s3://agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m/workspaces/workspace-audit-smoke/runs/run-idem-191fa7003b2441188aa1ebbc/artifacts/artifact-task-idem-191fa7003b2441188aa1ebbc-0001/hermes-report.md`

Current implementation hardening after the audit:

- Worker events are built through `@agents-cloud/protocol` helpers and include canonical envelope fields.
- Artifact events use protocol `kind: "report"` and `name`, not the earlier smoke-only `kind: "hermes-report"` / `title` shape.
- Artifact ids are deterministic per task attempt (`artifact-<taskId>-0001`) instead of the globally fixed `artifact-0001`.
- DynamoDB event and artifact metadata writes use conditional expressions so duplicate writes fail instead of silently overwriting ledger entries.
