# Local Docker ECS Runtime Plan

Workstream: Agent Harness
Date: 2026-05-10
Status: proposed runtime contract

## Purpose

The local Docker runtime should emulate the ECS user-runner contract closely
enough that Agent Harness work can be built and tested without deployed cloud
infrastructure. It is not a separate product runtime. It is the local version of
the same contract that ECS tasks will run.

## Current Baseline

Observed on 2026-05-10:

- `services/agent-runtime/Dockerfile` builds successfully as
  `agents-cloud-agent-runtime:local`.
- The image defaults to `HERMES_RUNNER_MODE=smoke`.
- The image command is `node dist/src/index.js`.
- The image runs as root because `.Config.User` is empty.
- `HERMES_HOME` points at `/root/.hermes`.
- The entrypoint is a one-shot run worker, not a resident user runner.
- Startup requires AWS-backed env vars for DynamoDB and S3 sinks:
  `RUNS_TABLE_NAME`, `TASKS_TABLE_NAME`, `EVENTS_TABLE_NAME`,
  `ARTIFACTS_BUCKET_NAME`, and `ARTIFACTS_TABLE_NAME`.
- There is no local file-backed event sink, inbox, state store, snapshot store,
  health endpoint, or resident loop.

Baseline command that passed:

```bash
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
```

## Target Modes

The runtime needs four explicit modes. A single implicit `HERMES_RUNNER_MODE`
flag is not enough for resident behavior.

| Mode | Purpose | Cloud required | Durable state |
| --- | --- | --- | --- |
| `oneshot-smoke` | Current ECS smoke path | Yes | DynamoDB/S3 |
| `local-oneshot` | Run one task locally with local sinks | No | local files |
| `resident-dev` | Emulate a user runner locally | No | local files and snapshots |
| `ecs-resident` | Production-shaped resident user runner | Yes | DynamoDB/S3 plus runner inbox |

Implementation should introduce a runtime mode separate from Hermes provider
mode:

```text
AGENTS_RUNTIME_MODE=oneshot-smoke | local-oneshot | resident-dev | ecs-resident
HERMES_RUNNER_MODE=smoke | cli
```

## Container Contract

Every local and ECS runner should receive the same identity and placement
fields, with local values allowed to be synthetic.

Required identity:

```text
RUNNER_ID
RUNNER_SESSION_ID
USER_ID
WORKSPACE_ID
ORG_ID
```

Required runtime mode:

```text
AGENTS_RUNTIME_MODE
WORKER_CLASS
```

Optional current one-shot fields:

```text
RUN_ID
TASK_ID
OBJECTIVE
```

Control-plane endpoints:

```text
CONTROL_API_URL
REALTIME_RELAY_URL
RUNNER_INBOX_URL
RUNNER_HEARTBEAT_URL
```

Local emulator paths:

```text
AGENTS_RUNTIME_ROOT=/runner
AGENTS_WORKSPACE_ROOT=/runner/workspace
AGENTS_STATE_ROOT=/runner/state
AGENTS_ARTIFACT_ROOT=/runner/artifacts
AGENTS_PROFILE_ROOT=/runner/profiles
AGENTS_TEMP_ROOT=/runner/tmp
```

Snapshot and artifact prefixes:

```text
SNAPSHOT_BUCKET_NAME
SNAPSHOT_PREFIX
ARTIFACTS_BUCKET_NAME
ARTIFACT_PREFIX
```

Credential references, not raw broad credentials:

```text
RUNNER_TOKEN_FILE=/run/secrets/runner-token
MODEL_CREDENTIAL_REF
GITHUB_CREDENTIAL_REF
MIRO_CREDENTIAL_REF
APIFY_CREDENTIAL_REF
```

Development may allow `RUNNER_TOKEN` as a local-only fallback, but the ECS and
Compose contract should prefer mounted secrets.

## Mount Contract

The runner should not depend on the image writable layer for durable work.

Recommended writable mounts:

```text
/runner/workspace
/runner/state
/runner/artifacts
/runner/profiles
/runner/tmp
```

Recommended secret mount:

```text
/run/secrets/runner-token
```

Future hardened Docker run shape:

```bash
docker run --rm \
  --name agents-cloud-runner-local \
  --cpus=2 \
  --memory=4g \
  --pids-limit=512 \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --mount type=volume,src=agents-cloud-workspace,dst=/runner/workspace \
  --mount type=volume,src=agents-cloud-state,dst=/runner/state \
  --mount type=volume,src=agents-cloud-artifacts,dst=/runner/artifacts \
  --mount type=tmpfs,dst=/runner/tmp,tmpfs-size=1073741824 \
  --env-file .env.runner.local \
  agents-cloud-agent-runtime:local
```

This command is a target. The current image cannot run this way until the
entrypoint supports local sinks, non-root paths, and resident mode.

## Health And Metadata

ECS health checks are task-definition settings, not Dockerfile-only guarantees.
The runtime still needs a local health surface so local Docker and ECS can use
the same readiness semantics.

Minimum health states:

```text
starting
ready
busy
waiting
draining
unhealthy
```

Minimum health data:

```text
runnerId
runnerSessionId
workspaceId
mode
logicalAgentCount
activeTaskCount
waitingTaskCount
lastHeartbeatAt
lastInboxCursor
lastSnapshotAt
```

In ECS, the runtime can read `ECS_CONTAINER_METADATA_URI_V4` for task/container
metadata and stats. In local Docker, a metadata mock should be injectable so
tests do not depend on Docker internals.

## Resident Runner Loop

The resident loop should be event-driven and snapshot-safe:

```text
boot
  -> load runner context
  -> restore latest snapshot if present
  -> fetch approved profile bundles needed by this workspace
  -> materialize logical agent registry
  -> send heartbeat
  -> poll or receive inbox item
  -> claim item idempotently
  -> run logical agent step
  -> execute tools through policy gateway
  -> emit canonical events and artifact records
  -> enter wait state or complete task
  -> snapshot after material state changes
  -> repeat until drain/cancel/shutdown
```

No step should sleep forever without a persisted wait state or wake timer.

## Local Sinks Needed

The next code slices should add local adapters before cloud adapters for
resident behavior:

- `LocalEventSink`
  - writes newline-delimited canonical events under `/runner/state/events.ndjson`,
  - enforces deterministic event IDs and duplicate suppression in tests.
- `LocalArtifactSink`
  - writes artifact files under `/runner/artifacts`,
  - emits artifact records under `/runner/state/artifacts.jsonl`.
- `LocalRunnerStateStore`
  - writes runner state JSON under `/runner/state/runner-state.json`,
  - supports atomic write via temp file and rename.
- `LocalInboxStore`
  - reads synthetic inbox items from `/runner/state/inbox.jsonl`,
  - records processed cursors.
- `LocalSnapshotStore`
  - writes versioned manifests under `/runner/state/snapshots`.

These local adapters let `pnpm agent-runtime:test` cover most behavior without
LocalStack, AWS credentials, or Cloudflare.

## Docker Image Changes Needed

The current Dockerfile is acceptable for the smoke path, but resident mode
needs hardening:

- add a non-root `runner` user,
- move `HERMES_HOME` away from `/root`,
- install only runtime dependencies in the final layer,
- add writable directories owned by `runner`,
- add optional health command only after a runtime health endpoint exists,
- keep the default command production-shaped but mode-driven,
- keep Docker socket unavailable,
- keep credential injection through env refs or secret files.

Do not add broad provider credentials to the image at build time.

## Tool Execution Boundary

The resident runner may execute tools, but tool execution must be mediated by a
runtime policy gateway:

```text
model/tool request
  -> tool descriptor lookup
  -> tenant/workspace scope check
  -> credential reference resolution
  -> risk and approval decision
  -> budget/idempotency check
  -> execution adapter
  -> result sanitizer
  -> canonical event and trace record
```

The model should never get raw tenant credentials, raw OAuth refresh tokens, or
unrestricted MCP/Apify endpoints.

## Validation Matrix

Current baseline validation:

```bash
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
docker image inspect agents-cloud-agent-runtime:local --format '{{.Config.User}} {{json .Config.Env}} {{json .Config.Cmd}}'
```

Future local resident validation:

```bash
pnpm agent-runtime:test
pnpm agent-runtime:build
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
docker run --rm --env-file .env.runner.local agents-cloud-agent-runtime:local
```

Future cloud-alignment validation:

```bash
pnpm contracts:test
pnpm infra:synth
pnpm --filter @agents-cloud/infra-cdk test
```

## Research Notes

Primary-source guidance used for this plan:

- Docker recommends non-root users, ephemeral containers, explicit runtime
  settings, and volumes for mutable data:
  <https://docs.docker.com/articles/dockerfile_best-practices/>
- Docker resource limits, secrets, volumes, and run flags map directly to local
  ECS emulation:
  <https://docs.docker.com/config/containers/resource_constraints/>,
  <https://docs.docker.com/compose/how-tos/use-secrets/>,
  <https://docs.docker.com/engine/storage/volumes/>,
  <https://docs.docker.com/engine/reference/commandline/run/>
- ECS task roles and metadata should be part of the production contract:
  <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html>,
  <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v4.html>
- ECS health checks must be specified in the task definition, so runtime health
  behavior must be explicit:
  <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html>

