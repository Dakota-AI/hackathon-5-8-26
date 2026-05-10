# Agent Creator Hermes profile

The Agents Cloud Agent Creator runs as a dedicated Hermes profile rather than
through ad-hoc API prompting from the admin UI. The admin Workshop playground
remains useful for human-in-the-loop staging and approval, but profile design
itself is the agent's job.

This profile lives at `~/.hermes/profiles/agentcreator/`. It is intentionally
not committed (every operator's `~/.hermes` is local), but the structure is
fully reproducible from this doc.

## What it is

A Hermes profile (`hermes profile create agentcreator --clone`) that:

- has a role-scoped `SOUL.md` defining the Agent Creator boundary,
- runs from `cwd: /Users/sebastian/Developer/agents-cloud` so all repo paths work,
- restricts `platform_toolsets.cli` to `clarify, delegation, file, memory,
  session_search, skills, terminal, todo, web` (no `browser`, `code_execution`,
  `image_gen`, `tts`, `vision`, `cronjob`, `messaging`, `rl`),
- ships four local skills under `skills/agents-cloud/`:
  - `agent-profile-schema` — `agent-profile/v1` JSON shape, enums, validator codes
  - `agent-profile-lifecycle` — intake → draft → validate → quarantine → handoff
  - `agent-tool-policy` — default-deny tool/MCP/Apify rules per role family
  - `agents-cloud-control-api` — live endpoints, payload shapes, auth
- reads the live Control API contract from `services/control-api/src/` and
  validates drafts with `@agents-cloud/agent-profile`.

## Reproduce locally

```bash
# 1. Create the profile (clone defaults, no shell wrapper)
hermes profile create agentcreator --clone --no-alias

# 2. Drop in the SOUL, config, and skills from this repo's
#    docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle/
#    (see Files section below; copy to ~/.hermes/profiles/agentcreator/)

# 3. Make sure the validator is built
pnpm --filter @agents-cloud/agent-profile build

# 4. Smoke test
mkdir -p /tmp/agent-creator
hermes --profile agentcreator \
  --skills agent-profile-lifecycle,agent-profile-schema,agent-tool-policy,agents-cloud-control-api \
  chat -Q -q 'Design a draft AgentProfileVersion for a "competitor-pricing-analyst" \
specialist for workspace "workspace-dev", createdByUserId "test-user". \
Goals: track competitor SaaS pricing weekly, surface anomalies, produce a brief \
PDF report. Constraints: no outbound emails, no social posting. Save to \
/tmp/agent-creator/competitor-pricing-analyst-draft.json, run local validation, \
and give me the Phase 7 review handoff. Do NOT POST to any API.'
```

Verified output (2026-05-10): the agent produced a draft with 4 allowed tools,
1 approval-gated tool (`browser.navigate`), 3 eval scenarios including a
guardrail (`outbound-action-blocked`), `mcpPolicy.allowDynamicServers=false`,
1 changelog entry. `validateAgentProfileVersion` returned `valid:true`.

## Provider notes

- Default model is Codex `gpt-5.5`. If Codex is rate-limited, switch to
  Copilot via `~/.hermes/profiles/agentcreator/config.yaml`:
  ```yaml
  model:
    default: gpt-4.1   # gpt-4o and Claude variants are not currently
    provider: copilot  # supported on the Copilot pool here
  ```
- Auth lives in `~/.hermes/profiles/agentcreator/auth.json`; copy from
  `~/.hermes/auth.json` if missing.

## Why a profile, not API prompting

- Identity (`SOUL.md`) is durable; the admin UI prompt isn't.
- Skills are versioned context the LLM loads on demand instead of the admin
  prompt re-explaining the schema every call.
- Toolsets are restricted at the Hermes level, so the agent literally cannot
  call `code_execution` or `browser` even if it tries.
- The agent runs locally with full repo access, so it can read
  `packages/agent-profile/src/types.ts` instead of trusting a stale prompt.
- The Control API approval gate stays human-only — the profile's
  `agents-cloud-control-api` skill explicitly forbids POSTing without an
  `APPROVE:` instruction from the user.

## Where to evolve this

- Add an `agents-cloud-research` skill once Apify MCP is wired in production.
- Add an `agents-cloud-eval-runner` skill once `services/agent-creator` exposes
  a deterministic CLI smoke runner (`pnpm agent-creator:smoke`).
- Migrate the static SOUL/config/skills into a committed bundle under
  `docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle/`
  so other developers (and CI) can drop them into a fresh profile via a
  one-line bootstrap script.
