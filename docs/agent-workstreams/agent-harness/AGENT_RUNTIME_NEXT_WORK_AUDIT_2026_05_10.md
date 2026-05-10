# Agent Runtime Next Work Audit

Workstream: Agent Harness
Status: proposed
Updated: 2026-05-10

## Scope

This audit answers what the agent-harness lane should work on next, assuming
the infrastructure proposal for AI caller and proactive communication will be
implemented by the infrastructure/realtime/client lanes.

Agent Harness should focus on:

- runtime contracts,
- logical agent state,
- tool interfaces,
- wait/resume behavior,
- communication intent generation,
- resident user-runner behavior,
- call-worker boundaries,
- artifact/transcript production.

Agent Harness should not own:

- APNs,
- mobile UI,
- Cloudflare Realtime session creation,
- Control API route deployment,
- DynamoDB table design except required runtime fields,
- client rendering.

## Code Inspected

```text
services/agent-runtime/src/worker.ts
services/agent-runtime/src/ports.ts
services/agent-runtime/src/hermes-runner.ts
services/agent-runtime/src/dynamo-event-sink.ts
services/agent-runtime/src/aws-artifact-sink.ts
services/agent-runtime/test/worker.test.ts
services/agent-manager/README.md
services/agent-creator/src/workshop.ts
services/agent-creator/src/types.ts
packages/protocol/src/events.ts
docs/adr/0008-user-runner-placement.md
docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md
docs/agent-workstreams/handoffs/2026-05-10-infra-to-agent-harness-user-runner-state.md
```

## Current Runtime Reality

`services/agent-runtime` is a one-shot ECS worker.

Current behavior:

- reads `RUN_ID`, `TASK_ID`, `WORKSPACE_ID`, `USER_ID`, and `OBJECTIVE` from env,
- marks run/task `running`,
- builds a static Hermes prompt,
- runs Hermes or smoke mode,
- writes one markdown report artifact,
- writes `artifact.created`,
- marks run/task `succeeded` or `failed`.

Current ports:

```text
EventSink:
  putEvent
  updateRunStatus
  updateTaskStatus

ArtifactSink:
  putArtifact
  putArtifactRecord

HermesRunner:
  run(prompt)
```

Current tests prove:

- success event/artifact path,
- failed Hermes path.

This is a good smoke worker. It is not yet the resident user runner or agent
manager layer.

## Current Protocol Reality

`packages/protocol/src/events.ts` is run-ledger shaped:

- `CanonicalEventEnvelope` requires `runId`,
- `CanonicalEventBaseInput` requires `runId`,
- event builders exist for `run.status` and `artifact.created`,
- schemas exist for run status, artifact, tool approval, and A2UI.

This blocks first-class user/workspace communication events until protocol work
is done, but Agent Harness can still build internal types and unit tests before
the protocol package is expanded.

## Current Agent Manager Reality

`services/agent-manager` is a README-only placeholder.

Documented responsibilities:

- select worker class,
- start ECS tasks,
- inject scoped run env,
- track heartbeats and callbacks,
- stop/cancel runs,
- emit canonical events.

No scheduler code exists yet.

Agent Harness should not implement cloud scheduling first. It should define the
runner-side contract the manager will later call.

## Current Agent Creator Reality

`services/agent-creator` exists in the working tree and appears to be a separate
workstream's active/uncommitted work.

Useful behavior:

- creates a deterministic workshop plan,
- drafts specialist profile behavior/tool policy/eval plan,
- evaluates profile drafts,
- simulates a workshop transcript.

Potential Agent Harness integration later:

- profile drafts become logical agent profiles,
- `communicationCadence` maps to interruption/contact policy,
- `toolPolicy` maps to allowed/approval-required tools,
- eval plans become quarantine checks before promotion.

Do not edit `services/agent-creator` in the agent-harness runtime slice unless
the owner hands it off.

## Current User-Runner State Reality

Infrastructure has active/uncommitted changes adding:

```text
HostNodesTable
UserRunnersTable
RunnerSnapshotsTable
AgentInstancesTable
```

The indexes are broadly compatible with Agent Harness needs:

- host status/heartbeat lookup,
- runner status/heartbeat lookup,
- runner desired-state lookup,
- runner by ID lookup,
- snapshots by user/workspace,
- agent instances by user/status and next wake time.

Agent Harness can accept current-state fields for V0. A separate
`RunnerHeartbeat` or `RunnerPlacement` history table is not required for the
first runtime implementation.

## Main Gaps Owned By Agent Harness

### 1. No resident runner mode

There is no process that:

- hosts multiple logical agents,
- stays warm for a user,
- receives messages/events/timers,
- heartbeats,
- snapshots state,
- resumes after restart.

### 2. No logical agent state model

Need internal types for:

```text
AgentProfile
AgentInstance
AgentTask
AgentWakeTimer
AgentWaitState
AgentMessage
ToolPolicy
```

### 3. No agent communication tools

Need agent-facing tools:

```text
send_user_message
ask_user_question
request_user_attention
notify_artifact_ready
create_audio_message
request_voice_call
```

The tools should emit platform communication intents, not call APNs,
Cloudflare, or mobile clients directly.

### 4. No wait/resume engine

Need deterministic state transitions:

```text
running -> waiting_for_user_answer -> ready
running -> waiting_for_call_acceptance -> ready | timed_out | declined
running -> waiting_for_approval -> ready | rejected | expired
running -> sleeping_until_timer -> ready
```

### 5. No runtime communication sink

Need a port like:

```text
CommunicationSink.createItem()
CommunicationSink.askQuestion()
CommunicationSink.requestCall()
CommunicationSink.createAudioMessage()
```

For now this can be an in-memory test sink. The Control API implementation can
replace it later.

### 6. No call-worker boundary

Need a runner-side interface for a signed Cloudflare Realtime call claim:

```text
CallWorker.start(claim)
CallWorker.emitLifecycleEvent()
CallWorker.writeTranscriptArtifact()
CallWorker.end()
```

Do not implement Cloudflare session creation in Agent Harness. The claim payload
comes from infrastructure/control API.

### 7. No snapshot manifest model

Need deterministic serialization for:

- runner version,
- logical agents,
- active tasks,
- wait states,
- wake timers,
- last processed event cursors,
- profile versions,
- tool policy versions.

Actual S3 wiring can wait. The manifest shape and tests do not need infra.

## Work That Can Start Immediately

These tasks do not require new infrastructure.

### Slice A: Runtime domain model package inside `agent-runtime`

Add pure TypeScript types and validators for:

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

Validation:

```bash
pnpm agent-runtime:test
```

### Slice B: In-memory runner state store

Add an in-memory store with deterministic transitions:

- register agent,
- update agent status,
- create task,
- enter wait state,
- resume from callback,
- schedule wake,
- list due wakes.

This is testable without DynamoDB.

### Slice C: Communication tool facade

Add pure runtime tools that write to an injectable `CommunicationSink`.

Tests:

- idempotency key required,
- blocking question enters wait state,
- call request does not assume acceptance,
- policy-blocked result is handled explicitly,
- artifact-ready notice links to run/work item/artifact IDs.

### Slice D: Call claim parser and call-worker interface

Add a typed claim parser and interface. Do not connect to Cloudflare yet.

Tests:

- accepts valid Cloudflare Realtime claim shape,
- rejects missing workspace/user/call/session IDs,
- rejects expired claims,
- maps call-worker lifecycle events.

### Slice E: Snapshot manifest serializer

Add JSON manifest serializer/deserializer and version field.

Tests:

- round-trip active agents/tasks/wait states,
- reject unsupported manifest version,
- preserve wake timers and event cursors.

### Slice F: Resident runner shell

After A-E, add a no-network resident runner loop that can:

- load initial state,
- process a local message event,
- invoke the communication tool facade,
- enter a wait state,
- process a synthetic answer event,
- emit a user-visible message intent.

This can run entirely in unit tests before Control API/infra exists.

## Work To Defer Until Infrastructure Is Ready

Defer:

- DynamoDB-backed runner state adapters,
- runner heartbeat API client,
- Control API communication client,
- real runner token verification,
- Cloudflare media adapter connection,
- ECS resident runner task/service deployment,
- local Docker supervisor integration,
- APNs/mobile lifecycle,
- realtime client subscription wiring.

## Required Contracts From Other Workstreams

From Infrastructure:

- runner env var contract,
- runner token scope and signing method,
- call claim signing method,
- call claim payload shape,
- snapshot S3 prefixes,
- heartbeat route names,
- communication runtime endpoint URL.

From Realtime Streaming:

- callback event routing shape,
- replay cursor shape for runner inbox and call session events,
- whether runner heartbeats are canonical events or operational records.

From Clients:

- no blocking dependency for initial Agent Harness work,
- later: user-visible labels for wait states and call outcomes.

## Recommended Immediate Implementation Order

1. Add `CURRENT_PLAN.md` for Agent Harness.
2. Add domain model and tests.
3. Add in-memory runner state store and transition tests.
4. Add communication tool facade and tests.
5. Add call claim parser/interface and tests.
6. Add snapshot manifest serializer and tests.
7. Add resident runner shell test.
8. Only then wire Control API/infra adapters.

This keeps the agent-harness lane moving while infrastructure implements the
Cloudflare Realtime and durable state plumbing.
