# Agent Harness Current Plan

Workstream: Agent Harness
Owner: Agent Harness Workstream
Updated: 2026-05-10
Status: resident ECS-shaped container slice implemented locally; production runner launch and durable adapters still pending

## Startup Checks

Required files read in order:

1. `AGENTS.md`
2. `docs/agent-workstreams/README.md`
3. `docs/agent-workstreams/agent-harness/README.md`
4. `docs/agent-workstreams/COORDINATION.md`
5. `docs/agent-workstreams/START_PROMPT_TEMPLATE.md`
6. `docs/roadmap/PROJECT_REMAINING_WORK_AUDIT_2026_05_10.md`
7. `docs/adr/0002-agent-harness.md`
8. `docs/adr/0008-user-runner-placement.md`
9. `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`
10. `services/agent-runtime/`

Repository status at start of this Agent Harness pass:

```text
## main...origin/main
 M docs/adr/0009-proactive-communication-plane.md
 M docs/agent-workstreams/agent-harness/README.md
 M docs/agent-workstreams/infrastructure/CURRENT_PLAN.md
 M docs/agent-workstreams/infrastructure/README.md
 M docs/roadmap/PROACTIVE_COMMUNICATION_REMAINING_WORK_2026_05_10.md
 M docs/roadmap/VOICE_CALL_AUDIO_MESSAGE_ARCHITECTURE_2026_05_10.md
 M infra/cdk/README.md
 M infra/cdk/src/stacks/state-stack.ts
 M package.json
 M pnpm-lock.yaml
?? docs/agent-workstreams/agent-harness/AGENT_RUNTIME_NEXT_WORK_AUDIT_2026_05_10.md
?? docs/agent-workstreams/agent-harness/CURRENT_PLAN.md
?? docs/agent-workstreams/agent-harness/PROACTIVE_COMMUNICATION_AGENT_INTERFACE_AUDIT.md
?? docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-user-runner-contract-response.md
?? docs/agent-workstreams/handoffs/2026-05-10-infra-to-agent-harness-user-runner-state.md
?? docs/agent-workstreams/handoffs/2026-05-10-infra-to-realtime-user-runner-state.md
?? docs/agent-workstreams/infrastructure/AI_CALLER_CLOUDFLARE_REALTIME_INFRA_PROPOSAL.md
?? infra/cdk/src/test/user-runner-state.test.ts
?? services/agent-creator/
```

Runtime-owned code diffs:

```text
services/agent-runtime/**  no active diff
packages/protocol/**      no active diff
services/agent-manager/** no active diff
```

Runtime-owned doc diffs:

```text
docs/agent-workstreams/agent-harness/README.md
docs/agent-workstreams/agent-harness/CURRENT_PLAN.md
docs/agent-workstreams/agent-harness/AGENT_RUNTIME_NEXT_WORK_AUDIT_2026_05_10.md
docs/agent-workstreams/agent-harness/PROACTIVE_COMMUNICATION_AGENT_INTERFACE_AUDIT.md
docs/agent-workstreams/agent-harness/LOCAL_DOCKER_ECS_RUNTIME_PLAN.md
docs/agent-workstreams/agent-harness/TOOL_CATALOG_AND_POLICY_PLAN.md
docs/agent-workstreams/agent-harness/AGENT_BUILDER_RUNTIME_INTEGRATION_PLAN.md
docs/agent-workstreams/agent-harness/RUNTIME_WORKFLOW_VISUALS.md
docs/agent-workstreams/agent-harness/LOCAL_RUNTIME_TESTING_PLAYBOOK.md
docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-user-runner-contract-response.md
docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-local-ecs-runtime-contract.md
```

Unrelated active work observed and preserved:

- infrastructure user-runner state table work,
- infrastructure workstream plan/status docs,
- package/workspace changes for `services/agent-creator`,
- untracked `services/agent-creator`.

Latest repository status observed during the Docker/tool planning pass also
included unrelated web/client changes and `.dockerignore` edits. Agent Harness
preserved those changes and only edited agent-harness docs and one handoff file.

## Current Scope

Own the runtime behavior for user runners and logical agents:

- logical agent state,
- agent tasks and wait states,
- communication tools,
- call-worker boundary,
- snapshot manifest,
- resident runner loop,
- Hermes/agent adapter boundary,
- runtime-owned tests.

Do not own:

- CDK tables,
- APNs delivery,
- mobile UI,
- Cloudflare Realtime session creation,
- Control API route deployment,
- realtime fanout implementation.

## Current State

`services/agent-runtime` is a one-shot Hermes/smoke ECS worker. It can:

- read run/task/user/workspace/objective env vars,
- mark a run/task running,
- run Hermes or smoke mode,
- write one markdown artifact,
- emit `run.status` and `artifact.created`,
- mark success/failure.

`services/agent-manager` is documentation only.

`services/agent-creator` exists as active/uncommitted work from another lane. It
has a useful deterministic profile/workshop model, but Agent Harness should not
edit it yet.

Infrastructure has active user-runner table work for `HostNodes`,
`UserRunners`, `RunnerSnapshots`, and `AgentInstances`. That is enough for Agent
Harness to plan against, but not required for the next pure runtime slices.

## Smoke Runtime Behavior

The current smoke runtime already proves the durable one-shot worker path:

```text
Step Functions launches ECS task
  -> runtime loads run context from environment
  -> run/task status set to running
  -> Hermes runner boundary executes smoke or CLI mode
  -> markdown report artifact written to S3
  -> artifact metadata record written to DynamoDB
  -> artifact.created event emitted
  -> terminal run.status emitted
  -> run/task status updated
```

Important implementation details:

- event builders come from `@agents-cloud/protocol`,
- artifact IDs are deterministic per task attempt,
- DynamoDB event/artifact writes use conditional expressions in the AWS sinks,
- failure emits a `run.status` event with `HERMES_WORKER_FAILED`.

The smoke runtime does not yet prove resident-runner behavior.

The first ECS-shaped resident runner implementation now exists separately from
the smoke worker:

```text
services/agent-runtime/Dockerfile.resident
services/agent-runtime/src/resident-runner.ts
services/agent-runtime/src/resident-runner-server.ts
services/agent-runtime/test/resident-runner.test.ts
docs/agent-workstreams/agent-harness/RESIDENT_ECS_CONTAINER.md
```

It proves:

- non-root resident image shape,
- `/runner` local workspace/state/artifact/profile layout,
- `HERMES_HOME=/runner/hermes`,
- authenticated HTTP API for health, state, events, agent registration, wake,
  and shutdown,
- multiple logical agents per same tenant runner,
- tenant mismatch rejection for registered profiles,
- smoke and future `hermes-cli` adapter boundary,
- session ID capture and reuse in runner state,
- heartbeat report artifact creation,
- critical-only canonical events for status and artifacts.

The resident runner is also present in CDK as a separate Fargate task definition
named `resident-runner`. This task definition is not yet wired to a production
spawn path or durable S3/DynamoDB adapters.

The proactive communication agent interface is documented in:

```text
docs/agent-workstreams/agent-harness/PROACTIVE_COMMUNICATION_AGENT_INTERFACE_AUDIT.md
```

The detailed runtime audit is documented in:

```text
docs/agent-workstreams/agent-harness/AGENT_RUNTIME_NEXT_WORK_AUDIT_2026_05_10.md
```

Additional runtime planning docs from the local Docker/tooling pass:

```text
docs/agent-workstreams/agent-harness/LOCAL_DOCKER_ECS_RUNTIME_PLAN.md
docs/agent-workstreams/agent-harness/TOOL_CATALOG_AND_POLICY_PLAN.md
docs/agent-workstreams/agent-harness/AGENT_BUILDER_RUNTIME_INTEGRATION_PLAN.md
docs/agent-workstreams/agent-harness/RUNTIME_WORKFLOW_VISUALS.md
docs/agent-workstreams/agent-harness/LOCAL_RUNTIME_TESTING_PLAYBOOK.md
docs/agent-workstreams/agent-harness/RUNTIME_AUTONOMY_AND_EVENT_POLICY.md
```

## Gaps

Agent Harness is missing:

- production resident user-runner launch path,
- durable logical agent registry backed by Control API/DynamoDB,
- agent task model,
- wake timers,
- wait/resume state machine,
- communication tool facade,
- runtime communication sink,
- call claim parser and call-worker interface,
- snapshot manifest serializer,
- heartbeat model,
- runner inbox/callback processing,
- profile/tool policy integration,
- Hermes-enabled resident image layer,
- local file-backed event/artifact/state/inbox/snapshot adapters,
- tests for durable adapters, cancellation, snapshot restore, and real tool
  policy boundaries.

For resident user runners, the missing runtime capabilities are:

- durable task launch/spawn integration for the separate resident entrypoint,
- runner heartbeat writes and stale-runner status contract,
- runner inbox/callback processing,
- explicit wake timers,
- explicit wait states with timeout behavior,
- delegation between logical agents inside one user runner,
- approval gate creation and resume/reject handling,
- retry, cancellation, resume, timeout, and duplicate-event rules,
- snapshot/restore semantics for runner state and workspace cursors,
- bounded heavy-work request boundary instead of host Docker access.

## Risks

- Building against Control API routes before they exist would block the lane.
  Mitigation: start with pure types, in-memory stores, injectable ports, and
  tests.
- Editing `services/agent-creator` could conflict with another active
  workstream. Mitigation: treat it as read-only until handed off.
- Protocol is still run-bound. Mitigation: internal runtime types can be built
  now; public event builders wait for protocol work.
- User-runner infrastructure is active and uncommitted. Mitigation: use docs and
  handoff contracts only; do not edit infra files.
- Call worker could accidentally absorb Cloudflare infrastructure concerns.
  Mitigation: parse and consume a claim payload only; infrastructure creates
  sessions/adapters.
- Runtime tools could expose broad credentials if they accept arbitrary provider
  secrets. Mitigation: tool schemas reference scoped credential IDs or brokered
  capability IDs only.
- Runtime state could become local-only. Mitigation: every resident-runner state
  type must be serializable into a snapshot manifest before being treated as
  durable.
- Proactive behavior could become a hidden loop. Mitigation: every sleep,
  callback wait, or scheduled action must have an explicit `AgentWaitState` or
  `AgentWakeTimer`.
- Tool access could become broad if MCP/Apify/provider tools are mounted
  directly into model context. Mitigation: normalize all tools through runtime
  descriptors, policy checks, credential refs, approval gates, budgets,
  idempotency, and audit events.
- The durable event ledger could become noisy if every internal tool call is
  persisted. Mitigation: emit canonical durable events only for product-critical
  transitions; keep routine tool churn as local aggregate metrics or
  short-retention traces.
- Docker local runtime could drift from ECS if it uses a different contract.
  Mitigation: local `resident-dev` and cloud `ecs-resident` should share one
  runner env/mount/secret/health/snapshot contract.
- The resident image could be mistaken as public production-ready because real
  Hermes now runs in it. Mitigation: keep it token-protected, inject auth only
  through Secrets Manager or a private credential upload route, and document
  that durable adapters, snapshot restore, per-user routing, and brokered
  provider credentials are still required.
- Codex/ChatGPT OAuth could be overexposed if raw user sessions are passed into
  multi-tenant agent code. Mitigation: production default remains API-key,
  provider-service-account, or brokered credential references; OAuth/bootstrap
  auth is private trusted-runner work only until policy and isolation are
  approved.

## Files Expected To Change

Current resident container slice:

```text
services/agent-runtime/Dockerfile.resident
services/agent-runtime/src/resident-runner.ts
services/agent-runtime/src/resident-runner-server.ts
services/agent-runtime/test/resident-runner.test.ts
services/agent-runtime/package.json
package.json
infra/cdk/src/stacks/runtime-stack.ts
infra/cdk/src/bin/agents-cloud-cdk.ts
infra/cdk/src/test/workitem-genui-infra.test.ts
docs/agent-workstreams/agent-harness/RESIDENT_ECS_CONTAINER.md
docs/agent-workstreams/agent-harness/RESIDENT_RUNNER_PRODUCTION_ROUTING_PLAN.md
docs/agent-workstreams/agent-harness/LOCAL_RUNTIME_TESTING_PLAYBOOK.md
docs/agent-workstreams/agent-harness/CURRENT_PLAN.md
docs/agent-workstreams/agent-harness/README.md
docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-resident-runner-ecs-launch.md
```

Likely next Agent Harness runtime slice:

```text
services/agent-runtime/src/runtime-model.ts
services/agent-runtime/src/runtime-state.ts
services/agent-runtime/src/communication-tools.ts
services/agent-runtime/src/call-worker.ts
services/agent-runtime/src/snapshot-manifest.ts
services/agent-runtime/src/local-event-sink.ts
services/agent-runtime/src/local-artifact-sink.ts
services/agent-runtime/src/local-runner-state-store.ts
services/agent-runtime/src/tool-registry.ts
services/agent-runtime/src/tool-policy.ts
services/agent-runtime/src/local-harness.ts
services/agent-runtime/src/local-runner-cli.ts
services/agent-runtime/test/runtime-model.test.ts
services/agent-runtime/test/runtime-state.test.ts
services/agent-runtime/test/communication-tools.test.ts
services/agent-runtime/test/call-worker.test.ts
services/agent-runtime/test/snapshot-manifest.test.ts
services/agent-runtime/test/local-runtime-sinks.test.ts
services/agent-runtime/test/tool-policy.test.ts
services/agent-runtime/test/local-harness.test.ts
docs/agent-workstreams/agent-harness/CURRENT_PLAN.md
```

Do not touch in the next Agent Harness slice unless explicitly coordinated:

```text
services/control-api/**
services/agent-creator/**
apps/**
infra/cloudflare/**
```

## Cross-Workstream Dependencies

- Dependency: runner state table/index contract.
  Owning workstream: Infrastructure.
  Handoff file:
  `docs/agent-workstreams/handoffs/2026-05-10-infra-to-agent-harness-user-runner-state.md`

- Dependency: resident runner ECS launch, scoped secrets, and task wake path.
  Owning workstream: Infrastructure.
  Handoff file:
  `docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-resident-runner-ecs-launch.md`

- Dependency: Cloudflare Realtime call session/adapters and signed claim.
  Owning workstream: Infrastructure / Realtime Streaming.
  Handoff file:
  `docs/agent-workstreams/infrastructure/AI_CALLER_CLOUDFLARE_REALTIME_INFRA_PROPOSAL.md`

- Dependency: public communication event protocol.
  Owning workstream: Protocol/shared contract, then Control API/Realtime/Clients.
  Handoff file:
  `docs/roadmap/COMMUNICATION_EVENT_CONTRACTS_2026_05_10.md`

Needed from Infrastructure:

- final resident runner environment variables,
- runner token scope/signing method,
- snapshot S3 prefixes,
- heartbeat route names,
- runtime communication endpoint URL,
- Cloudflare Realtime call-claim payload and signing method.

Needed from Realtime Streaming:

- runner inbox event delivery/replay shape,
- callback event cursor model,
- whether heartbeats are operational records or canonical user-visible events,
- call-session lifecycle subscription shape.

Needed from Clients:

- user-visible labels for runtime states,
- approval/question payload rendering expectations,
- artifact/audio/call request card payload requirements.

Needed from Product Coordination:

- initial logical agent roles for demo,
- agent role naming and scope,
- default communication cadence and escalation policy.

## Handoffs

Existing incoming handoff triaged:

- `docs/agent-workstreams/handoffs/2026-05-10-infra-to-agent-harness-user-runner-state.md`

Agent Harness response created:

- `docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-user-runner-contract-response.md`
- `docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-local-ecs-runtime-contract.md`
- `docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-resident-runner-ecs-launch.md`

Current response:

- accept current-state user-runner tables for v0,
- no separate runner heartbeat or placement history table required for the first
  runtime implementation,
- request final env vars, token scope, snapshot prefixes, and call-claim signing
  details before wiring cloud adapters.

## Implementation Plan

Smallest next runtime slice:

```text
Slice 1: pure runtime domain model and validation only.
```

Reason:

- unblocks resident runner design without waiting for Control API routes,
- does not require CDK/IAM/secrets,
- can be tested locally,
- gives Infrastructure, Realtime, and Clients stable names for later contracts.

### Slice 1: Pure runtime domain model

Add types and small validators for:

```text
UserRunnerState
LogicalAgentInstance
AgentProfileRef
AgentTask
AgentWaitState
AgentWakeTimer
AgentToolPolicy
CommunicationIntent
CallClaim
```

No AWS dependencies.

Definition for Slice 1:

- add runtime-owned TypeScript types,
- add small validation helpers for IDs/statuses/expiry,
- add tests for valid and invalid runner/agent/task/wait/call-claim shapes,
- do not change `packages/protocol` yet unless public event builders are added.

### Slice 2: In-memory runner state store

Implement deterministic transitions:

```text
registerAgent
createTask
setAgentStatus
enterWaitState
resumeWaitState
scheduleWake
listDueWakes
recordProcessedEventCursor
```

No DynamoDB adapter yet.

### Slice 3: Communication tool facade

Implement agent-facing tools using an injectable `CommunicationSink`:

```text
send_user_message
ask_user_question
request_user_attention
notify_artifact_ready
create_audio_message
request_voice_call
```

Tools create intents and handle sink results. They do not know APNs,
Cloudflare, or mobile routes.

### Slice 4: Call-worker boundary

Implement:

```text
parseCallClaim
validateCallClaimExpiry
CallWorker interface
CallWorkerLifecycleEvent types
```

No Cloudflare network client yet.

### Slice 5: Snapshot manifest

Implement versioned JSON manifest serialization for runner state.

Include:

- runner ID,
- user/workspace,
- profile versions,
- agent instances,
- tasks,
- wait states,
- wake timers,
- event cursors.

### Slice 6: Resident runner shell

Add a no-network shell that can process synthetic events in tests:

```text
message received
  -> logical agent task
  -> communication tool
  -> wait state
  -> synthetic user answer
  -> resume
  -> completion message
```

### Slice 0.5: Local executable harness

Added before Slice 1 so runtime behavior can be exercised immediately:

```text
pnpm --filter @agents-cloud/agent-runtime run local:harness -- run --interactive
pnpm --filter @agents-cloud/agent-runtime run local:harness -- inspect --root <run-root>
```

This slice proves:

- local resident-runner style state,
- manager and specialist logical agents,
- user question transcript,
- approval request/decision events,
- pending approval wait state,
- mostly autonomous operation with critical-only durable event emission,
- aggregate local tool metrics without canonical `tool.call` spam,
- report artifact creation,
- website artifact creation only after approval,
- CLI run and inspect commands,
- Docker image can execute the local CLI with an entrypoint override.

It is deterministic and no-network. It does not replace the planned full
resident runner, inbox, snapshot restore, or real tool adapters.

### Slice 0.6: ECS-shaped resident runner container

Implemented after Slice 0.5 so the runtime can be exercised as a long-lived
container:

```text
resident-runner HTTP server
  -> authenticated local API
  -> tenant-scoped logical agent registration
  -> wake one or all logical agents
  -> smoke or future Hermes CLI adapter
  -> heartbeat report artifacts
  -> canonical status/artifact events
  -> local runner state and event inspection
```

This slice also adds a separate CDK Fargate task definition for the resident
runner so it does not share the one-shot smoke worker task definition.

It is still local-file backed. The next implementation work should add durable
ports for `UserRunners`, `RunnerSnapshots`, `AgentInstances`, S3 artifact
upload, and canonical event writes before any production user runner launch.

## Validation Plan

For this planning/audit-only session:

```bash
git diff --check
```

For the next code slice:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
```

If protocol exports change:

```bash
pnpm contracts:test
```

Do not run broad infra/client tests for pure agent-harness docs unless code
touches those lanes.

Docker baseline validated during this planning pass:

```bash
docker build -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:local .
docker image inspect agents-cloud-agent-runtime:local --format '{{.Config.User}} {{json .Config.Env}} {{json .Config.Cmd}}'
```

Result:

- image build passed,
- image still runs as root because `.Config.User` is empty,
- env defaults include `HERMES_HOME=/root/.hermes` and
  `HERMES_RUNNER_MODE=smoke`,
- command is `["node","dist/src/index.js"]`,
- current entrypoint is not resident-runner capable.

Validation results for this pass:

```bash
git diff --check
rg -n '[ \t]+$' docs/agent-workstreams/agent-harness docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-local-ecs-runtime-contract.md docs/agent-workstreams/handoffs/2026-05-10-agent-harness-to-infrastructure-user-runner-contract-response.md
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
pnpm agent-runtime:local -- run --root /tmp/agents-cloud-root-script-2 --run-id run-root-script-2 --objective "Create a second root-script dashboard preview" --approve-preview approved --print-inspection
pnpm agent-runtime:docker:build
pnpm agent-runtime:docker:harness -- run --objective "Create a docker-script dashboard preview" --approve-preview approved --json
```

Result:

- diff whitespace check passed,
- no trailing whitespace found in Agent Harness docs/handoffs,
- protocol schemas validated,
- agent-runtime tests passed with local harness workflow coverage,
- agent-runtime build passed.
- root local harness script produced a completed run with 10 events, two
  artifacts, two logical agents, and no wait states.
- Docker image built and ran the local harness with a completed run, 10 events,
  approval evidence, a report artifact, and a website artifact.

Validation results for the resident ECS container slice:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
pnpm --filter @agents-cloud/infra-cdk test
pnpm agent-runtime:resident:docker:build
docker run --rm -p 127.0.0.1:18787:8787 -e RUNNER_API_TOKEN=test-token -e ORG_ID=org-local -e USER_ID=user-local -e WORKSPACE_ID=workspace-local -e RUNNER_ID=runner-local -e RUNNER_SESSION_ID=runner-session-local agents-cloud-agent-runtime-resident:local
curl -sS http://127.0.0.1:18787/wake -H 'authorization: Bearer test-token' -H 'content-type: application/json' -d '{"objective":"Create a stock dashboard artifact plan after rebuild.","runId":"run-docker-resident-rebuild","taskId":"task-docker-resident-rebuild","wakeReason":"on_demand"}'
curl -sS -X POST http://127.0.0.1:18787/shutdown -H 'authorization: Bearer test-token'
pnpm infra:synth
git diff --check
```

Result:

- protocol schemas validated,
- agent-runtime tests passed with 11 tests, including resident runner
  multi-agent wake, tenant rejection, authenticated HTTP API, and adapter
  environment isolation,
- agent-runtime build passed,
- infra CDK tests passed with 9 tests,
- resident Docker image built,
- resident container started as user `runner` with command
  `node dist/src/resident-runner-server.js`,
- Docker wake smoke produced one heartbeat, one report artifact, four canonical
  events, and clean shutdown,
- `pnpm infra:synth` passed with only existing CDK deprecation warnings,
- diff whitespace check passed.

Validation results for the real-Hermes resident update:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm agent-runtime:build
pnpm --filter @agents-cloud/infra-cdk test
pnpm agent-runtime:resident:docker:build
pnpm infra:synth
cd infra/cdk && pnpm build && pnpm exec cdk deploy --app 'node dist/bin/agents-cloud-cdk.js' agents-cloud-dev-runtime --require-approval never
```

Result:

- protocol schemas validated,
- agent-runtime tests passed with 18 tests,
- agent-runtime build passed,
- infra CDK tests passed with 9 tests,
- resident image now builds from `nousresearch/hermes-agent:latest`,
- resident smoke adapter was removed from resident runtime code and rejected in
  HTTP-server startup tests,
- `POST /credentials/hermes-auth` stores `$HERMES_HOME/auth.json` without
  echoing auth contents,
- dev Secrets Manager secret
  `agents-cloud/dev/resident-runner/hermes-auth-json` was created/updated from
  the local Hermes auth file,
- `agents-cloud-dev-runtime` deployed resident task definition revision `4`,
- local Docker real-Hermes `/wake` reached OpenAI Codex and failed with HTTP
  `429 usage_limit_reached`,
- live ECS task
  `arn:aws:ecs:us-east-1:625250616301:task/agents-cloud-dev-cluster/264c24cc42374834b3c006a56822069b`
  started the resident server, loaded Hermes auth from Secrets Manager, invoked
  `/opt/hermes/.venv/bin/hermes`, emitted visible failed status/artifact events,
  and exited `0`,
- successful model output is blocked by current Codex provider quota, not by ECS
  container wiring.

## Progress Log

- 2026-05-10: Audited current `agent-runtime`, `agent-manager`,
  `agent-creator`, protocol event model, user-runner docs, and infra handoff.
- 2026-05-10: Confirmed immediate work can start without backend routes by using
  pure runtime types, in-memory stores, injectable sinks, and tests.
- 2026-05-10: Added runtime audit and current plan docs.
- 2026-05-10: Re-read the required Agent Harness start context, verified there
  are no active code diffs in `services/agent-runtime`, `packages/protocol`, or
  `services/agent-manager`, and tightened this plan to the assigned workstream
  prompt.
- 2026-05-10: Built the existing agent-runtime Docker image locally and recorded
  that the current image is a root, one-shot smoke worker rather than a resident
  runner.
- 2026-05-10: Added local Docker/ECS runtime, tool catalog/policy, Agent
  Workshop integration, and visual workflow docs.
- 2026-05-10: Added an Infrastructure handoff for the shared local Docker and
  ECS resident-runner contract.
- 2026-05-10: Ran `pnpm contracts:test`, `pnpm agent-runtime:test`, and
  `pnpm agent-runtime:build`; all passed.
- 2026-05-10: Added first executable local runtime harness and CLI for approved,
  pending, and rejected approval workflows. The harness writes local events,
  state, transcript, and artifacts for inspection.
- 2026-05-10: Added protocol `tool.approval` TypeScript helper and golden
  request/decision examples validated by `pnpm contracts:test`.
- 2026-05-10: Added root convenience scripts for local and Docker harness runs.
- 2026-05-10: Added runtime autonomy/event policy and updated the local harness
  to track aggregate local tool metrics while keeping durable events limited to
  status, approval, and artifact events.
- 2026-05-10: Added `Dockerfile.resident`, resident runner/server code, tests,
  root scripts, CDK task definition, resident container docs, and an
  Infrastructure handoff for task launch/secrets/snapshot wiring.
- 2026-05-10: Built and ran the resident Docker image locally, exercised the
  authenticated HTTP wake flow, confirmed canonical status/artifact events, and
  added an adapter environment isolation test so Hermes child processes do not
  inherit AWS task credentials or runner tokens by default.
- 2026-05-10: Deployed `agents-cloud-dev-state` and
  `agents-cloud-dev-runtime`, pushed the resident image to ECR via CDK, launched
  live ECS task
  `arn:aws:ecs:us-east-1:625250616301:task/agents-cloud-dev-cluster/e43f96b820414db8af395525cdcd7187`,
  verified `/health`, `/wake`, `/state`, and `/shutdown` inside Fargate, and
  documented the remaining per-user routing plan.
- 2026-05-10: Replaced the resident smoke adapter default with real Hermes CLI,
  switched the resident image to `nousresearch/hermes-agent:latest`, added
  token-protected Hermes auth upload, injected Hermes auth through Secrets
  Manager, deployed resident task definition revision `4`, and verified live ECS
  reaches the OpenAI Codex backend before failing on current `429`
  `usage_limit_reached` quota.

## Completion Criteria

This planning session is complete when:

- required docs and runtime files have been read,
- `git status --short --branch` has been inspected,
- active runtime-owned diffs have been checked,
- this `CURRENT_PLAN.md` identifies the next smallest runtime slice,
- cross-workstream handoff needs are recorded,
- docs pass `git diff --check`.

The next Agent Harness implementation slice is complete when:

- durable resident runner ports exist for events, artifacts, runner state,
  agent instances, and snapshots,
- resident runner heartbeat and stale-runner behavior are implemented,
- inbox/wake/cancel/approval resume flows are explicit and tested,
- snapshot manifests round-trip and restore workspace cursors,
- Hermes-enabled image layer is pinned and only receives an allowlisted runtime
  environment,
- no client/backend files are changed without handoff,
- `pnpm contracts:test`, `pnpm agent-runtime:test`, `pnpm agent-runtime:build`,
  and resident Docker API smoke tests pass.
