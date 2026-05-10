# Runner, Delegation, and Main-Agent Deep Audit

Date: 2026-05-10
Auditor: Hermes / OpenAI Codex gpt-5.5
Repo: `/Users/sebastian/Developer/agents-cloud`

## Executive summary

The short answer to "does Hermes actually run on the runner, do messages go back
and forth, do we see responses, can we use this?" is:

**Yes, locally, the core resident-runner path now works.**

Verified in this audit:

- Hermes CLI is installed and callable on this machine.
- Hermes CLI can run a real tool call and produce a real response.
- The Agents Cloud resident runner HTTP server can boot locally.
- The resident runner can accept a `/wake` request.
- The resident runner can invoke Hermes through the `hermes-cli` adapter.
- The wake produces run-status events, a heartbeat record, and a markdown report
  artifact.
- Agent-runtime tests pass, including resident runner HTTP API tests.
- Control API tests pass, including user-runner dispatch tests, work items,
  surfaces, artifacts, agent profile registry, and runner state control tests.
- Realtime API tests pass for WebSocket authorization, subscriptions, fanout, and
  user scoping.
- Agent Creator tests pass for workshop/profile-bundle behavior.
- The local Apify CLI exists and exposes discovery/run/status/log/items commands,
  but live Apify calls were not run because `APIFY_TOKEN` is not set.

The important caveat is:

**This is not yet a fully productized CEO/executive-assistant multi-agent company
loop.** The runtime foundation is real, but several product-critical layers are
still missing or only partially wired:

- The main delegator can run as a Hermes resident agent, but its durable authority
  model is still mostly prompt/config based rather than a first-class main-agent
  orchestration contract.
- The resident runner can run multiple logical agents, but the visible Kanban / UI
  company model is not yet fully driven by live logical-agent task state and
  delegation lineage.
- Hermes tool calls are visible in direct CLI output, but resident-runner quiet
  mode currently stores only the final raw response in the heartbeat report; it
  does not yet persist structured tool-call transcript events for UI inspection.
- The Agent Creator can draft/validate/profile/approve specialists, but approved
  profiles are not yet promoted into the resident Hermes runner as live specialist
  instances with eval/quarantine evidence.
- The Apify CLI is present, but credential brokering and approved actor execution
  are not yet production-wired.
- The call/voice/review-walkthrough UX is not implemented yet. It should sit on
  top of the same main-agent, Surface, client-control, artifact, and review-state
  primitives described in the GenUI/client-control plan.

## Repo state at audit time

`git status --short --branch` showed:

```text
## main...origin/main [ahead 1]
 M apps/desktop_mobile/lib/src/screens/chat_screen.dart
 M apps/web/components/app/hero-command-panel.tsx
 M apps/web/components/app/runs-chat.tsx
 M apps/web/lib/control-api.ts
 M apps/web/lib/realtime-client.ts
 M apps/web/test/realtime-client.test.ts
 M apps/web/test/work-items.test.ts
 M infra/cdk/src/stacks/control-api-stack.ts
 M infra/cdk/src/test/workitem-genui-infra.test.ts
 M pnpm-lock.yaml
 M scripts/smoke-websocket-run-e2e.mjs
 M services/control-api/package.json
 M services/control-api/src/handlers.ts
?? apps/web/lib/use-run-realtime-events.ts
?? docs/agent-workstreams/handoffs/2026-05-10-0554-clients-to-agent-harness-resident-runner-demo-contract.md
?? services/control-api/src/lambda-async-execution.ts
?? services/control-api/test/lambda-async-execution.test.ts
?? tmp-hermes-live-smoke-event.json
```

Recent commits at audit time:

```text
92fc219 docs: plan agent-controlled GenUI architecture
9d927fc feat: wire resident runner dispatch and desktop polish
fea7b6a fix(flutter): prevent macos auth sign-in hang
99973c9 feat: add Agent Creator Apify CLI workflow
fa9d48b feat(flutter): redesign agent workspace and polish lab UI
```

This audit intentionally avoided changing the existing application/runtime code.

## What was tested

### 1. Hermes CLI availability

Command:

```bash
hermes --version
```

Observed:

```text
Hermes Agent v0.12.0 (2026.4.30)
Project: /Users/sebastian/.hermes/hermes-agent
Python: 3.11.15
OpenAI SDK: 2.32.0
Update available: 958 commits behind — run 'hermes update'
```

Interpretation:

- Hermes is installed and runnable.
- It is old relative to upstream, but functional.
- Any production path should pin/validate a minimum Hermes CLI version because the
  runner relies on flags such as `--source`, `--max-turns`, `--pass-session-id`,
  `--resume`, and toolset selection.

### 2. Direct Hermes tool-call smoke

Command:

```bash
hermes chat -q 'You must use the terminal tool to run pwd and then reply with the cwd prefixed by CWD_RESULT:. Do not answer from memory.' -t terminal --max-turns 4 --source agents-cloud-audit --pass-session-id
```

Observed output included:

```text
┊ 💻 $         pwd  0.4s
CWD_RESULT:/Users/sebastian/Developer/agents-cloud
Session:        20260510_062151_9c0d7f
Messages:       4 (1 user, 2 tool calls)
```

Interpretation:

- Direct Hermes tool calls work.
- Tool-call output is visible when not running in quiet mode.
- This proves the local Hermes binary can execute tools in this repo context.

### 3. Resident runner live smoke

Started local resident runner:

```bash
AGENTS_RUNNER_ROOT=/tmp/agents-cloud-resident-live-smoke \
PORT=8897 \
HERMES_TOOLSETS=terminal \
AGENTS_HERMES_MAX_TURNS=4 \
AGENTS_MODEL_PROVIDER=openai-codex \
AGENTS_MODEL=gpt-5.5 \
node services/agent-runtime/dist/src/resident-runner-server.js
```

Health check:

```bash
curl -s http://127.0.0.1:8897/health
```

Observed runner health:

```json
{
  "status": "ok",
  "runner": {
    "runnerId": "runner-local-001",
    "runnerSessionId": "session-1778412141846",
    "orgId": "org-local-001",
    "userId": "user-local-001",
    "workspaceId": "workspace-local-001",
    "mode": "resident-dev",
    "status": "ready"
  }
}
```

Wake request:

```bash
curl -s -X POST http://127.0.0.1:8897/wake \
  -H 'Content-Type: application/json' \
  -d '{"runId":"run-live-smoke","taskId":"task-live-smoke","objective":"Live smoke. Use the terminal tool exactly once to run pwd, then summarize the result in one sentence prefixed LIVE_RESIDENT_OK."}'
```

Observed result:

```json
{
  "runId": "run-live-smoke",
  "taskId": "task-live-smoke",
  "heartbeats": [
    {
      "heartbeatId": "heartbeat-run-live-smoke-agent-delegator-codex-55",
      "agentId": "agent-delegator-codex-55",
      "status": "succeeded",
      "summary": "LIVE_RESIDENT_OK Current workspace is /private/tmp/agents-cloud-resident-live-smoke/workspace/agent-delegator-codex-55.",
      "artifactIds": [
        "artifact-task-live-smoke-agent-delegator-codex-55-heartbeat"
      ],
      "adapterKind": "hermes-cli"
    }
  ]
}
```

Observed events:

- `run.status` planning: resident runner accepted wake request.
- `run.status` running: Agent Delegator heartbeat started.
- `artifact.created`: heartbeat report artifact created.
- `run.status` succeeded: resident runner wake completed.

Observed artifact:

`/tmp/agents-cloud-resident-live-smoke/artifacts/run-live-smoke/artifact-task-live-smoke-agent-delegator-codex-55-heartbeat/heartbeat-report.md`

The artifact contains the final summary and raw Hermes output.

Interpretation:

- The actual local runner can execute the actual Hermes CLI.
- Messages do go through the `/wake` API into Hermes and back into runner output.
- The runner emits canonical events and a report artifact.
- The current artifact does not show structured tool-call details because the
  resident runner invokes Hermes with `-Q` quiet mode and server bootstrap config
  sets `display.tool_progress: false`. This is acceptable for a smoke but not
  enough for product-grade auditability.

### 4. Focused package validation

Command group:

```bash
pnpm agent-runtime:test
pnpm control-api:test
pnpm realtime-api:test
pnpm agent-creator:test
```

Results:

- `pnpm agent-runtime:test`: 23/23 pass.
- `pnpm control-api:test`: 67/67 pass.
- `pnpm realtime-api:test`: 11/11 pass.
- `pnpm agent-creator:test`: 6/6 pass.

Log saved at:

`/tmp/agents-cloud-runner-audit-validation.log`

### 5. Apify CLI availability

Command:

```bash
./tools/apifycli/apifycli --help
```

Observed:

- CLI exists.
- It supports `search`, `get`, `openapi`, `readme`, `validate`, `run-sync`,
  `run`, `status`, `log`, `items`, `abort`, `me`, and `runs`.

Attempted harmless search:

```bash
./tools/apifycli/apifycli search --q 'website content crawler' --limit 1
```

Observed:

```text
error: APIFY_TOKEN not set in environment
```

Interpretation:

- The local Apify CLI tool exists and is wired as a zero-dependency helper.
- Live Apify discovery/runs require `APIFY_TOKEN` in environment.
- This is appropriate: production should not expose raw Apify tokens to arbitrary
  agents; it should use a scoped broker/approval path.

## What exists in Agents Cloud now

### Agent runtime

Key files:

- `services/agent-runtime/src/resident-runner.ts`
- `services/agent-runtime/src/resident-runner-server.ts`
- `services/agent-runtime/src/gateway-hermes-runner.ts`
- `services/agent-runtime/src/local-harness.ts`
- `services/agent-runtime/test/resident-runner.test.ts`
- `services/agent-runtime/test/gateway-hermes-runner.test.ts`
- `services/agent-runtime/test/local-harness.test.ts`

Capabilities now present:

- Tenant-scoped resident runner state.
- Multiple logical agents inside one resident runner.
- Logical agent registration.
- `/health`, `/state`, `/events`, `/agents`, `/wake`, `/shutdown` HTTP API.
- Optional runner API token enforcement in `ecs-resident` mode.
- Hermes auth upload endpoint guarded by runner API token.
- Hermes home bootstrap.
- Default delegator profile.
- Hermes CLI invocation through `hermes chat`.
- Session resume storage through `--pass-session-id` and parsed session output.
- Per-agent workspace directories.
- Run status events and artifact-created events.
- Markdown heartbeat report artifacts.
- Tenant boundary validation for registered profiles.
- Tests for credential non-exposure to Hermes child processes.

Current limitation:

- It is a heartbeat runner, not yet a rich multi-agent company operating system.
- Tool-call telemetry is not yet first-class in runner events.
- Delegated subagents inside Hermes are possible through Hermes toolsets, but not
  yet represented as durable Agents Cloud logical-agent child tasks with lineage,
  assignment, health, sentiment, QC, and agent-version evolution.

### Control API

Key files:

- `services/control-api/src/handlers.ts`
- `services/control-api/src/runner-dispatcher.ts`
- `services/control-api/src/runner-dispatcher-aws.ts`
- `services/control-api/src/user-runners.ts`
- `services/control-api/src/dynamo-store.ts`
- `services/control-api/src/agent-profiles.ts`
- `services/control-api/test/runner-dispatcher.test.ts`

Capabilities now present according to tests:

- WorkItem creation/listing/get/update.
- Run creation linked to WorkItems.
- Idempotent run creation.
- Ordered event queries.
- Artifact listing/get/presigning scoped to owner.
- Surface creation/publish/list/get scoped to owner.
- Agent profile draft/list/get/approve registry path.
- User runner create/read/update/heartbeat/admin-list path.
- Runner dispatcher can:
  - use an already-running runner,
  - auto-create runner rows,
  - launch/relaunch runners,
  - observe ECS private IPs,
  - wait for ECS `RUNNING`,
  - surface launch/wake failures.

Current limitation:

- Full tenant/workspace membership/capability authorization remains an explicit
  hardening priority.
- Promotion of approved Agent Creator profiles into a live resident runner is not
  complete.
- End-to-end deployed path from Control API create-run -> resident ECS runner ->
  realtime client -> UI artifact review still needs one integrated smoke with
  evidence.

### Realtime API

Key files:

- `services/realtime-api`
- `apps/web/lib/realtime-client.ts`
- `scripts/smoke-websocket-run-e2e.mjs`

Capabilities now present according to tests:

- WebSocket token extraction.
- Authorizer response.
- Connection persistence.
- Subscribe/unsubscribe.
- Disconnect cleanup.
- Run event fanout.
- User-scoped event delivery.
- Stale/malformed connection cleanup.

Current limitation:

- Realtime event payloads are currently run/artifact/status oriented.
- They do not yet include the full future client-control protocol:
  `client.command`, `client.observation`, `surface.patch`, `voice.call`, review
  walkthrough state, etc.

### Agent Creator / profile lifecycle

Key files:

- `services/agent-creator/src/cli.ts`
- `services/agent-creator/src/workshop.ts`
- `services/agent-creator/src/profile-bundle.ts`
- `packages/agent-profile`
- `docs/roadmap/AGENT_WORKSHOP_LIFECYCLE.md`

Capabilities now present:

- Interactive or scenario-driven profile draft simulation.
- Auditable workshop request generation.
- Profile bundle writer with hashes/manifest.
- Scorecard that blocks promotion when evals/gates/evidence are missing.
- Control API registry path can persist/list/get/approve versions.
- Apify posture is represented in policy as allowed / approval-required / denied.

Current limitation:

- Agent Creator does not yet run a real conversational interview loop backed by
  live Hermes.
- Quarantine eval execution is not yet wired.
- Promotion into runner context is not yet wired.
- Profile version changes are not yet reflected as visible agent version bumps in
  the product UI.

### Flutter/Web clients

Relevant current direction:

- Flutter desktop has a more polished command-center shell with agent list,
  embedded chat, Kanban, Browser, GenUI Lab, UI Kit.
- Web has WorkItem/run/realtime client work underway in the working tree.
- GenUI architecture plan now exists at:
  `docs/roadmap/AGENT_CONTROLLED_GENUI_ARCHITECTURE_AND_PHASE_PLAN_2026_05_10.md`

Current limitation:

- The clients are not yet the live review cockpit described by the user.
- The Kanban board and agent list need to become live projections of WorkItems,
  agent instances, runner state, delegated tasks, review requests, and artifacts.
- Voice/call mode and review walkthrough mode are not yet implemented.

## Paperclip / Hermes adapter findings

Upstream repos inspected:

- `https://github.com/NousResearch/hermes-paperclip-adapter`
- `https://github.com/paperclipai/paperclip`

Local audit clones:

- `/tmp/paperclip-audit/hermes-paperclip-adapter`, commit `937ea71`
- `/tmp/paperclip-audit/paperclip`, commit `eb12c42`

### Paperclip model that matters for Agents Cloud

Paperclip V1 is a control plane for AI-agent companies:

- Human creates a company and goals.
- Board creates agents in an org tree.
- Agents receive tasks through heartbeat invocations.
- Work is tracked through issues/comments.
- Cost/budget and audit visibility are first-class.
- Board can intervene anywhere.

Core semantics worth borrowing:

- Strict single-assignee task ownership.
- Heartbeat invocations as bounded work turns.
- `last_heartbeat_at` and run status as liveness signals.
- Agent API keys scoped to company/agent.
- Issue checkout/active execution semantics.
- Non-terminal issue liveness contract: every open issue needs a clear next path.
- Parent/subtask structure is separate from blocker dependencies.
- Recovery issues instead of silent dead states.
- Board-visible activity log for mutating actions.

### Hermes Paperclip adapter model

The Hermes adapter is a Paperclip server adapter that:

- exposes adapter type `hermes_local`,
- runs Hermes Agent as a managed employee,
- executes `hermes chat -q ...`,
- can pass model/provider/toolsets/worktree/checkpoint/session config,
- can resume Hermes sessions across heartbeats with `--resume`,
- can parse Hermes stdout into Paperclip transcript entries,
- maps Hermes tool output lines into structured `tool_call` / `tool_result`
  transcript entries for UI display.

Key adapter details:

- It defaults to `persistSession: true`.
- It uses Paperclip agent/company/task variables in the prompt.
- It instructs Hermes to use `curl` against the Paperclip API for local work.
- It passes `--source tool` so sessions do not clutter normal user history.
- It can pass `--yolo` because Paperclip agents are non-interactive subprocesses.
- It includes a stdout parser that turns Hermes lines such as `┊ 💻 $ curl ...`
  into structured tool cards.

### Gap vs Agents Cloud resident runner

Agents Cloud already has the runner/heartbeat shape, but should borrow the
adapter's transcript strategy.

Today in Agents Cloud:

- Resident runner calls Hermes in quiet mode.
- It stores a markdown heartbeat report.
- It emits run status and artifact events.

Missing compared to Paperclip adapter:

- Structured transcript entries for assistant messages.
- Structured tool-call/tool-result entries.
- UI grouping of tool calls.
- Session display ID in client surfaces.
- Clear heartbeat transcript separate from final artifact.
- First-class issue/comment/task mutation workflow available to the agent through
  scoped API tools.

Recommendation:

- Keep the Agents Cloud resident runner architecture.
- Add a transcript parser/event layer inspired by `hermes-paperclip-adapter`.
- Do not import Paperclip wholesale; selectively copy the proven primitives:
  heartbeat, issue/task liveness, structured transcript parsing, org/delegation
  semantics, and recovery rules.

## Core product architecture recommendation

The user's desired system is best framed as:

**A resident CEO assistant / main agent running inside a user-scoped Hermes
runner, with authority to delegate to specialist logical agents, maintain a live
Kanban/work graph, brief the user through artifacts, and evolve specialists from
review feedback.**

The main agent should be special, but not magical:

- It is the default user-facing agent.
- It has the client-control and review-walkthrough tools.
- It can create WorkItems and delegate sub-work.
- It can register/request/promote specialist profiles through Agent Creator.
- It can summarize global state.
- It can call the user / start a review session.
- It can record feedback against artifacts, tasks, and agent versions.
- It can propose changes to specialist profiles.

Specialists:

- Run as logical agents inside the same user runner boundary.
- Own assigned WorkItems/tasks.
- Produce artifacts and status events.
- Can request approvals/questions.
- Do not directly remote-control the user's client unless explicitly escalated
  through the main agent.

This preserves the company analogy:

- The user is CEO/operator.
- The main agent is executive assistant / chief of staff / delegator.
- Specialists are direct reports or teams.
- Everyone can surface issues to the CEO, but the main agent owns the coherent
  operating picture.

## Required next build phases

### Phase 1: Runner transcript and tool-call visibility

Goal: make every Hermes heartbeat auditable, not just summarized.

Build:

- Add structured resident transcript records:
  - assistant message
  - tool call
  - tool result
  - stderr/system group
  - session id
  - token/cost when available
- Parse Hermes stdout using a strategy similar to `hermes-paperclip-adapter`.
- Emit canonical events for tool calls/results or attach them to a run transcript
  artifact.
- Add UI rendering for tool cards in web/Flutter run detail.

Why next:

The user explicitly asked whether we see tool calls. Direct CLI yes; resident UI
no. This is the immediate observability gap.

### Phase 2: Main-agent orchestration contract

Goal: make the main agent a product primitive.

Build:

- Add a `mainAgentId` / `delegatorAgentId` per workspace/user runner.
- Define capabilities:
  - delegate work,
  - create/update WorkItems,
  - create specialist profile draft requests,
  - start review walkthroughs,
  - send client-control commands,
  - summarize global state.
- Make only the main agent eligible for client-control and voice review tools by
  default.
- Add tests proving specialists cannot silently control user UI.

### Phase 3: WorkItem/Kanban as the durable company work graph

Goal: every piece of delegated work appears as live state.

Build:

- Treat WorkItems as the Agents Cloud equivalent of Paperclip issues.
- Add parent/child WorkItem relationships.
- Add blockers/dependencies.
- Add assignee logical-agent IDs.
- Add checkout/execution run IDs.
- Add explicit liveness/recovery states.
- Add comments/notes/feedback linked to WorkItems and artifacts.
- Project Kanban board directly from WorkItems and runner/agent state.

### Phase 4: Delegation events and logical-agent lineage

Goal: when the main agent delegates, the UI and state know exactly what happened.

Build canonical events:

- `agent.delegated`
- `agent.heartbeat.started`
- `agent.heartbeat.finished`
- `work_item.assigned`
- `work_item.blocked`
- `review.requested`
- `feedback.recorded`
- `agent_profile.revision_proposed`
- `agent_profile.promoted`

Tie each event to:

- user/workspace/org,
- runner,
- main agent,
- specialist agent,
- WorkItem,
- run,
- artifact IDs.

### Phase 5: Agent Creator promotion loop

Goal: created specialists become real runtime agents after governance.

Build:

- Quarantine eval execution for approved profiles.
- Profile promotion route.
- Runner registration of promoted profile versions.
- Profile hash/version binding in runner state.
- UI-visible agent version changelog.
- Agent capability/tool inventory panel.

This is where sentiment and self-evolution become safe:

- Feedback creates evidence.
- Evidence creates proposed profile revisions.
- Revisions run evals.
- Human/main-agent review approves promotion.
- Runtime binds to exact version/hash.

### Phase 6: Review walkthrough mode

Goal: when work completes, the main agent can walk the user through it.

Build:

- Review session object:
  - ordered review steps,
  - artifact references,
  - browser previews,
  - generated surfaces,
  - notes/feedback capture,
  - next/previous controls,
  - voice/text transcript.
- Client commands:
  - open artifact,
  - open generated Surface,
  - open browser preview,
  - highlight component,
  - wait for user scroll/next,
  - capture note against current context.
- Feedback model:
  - linked to artifact/component/page/agent/task,
  - sentiment/severity/category,
  - follow-up WorkItem suggestions,
  - specialist profile improvement suggestions.

This implements the user's desired flow:

- The agent calls or messages the user.
- It says work is ready.
- It walks through reports, websites, charts, deployed pages, and QC results.
- User can say "this is broken" while looking at something.
- The system records the exact context.
- It does not immediately thrash; it turns review feedback into tasks/profile
  improvements after the review.

### Phase 7: Voice/call path

Goal: voice becomes another IO channel for the same review/control session.

Build:

- Server-side STT/TTS provider abstraction.
- Streaming transcript events.
- Low-latency response path for main agent.
- Push-to-talk first; live call mode after.
- Orb/presence UI in Flutter mobile/desktop.
- Review walkthrough controls that work with voice and buttons.

Important:

Voice should not be built as a separate chatbot. It should operate the same
main-agent session, same WorkItems, same artifacts, same Surfaces, same feedback
capture, same client-control channel.

### Phase 8: Self-improvement / agent quality loop

Goal: agents improve from user feedback without unsafe silent mutation.

Build:

- Agent quality metrics:
  - user sentiment by artifact/task,
  - rework rate,
  - failed QC gates,
  - approval rejection rate,
  - tool failure rate,
  - blocked/stale task rate.
- Profile revision proposal engine:
  - suggests memory/instruction/tool/eval changes,
  - records why,
  - ties to feedback evidence.
- Quarantine eval before promotion.
- Human-visible changelog:
  - Research Agent 1.0 -> 1.1 -> 1.2,
  - tools added/removed,
  - standards clarified,
  - eval scores.

## Specific answers to the user's questions

### Does Hermes run on that thing?

Yes, locally. The resident runner invokes `hermes chat` through the `hermes-cli`
adapter. A live `/wake` request succeeded and produced a Hermes-generated
summary, runner events, and a report artifact.

### Do messages go back and forth?

Yes. `/wake` sends an objective into the runner, the runner renders the main
agent prompt, Hermes runs, and the result comes back as heartbeat summary/raw
output/artifact/events.

### Do we see tool calls?

We should not optimize the product around ordinary tool-call visibility.

- Direct Hermes CLI can show ordinary tool calls when needed for debugging.
- The user-facing product should stay focused on high-signal milestones:
  delegation, WorkItem assignment, Agent Creator/profile changes, artifact
  creation, webpage publishing, review sessions, and recorded user feedback.
- Ordinary search/file/browser/tool chatter should remain in runner logs or
  debug artifacts, not in the main UI.

The resident runner now supports a lighter mechanism: the main agent can emit a
fenced `agents-cloud-event` JSON block for allowlisted high-signal actions. The
runner persists only those action events and ignores non-allowlisted telemetry
such as `tool.call`.

### Can we actually use this?

Yes for local resident-runner smoke and backend development. Not yet as a
complete product workflow.

Usable now:

- local Hermes CLI,
- local resident runner server,
- wake endpoint,
- run status events,
- heartbeat artifacts,
- Control API runner dispatch tests,
- realtime tests,
- Agent Creator tests.

Not fully productized yet:

- deployed ECS resident runner end-to-end evidence,
- UI-visible structured tool calls,
- main-agent delegation contract,
- live WorkItem/Kanban delegation graph,
- Agent Creator promotion to runtime,
- voice review walkthrough,
- sentiment-driven specialist improvement loop.

### Is the main agent ready to create/delegate/manage other agents?

It is conceptually and partially technically ready, but not governance-complete.

Ready pieces:

- main/default delegator profile exists in resident runner bootstrap,
- Hermes delegation toolsets can be enabled,
- resident runner supports multiple logical agents,
- Agent Creator can produce governed profile versions,
- Control API can persist/approve profile versions,
- WorkItems and runner state exist.

Missing pieces:

- first-class main-agent authority model,
- durable delegated WorkItem creation/assignment from main-agent tool calls,
- profile promotion route into runner,
- quarantine evals,
- client-visible delegation lineage,
- structured review/feedback/self-improvement loop.

## Simplified high-signal event contract

The product should use a small set of durable, actionable events rather than a
full internal tool transcript.

High-signal event families:

- `artifact.created`: a report, dataset, design, exported file, voice-call
  analysis, or other durable output exists and should be reviewable.
- `webpage.published`: an agent-created webpage/site/preview is hosted and has a
  URL the user can open.
- `agent.delegated`: the main agent handed a meaningful unit of work to another
  logical agent or specialist profile.
- `work_item.created` / `work_item.assigned`: Kanban-visible task state changed.
- `agent.profile.requested` / `agent.profile.revision_proposed` /
  `agent.profile.promoted`: Agent Creator or self-improvement changed a visible
  specialist version/evaluation path.
- `review.session.created`: a phone/review/walkthrough interaction produced a
  durable session artifact.
- `review.feedback.recorded`: sentiment/rework/approval feedback was captured and
  can generate follow-up work.

Explicit non-goals for now:

- No product UI feed for every shell command, search, browser page, or file edit.
- No mandatory Hermes stdout parser for every ordinary tool call.
- No graph database or heavyweight issue graph before the Kanban/WorkItem model
  proves it needs one.

Implementation rule:

- Keep the normal runner heartbeat/report artifact as the debug trail.
- Ask the resident main agent to emit fenced `agents-cloud-event` JSON only for
  high-signal milestones.
- The runner allowlists event types and ignores noisy or unknown telemetry.
- Voice/call/review evidence should land as S3 artifacts plus background
  WorkItems, not as a synchronous blocker for the main user session.

## Recommended immediate next implementation slice

The immediate path should stay simple and high-signal. Do **not** build a full
Hermes stdout/tool-call parser or UI feed unless debugging evidence later proves
we need it.

**High-Signal Main-Agent Operating Loop**

Concrete task list:

1. Keep `artifact.created` and `webpage.published` as first-class user-visible
   milestones.
2. Keep `agent.delegated`, `work_item.created`, and `work_item.assigned` as the
   main delegation events that power Kanban and agent activity.
3. Keep `agent.profile.requested`, `agent.profile.revision_proposed`, and
   `agent.profile.promoted` as the Agent Creator/version-evolution milestones.
4. Keep `review.session.created` and `review.feedback.recorded` as the bridge
   from voice/review walkthroughs into async follow-up work.
5. Store heavy review/call/sentiment evidence as artifacts in S3, then create
   background WorkItems for agents to analyze later.
6. Add the main-agent authority model only where it gates special powers:
   delegation, Agent Creator promotion requests, review feedback capture, and
   future client-control/voice walkthroughs.
7. Drive the live Kanban board from WorkItems and these high-signal events rather
   than from every internal tool call.
8. Use focused checkpoint tests for major slices instead of retesting every small
   UI detail.

Only after this lean operating loop is working should the team invest in the full
voice/orb/review walkthrough layer.

## Validation artifacts from this audit

- `/tmp/agents-cloud-runner-audit-validation.log`
- `/tmp/agents-cloud-hermes-cli-tool-smoke.log`
- `/tmp/agents-cloud-hermes-cli-tool-smoke-verbose.log`
- `/tmp/agents-cloud-resident-live-smoke.log`
- `/tmp/agents-cloud-resident-live-smoke-response.json`
- `/tmp/agents-cloud-resident-live-smoke/artifacts/run-live-smoke/artifact-task-live-smoke-agent-delegator-codex-55-heartbeat/heartbeat-report.md`
- `/tmp/agents-cloud-apifycli-search-smoke.json`

## Bottom line

The backend/runtime is no longer just scaffolding. The local resident runner can
run Hermes for real, and the core backend packages around runner dispatch,
WorkItems, surfaces, realtime, artifacts, and Agent Creator are passing focused
validation.

The next problem is not "can an agent answer?" It can.

The next problem is making the system legible, governable, and company-like
without turning the UI into a low-level tool log:

- show every artifact, webpage publish, delegation, review session, and feedback
  capture,
- keep ordinary search/file/browser/tool chatter in debug logs or artifacts,
- make WorkItems the durable Kanban/task graph,
- make the main agent the coherent delegator/reviewer,
- make specialists versioned and improvable,
- turn user review feedback into follow-up tasks and profile revisions,
- then put the voice/orb/review walkthrough on top.
