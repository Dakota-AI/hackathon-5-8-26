# Adaptive Agent Workshop / Agent Creator Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after the first scaffold is green.

**Goal:** Build an Agent Workshop service that can iteratively create, test, tune, approve, and version role-specialized Hermes-backed agents for Agents Cloud.

**Architecture:** Agents Cloud owns the deterministic control plane: tenancy, profile registry, tool policy, approval gates, evals, lineage, artifacts, and promotion. Hermes is the runtime harness that materializes an approved profile in an isolated ECS/user-runner context. Apify and MCP are discovery/execution sources behind platform policy, never raw unbounded agent privileges.

**Tech Stack:** TypeScript pnpm workspace, Control API + DynamoDB + S3 + Step Functions/ECS, Hermes profile bundles, Apify catalog metadata, deterministic tests first, later model-assisted research/evaluation.

---

## Executive recommendation

Do not build a one-shot agent factory. Build an Agent Workshop.

The difference matters:

- A factory implies: user asks once, system generates an agent, agent is done.
- A workshop implies: user asks, system researches, asks targeted questions, proposes a profile, tests it, shows evidence, receives feedback, creates a new version, and keeps improving the specialist over time.

The first production-shaped version should be deterministic and testable:

```text
User request / feedback
  -> Workshop intake
  -> Discovery questions + resource permission requests
  -> Draft profile artifact
  -> Tool policy + approval gates
  -> Quarantine eval scenarios
  -> User review scorecard
  -> Approved profile version
  -> Hermes materialization smoke run
```

Only after this works should the system make the creator itself deeply model-driven.

---

## Research findings shaping this plan

### 1. Start simple, add autonomy only when it improves outcomes

Anthropic's agent guidance emphasizes starting with simple, composable patterns and adding complexity only when needed. For Agents Cloud, that means the first creator path should be a deterministic workflow with clear gates, not a fully autonomous multi-agent swarm.

Practical implication:

- First: deterministic Agent Workshop pipeline.
- Next: evaluator-optimizer loop.
- Later: autonomous research agents, tool-discovery agents, profile-optimization agents.

### 2. Agent evals must grade traces, outcomes, and tool trajectories

Anthropic and OpenAI both emphasize that agent evals are harder than single-turn evals because agents call tools, modify state, and may take different valid paths. OpenAI's agent eval docs recommend trace grading first while debugging, then repeatable datasets/eval runs when behavior stabilizes.

Practical implication:

- Store every workshop run as trace/evidence.
- Grade profile drafts against:
  - final output quality,
  - tool choice,
  - approval behavior,
  - cost/latency,
  - interruption cadence,
  - source quality,
  - failure recovery.

### 3. Human review is part of the architecture, not a UX afterthought

OpenAI's guardrails/human-review guidance frames approvals as a run state: continue, pause, or stop. High-risk actions, sensitive MCP calls, side effects, and expensive tools must pause for approval.

Practical implication:

- Agent profiles must encode approval policy.
- Runtime must enforce approval outside the model.
- UI must show exactly why an action/profile/tool needs approval.

### 4. MCP needs deterministic control-plane enforcement

Microsoft's MCP security guidance argues that MCP does not include a built-in governance checkpoint, and prompt-only safety instructions are not a security boundary. OWASP MCP Top 10 highlights prompt injection via contextual payloads and tool poisoning.

Practical implication:

- Treat MCP tool descriptions and results as untrusted.
- Pin/hash tool definitions.
- Enforce allow/deny/approval before execution.
- Separate read-only catalog discovery from expensive/side-effecting execution.

### 5. Apify is valuable but must be curated

Apify MCP can search actors, fetch actor details, run actors, read datasets, and use inferred output schemas. Its own docs recommend explicitly specifying tools in production instead of relying on defaults.

Practical implication:

- Agent Creator may search Apify catalog during discovery.
- Production agents should receive curated platform connector tools, not raw broad Apify MCP.
- Running actors/spending credits requires approval or pre-approved budget.

### 6. User preferences are product primitives

The user's examples are not prompt tweaks; they are durable product state:

- prefers PDF reports,
- prefers concise responses,
- does not want frequent calls,
- expensive APIs only with approval,
- Tuesday 4pm weekly report,
- certain tools are trusted or disliked,
- all agents should follow a new company-wide standard.

Practical implication:

- Add preference layers: user, org, workspace, project, agent profile, task override.
- Store feedback as structured signals tied to profile versions and run traces.
- Build migration/update workflows that can apply standards to one agent, all agents, or a cohort.

---

## Product model

### Core nouns

1. AgentWorkshopRequest
   - User asks for a new agent or tuning of an existing agent.
   - Contains role, project context, feedback, desired behavior, tool preferences, budget, reporting cadence.

2. AgentProfileVersion
   - Immutable versioned profile artifact.
   - Contains mission, role, behavior policy, tool policy, MCP policy, memory policy, eval pack, approvals, changelog, hashes.

3. WorkshopRun
   - One execution of the workshop pipeline.
   - Produces profile drafts, questions, resource requests, eval scorecards, artifacts.

4. AgentPreferencePolicy
   - Structured preferences at user/org/workspace/project/agent levels.
   - Examples: reporting style, verbosity, interruption tolerance, tool cost policy, approval thresholds.

5. ToolCatalogEntry
   - Platform-normalized tool metadata.
   - Includes source, capability, risk, cost, auth, schemas, prompt-injection risk, approved status.

6. QuarantineEvalRun
   - Sandbox test of a profile candidate.
   - Uses deterministic mocks first, then optionally controlled live tools.

7. ProfileChangeRequest
   - User or agent feedback that asks the workshop to tune behavior, tools, skills, memory, reporting, or permissions.

8. ProfileLineageEvent
   - Audit event for every draft, eval, approval, rejection, promotion, rollback, or mass policy update.

---

## Target lifecycle

```text
1. Intake
   User asks: "Create a marketing agent" or "This agent is too verbose."

2. Classify request
   New profile, tune existing profile, add tool, change standard, run audit, rollback.

3. Ask or infer missing context
   Ask targeted questions when ambiguity affects tools, cost, approval, sources, or success criteria.

4. Permissioned discovery
   Request approval before external research, paid APIs, Apify actor runs, private repo access, email, calendar, etc.

5. Draft profile
   Generate profile bundle with explicit tool policy, behavior policy, reporting policy, eval pack, and changelog.

6. Validate profile
   Static validators check schema, policy, unsafe permissions, missing evals, over-broad tools, secret leakage.

7. Quarantine eval
   Candidate agent runs against scenarios with mocked or sandboxed tools.

8. Scorecard
   Workshop emits user-readable findings: pass/fail, examples, cost risk, quality concerns, suggested changes.

9. User review
   User approves, rejects, asks for changes, or accepts limited/sandbox rollout.

10. Promote version
   Profile becomes executable by ECS/Hermes under scoped policy.

11. Monitor production traces
   Collect user feedback, tool use, failures, cost, interruptions, report quality.

12. Tune and version
   Workshop proposes v0.2, v1.1, etc. with changelog and evidence.
```

---

## Permission and autonomy model

### Autonomy levels

1. Observe only
   - Can read approved context and produce advice.
   - No external calls.

2. Research with approval
   - Can ask to fetch web/Apify/tool catalog/docs.
   - Cannot spend credits or access private sources without permission.

3. Sandbox execution
   - Can run evals against mocked tools or temporary sandboxes.
   - No production side effects.

4. Limited production execution
   - Can use pre-approved tools within budgets.
   - Must pause for medium/high-risk operations.

5. Trusted resident specialist
   - Can operate longer-running loops.
   - Still bounded by profile policy, budgets, approval gates, and monitoring.

### Action risk categories

Low risk:
- local analysis,
- read-only public research,
- catalog search,
- draft artifact generation,
- deterministic evals.

Medium risk:
- paid but bounded research,
- private read-only workspace access,
- generating a report to a shared workspace,
- creating drafts in external systems.

High risk:
- sending email/messages,
- publishing publicly,
- running shell commands against production,
- spending meaningful credits,
- changing permissions,
- accessing sensitive private data,
- modifying source repos or cloud infra.

Policy rule: high-risk tools are never unlocked because a profile prompt says they are allowed. Runtime policy must enforce them.

---

## Preference system

### Layers

```text
Global platform defaults
  -> org/company standards
  -> user preferences
  -> workspace/project preferences
  -> agent profile behavior
  -> task-specific override
```

Conflict resolution should be explicit. Example:

- Global default: require approval for external sends.
- User preference: prefers concise reports.
- Agent profile: marketing agent may draft email campaigns.
- Task override: user says "send it after I approve copy."

Runtime result:

- Agent may draft copy.
- Agent may not send without approval.
- Reports should be concise.

### Preference examples to support

- `verbosity = concise | balanced | detailed`
- `interruptionTolerance = low | normal | high`
- `reportCadence = on_completion | daily | weekly | custom_cron`
- `reportFormat = chat_summary | pdf_brief | markdown | email | genui_workspace`
- `expensiveToolPolicy = never | ask | budgeted | autonomous`
- `externalActionPolicy = ask | allowed_for_approved_recipients | never`
- `sourcePolicy = verified_first | broad_research | internal_only`
- `agentSelfImprovementPolicy = propose_only | auto_patch_low_risk | require_review`

### Feedback mapping examples

User says: "Its responses are too long."

Workshop creates a ProfileChangeRequest:

```json
{
  "changeType": "behavior.preference",
  "target": "verbosity",
  "newValue": "concise",
  "evidence": "direct_user_feedback",
  "requiresEval": true
}
```

User says: "Don't call me all the time."

```json
{
  "changeType": "communication.cadence",
  "target": "interruptionTolerance",
  "newValue": "low",
  "policy": "batch_noncritical_updates; interrupt_for_critical_or_approval_only"
}
```

User says: "Use this expensive API only when absolutely needed."

```json
{
  "changeType": "tool.cost_policy",
  "target": "tool:premium-api",
  "newValue": "approval_required_unless_preapproved_budget"
}
```

---

## Testing interface

The first testing interface is intentionally CLI/JSON so it can run in CI, Docker, ECS smoke tasks, and later web UI.

Current scaffold:

```bash
pnpm agent-creator:test
pnpm agent-creator:smoke
node services/agent-creator/dist/src/cli.js \
  --scenario services/agent-creator/test/fixtures/marketing-workshop-scenario.json
```

Docker target:

```bash
docker build \
  -f services/agent-creator/Dockerfile \
  -t agents-cloud-agent-creator:verify .

docker run --rm agents-cloud-agent-creator:verify
```

The CLI returns:

- workshop plan,
- discovery questions,
- permissioned resource requests,
- draft profile,
- tool policy,
- eval plan,
- scorecard,
- demo transcript,
- next actions.

This becomes the same payload the web review UI can render.

---

## Implementation slices

### Slice 0: Current scaffold, already started

Files:

- `services/agent-creator/package.json`
- `services/agent-creator/tsconfig.json`
- `services/agent-creator/src/types.ts`
- `services/agent-creator/src/workshop.ts`
- `services/agent-creator/src/index.ts`
- `services/agent-creator/src/cli.ts`
- `services/agent-creator/test/workshop.test.ts`
- `services/agent-creator/test/fixtures/marketing-workshop-scenario.json`
- `services/agent-creator/Dockerfile`
- root `package.json` scripts

Definition of done:

- `pnpm agent-creator:test` passes.
- `pnpm agent-creator:smoke` emits a deterministic workshop simulation JSON.
- Docker image builds and runs the same simulation.

### Slice 1: Extract shared agent-profile package

Create:

- `packages/agent-profile/package.json`
- `packages/agent-profile/src/types.ts`
- `packages/agent-profile/src/validators.ts`
- `packages/agent-profile/src/fixtures.ts`
- `packages/agent-profile/test/validators.test.ts`

Move durable profile contracts out of the service.

Validators:

- profile has immutable `profileId/version`,
- no secrets in profile bundle,
- every non-low-risk tool has approval policy,
- every approved tool has catalog hash/source,
- eval plan exists before review,
- promotion requires scorecard evidence and approval event.

### Slice 2: Profile bundle writer

Add to `services/agent-creator`:

- `src/profile-bundle.ts`
- `test/profile-bundle.test.ts`

Bundle layout:

```text
profile.json
SOUL.md
config.fragment.yaml
skills/README.md
policy/tool-policy.json
policy/mcp-policy.json
evals/eval-pack.json
scorecards/latest.json
CHANGELOG.md
manifest.json
```

Definition of done:

- deterministic bundle generated in temp dir,
- manifest includes hashes,
- tests reject bundles containing obvious secret patterns,
- SOUL.md is human-readable and does not include credentials.

### Slice 3: Quarantine eval harness

Add:

- `src/eval-runner.ts`
- `src/mock-tools.ts`
- `test/eval-runner.test.ts`

First graders:

- deterministic code grader for approval behavior,
- deterministic code grader for verbosity/report format,
- deterministic code grader for source-quality disclaimers,
- simulated tool call trajectory grader.

Later graders:

- LLM judge with isolated rubric dimensions,
- human review calibration.

### Slice 4: Workshop API shape in Control API

Add routes after package is stable:

- `POST /agent-workshop/requests`
- `GET /agent-workshop/runs/{workshopRunId}`
- `POST /agent-workshop/runs/{workshopRunId}/feedback`
- `POST /agent-profiles/{profileId}/versions/{version}/approve`
- `POST /agent-profiles/{profileId}/versions/{version}/promote`

First implementation can return `501` until storage is ready, but route contracts should be tested.

### Slice 5: DynamoDB/S3 registry

Tables/keys:

- `AgentProfilesTable`
  - pk: `workspaceId#profileId`
  - sk: `version`
  - status: draft/review/approved/promoted/retired

- `AgentWorkshopRunsTable`
  - pk: `workspaceId#workshopRunId`
  - status, requested role, current phase, profile target

- S3 prefix:
  - `workspaces/{workspaceId}/agent-profiles/{profileId}/{version}/...`

### Slice 6: Web review interface

Minimal UI:

- agent role/mission,
- questions needing answer,
- resource permissions requested,
- tool gates,
- eval scenarios,
- scorecard,
- changelog,
- approve/request changes/reject actions.

Do not expose raw JSON by default. Keep a developer/admin expander for internals only.

### Slice 7: Hermes materialization smoke

Runtime path:

```text
Approved AgentProfileVersion
  -> ECS task fetches bundle
  -> verifies manifest hashes
  -> creates temp HERMES_HOME
  -> writes SOUL.md/config/skills/MCP config
  -> runs safe smoke command
  -> emits canonical events and report artifact
```

No broad tool access in the first smoke. It should prove materialization and event lineage only.

### Slice 8: Apify catalog importer

Build catalog as data first:

- import/search actor metadata,
- store actor id, name, description, input schema, output schema when available, pricing/cost notes, categories, risk score,
- do not expose raw actor execution to generated profiles.

First production tools:

- `apify.catalog.search` low risk,
- `apify.actor.inspect` low risk,
- `apify.actor.request_run` medium/high risk requiring approval.

### Slice 9: Adaptive tuning loop

A profile can enter the workshop from several triggers:

- direct user feedback,
- negative rating,
- repeated eval failure,
- high cost anomaly,
- tool blocked too often,
- stale source issue,
- user/org standard changed,
- scheduled periodic audit.

The workshop proposes a new version with:

- changelog,
- before/after behavior diff,
- eval score comparison,
- migration impact,
- approval requirements.

### Slice 10: Scheduled report / calendar policy

Represent reports as preference policy, not hard-coded cron inside every agent.

Example:

```json
{
  "reportPolicy": {
    "cadence": "weekly",
    "schedule": "Tuesday 16:00 America/New_York",
    "format": "pdf_brief",
    "scope": "all_agents",
    "include": ["completed_work", "blockers", "costs", "tool_issues", "next_week"]
  }
}
```

The scheduler should create work items or run requests for each relevant agent and aggregate results.

---

## Future model-driven Agent Creator loop

Once deterministic scaffolding exists, the model-driven Workshop can use this loop:

1. Understand request.
2. Identify missing context.
3. Ask user or request permissioned research.
4. Research role and tool options.
5. Draft profile.
6. Critique profile against policy.
7. Generate eval scenarios.
8. Run quarantine evals.
9. Analyze traces.
10. Revise profile.
11. Produce scorecard and ask for review.
12. Promote only after gates pass.

The model proposes. The platform validates and enforces.

---

## Non-goals for the first implementation

- No raw broad Apify token inside generated profiles.
- No arbitrary MCP server connections from user input.
- No automatic promotion of new agents.
- No self-modifying production agent code.
- No vector memory platform until trace/artifact/preference memory works.
- No AppSync/Cloudflare dependency for the first workshop path.
- No public publishing/email sending without approval gates.

---

## Quality gates

Before claiming the workshop is production ready:

- schema validators pass,
- service tests pass,
- profile bundle hash verification passes,
- quarantine evals pass,
- approval gates are enforced outside the model,
- secrets are scanned out of artifacts,
- trace and lineage events are queryable,
- user review UI can approve/request changes/reject,
- Hermes ECS materialization smoke produces canonical events,
- docs/status match deployed reality.

---

## Immediate next command sequence

```bash
pnpm agent-creator:test
pnpm agent-creator:smoke
docker build -f services/agent-creator/Dockerfile -t agents-cloud-agent-creator:verify .
docker run --rm agents-cloud-agent-creator:verify
```

Then implement Slice 1 with strict TDD.
