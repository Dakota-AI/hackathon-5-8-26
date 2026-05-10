# Local Harness — Reference

[← reference](README.md) · [wiki index](../README.md) · related: [agent-runtime](../services/agent-runtime.md), [events-catalog](events-catalog.md)

> The only end-to-end simulated multi-agent flow in the codebase. Deterministic, no LLM, no real tools, no cloud writes — but produces real protocol-compliant NDJSON events and real artifact files for offline pipeline development.

**Path:** `services/agent-runtime/src/local-harness.ts`, `services/agent-runtime/src/local-runner-cli.ts`
**Tests:** `services/agent-runtime/test/local-harness.test.ts`
**CLI:** `pnpm agent-runtime:local`

---

## What `runLocalHarnessScenario` produces

Outputs are written under `rootDir` (default `.agents/local-runs/<run-id>`):

```
<rootDir>/
├── events.ndjson                  # one canonical event per line
├── runner-state.json              # full LocalHarnessState snapshot
├── transcript.md                  # markdown narration log
└── artifacts/
    └── <artifactId>/
        ├── report.md              # always (markdown report)
        └── index.html             # only on approved branch
```

### Agents (always two)

- `agent-manager-001` — role "Manager Agent", profile `manager-agent`
- `agent-<role-slug>-001` — role from `agentRole` (default "Product Builder Agent")

Both share `profileVersion: "local-dev"` and a single `taskId`.

### Tool calls (in order)

`LocalToolExecution` entries appended to `state.tools`:

1. `workspace.plan_task` → completed
2. `research.summarize_context` → completed
3. `communication.ask_user_question` → completed
4. `preview.register_static_site` → `approval_required` then transitions to `approved` / `rejected` (or stays `approval_required` if pending). Carries `approvalId`.
5. `artifact.create` → completed (only on approved/rejected branches)
6. `workspace.generate_static_site` → completed (only on approved branch)

### Approval gate (single)

`approval-<runId>-preview-001` for `preview.register_static_site`:
- Risk: `medium`
- Requested action: *"Publish a local static website artifact and reserve a preview subdomain label."*
- Arguments preview: `requestedLabel`, `workspaceId`, `artifactKind: "website"`
- 15-minute `expiresAt`

### Event sequence (approved branch — 10 events)

Asserted by test at `local-harness.test.ts:49-61`:

| seq | type | notes |
|---:|---|---|
| 1 | `run.status` | planning, progress 0.1 |
| 2 | `run.status` | running, 0.35 |
| 3 | `run.status` | waiting_for_approval, 0.5 |
| 4 | `tool.approval` | kind=`request` |
| 5 | `tool.approval` | kind=`decision`, decision=`approved` |
| 6 | `run.status` | running, 0.65 |
| 7 | `artifact.created` | report (markdown) |
| 8 | `artifact.created` | website (html) |
| 9 | `run.status` | archiving, 0.9 |
| 10 | `run.status` | succeeded, 1.0 |

⚠️ No `tool.call` or `tool.metrics` events emitted (durable-events policy is `critical_only`). Tool execution is recorded only inside `runner-state.json`.

### Artifacts

- `report` — `artifacts/artifact-<taskId>-report/report.md`
  - kind `report`, contentType `text/markdown`, `file://` URI
- `website` (approved only) — `artifacts/artifact-<taskId>-preview/index.html`
  - kind `website`, contentType `text/html`
  - `previewUrl: https://<label>.preview.solo-ceo.ai` (fabricated string, nothing serves it)

---

## The three branches

Driven by `previewDecision: "approved" | "rejected" | "pending"` (default `"approved"`).

### Approved
- Full flow.
- 6 tool calls, 10 events, 2 artifacts (report + website).
- Final `run.status = succeeded`, `runner.status = completed`.
- Transcript line *"Preview published at https://...preview.solo-ceo.ai"*.

### Rejected
- Approval decision event has `decision: "rejected"`.
- `workspace.generate_static_site` is skipped.
- Only the `report` artifact is written.
- Test (`local-harness.test.ts:96-116`): 5 tool calls, no website artifact event, run still ends `succeeded`.

### Pending
- Function returns early after emitting the approval **request** (no decision event).
- State: `run.status = waiting_for_approval`, `runner.status = waiting`, agents `waiting_for_approval`, one entry in `state.waitStates` of kind `approval`.
- Test (`local-harness.test.ts:73-94`): 4 events ending with the approval request, 4 tool calls, 0 artifacts.

---

## Tool catalog (logical purpose)

Declared in `LOCAL_TOOLS` (`local-harness.ts:152-174`) plus two implicit tools:

| Tool | Risk | Side effects | Approval | Purpose |
|---|---|---|---|---|
| `workspace.plan_task` | (implicit) | — | — | Manager-side decomposition of objective into tasks |
| `research.summarize_context` | (implicit) | — | — | Gather/synthesize background |
| `communication.ask_user_question` | low | contact_user | no | Pull a clarification from user |
| `preview.register_static_site` | **medium** | publish, write | **yes** | Reserve preview subdomain + publish static-site artifact |
| `artifact.create` | low | write | no | Materialize the report markdown |
| `workspace.generate_static_site` | (implicit) | — | — | Produce HTML preview after register approved |

---

## CLI (`local-runner-cli.ts`)

### `run` (default)
Invokes `runLocalHarnessScenario`.

Flags:
- `--root <dir>` — output directory (default `.agents/local-runs/<run-id>`)
- `--objective <text>` — natural-language goal
- `--agent-role <text>` — specialist role label
- `--answer <text>` — pre-canned answer to ask_user_question
- `--approve-preview approved|rejected|pending` (aliases `yes`/`no`/`wait`)
- `--run-id`, `--task-id`, `--user-id`, `--workspace-id`, `--org-id`, `--runner-id`
- `--json` — JSON output instead of summary
- `--print-inspection` — also print inspection summary

### `inspect --root <path>`
Re-reads `runner-state.json` + `events.ndjson`. Prints `renderInspection`:
- runner/run status
- agent/task/wait-state/artifact counts
- tool-call totals
- distinct event types

`--json` for full JSON.

### `--interactive`
TTY mode. Prompts via `node:readline` for objective, agent role, user answer, approval decision. When stdin is piped (non-TTY), reads four newline-separated lines.

### `help`
Prints usage text.

---

## Test coverage (`local-harness.test.ts`)

5 tests, all use fixed timestamp `2026-05-10T12:00:00.000Z`:

1. **approved** — exact seq sequence `[1..10]`, exact event-type ordering, both artifact kinds, 6 tool calls, 1 approval-gated, transcript content.
2. **pending** — `waiting_for_approval` status, single wait-state, 0 artifacts, last event is approval `request`.
3. **rejected** — succeeded with only the report artifact; `workspace.generate_static_site` absent.
4. **CLI run + inspect** — `execFile` integration; checks summary lines `status=succeeded`, `eventTypes=run.status,tool.approval,artifact.created`, `toolCalls=6`, `durableToolEvents=1`.
5. **scripted interactive** — pipes 4 answer lines into CLI; verifies captured objective and agent role land in state.

---

## Real vs simulated

### Real (actual filesystem side effects)
- `events.ndjson`, `runner-state.json`, `transcript.md` written via `node:fs/promises`.
- `report.md` is a real markdown file (`writeReportArtifact`, lines 444–481).
- `index.html` is a real, openable HTML page with embedded CSS (`writeWebsiteArtifact`, lines 483–516).
- `uri` is a working `file://` URL via `pathToFileURL`.

### Simulated (string only)
- All "tool calls" are `LocalToolExecution` records pushed into an array — no LLM, no planner, no research, no question-asking.
- `previewUrl` `https://<label>.preview.solo-ceo.ai` is fabricated; nothing is registered or served.
- Approval "decisions" come from caller's `previewDecision` option — no real human-in-the-loop.
- `risk`, `sideEffects`, `approvalRequired` policy in `LOCAL_TOOLS` is metadata only — no enforcement engine.
- Agent identities, profile IDs, runner heartbeats, and progress numbers are hardcoded.

---

## Why it matters

The harness is the closest thing the codebase has to a "real" agent run. It demonstrates:

1. The exact event sequence pattern a production worker should produce.
2. How approvals fit into the canonical event log.
3. What a multi-artifact run looks like.
4. The shape of `LocalHarnessState` — useful for designing a future durable resident-runner state.

When implementing a real worker (replacing smoke), use this as the protocol-compliance reference. See [HACKATHON_CRITICAL_PATH](../HACKATHON_CRITICAL_PATH.md#1).

[← reference](README.md) · [→ agent-runtime](../services/agent-runtime.md) · [→ events-catalog](events-catalog.md)
