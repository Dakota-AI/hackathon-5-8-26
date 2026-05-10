# Agent Creator Next Implementation Slices

_Last updated: 2026-05-10_

## Purpose

Turn the Agent Creator / Hermes Profiles / Apify plan into a practical sequence that creates useful product value quickly without jumping ahead of the durable Agents Cloud platform spine.

The correct next move is not to build a fully autonomous self-improving agent factory immediately. The correct next move is to create a thin, typed, reviewable path from:

```text
User asks for a specialist
  -> platform creates a draft AgentProfileVersion
  -> draft includes role mission, allowed tools, skills, approval rules, and eval tasks
  -> draft is visible/reviewable as an artifact
  -> later runtime can execute approved profiles in ECS
```

## Best overall approach

Start with a static, deterministic Agent Creator scaffold before model-driven generation.

Why:

- It creates the platform data model and APIs safely.
- It gives the UI something useful to show quickly.
- It lets us validate profile artifacts, tool policy, and skill bundles before exposing real tools.
- It avoids letting a newly generated agent immediately access broad Apify/MCP/tool surfaces.
- It fits the current project priority: durable WorkItem/Run/Event/Artifact truth first, advanced specialists second.

## Immediate north-star slice

Build this user flow first:

```text
User: "Create a marketing agent"
  -> Control API creates an AgentProfile draft request
  -> services/agent-creator renders a deterministic marketing-strategist profile bundle
  -> profile bundle is stored as artifacts
  -> event ledger records agent-profile.draft-created
  -> web shows a simple Agent Profile review card
```

This is useful even before real autonomous profile research because the user can see:

- what the agent is for
- what it can do
- what it cannot do
- which tools/categories it would get
- which actions require approval
- what skills/evals are included

## Slice 0: Preserve current WIP and avoid scope collision

Before writing code for Agent Creator, finish or isolate the existing WorkItem/control-api WIP.

Current observed working tree includes WorkItem/control-api/docs changes. Do not mix Agent Creator commits into that same diff unless Agent Creator is explicitly built on those WorkItem changes.

Recommended:

```text
1. Finish or stash the WorkItem Control API WIP.
2. Commit the Agent Creator plan docs separately.
3. Create a focused branch/commit for AgentProfile protocol contracts.
```

## Slice 1: Protocol contracts only

Goal: define the agent profile artifact shape without touching AWS/CDK/runtime yet.

Files:

```text
packages/protocol/src/agent-profiles.ts
packages/protocol/src/events.ts
packages/protocol/src/index.ts
packages/protocol/test/agent-profiles.test.ts
packages/protocol/test/events.test.ts
```

Add types:

```ts
AgentProfile
AgentProfileVersion
AgentProfileStatus
ToolPolicy
McpPolicy
ApifyPolicy
SkillRef
EvalPackRef
MemoryScopeRef
ApprovalPolicy
BudgetPolicy
GeneratedProfileFiles
```

Add event builders:

```text
agent-profile.requested
agent-profile.draft-created
agent-profile.validation-passed
agent-profile.validation-failed
agent-profile.eval-completed
agent-profile.approval-requested
agent-profile.promoted
agent-profile.rejected
```

Why this first:

- It becomes the shared language for Control API, runtime, web, and Flutter.
- It keeps later implementation from inventing ad hoc JSON.
- It is easy to test.

Validation:

```bash
pnpm contracts:test
```

## Slice 2: Static `services/agent-creator` package

Goal: create a deterministic renderer that turns a role request into a draft profile bundle.

Package:

```text
services/agent-creator/
  package.json
  tsconfig.json
  src/
    index.ts
    create-agent-profile.ts
    role-templates.ts
    profile-renderer.ts
    validators.ts
    ports.ts
  test/
    create-agent-profile.test.ts
    validators.test.ts
```

Input:

```ts
type CreateAgentProfileRequest = {
  workspaceId: string;
  userId: string;
  requestedRole: string;
  businessContext?: string;
  constraints?: string[];
};
```

Output:

```ts
type DraftAgentProfileBundle = {
  profile: AgentProfileVersion;
  files: {
    'manifest.json': string;
    'SOUL.md': string;
    'config.yaml': string;
    'tool-policy.json': string;
    'mcp-policy.json': string;
    'skills/.../SKILL.md': string;
    'evals/golden-tasks.jsonl': string;
    'evals/rubric.md': string;
    'README.md': string;
  };
};
```

Start with hardcoded role templates:

```text
marketing-strategist
sales-researcher
finance-analyst
coding-agent
research-analyst
```

For the first pass, only implement `marketing-strategist`.

Why:

- Fast useful path.
- Lets us review generated profile quality.
- Avoids expensive/variable LLM research before the storage/API/runtime are ready.

Validation:

```bash
pnpm --filter @agents-cloud/agent-creator test
```

## Slice 3: Static validators and policy checks

Goal: make unsafe profile drafts fail before any runtime can use them.

Validators should reject:

- unknown toolsets
- broad dangerous toolsets for non-coding roles
- plaintext secret-looking values
- MCP servers without explicit tool allowlists
- Apify full-access policy without approval gates
- external write/publish/spend/delete actions without approval requirements
- missing eval pack
- missing budget limits
- missing non-goals
- oversized generated files

This is the most important safety scaffold. Do it before real generation.

## Slice 4: Artifact-only Control API path

Goal: let the platform store/retrieve a draft profile as a durable artifact and event ledger record.

Add API routes after protocol + service package exist:

```text
POST /agent-profiles/requests
GET  /agent-profiles
GET  /agent-profiles/{agentProfileId}
GET  /agent-profiles/{agentProfileId}/versions/{version}
```

First implementation can be synchronous/static:

```text
POST /agent-profiles/requests
  -> validate request
  -> call services/agent-creator static renderer
  -> store metadata in DynamoDB
  -> store generated files in S3
  -> emit agent-profile.draft-created event
  -> return profile/version IDs
```

Do not launch Hermes yet.

Why:

- Produces immediate user-visible value.
- Tests tenancy, storage, event shape, and artifact access.
- Provides a reviewable foundation before runtime execution.

Validation:

```bash
pnpm control-api:test
pnpm infra:build
pnpm infra:synth
```

## Slice 5: Web review UI

Goal: give the user a useful Agent Library page without raw JSON.

Add:

```text
/apps/web/app/agents/page.tsx
/apps/web/app/agents/[agentProfileId]/page.tsx
/apps/web/components/agent-profile-card.tsx
/apps/web/components/agent-profile-detail.tsx
```

Show plain-language sections:

```text
Mission
Can do
Cannot do
Tools it can use
Approval-required actions
Included skills
Example tasks
Eval tasks
Status/version
```

Do not show raw `tool-policy.json` by default. Provide an advanced inspector later.

Validation:

```bash
pnpm web:typecheck
pnpm web:build
```

## Slice 6: Apify catalog in mock/readonly mode

Goal: prepare for Apify usefulness without giving agents a raw full token.

Build an adapter inside `services/agent-creator` first:

```text
apify-catalog.ts
```

It should expose:

```ts
searchActors(query)
inspectActor(actorId)
classifyActorRisk(actor)
recommendActorsForRole(roleKey)
```

First pass uses fixture data, not live Apify.

Later pass can use:

- Apify MCP for discovery
- Apify REST/OpenAPI for deterministic production calls

For marketing v0, recommend categories only:

```text
web research
SERP scraping
competitor website crawling
pricing page monitoring
company/local market data
```

Require explicit approval for:

```text
social scraping
personal/contact data extraction
paid Actors beyond budget
login/session actors
external writes
```

## Slice 7: Runtime profile materialization smoke

Goal: prove ECS runtime can consume an approved profile without real model/tool risk.

Extend runtime spec:

```ts
agentProfileRef?: {
  agentProfileId: string;
  version: string;
};
```

Runtime in smoke mode should:

```text
1. fetch profile metadata
2. download profile bundle
3. verify hashes
4. materialize temp HERMES_HOME
5. write SOUL.md/config/skills
6. emit event: agent-profile.materialized
7. produce a report artifact saying which profile would have run
```

Keep `HERMES_RUNNER_MODE=smoke`.

This validates the hardest runtime shape safely.

## Slice 8: Quarantine eval runner

Goal: run candidates against generated eval tasks before approval.

First pass can be mocked:

```text
profile + golden task -> expected artifact headings / policy behavior / refusal behavior
```

Score:

```text
task_success
policy_compliance
artifact_quality
tool_policy_compliance
cost_estimate
```

Produce:

```text
scorecard.md
scorecard.json
```

Do not promote profiles without scorecard + user approval.

## Slice 9: Real model-powered Agent Creator research

Only after static path works:

```text
agent-creator static renderer
  -> add web research tool
  -> add Apify discovery in read-only mode
  -> generate richer skills/evals
  -> still pass validators
  -> still require approval
```

The model can propose, but validators decide.

## Slice 10: Real Hermes profile execution

Only after runtime materialization and quarantine work:

```text
approved AgentProfileVersion
  -> scoped ECS task
  -> generated HERMES_HOME
  -> narrow toolsets
  -> approved MCP config
  -> scoped secrets
  -> per-call policy/audit where available
  -> canonical events/artifacts
```

Start with research-only roles before coding/deployment agents.

## Recommended commit sequence

```text
commit 1: docs: add agent creator implementation slices
commit 2: feat(protocol): add agent profile contracts
commit 3: feat(agent-creator): render static marketing profile drafts
commit 4: feat(agent-creator): validate profile tool policies
commit 5: feat(control-api): persist agent profile drafts
commit 6: feat(web): add agent profile review page
commit 7: feat(agent-runtime): materialize profile bundles in smoke mode
```

Keep each commit separately testable.

## What not to do yet

Do not:

- wire raw Apify token directly into Hermes profiles
- expose all Apify MCP tools to every specialist
- auto-promote generated skills
- let an agent create another production agent without review
- build arbitrary GenUI for agents first
- build full autonomous self-improvement first
- add AppSync just for this
- deploy Cloudflare just for this
- build UI before protocol/API artifacts exist

## Practical answer

The best next real engineering step is:

```text
Add AgentProfile protocol contracts and a static services/agent-creator package that renders a reviewable marketing-agent profile bundle with validators.
```

That creates durable usefulness immediately, gives the user something visible/reviewable, and sets up the correct future path for real Hermes + Apify execution without creating unsafe tool sprawl.
