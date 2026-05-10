# Resident Agent Delegator Deep Audit — 2026-05-10

## Executive answer

The deployed ECS resident runner is real and can launch Hermes in a resident container. The current smoke evidence proves:

- `POST /runs` / CreateRun Lambda can create a durable run and hand off resident dispatch.
- The resident Fargate task starts and listens on `:8787`.
- The resident runner has Hermes installed through the resident image and invokes `hermes chat -q ...` through `services/agent-runtime/src/resident-runner.ts`.
- The default logical agent is the Codex 5.5 Agent Delegator:
  - `agentId=agent-delegator-codex-55`
  - `profileId=codex-55-agent-delegator`
  - `profileVersion=codex-55-agent-delegator-v1`
  - `provider=openai-codex`
  - `model=gpt-5.5`
- The runner persisted an `AgentInstances` row with `heartbeatCount=1`, `status=succeeded`, and `lastRunId` for the live smoke run.

But the full product loop is not yet good-to-go. The critical missing piece is durable visibility of the actual conversation/output/tool stream. Today the resident runner's Hermes stdout, local status events, and local artifact report stay inside the ECS task filesystem. Control API and the dashboard only see the create-run queued event plus AgentInstances status, not the assistant response, not tool calls, not the heartbeat report artifact, and not resident `run.status`/`artifact.created` events.

Therefore: Hermes is running enough to mark the resident heartbeat succeeded, but the platform cannot yet prove/show messages, tool calls, or responses end-to-end in the user dashboard. The next core slice is a durable resident event/artifact/transcript sink.

## Live environment checked

Region/profile shape used:

```text
AWS_REGION=us-east-1
AWS_PROFILE=${AWS_PROFILE:-agents-cloud-source}
```

Live Control API:

```text
agents-cloud-dev-control-api.ControlApiUrl = https://ajmonuqk61.execute-api.us-east-1.amazonaws.com
```

Live resident task definition:

```text
task family: agents-cloud-dev-resident-runner
active revision: 8
container: resident-runner
AGENTS_RUNTIME_MODE=ecs-resident
AGENTS_MODEL_PROVIDER=openai-codex
AGENTS_MODEL=gpt-5.5
HERMES_TOOLSETS=file,terminal,web,delegation,skills,session_search
```

Live Lambda posture after deploying the current Control API stack:

```text
CreateRunFunction timeout: 30s
CreateRunFunction DISPATCH_RUN_FUNCTION_NAME: agents-cloud-dev-control--DispatchRunFunction8B271-5cnj7XtQS4E3
CreateRunFunction RESIDENT_RUNNER_TASK_DEFINITION_ARN: agents-cloud-dev-resident-runner
DispatchRunFunction timeout: 900s
```

This is better than the previous synchronous cold-start path: CreateRun now returns quickly with an async-lambda execution reference, and DispatchRunFunction does the longer ECS wake.

## Live smoke performed

Smoke input objective:

```text
Live Hermes capability smoke: use any available safe tool to inspect the working directory or environment, then answer in one concise paragraph beginning HERMES_LIVE_SMOKE_OK and mention whether a tool was used.
```

CreateRun Lambda response:

```json
{
  "runId": "run-524cb9d8-7f22-49ba-a254-e32ee0a4d195",
  "workspaceId": "workspace-default",
  "taskId": "task-524cb9d8-7f22-49ba-a254-e32ee0a4d195",
  "status": "queued",
  "executionArn": "async-lambda:agents-cloud-dev-control--DispatchRunFunction8B271-5cnj7XtQS4E3:run-524cb9d8-7f22-49ba-a254-e32ee0a4d195"
}
```

After waiting for dispatch/ECS/Hermes:

AgentInstances row:

```text
userId=smoke-user-hermes-tool-0625
runnerId=runner-run-524cb9d8-7f22-49ba-a254-e32ee0a4d195-runner
agentId=agent-delegator-codex-55
profileId=codex-55-agent-delegator
profileVersion=codex-55-agent-delegator-v1
provider=openai-codex
model=gpt-5.5
status=succeeded
heartbeatCount=1
lastRunId=run-524cb9d8-7f22-49ba-a254-e32ee0a4d195
```

UserRunner row:

```text
status=running
runnerEndpoint=http://10.40.2.180:8787
taskArn=arn:aws:ecs:us-east-1:[REDACTED_ACCOUNT]:task/agents-cloud-dev-cluster/[REDACTED_TASK_ID]
```

EventsTable for that run:

```text
Only one durable event exists:
seq=1 type=run.status status=queued message="Run accepted and queued for execution."
```

ArtifactsTable for that run:

```text
0 items
```

CloudWatch resident runner log:

```text
resident-runner-listening on port 8787
runner status ready
```

Important interpretation:

- The resident task started.
- The runner initialized the logical Codex 5.5 agent.
- The dispatch wake reached the runner and the heartbeat completed enough for `AgentInstances.status=succeeded` and `heartbeatCount=1`.
- However, the actual assistant response and tool usage were not visible from the durable platform because resident events/artifacts/transcript are local-only.

## Source audit: resident Hermes execution path

File: `services/agent-runtime/src/resident-runner-server.ts`

The resident HTTP server exposes:

- `GET /health`
- `GET /state`
- `GET /events`
- `POST /agents`
- `POST /credentials/hermes-auth`
- `POST /wake`
- `POST /shutdown`

In `AGENTS_RUNTIME_MODE=ecs-resident`, `RUNNER_API_TOKEN` is required.

File: `services/agent-runtime/src/resident-runner.ts`

The Hermes process shape is:

```text
hermes chat -q <rendered prompt> -Q --source agents-cloud --max-turns <n> --pass-session-id
  -m <agent.model>
  --provider <agent.provider>
  -t <toolsets>
  --resume <sessionId> when present
```

Runtime defaults:

```text
HERMES_COMMAND=/opt/hermes/.venv/bin/hermes
HERMES_HOME=/runner/hermes
model=gpt-5.5
provider=openai-codex
toolsets=file,terminal,web,delegation,skills,session_search
```

Hermes config bootstrap writes `/runner/hermes/config.yaml` and optional `/runner/hermes/auth.json` from the bootstrap secret/env. Secret contents were not inspected or printed.

### What is captured today

`runProcess()` captures:

- stdout as one final string on success
- stderr only if the process exits non-zero

Then the resident runner writes:

- local state: `/runner/state/resident-runner-state.json`
- local events: `/runner/state/events.ndjson`
- local profiles: `/runner/profiles/<agentId>.json`
- local logs: `/runner/logs/<heartbeatId>.log`
- local artifact report: `/runner/artifacts/<runId>/<artifactId>/heartbeat-report.md`

The resident runner emits local events:

- `run.status planning`
- `run.status running`
- per-agent `run.status failed` if adapter fails
- `artifact.created`
- terminal `run.status succeeded/failed`

### What is not captured today

The following are not durable in AWS state:

- Hermes assistant response text
- Hermes stdout/stderr split
- Hermes tool calls
- tool arguments/results/timing
- model usage/cost
- resident local `run.status` events
- resident local `artifact.created` event
- local heartbeat markdown report
- local transcript/session metadata beyond AgentInstances session/status fields

The current platform-visible durable event ledger stays at `queued` even after the resident agent succeeds.

## Source audit: dispatch/control path

Files:

- `services/control-api/src/handlers.ts`
- `services/control-api/src/lambda-async-execution.ts`
- `services/control-api/src/runner-dispatcher.ts`
- `services/control-api/src/runner-dispatcher-aws.ts`
- `infra/cdk/src/stacks/control-api-stack.ts`

Current source now supports:

- Async dispatch Lambda handoff, so public CreateRun does not block on cold ECS/Hermes.
- VPC-attached dispatch Lambda for private Fargate IP wake calls.
- ECS RunTask launcher with per-user overrides.
- DescribeTasks polling for private IP only after ECS `RUNNING`.
- Brief wake retry after ECS `RUNNING`.
- Stable task-definition family name instead of exact revision export.

Live deployment was updated during this audit to include the new `DispatchRunFunction`.

### Remaining control gap

`DispatcherExecutionStarter.startExecution()` calls `dispatchRunnerWake()` and returns only a task ARN-compatible execution reference. It does not ingest the resident `/wake` response into Control API stores.

The wake response contains local events/artifacts, but the dispatcher currently discards those details after successful wake.

## Source audit: Agent Creator / Apify / Kanban / Dashboard

### Agent Creator

Files:

- `services/agent-creator/src/cli.ts`
- `services/agent-creator/src/workshop.ts`
- `services/agent-creator/src/profile-bundle.ts`
- `services/control-api/src/agent-profiles.ts`
- `apps/web/components/admin-console.tsx`

Current capabilities:

- Agent Creator CLI exists and can run scenarios/interactively.
- Workshop phases exist: intake, research, tool policy, profile draft, quarantine eval, user review, promotion/revision.
- Profile bundle writer emits `profile.json`, `SOUL.md`, config fragment, policy files, eval pack, scorecard, changelog, manifest.
- Control API can create/list/get/approve AgentProfileVersion records and S3 profile artifacts.
- Admin console has Agent Workshop/profile registry UI.

Not yet complete:

- Approved profile versions are not automatically materialized into running resident agents.
- Main `/agents` page is still placeholder.
- There is no user-facing agent directory showing all logical agents/direct reports.
- Promotion remains intentionally gated; workshop output is not automatically “hire this specialist into my resident team.”

### Apify CLI

Files:

- `tools/apifycli/apifycli`
- `tools/apifycli/README.md`
- `services/agent-creator/src/workshop.ts`
- `services/agent-creator/src/interactive.ts`

Current capabilities:

- Zero-dependency Apify CLI exists.
- Supports discovery, validation, sync run, async run/status/log/items/abort, account commands.
- Agent Creator has Apify-aware tool policy concepts.

Not yet complete:

- Agent Creator does not appear to call `tools/apifycli/apifycli` directly in service code.
- Apify tool prototyping remains more manual/CLI-policy-based than an integrated Agent Workshop automation loop.

### Kanban / work board

Files:

- `services/control-api/src/work-items.ts`
- `apps/web/components/app/work-dashboard.tsx`
- `apps/web/lib/use-work-items.ts`
- `apps/desktop_mobile/lib/src/widgets/kanban_board.dart`

Current capabilities:

- Durable WorkItems exist in Control API.
- Web dashboard can create/list/select work items and fetch runs/events/artifacts/surfaces.
- Flutter has a four-column Kanban board component.

Not yet complete:

- Web board is list/detail, not a full four-column Kanban.
- There is no agent-to-agent task assignment/checkout/comment protocol equivalent to Paperclip issues.
- WorkItem status vocabularies are not fully aligned across backend/web/Flutter.
- Agent delegation does not yet create child tasks assigned to specialist agents in a durable graph.

### Dashboard/state

Current capabilities:

- DynamoDB tables exist for `AgentInstances`, `AgentProfiles`, `UserRunners`, `WorkItems`, `Events`, `Artifacts`, `Surfaces`, approvals, etc.
- AgentInstances are written by resident runner.
- Admin console has runner/profile/run visibility pieces.

Not yet complete:

- No Control API list endpoint for AgentInstances was found.
- Main Agents dashboard is placeholder.
- No durable transcript/message viewer for resident Hermes output.
- No durable artifact created by resident heartbeat.

## Paperclip / Hermes Paperclip Adapter implications

Relevant upstream references:

- `https://github.com/paperclipai/paperclip`
- `https://github.com/NousResearch/hermes-paperclip-adapter`

The important model is Paperclip-style company control plane, not a simple queue:

```text
CEO/user goal
  -> executive assistant / chief-of-staff delegator
  -> task graph / issues / comments / approvals
  -> specialist agents with roles, capabilities, budgets, sessions
  -> heartbeat windows
  -> durable logs/transcripts/artifacts/activity
  -> user/admin dashboard and live updates
```

Paperclip concepts that map directly to Agents Cloud:

- Agents are employees in an org chart.
- Agents have roles, capabilities, budgets, statuses, and reporting lines.
- Work is issue/task based, with parent/child links, comments, blockers, checkout/locking, and work products.
- Agents run short heartbeat windows, not infinite unbounded loops.
- Wake reasons include assignment, schedule, comment, manual, automation, approval/callback.
- Heartbeat runs persist status, logs, stdout/stderr excerpts, session state, cost/usage, and live activity.
- Adapters have a server execution contract, session codec, environment test, UI transcript parser, and config schema.

Hermes Paperclip Adapter-specific implications:

- It runs Hermes using `hermes chat -q` in quiet/single-query mode.
- It supports `--resume`, toolsets, model/provider, persistent sessions, worktree/checkpoint/yolo flags.
- It parses Hermes stdout into transcript entries, including assistant messages and tool-ish lines.
- It treats adapter stdout/transcripts as UI-visible artifacts, not hidden local files.

Agents Cloud should borrow the adapter boundary and heartbeat state model, not necessarily vendor Paperclip wholesale.

## Readiness matrix

| Capability | Current status | Evidence | Product readiness |
|---|---:|---|---:|
| ECS resident runner starts | Works | ECS task RUNNING, CloudWatch listening log | 80% |
| Hermes installed in runner image | Works by source/image config | resident Docker/HERMES_COMMAND | 75% |
| Hermes invoked on wake | Partially proven | AgentInstances heartbeatCount=1/status=succeeded | 65% |
| Actual assistant response visible to user | Not done | EventsTable only queued; no artifact row | 20% |
| Tool calls visible | Not done | no structured tool event capture/parser | 10% |
| Durable resident events | Not done | resident events local-only | 20% |
| Durable resident artifacts | Not done | ArtifactsTable empty; local file:// only | 15% |
| AgentInstances dashboard state | Backend write works | AgentInstances row persisted | 55% |
| User-facing Agents page | Placeholder | app `(console)/agents/page.tsx` | 15% |
| Agent Creator CLI/profile registry | Exists | `services/agent-creator`, Control API profile routes | 65% |
| Auto-hire/materialize created agents | Not done | no profile -> resident /agents link | 20% |
| Apify CLI | Exists | `tools/apifycli` | 65% |
| Apify integrated into workshop runtime | Partial | policy exists, service call absent | 35% |
| Kanban/task board | Partial | WorkItems + Flutter Kanban; web list/detail | 50% |
| Agent-to-agent delegation graph | Not done | no durable child-task assignment protocol | 25% |
| Paperclip heartbeat model | Partial | resident heartbeat exists, no wake queue/session ledger | 35% |

## Recommended next implementation slices

### Slice 1 — Durable resident heartbeat sink (highest priority)

Goal: make the actual Hermes response, status events, and artifact report visible through the existing Control API/dashboard path.

Implement one of two small designs:

Option A: dispatcher ingests `/wake` response:

1. Extend `DispatcherExecutionStarter` to take wake response events/artifacts.
2. Convert resident local events into canonical `EventRecord`s.
3. Append them to EventsTable with correct sequence numbers after the initial queued event.
4. Upload heartbeat report text to S3 and insert ArtifactsTable row.
5. Update Run status to succeeded/failed after wake completes.
6. Add tests proving queued -> planning/running/artifact/succeeded appears via `GET /runs/{runId}/events`.

Option B: resident runner writes directly to durable AWS sinks:

1. Inject EventsTable/ArtifactsTable/S3 bucket env into resident task.
2. Add resident `DurableRunSink` similar to existing stateless runtime artifact sink.
3. Write canonical events/artifacts as they happen.
4. Update run/task status from runner or a brokered API.
5. Add idempotency/sequence safeguards.

Option A is smaller. Option B is more scalable and closer to Paperclip heartbeat architecture.

### Slice 2 — Hermes transcript/tool parser

Goal: answer “do we see tool calls?” with real evidence.

1. Add a transcript parser based on Hermes Paperclip Adapter patterns.
2. Parse assistant messages and tool-ish quiet output lines.
3. Persist normalized transcript events:
   - `agent.message`
   - `tool.call`
   - `tool.result`
   - `tool.error`
   - `run.log`
4. Store raw stdout/stderr separately and redact secrets.
5. Render transcript in admin first, then simplified user chat.

### Slice 3 — Agent directory and materialization

Goal: created/delegated agents show up and can be addressed.

1. Add Control API list/get for AgentInstances by user/workspace.
2. Replace placeholder `/agents` page with the actual AgentInstances directory.
3. Add “hire/materialize approved profile” endpoint:
   - choose approved AgentProfileVersion
   - call resident `/agents` or enqueue registration
   - persist AgentInstance `idle`
4. Show agent status, role, model/provider, last heartbeat/run, parent/delegator relationship.

### Slice 4 — Delegation/task graph

Goal: the executive assistant agent can assign work like a company chief-of-staff.

1. Extend WorkItems with parent/child/dependency/assignee agent fields.
2. Add checkout/lock/comment endpoints.
3. Add wake reasons and wake payloads:
   - `manual`
   - `assignment`
   - `comment`
   - `scheduled_heartbeat`
   - `approval_decision`
4. Let Agent Delegator create child WorkItems assigned to specialist AgentInstances.
5. Add a compact agent-facing API similar to Paperclip:
   - me
   - inbox
   - task context
   - checkout
   - update status
   - comment
   - attach artifact/surface

### Slice 5 — Agent Creator + Apify integration

Goal: generated specialists become usable team members with governed tools.

1. Agent Creator CLI can remain, but add Control API/workshop action that runs it as a durable WorkItem/run.
2. Add Apify CLI discovery/prototype calls behind budget/approval policy.
3. Store tool-policy evidence in profile bundle.
4. Promote approved profile into the resident agent directory.
5. Allow the Agent Delegator to request “create/recruit specialist X” as a gated workflow.

## Immediate answer to the user questions

### Does Hermes run on that thing?

Yes, the resident ECS runner is configured to run Hermes, and the live smoke produced a successful resident heartbeat. The source path invokes `hermes chat -q` in the ECS container.

### Do messages go back and forth?

Partially. The Control API sends the user objective to the resident runner through `/wake`. Hermes likely produces stdout inside the runner, but that message is not durably surfaced back to Control API/UI today. The user-visible event stream only shows the initial queued event.

### Do we see tool calls?

No. Tool calls are not structurally captured or persisted. The current configuration also asks Hermes not to emit noisy internal tool calls. Any tool activity would be buried in local stdout/log files inside the ECS task, not visible in DynamoDB events or dashboard.

### Can we actually use this?

Use it as a backend smoke foundation, not as the finished product. It can launch a Codex 5.5 resident agent and complete a heartbeat. It cannot yet provide the user-grade “chat with executive assistant, see delegated agents working, inspect messages/tool calls/artifacts” loop.

## Validation performed in this audit

Commands/tests run:

```text
pnpm control-api:test             passed, 67 tests
pnpm infra:build                  passed
pnpm infra:test                   passed, 10 tests
cdk deploy control-api            passed, added DispatchRunFunction
live Lambda smoke                 returned 202 async dispatch
ECS task verification             resident task RUNNING
AgentInstances scan               status=succeeded heartbeatCount=1
EventsTable scan                  only queued event found
ArtifactsTable scan               no resident artifact found
```

Temporary files created for smoke:

```text
tmp-hermes-live-smoke-event.json
```

This file should not be committed.

## Bottom line

The correct status is:

```text
Core ECS/Hermes runner foundation: working.
Actual product-visible agent conversation/tool/artifact loop: not yet complete.
Delegator/company/Kanban model: partially scaffolded, needs durable task graph + agent-facing API.
Agent Creator/Apify: useful foundations exist, not yet wired into auto-hiring/delegation.
```

The next commit should not be “more model config.” It should be the durable resident sink + transcript parser, because that is the difference between “Hermes ran somewhere” and “the user can actually use and trust the agent.”

## Fast-path simplification update — user direction

After the audit, the implementation direction was simplified deliberately:

```text
Do not build a full low-level tool-call watcher/UI parser right now.
Persist the important business events only:
- final or meaningful artifacts,
- generated webpages / preview publications,
- agent delegation events,
- agent profile creation/promotion events,
- review/feedback events,
- WorkItem/task events that affect the live board.
```

This matches the employee-over-the-shoulder model: the product does not need to show every search, file read, or internal CLI call. It needs to show the moments when a teammate creates something, delegates something, asks for approval, publishes something, or finishes.

### Smallest backend checkpoint implemented in code

The current resident runner code now moves toward that fast path:

- Resident wakes can write durable `run.status` events through `DynamoEventSink` when table env vars are present.
- Resident heartbeat reports can upload to S3 and write `ArtifactsTable` rows through `AwsArtifactSink` when artifact env vars are present.
- Resident output supports high-signal fenced events only, using:

````text
```agents-cloud-event
{"type":"agent.delegated","payload":{"delegatedAgentId":"agent-ui-polish","workItemId":"workitem-ui-polish","objective":"Polish the review walkthrough controls"}}
```
````

- Allowed high-signal event types currently include:
  - `agent.delegated`
  - `agent.profile.requested`
  - `agent.profile.revision_proposed`
  - `agent.profile.promoted`
  - `work_item.created`
  - `work_item.assigned`
  - `review.session.created`
  - `review.feedback.recorded`
  - `webpage.published`

Everything else, including normal `tool.call`, is intentionally ignored by the resident output bridge for now.

### What this means for the next live smoke

The next deployed smoke should prove only the critical product facts:

1. `/runs` returns quickly with queued/accepted state.
2. Dispatch Lambda wakes or launches the resident runner.
3. Resident runner marks the run `running` then `succeeded` or `failed`.
4. A heartbeat markdown artifact lands in S3 and `ArtifactsTable`.
5. If the agent emits a fenced `agents-cloud-event`, it appears in `EventsTable`.
6. AgentInstances reflects the resident Codex 5.5 Delegator status/heartbeat.

If those pass, the platform has the minimum useful CEO-style substrate: a main agent can work for a while, create a durable artifact, and emit a small number of special business events without exposing noisy internal tool activity.

### Deferred on purpose

These are now intentionally deferred until they become necessary:

- Full Hermes transcript parser.
- Full low-level tool-call event stream.
- UI for every internal search/shell/file operation.
- Graph database semantics beyond existing WorkItem/run/event/artifact links.

The near-term focus should stay on:

- artifacts,
- WorkItems/Kanban,
- special delegation/profile/review/publish events,
- agent directory/AgentInstances,
- and voice/call/review flows built on top of those primitives.

## Verified deployment checkpoint — durable fast path

A later deployed smoke verified the simplified fast path end-to-end after the resident runner was changed to construct itself from environment-backed sinks and after DynamoDB document clients were configured to remove nested undefined values.

Smoke run:

```text
runId=run-idem-685eec5faedb57d73115757c
taskId=task-idem-685eec5faedb57d73115757c
user=smoke-user-fastpath-0730
resident task definition=agents-cloud-dev-resident-runner:14
```

Durable evidence observed:

```text
EventsTable rows: 6
  seq=1 run.status queued
  seq=2 run.status planning
  seq=3 run.status running
  seq=4 agent.delegated
  seq=5 artifact.created
  seq=6 run.status succeeded

ArtifactsTable rows: 1
  kind=report
  name=Agent Delegator heartbeat report
  uri=s3://[REDACTED_BUCKET]/workspaces/workspace-default/runs/run-idem-685eec5faedb57d73115757c/artifacts/.../heartbeat-report.md

AgentInstances rows for smoke user: 1
  agentId=agent-delegator-codex-55
  provider=openai-codex
  model=gpt-5.5
  status=succeeded
  heartbeatCount=1
  lastRunId=run-idem-685eec5faedb57d73115757c
```

This changes the readiness answer: the product-visible low-noise loop is now proven for run lifecycle, one high-signal delegation event, one S3-backed report artifact, and AgentInstances status. It still does not create the delegated specialist/work item as a real child object; today `agent.delegated` is a durable event contract, not yet a materialized child-agent/task workflow.

### Fixes made during this checkpoint

- Resident HTTP server now uses `ResidentRunner.fromEnvironment()` so ECS table/bucket env vars activate the same artifact sink as non-server runtime construction.
- Runtime DynamoDB document clients use `marshallOptions.removeUndefinedValues=true`, preventing nested optional metadata from crashing resident `/wake`.
- Resident prompts explicitly tell the delegator to emit only high-signal `agents-cloud-event` fenced JSON blocks, not ordinary tool-call telemetry.
- The resident runner supports a timeout fallback knob for demo safety, but the deployed default keeps fallback disabled so normal Hermes timeouts fail instead of being marked as successful.
- The Hermes subprocess receives a separate engagement token for `agents-cloud-user` calls, not the runner admin token; `/engagement/*` rejects the admin token in tests.
- `DispatchRunFunction` uses a 900-second timeout so the 150-second ECS launch wait plus 600-second resident Hermes default fit within the async dispatch budget.

### Remaining smallest next slice

The next practical slice is materialization, not observability: when `agent.delegated` or `work_item.created` appears, convert it into real WorkItem/AgentInstance records behind the same durable event ledger. That gives the Kanban board and agent directory real child tasks/teammates without building a full tool-call parser.
