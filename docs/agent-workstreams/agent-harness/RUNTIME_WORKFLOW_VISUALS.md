# Runtime Workflow Visuals

Workstream: Agent Harness
Date: 2026-05-10
Status: reference workflows for implementation planning

## 1. CEO Objective To Agent Team

```mermaid
sequenceDiagram
  participant User
  participant Client
  participant Control as Control API
  participant Runner as User Runner
  participant Manager as Manager Agent
  participant Specialist as Specialist Agent
  participant Tools as Tool Gateway
  participant Ledger as Event/Artifact Ledger

  User->>Client: "Create a new product plan"
  Client->>Control: create run
  Control->>Runner: inbox item
  Runner->>Manager: create planning task
  Manager->>Runner: delegate research/build/report tasks
  Runner->>Specialist: schedule specialist task
  Specialist->>Tools: request scoped tools
  Tools->>Runner: sanitized tool results
  Runner->>Ledger: run.status, artifacts, traces
  Manager->>Runner: final synthesis
  Runner->>Ledger: report artifact and completion
  Ledger->>Client: query/realtime replay
  Client->>User: messages, artifacts, questions, approvals
```

Runtime requirements:

- task records for delegation,
- logical agent instances inside the runner,
- tool policy gateway,
- event ordering and idempotency,
- artifact records,
- resumable wait states.

## 2. Local Docker ECS Emulation

```mermaid
flowchart LR
  Dev[Developer command] --> Docker[Docker container]
  Docker --> Entrypoint[Runtime entrypoint]
  Entrypoint --> Mode{AGENTS_RUNTIME_MODE}
  Mode --> Smoke[oneshot-smoke]
  Mode --> LocalOne[local-oneshot]
  Mode --> Resident[resident-dev]
  Resident --> Inbox[Local inbox jsonl]
  Resident --> State[Local runner state]
  Resident --> Artifacts[Local artifacts dir]
  Resident --> Events[Local events ndjson]
  Resident --> Snapshots[Local snapshots]
```

Runtime requirements:

- local event/artifact/state/inbox/snapshot adapters,
- non-root writable paths,
- no host Docker socket,
- env contract aligned with ECS.

## 3. Agent Workshop To Runtime Profile

```mermaid
flowchart TD
  User[User asks for specialist] --> Workshop[Agent Workshop]
  Workshop --> Questions[Discovery questions]
  Workshop --> Draft[Draft profile bundle]
  Draft --> Validate[Static validators]
  Validate --> Eval[Quarantine evals]
  Eval --> Scorecard[Scorecard artifact]
  Scorecard --> Approval{User approval}
  Approval -- approved --> Registry[Profile registry]
  Approval -- revision --> Workshop
  Registry --> Runner[Resident runner]
  Runner --> Verify[Verify manifest and hashes]
  Verify --> Materialize[Materialize HERMES_HOME/profile root]
  Materialize --> Agent[Logical agent instance]
```

Runtime requirements:

- profile manifest verifier,
- profile materialization state,
- logical agent registry,
- profile/tool policy bridge,
- event/artifact output for materialization.

## 4. Website Preview Workflow

```mermaid
sequenceDiagram
  participant Agent
  participant Tools as Tool Gateway
  participant Workspace
  participant Artifacts as Artifact Sink
  participant Preview as Preview Registry
  participant Client

  Agent->>Tools: preview.build_static_site
  Tools->>Workspace: run declared build command
  Workspace-->>Tools: dist directory
  Tools->>Artifacts: upload static artifact
  Tools->>Preview: request/register preview label
  Preview-->>Tools: previewUrl
  Tools-->>Agent: artifactId and previewUrl
  Tools->>Client: artifact.created via ledger/realtime
```

Runtime requirements:

- build command policy,
- artifact upload,
- preview registration adapter,
- label collision handling,
- no direct DNS mutation from agent code.

## 5. Artifact Creation Workflow

```mermaid
flowchart TD
  Agent[Logical agent] --> Tool[artifact.create]
  Tool --> Policy[Policy check]
  Policy --> Write[Write bytes to sink]
  Write --> Record[Create artifact record]
  Record --> Event[Emit artifact.created]
  Event --> Client[Clients render artifact]
```

Runtime requirements:

- stable artifact IDs,
- content type,
- S3/local sink parity,
- optional preview URL,
- duplicate suppression.

## 6. Approval Gate Workflow

```mermaid
sequenceDiagram
  participant Agent
  participant Runner
  participant Ledger
  participant Client
  participant User

  Agent->>Runner: request high-risk tool
  Runner->>Runner: persist wait state
  Runner->>Ledger: tool approval request event
  Ledger->>Client: realtime approval card
  User->>Client: approve or reject
  Client->>Ledger: approval decision
  Ledger->>Runner: inbox decision event
  Runner->>Runner: resume same task from wait state
  Runner->>Agent: tool result or rejection
```

Runtime requirements:

- wait state persisted before event,
- approval expiry,
- idempotent decisions,
- rejection path visible to agent and user,
- same task resumes after approval.

## 7. Proactive Message Or Call

```mermaid
flowchart TD
  Wake[Wake timer or inbox event] --> Runner[Resident runner]
  Runner --> Agent[Logical agent step]
  Agent --> Decision{Needs user contact?}
  Decision -- normal update --> Text[send_user_message]
  Decision -- question --> Question[ask_user_question]
  Decision -- urgent --> Notify[request_attention]
  Decision -- voice needed --> Approval[request_voice_call approval]
  Approval --> Claim[Call claim from infra/realtime]
  Claim --> CallWorker[Call worker boundary]
  Text --> Ledger[Communication event]
  Question --> Ledger
  Notify --> Ledger
  CallWorker --> Ledger
```

Runtime requirements:

- explicit wake timer or inbox trigger,
- communication cadence policy,
- call claim parser,
- communication sink,
- failure and timeout events.

## 8. Snapshot And Restore

```mermaid
sequenceDiagram
  participant Runner
  participant Store as Snapshot Store
  participant Ledger

  Runner->>Store: write snapshot after material change
  Store-->>Runner: snapshot id/version
  Runner->>Ledger: optional internal snapshot trace
  Note over Runner: container stops or moves
  Runner->>Store: list latest valid snapshot
  Store-->>Runner: manifest and state files
  Runner->>Runner: validate schema and hashes
  Runner->>Runner: restore agents, tasks, waits, cursors
  Runner->>Ledger: run.status resumed/recovered if user-visible
```

Runtime requirements:

- versioned manifest,
- checksum verification,
- event cursor persistence,
- retry-safe restore,
- stale-runner behavior when heartbeat expires.

## 9. Tool Execution Policy

```mermaid
flowchart TD
  Request[Model tool request] --> Registry[Tool registry lookup]
  Registry --> Scope[Tenant/workspace scope check]
  Scope --> Risk[Risk and approval decision]
  Risk -- denied --> Denied[Return blocked result and event]
  Risk -- approval --> Wait[Persist approval wait]
  Risk -- allowed --> Creds[Resolve scoped credential ref]
  Creds --> Adapter[Run adapter]
  Adapter --> Sanitize[Sanitize result]
  Sanitize --> Trace[Trace and canonical events]
  Trace --> Result[Return result to agent]
```

Runtime requirements:

- normalized tool descriptors,
- profile policy bridge,
- scoped credential refs,
- result sanitization,
- idempotency ledger.

