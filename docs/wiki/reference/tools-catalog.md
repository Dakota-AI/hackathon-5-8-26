# Tools Catalog

[← reference](README.md) · [wiki index](../README.md) · related: [local-harness](local-harness.md), [agent-profile-package](agent-profile-package.md)

> Every tool name referenced in the codebase. There's no central tool registry yet — this is a forensic inventory.

---

## Sources of "tools"

There are three places tools appear:

1. **`local-harness.ts` `LOCAL_TOOLS`** — a hardcoded array used by the simulated multi-agent flow. **Names only** — no implementation behind any of them.
2. **`packages/agent-profile/src/types.ts` `CandidateTool`** — discovery-time tool descriptor. Fields: `id, name, category, risk, description, source, catalogHash`. Each tool with `risk: medium|high` must end up in an AgentProfile's `approvalRequiredTools`.
3. **`HERMES_TOOLSETS` env var** — comma-separated toolset names passed to the Hermes CLI: `web,file,terminal` (default). Sub-toolset definitions live inside the Hermes binary, not in this repo.

---

## Tools used by the local harness

`services/agent-runtime/src/local-harness.ts:152-174` declares 4 tools (plus 2 implicit):

| Tool | Risk | Side effects | Approval | Purpose (logical) |
|---|---|---|---|---|
| `workspace.plan_task` | (implicit) | — | — | Manager-side decomposition of objective into tasks |
| `research.summarize_context` | (implicit) | — | — | Gather/synthesize background relevant to objective |
| `communication.ask_user_question` | low | `contact_user` | no | Pull a clarification from user |
| `preview.register_static_site` | **medium** | `publish`, `write` | **yes** | Reserve preview subdomain + publish static-site artifact |
| `artifact.create` | low | `write` | no | Materialize a markdown report |
| `workspace.generate_static_site` | (implicit) | — | — | Produce HTML preview after register approved |

⚠️ These are **simulated only**. No actual code executes them. The harness emits an event saying the tool ran and writes a static fixture file.

---

## Tool naming convention

`<category>.<verb_or_action>` (snake_case after the dot, lowercase always):
- `workspace.*` — operations within the user's workspace (plan, generate, search)
- `research.*` — information-gathering
- `communication.*` — user-facing messaging
- `preview.*` — preview/artifact publishing
- `artifact.*` — artifact creation/management
- `email.*` — email sending (referenced in agent-creator scenario)
- `apify.*` — Apify Actors (referenced in agent-creator scenario)

The schema regex in `event-envelope.schema.json` enforces `[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+`, so tool names automatically conform when used as event types (e.g. `tool.approval`).

---

## Tools mentioned in agent-creator scenario

`services/agent-creator/test/fixtures/marketing-workshop-scenario.json` lists three CandidateTools for the Marketing Strategist demo:

| Tool | Risk | Source | Notes |
|---|---|---|---|
| `apify.search-actors` | low | apify | Search Apify catalog |
| `apify.call-actor` | high | apify | Execute an Actor (real cost) |
| `email.send` | high | (likely platform) | Send an email |

The workshop's risk-split rule: low → `allowedTools`, medium/high → `approvalRequiredTools` with `requiresApproval: true`. So `apify.call-actor` and `email.send` get approval-gated.

---

## What's NOT here

There is no:
- ❌ Central tool registry / catalog service
- ❌ Tool dispatch in `worker.ts` — it just calls the model
- ❌ Tool implementation in resident-runner — adapter shells out to `hermes` which has its own toolsets
- ❌ Tool argument schema validation
- ❌ Per-tool rate limit / budget enforcement code (despite `budget.maxCallsPerRun` / `maxCostUsdPerRun` in `AgentToolPolicyEntry`)
- ❌ MCP discovery / handshake
- ❌ Audit logging for tool calls (no `tool.call` or `tool.metrics` event types in the protocol)

---

## Hermes toolsets (the real "tools" today, when not in smoke mode)

When `HERMES_RUNNER_MODE=cli` and the image has the Hermes binary baked in, the worker shells out to:

```
hermes chat -q "<prompt>" --quiet --toolsets <toolsets>
```

Default `HERMES_TOOLSETS=web,file,terminal`. The Hermes binary defines what these mean — typically `web` for HTTP fetch / search, `file` for read/write within `cwd`, `terminal` for shell exec.

**The Hermes binary is NOT in either Dockerfile** — neither `services/agent-runtime/Dockerfile` nor `Dockerfile.resident` baked it in. So `cli` mode fails at spawn today.

---

## What needs to ship for hackathon (real tool execution)

If the hackathon needs actual agent capabilities beyond smoke:

- [ ] Decide: bake Hermes into the image, or replace with direct SDK calls (Anthropic / OpenAI / Bedrock)
- [ ] If SDK: implement minimum viable tools — `workspace.write_file`, `web.fetch`, maybe `web.search` via Exa (`EXA_API_KEY` already documented)
- [ ] Wire tool dispatch into `worker.ts` and/or resident-runner adapter
- [ ] Emit `tool.call` / `tool.completed` envelopes (would require new schema in `packages/protocol/`)
- [ ] Gate risky tools with `tool.approval` request → wait → respect decision

See [HACKATHON_CRITICAL_PATH.md#1](../HACKATHON_CRITICAL_PATH.md).

[← reference](README.md)
