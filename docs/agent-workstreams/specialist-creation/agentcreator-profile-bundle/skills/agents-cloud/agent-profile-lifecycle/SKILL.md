---
name: agent-profile-lifecycle
description: "End-to-end lifecycle for an Agents Cloud specialist: intake -> research -> draft -> validate -> quarantine eval -> review -> approval -> promotion. Load whenever the user asks to create, tune, or audit a specialist agent."
version: 1.0.0
metadata:
  hermes:
    tags: [agents-cloud, lifecycle, agent-creator, workshop]
---

# Specialist agent lifecycle (Agents Cloud)

You are running the Agent Workshop. The user asks for a specialist (marketing
strategist, sales researcher, finance analyst, etc.). Walk the lifecycle below
exactly. Do not skip steps to look helpful — every gate exists for a reason.

## Phase 1 — Intake

Capture, in plain text first:

- `requestedRole` (e.g. "marketing-strategist")
- `workspaceId` (ask user; default `workspace-dev` for local testing)
- `createdByUserId`
- `projectContext`: name, 3-7 goals, 0-N constraints
- `userPreferences`: communicationCadence, reportStyle, verbosity
- prior `feedback`: list of complaints/wishes from past runs (may be empty)
- `candidateTools`: list of `{id,name,category,risk,description}` you are
  considering. If empty, propose 3-8 grounded in the role.

If success criteria, source permissions, autonomy, or interruption cadence are
ambiguous, ask 3-5 batched clarifying questions via the `clarify` tool. Do not
ask more than once per phase.

## Phase 2 — Permissioned research (optional, requires user OK)

Only do this when the user explicitly OKs research and the role demands current
domain knowledge. Use `web_search` / `web_extract` to capture a short
research note: 5-10 bullets on responsibilities, common tools, KPIs, risks.
Save under `/tmp/agent-creator/<profileId>-research.md`.

## Phase 3 — Tool policy design (iterative, not declarative)

This is where most workshops collapse into a one-shot draft. Don't. Apply
skills `iterative-tool-assembly` and `apify-tool-discovery` in full:

1. Discover candidates (web + Apify MCP).
2. Prototype each candidate (`code_execution` / `terminal`).
3. Test on a real input.
4. Score (correctness, stability, cost, risk).
5. Decide bucket (`allowedTools` / `approvalRequiredTools` / `deniedTools`).
6. Append a trace line to `/tmp/agent-creator/prototypes/<profileId>/TRACE.md`.

Output two lists at the end:

- `allowedTools`: only `risk:"low"` AND prototype passed.
- `approvalRequiredTools`: medium/high risk, prototype passed, with budget
  caps and one-line `description` justifying gate AND referencing the trace.

If you skip prototyping because "the docs look fine," start over.

## Phase 4 — Draft profile

Render a complete `AgentProfileVersion` JSON matching the
`agent-profile-schema` skill. Required fields:

- `schemaVersion: "agent-profile/v1"`
- `lifecycleState: "draft"`
- `mission`: one sentence
- `behavior.instructions`: 3-5 actionable rules
- `behavior.escalationPolicy`: explicit irreversible/expensive/public list
- `behavior.preferencePolicy`: derive from userPreferences
- `mcpPolicy.allowDynamicServers: false`, every server pinned
- `evalPack.scenarios`: >=3 including 1 guardrail scenario
- `changeLog`: 1 entry with concrete `evidence: string[]`

Save to `/tmp/agent-creator/<profileId>-draft.json`.

## Phase 5 — Local validation (mandatory)

Run from `/Users/sebastian/Developer/agents-cloud`:

```bash
pnpm --filter @agents-cloud/agent-profile build >/dev/null
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateAgentProfileVersion } from './packages/agent-profile/dist/src/index.js';
const d = JSON.parse(readFileSync(process.argv[1],'utf8'));
const r = validateAgentProfileVersion(d);
console.log(JSON.stringify(r, null, 2));
process.exit(r.valid ? 0 : 1);
" /tmp/agent-creator/<profileId>-draft.json
```

If `valid:false`, fix the draft and re-run. NEVER hand off an invalid draft.

## Phase 6 — Quarantine eval (real harness)

The agents-cloud monorepo ships a real workshop harness. Use it; do not
hand-walk.

```bash
cd /Users/sebastian/Developer/agents-cloud
pnpm --filter @agents-cloud/agent-creator build >/dev/null

# Option A — run against the marketing fixture to sanity-check the harness:
pnpm --filter @agents-cloud/agent-creator run smoke

# Option B — run against the scenario you just authored:
node services/agent-creator/dist/src/cli.js \
  --scenario /tmp/agent-creator/<profileId>-scenario.json \
  --bundle /tmp/agent-creator/<profileId>-bundle/
```

The CLI emits an `audit trail`, `demo transcript`, `draft profile summary`,
and (with `--bundle`) writes a full profile bundle to disk with `SOUL.md`,
`config.yaml`, `tool-policy.json`, `mcp-policy.json`, `evals/`, and a
`manifest.json` containing per-file sha256 hashes.

For each `evalPack.scenarios[i]`, run the candidate behaviorally:

1. Build the scenario prompt + the candidate's draft `behavior.instructions`
   into a one-shot Hermes invocation in a *throwaway* profile (NOT
   `agentcreator`):
   ```bash
   hermes --profile <throwaway> --skills <profile-skills> chat -Q -q "<scenario.prompt>"
   ```
2. Score the response against `passCriteria` and `requiredToolBehavior`.
3. Capture pass/fail + a one-line reason in
   `/tmp/agent-creator/<profileId>-eval-results.json`.

Then build the `scorecard`:

```ts
scorecard: {
  readyForUserReview: <all blockers resolved>,
  readyForPromotion: false,           // ALWAYS false at draft time
  metrics: { policyCoverage, evalScenarioCount, approvalGateCount },
  requiredBeforePromotion: [
    "Run quarantine eval scenarios against a throwaway specialist runner.",
    "Attach the eval-results.json artifact to the profile version.",
    "Record explicit approval or requested revisions from the user.",
  ],
  findings: [...],
}
```

## Phase 7 — Review handoff

Print to the user, in this order:

1. One-paragraph profile summary (role, mission, who it's for).
2. Tool policy: `allowed (N)`, `approval-required (N)` with names.
3. Eval pack: scenario names + 1-line purpose.
4. Validation result: `valid:true`, error list `[]`.
5. Scorecard: `readyForUserReview`, blockers before promotion.
6. Path to draft JSON on disk.
7. Exact `agents-cloud-control-api` calls the user needs to POST/approve.

Do NOT call the Control API yourself unless the user types
`APPROVE: post draft for <profileId>`.

## Phase 8 — Approval & promotion (user-driven)

Approval and promotion happen via the Control API (skill
`agents-cloud-control-api`). You only stage; the human approves.

## Tuning loop (existing profiles)

If the user hands you feedback like "responses are too long" or "stop calling
me", treat each as a structured `AgentProfileChangeRequest`:

```
"too long"          -> changeType:"behavior.preference",  target:"verbosity",            requestedValue:"concise"
"don't call me"     -> changeType:"communication.cadence",target:"interruptionTolerance",requestedValue:"low"
"too expensive"     -> changeType:"tool.cost_policy",     target:"expensiveToolPolicy",  requestedValue:"ask"
"out of date"       -> changeType:"source_policy.change", target:"sourcePolicy",         requestedValue:"verified_first"
"send weekly PDF"   -> changeType:"reporting.change",     target:"reportFormat",         requestedValue:"pdf_brief"
```

Bump the patch version (`0.1.0-draft -> 0.2.0-draft`) and add a changeLog
entry citing the user feedback as evidence.
