# Agent Creator, Hermes Profiles, and Apify Tool Catalog Plan

_Last updated: 2026-05-10_

## Purpose

Design the next major Agents Cloud layer: a dedicated Agent Creator service that can research a requested company role, design a safe specialist definition, select/mint the right Hermes profile configuration, attach role-appropriate skills/tools/memory scopes, run the candidate in quarantine, and promote it into the platform registry for future ECS execution.

The user-facing product goal is simple:

```text
User: "Create a marketing agent for my company."
  -> Agents Cloud researches what a marketing agent should know/do
  -> creates a versioned specialist profile
  -> selects tools such as web research and Apify Actors
  -> writes role skills and operating instructions
  -> runs evals in quarantine
  -> asks for approval
  -> promotes the agent
  -> future WorkItems can delegate to that specialist
```

This plan assumes Hermes Agent is the specialist worker harness, not the multi-tenant SaaS control plane. Agents Cloud owns tenancy, auth, run ledgers, approvals, policies, secrets, registries, and artifact durability. Hermes owns the bounded local agent loop inside a user-runner/ECS task.

## Sources reviewed

Project docs/code:

- `AGENTS.md`
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/IMPLEMENTATION_READINESS_AUDIT.md`
- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
- `docs/roadmap/PROJECT_STATUS.md`
- `docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md`
- `docs/roadmap/AGENT_CREATED_INTERFACES_GENUI_PRODUCT_VISION.md`
- `docs/roadmap/BEST_NEXT_STEPS_EXECUTION_PLAN.md`
- `docs/roadmap/WORKITEM_GENUI_IMPLEMENTATION_PLAN.md`
- `services/agent-runtime/src/worker.ts`
- `services/agent-runtime/src/hermes-runner.ts`
- `services/agent-runtime/src/ports.ts`
- `infra/cdk/src/stacks/runtime-stack.ts`
- `services/control-api/src/create-run.ts`

Hermes Agent:

- `https://github.com/nousresearch/hermes-agent`
- Hermes profiles docs
- Hermes tools/toolsets docs
- Hermes MCP docs
- Local clone inspected at `/tmp/hermes-agent-inspect`

Apify:

- `/Users/sebastian/Downloads/openapi.json`
- Apify MCP docs
- Apify MCP server repository/docs

Security/governance research:

- Microsoft: securing MCP with a deterministic control plane for tool execution
- MCP gateway/registry and permission guidance

## Current project reality

Agents Cloud already has the foundation this should plug into:

```text
authenticated client command
  -> Control API
  -> DynamoDB run/event/artifact records
  -> Step Functions
  -> ECS worker task
  -> worker emits canonical events/artifacts
  -> web/native clients query/stream ordered events
```

Current implementation still has important constraints:

- Runtime is still a smoke/Hermes-shaped worker path, not full production Hermes CLI execution.
- `services/agent-runtime/src/hermes-runner.ts` can call `hermes chat -q ... --quiet --toolsets ...`, but environment/runtime profile materialization is not yet productionized.
- The runtime currently only receives basic context: `runId`, `taskId`, `workspaceId`, `userId`, `objective`.
- WorkItem, DataSourceRef, and Surface are the correct product spine, but they are not fully completed everywhere yet.
- AWS remains durable truth; Cloudflare is optional/future realtime fanout only.
- The project already has a roadmap section for Specialist Agent Factory, but this document expands it into a concrete service/data/runtime plan.

Important implication: do not start by letting arbitrary newly created agents freely run tools. Build the Agent Creator as a governed pipeline that emits versioned, reviewable artifacts first.

## Hermes capability implications

Hermes has exactly the primitives needed for specialist workers:

1. Profiles
   - Each profile is a separate Hermes home with isolated `config.yaml`, `.env`, `SOUL.md`, memory, sessions, skills, cron, logs, and workspace.
   - Profiles are useful as a mental model, but production Agents Cloud should materialize an ephemeral/run-scoped `HERMES_HOME` from a platform-owned `AgentProfileVersion`, not rely on long-lived local profile aliases.

2. SOUL/personality
   - `SOUL.md` is the primary agent identity file.
   - Agent Creator should generate a role-specific SOUL/identity document from a structured template.
   - This should not contain secrets or tenant-private data unless scoped and approved.

3. Toolsets
   - Hermes can restrict available tools with `--toolsets` and config-level tool selection.
   - Production should always pass a role-scoped allowlist. Example: marketing research agent gets `web`, `browser`, `file`, `skills`, `memory`, maybe `mcp-apify`; not broad terminal/code/deployment tools by default.

4. MCP
   - Hermes can connect to local stdio and remote HTTP MCP servers through `mcp_servers` in config.
   - MCP tools are registered as prefixed normal tools, e.g. `mcp_apify_search-actors`.
   - Hermes supports per-server filtering; Agent Creator should use this to expose only selected Apify Actors/tool categories.

5. Skills
   - Skills are portable `SKILL.md` procedural memory documents.
   - Production skills should be versioned, signed/checksummed, read-only mounted, and selected by role.
   - Candidate skills should be generated in quarantine and promoted only after evals and review.

6. Memory
   - Hermes profile memory is useful locally, but platform memory must be source of truth.
   - Build a platform memory adapter later; first slice can inject read-only memory snapshots into prompt/context files.

## Apify capability implications

The local OpenAPI spec at `/Users/sebastian/Downloads/openapi.json` is Apify API `3.1.2`, title `Apify API`, version `v2-2026-04-29T071435Z`.

Observed scope:

- 125 paths
- 225 operations
- 238 schemas
- major tags include Actors, Actor runs, Actor tasks, Actor builds, Datasets, Key-value stores, Request queues, Webhooks, Schedules, Store, Users, Tools

Important operation families:

```text
Actors
  GET/POST /v2/acts
  GET/PUT/DELETE /v2/acts/{actorId}
  POST /v2/acts/{actorId}/validate-input

Actor runs
  POST /v2/acts/{actorId}/runs
  POST /v2/acts/{actorId}/run-sync
  POST /v2/acts/{actorId}/run-sync-get-dataset-items
  GET /v2/actor-runs/{runId}
  POST /v2/actor-runs/{runId}/abort
  GET /v2/actor-runs/{runId}/log

Datasets
  GET /v2/datasets
  GET /v2/datasets/{datasetId}
  GET /v2/datasets/{datasetId}/items
  GET /v2/datasets/{datasetId}/statistics

Key-value stores
  GET /v2/key-value-stores
  GET /v2/key-value-stores/{storeId}/records/{recordKey}

Schedules/webhooks
  CRUD schedules
  CRUD webhooks
```

Apify should be exposed in two layers:

1. Interactive/discovery layer via Apify MCP
   - Use hosted `https://mcp.apify.com` when OAuth/bearer-token policy is solved.
   - Apify MCP supports actor discovery, fetching actor details, running actors, retrieving output, storage access, docs search/fetch, and actor output schema inference on hosted server.
   - This is ideal for Agent Creator research and candidate tool selection.

2. Deterministic production layer via a platform Apify connector
   - Use the OpenAPI spec to generate/hand-write a small `services/tool-gateway` or `services/connectors/apify` wrapper.
   - Production specialists should not receive a raw full Apify token and full API surface.
   - The platform connector should expose curated actions: search actors, inspect actor, validate input, run approved actor, fetch dataset items, fetch run log, abort run.
   - All actor runs should be tied to `workspaceId`, `runId`, `workItemId`, and budget policy.

Rule of thumb:

```text
Agent Creator uses Apify MCP for discovery/research.
Production specialist uses curated platform connector/tool policy for repeatable work.
```

## Core concept: agent profiles are artifacts

Treat a specialist agent as a versioned platform artifact, not an ad hoc prompt.

Recommended durable object:

```ts
type AgentProfileVersion = {
  workspaceId: string;
  agentProfileId: string;
  version: string;
  status: 'draft' | 'candidate' | 'quarantined' | 'pending_approval' | 'approved' | 'canary' | 'active' | 'deprecated' | 'rejected';
  roleKey: string;              // marketing-strategist, sales-researcher, finance-analyst
  displayName: string;
  mission: string;
  nonGoals: string[];
  operatingPrinciples: string[];
  decisionPolicy: string;
  defaultWorkItemTypes: string[];
  modelPolicy: ModelPolicy;
  toolPolicy: ToolPolicy;
  mcpPolicy: McpPolicy;
  apifyPolicy?: ApifyPolicy;
  skillRefs: SkillRef[];
  memoryScopes: MemoryScope[];
  artifactPolicy: ArtifactPolicy;
  approvalPolicy: ApprovalPolicy;
  budgetPolicy: BudgetPolicy;
  evalPackRefs: EvalPackRef[];
  provenance: Provenance;
  generatedFiles: GeneratedProfileFiles;
  hashes: {
    soulSha256: string;
    configSha256: string;
    skillBundleSha256: string;
    fullProfileSha256: string;
  };
  createdByRunId: string;
  approvedByUserId?: string;
  createdAt: string;
  updatedAt: string;
};
```

Generated profile files:

```text
profile/
  manifest.json              # platform canonical profile metadata
  SOUL.md                    # role identity and durable behavioral guardrails
  config.yaml                # Hermes config fragment, no plaintext secrets
  skills/
    market-research/SKILL.md
    campaign-planning/SKILL.md
    competitor-analysis/SKILL.md
  evals/
    golden-tasks.jsonl
    rubric.md
  tool-policy.json           # normalized policy used by platform before Hermes sees tools
  mcp-policy.json            # selected MCP servers/tools and filters
  memory-policy.json         # allowed read/write memory scopes
  README.md                  # human-readable profile card
```

Store this in S3 under a versioned prefix and mirror metadata in DynamoDB:

```text
s3://workspace-live-artifacts/workspaces/{workspaceId}/agent-profiles/{agentProfileId}/versions/{version}/...
```

## Agent Creator service

Create a dedicated service package:

```text
services/agent-creator/
  src/
    index.ts
    create-agent-profile.ts
    role-research.ts
    tool-recommender.ts
    apify-catalog.ts
    skill-generator.ts
    eval-pack-generator.ts
    profile-renderer.ts
    validators.ts
    ports.ts
  test/
    create-agent-profile.test.ts
    apify-catalog.test.ts
    validators.test.ts
    profile-renderer.test.ts
```

The service should be invoked through Control API and Step Functions, not directly from clients.

### Responsibilities

1. Interpret requested role
   - Input: user objective such as `Create a marketing agent for launching Solo CEO`.
   - Output: normalized role brief with domain, expected tasks, deliverables, allowed autonomy, needed integrations, risk level.

2. Deep research
   - Use web research, Apify actor discovery, project context, and role templates.
   - Produce a research artifact: role responsibilities, useful tools, risks, KPIs, deliverables, sample tasks.

3. Tool selection
   - Select built-in Hermes toolsets.
   - Select MCP servers and exact MCP tool filters.
   - Select Apify actors/categories when useful.
   - Reject broad/inappropriate tools.

4. Skill set generation
   - Generate role-specific skills from templates plus research.
   - Keep skills procedural and bounded: workflows, checklists, verification, examples, pitfalls.
   - Avoid embedding secrets or unreviewed private data.

5. Evaluation pack generation
   - Generate golden tasks and scoring rubrics.
   - Include at least one negative/guardrail task.
   - Include artifact quality expectations.

6. Candidate profile rendering
   - Render `SOUL.md`, Hermes `config.yaml`, tool policy, MCP policy, skill files, README.

7. Static validation
   - Validate schemas, deny dangerous tools, scan prompt injection patterns, scan secrets, check tool names, check budget and approval policy.

8. Quarantine run
   - Launch the candidate in a no-production-secrets sandbox against eval tasks.
   - Capture event ledger, artifacts, scorecard.

9. Human approval
   - Save scorecard and profile diff for review.
   - Promote only after approval.

## Agent Creator workflow

```text
POST /agent-profiles/requests
  -> create WorkItem: "Create marketing agent"
  -> create Run: agent-creator
  -> emit agent-profile.requested
  -> research role and project needs
  -> search curated tool catalogs and Apify actors
  -> produce draft profile artifacts
  -> validate draft profile
  -> run candidate in quarantine evals
  -> produce scorecard
  -> create approval request
  -> on approval: promote profile version
```

Recommended API surface:

```text
POST   /agent-profiles/requests
GET    /agent-profiles
GET    /agent-profiles/{agentProfileId}
GET    /agent-profiles/{agentProfileId}/versions
GET    /agent-profiles/{agentProfileId}/versions/{version}
POST   /agent-profiles/{agentProfileId}/versions/{version}/approve
POST   /agent-profiles/{agentProfileId}/versions/{version}/reject
POST   /agent-profiles/{agentProfileId}/versions/{version}/canary
POST   /work-items/{workItemId}/delegate
```

Minimum events:

```text
agent-profile.requested
agent-profile.research-started
agent-profile.tool-catalog-searched
agent-profile.draft-created
agent-profile.validation-failed
agent-profile.validation-passed
agent-profile.eval-started
agent-profile.eval-completed
agent-profile.approval-requested
agent-profile.promoted
agent-profile.rejected
agent-profile.deprecated
```

## Tool policy model

Do not expose tools just because an agent requests them. Store and enforce a deterministic policy.

```ts
type ToolPolicy = {
  builtInToolsets: string[];
  disabledToolsets: string[];
  toolAllowlist: string[];
  toolDenylist: string[];
  requiresApproval: Array<{
    toolPattern: string;
    reason: string;
    approvalType: 'external_write' | 'spend' | 'publish' | 'delete' | 'credential_access';
  }>;
  limits: {
    maxToolCallsPerRun: number;
    maxBrowserPagesPerRun?: number;
    maxExternalWritesPerRun?: number;
    maxDatasetRowsPerRun?: number;
    maxSpendUsdPerRun?: number;
  };
};
```

Initial role defaults:

```text
Agent Creator
  toolsets: web, browser, file, skills, memory/session_search, code_execution, mcp-apify-readonly
  no external writes without approval
  can generate profile artifacts, not promote itself

Marketing Strategist
  toolsets: web, browser, file, skills, memory, mcp-apify-marketing-readonly
  Apify: search/scrape/read datasets only by default
  no posting ads, sending email, buying media, publishing sites without approval

Sales Research Agent
  toolsets: web, browser, file, skills, mcp-apify-lead-research
  Apify: search, maps/company/contact enrichment actors as approved
  export/contacting requires approval

Coding Agent
  toolsets: terminal, file, web, skills, github if linked
  stronger sandbox and branch/PR-only external writes

Finance Analyst
  toolsets: file, web, spreadsheet, memory; no broad browser automation by default
  external banking/accounting connectors require explicit scoped OAuth and approvals
```

## MCP policy model

MCP is powerful, but it is not enough by itself. Add a platform control layer.

Research finding: MCP gives discovery/invocation, but does not define a deterministic pre-call governance checkpoint. The platform must decide whether an agent may invoke a specific tool with specific arguments at a specific time.

Therefore:

- Agent Creator may propose MCP servers/tools.
- Platform validates and stores MCP policy.
- Runtime materializes Hermes config with only approved MCP servers/tools.
- A future Tool Gateway should enforce per-call policy and audit every call.

Example Hermes config fragment for a role:

```yaml
model:
  provider: openrouter
  default: anthropic/claude-sonnet-4
terminal:
  backend: docker
  cwd: /workspace
mcp_servers:
  apify:
    url: https://mcp.apify.com
    headers:
      Authorization: ${APIFY_MCP_BEARER}
    tools:
      allow:
        - search-actors
        - fetch-actor-details
        - get-actor-output
        - apify/rag-web-browser
      utilities:
        resources: false
        prompts: false
```

Do not write bearer tokens into generated profile artifacts. Use secret refs:

```json
{
  "secretRefs": [
    {
      "name": "APIFY_MCP_BEARER",
      "provider": "aws-secrets-manager",
      "scope": "workspace",
      "purpose": "apify-mcp-readonly"
    }
  ]
}
```

## Apify catalog design

Create a platform-side Apify catalog cache rather than asking every specialist to rediscover the entire Apify Store.

```text
ApifyCatalogTable
  PK: workspaceId#catalogScope
  SK: actorId#version
  actorId
  title
  description
  categories
  inputSchemaHash
  outputSchemaHash
  pricingSummary
  riskTags
  allowedRoles
  defaultApprovalPolicy
  lastInspectedAt
```

Agent Creator uses:

1. Apify MCP or Store API to find candidate Actors.
2. `fetch-actor-details`/OpenAPI actor build endpoint to inspect schemas and pricing.
3. A platform risk classifier:
   - read-only data extraction
   - personal data extraction
   - social scraping
   - paid/spend-bearing
   - external write/publish
   - login/session required
4. Human-visible tool recommendation card.

For marketing agent v0, likely useful categories:

```text
- RAG Web Browser for general web research
- Google Search/SERP scrapers for competitive research
- Website content crawlers for competitor landing pages
- Social/media trend scrapers only if policy allows
- Google Maps/company data actors for local/market research
- E-commerce/price scrapers for competitor pricing
```

Do not automatically grant broad social scraping or contact extraction. These can involve privacy/compliance concerns and should require explicit approval and role-specific constraints.

## Runtime profile materialization

Extend `services/agent-runtime` from prompt-only smoke runner to profile-aware worker.

New runtime input:

```ts
type RuntimeRunSpec = {
  runId: string;
  taskId: string;
  workItemId?: string;
  workspaceId: string;
  userId: string;
  objective: string;
  agentProfileRef?: {
    agentProfileId: string;
    version: string;
  };
  toolPolicyRef?: string;
  memoryScopeRefs: string[];
  budget: {
    maxRuntimeSeconds: number;
    maxToolCalls: number;
    maxCostUsd: number;
  };
};
```

Runtime steps:

```text
1. Read run spec from env/S3/DynamoDB.
2. Fetch approved AgentProfileVersion metadata.
3. Download profile artifact bundle from S3.
4. Verify hashes/signature.
5. Create isolated /tmp/hermes-home or mounted /workspace/.hermes-home.
6. Write SOUL.md.
7. Write config.yaml with secret env placeholders only.
8. Mount/copy approved skills read-only.
9. Fetch scoped memory snapshot and write read-only context file.
10. Inject only approved secret values as environment variables.
11. Start `hermes chat -q <objective>` with approved `--toolsets`.
12. Stream/summarize Hermes output to canonical events.
13. Upload artifacts and profile/run traces.
14. Propose memory updates to review queue, do not directly mutate durable memory.
```

Near-term code impact:

- `services/agent-runtime/src/ports.ts`: add `workItemId`, `agentProfileRef`, `toolPolicy` fields.
- `services/agent-runtime/src/hermes-runner.ts`: accept a materialized profile home, env overrides, and config path.
- `services/agent-runtime/src/worker.ts`: use profile metadata to build prompt and artifact names.
- `infra/cdk/src/stacks/runtime-stack.ts`: pass table/bucket names for AgentProfiles/SkillRegistry/Memory if added.

## Data model additions

Add these DynamoDB tables or single-table entity types, depending on the final StateStack style:

```text
AgentProfilesTable
  PK: workspaceId
  SK: agentProfileId

AgentProfileVersionsTable
  PK: workspaceId#agentProfileId
  SK: version

SkillRegistryTable
  PK: workspaceId#skillName
  SK: version

ToolCatalogTable
  PK: provider#scope
  SK: toolId#version

AgentEvalRunsTable
  PK: workspaceId#agentProfileId#version
  SK: evalRunId

MemoryScopesTable
  PK: workspaceId
  SK: scopeId
```

Prefer adding protocol types first in `packages/protocol`, then Control API tests, then CDK.

## Promotion gates

No profile should become active unless these pass:

1. Schema validation
2. Tool policy validation
3. MCP server/tool allowlist validation
4. Secret scan for generated files
5. Prompt injection scan for skills/tool descriptions
6. Apify Actor risk classification
7. Budget policy check
8. Approval policy check
9. Eval pack exists
10. Candidate eval run completed
11. Scorecard meets threshold
12. Human approval for first active promotion
13. Canary option before full active use
14. Rollback target exists

Static checks should run locally and in CI. Quarantine checks run as ECS tasks with no production write credentials.

## First implementation slice

Do not try to build the full autonomous factory first. Build a boring, deterministic v0.

### Slice A: contracts and docs

- Add `AgentProfile`, `AgentProfileVersion`, `ToolPolicy`, `SkillRef`, `McpPolicy`, `ApifyPolicy` types in `packages/protocol`.
- Add event builders for `agent-profile.*` events.
- Add this plan to roadmap/status references.

Validation:

```bash
pnpm contracts:test
```

### Slice B: static Agent Creator package

- Create `services/agent-creator`.
- It accepts a role request and returns a deterministic draft profile artifact using templates.
- No model calls yet.
- No Apify calls yet.
- Tests cover marketing-agent fixture.

Validation:

```bash
pnpm --filter @agents-cloud/agent-creator test
```

### Slice C: Apify catalog adapter in readonly/mock mode

- Parse `/Users/sebastian/Downloads/openapi.json` in tests as a fixture or committed reduced schema, not the user Downloads path.
- Implement a small `ApifyCatalogPort` and classifier.
- Use mocked Apify actors in tests.
- Later wire real Apify MCP/API behind secrets.

### Slice D: Control API profile draft endpoints

- `POST /agent-profiles/requests` creates a WorkItem + Run or plain draft request depending on WorkItem readiness.
- `GET /agent-profiles` and `GET /agent-profiles/{id}/versions/{version}` list/read metadata.
- Store generated artifacts in S3.

### Slice E: runtime materialization smoke

- Let `services/agent-runtime` accept `agentProfileRef` and materialize `SOUL.md` + skills into a temp `HERMES_HOME`.
- Keep `HERMES_RUNNER_MODE=smoke` first.
- Assert canonical events include profile metadata.

### Slice F: quarantine eval runner

- Run one generated profile against small golden tasks with mocked tools.
- Produce `scorecard.md` artifact.
- Require approval before active status.

### Slice G: real Hermes CLI mode

- Enable real Hermes CLI only after Docker image and profile materialization are stable.
- Attach scoped model/provider secrets.
- Keep toolsets narrow.
- Capture logs and artifacts.

## Marketing agent example

Request:

```text
Create a marketing agent for Solo CEO that can research market positioning, competitor messaging, launch channels, content ideas, and campaign plans. It should not buy ads, post to social, email customers, or publish externally without approval.
```

Agent Creator output:

```json
{
  "roleKey": "marketing-strategist",
  "displayName": "Marketing Strategist",
  "mission": "Research, plan, and evaluate marketing strategy for Solo CEO launches and growth experiments.",
  "nonGoals": [
    "Do not purchase ads.",
    "Do not post publicly without approval.",
    "Do not scrape private/login-gated data.",
    "Do not contact leads or customers directly."
  ],
  "toolPolicy": {
    "builtInToolsets": ["web", "browser", "file", "skills", "memory"],
    "disabledToolsets": ["terminal", "github", "discord_admin", "homeassistant", "spotify", "rl"],
    "limits": {
      "maxToolCallsPerRun": 80,
      "maxBrowserPagesPerRun": 40,
      "maxDatasetRowsPerRun": 5000,
      "maxSpendUsdPerRun": 5
    }
  },
  "apifyPolicy": {
    "mode": "curated-readonly",
    "allowedActorCategories": ["web-search", "web-crawl", "company-research", "pricing-research"],
    "requiresApprovalCategories": ["social-media", "personal-data", "contact-extraction", "paid-spend", "external-write"]
  },
  "skills": [
    "market-research",
    "competitive-positioning",
    "campaign-planning",
    "content-strategy",
    "launch-retrospective"
  ],
  "defaultArtifacts": [
    "market-research-brief.md",
    "competitor-messaging-table.csv",
    "campaign-plan.md",
    "channel-scorecard.md"
  ]
}
```

Expected agent behavior:

- Creates WorkItems for larger initiatives.
- Produces concise research briefs with citations.
- Builds competitor tables and positioning matrices.
- Recommends campaigns and channels.
- Generates approval requests before external posting/spend/contacting.
- Emits artifacts and DataSourceRefs that can power dashboard Surfaces.

## UI/UX implication

Add an "Agent Library" section later:

```text
Agent Library
  - Active agents
  - Draft/candidate agents
  - Version history
  - Tool access summary
  - Skills included
  - Eval scorecard
  - Approval / reject / canary buttons
  - Recent delegated WorkItems
```

For the first UX, avoid raw JSON. Show:

- Role
- Mission
- What it can do
- What it cannot do
- Tools it can access, grouped by plain language
- Approval-required actions
- Example tasks
- Latest eval scorecard

## Security rules

- Never store secrets in generated profile files.
- Never let a generated profile approve itself.
- Never expose all Apify tools by default.
- Never expose all Hermes built-in toolsets by default.
- Never mount Docker socket into user runner containers.
- Never grant production external-write tools to a candidate profile.
- Treat MCP tool descriptions and results as untrusted input.
- Enforce tool policy outside the model, not only through prompt instructions.
- Tie every tool call/run/artifact to `workspaceId`, `userId`, `workItemId`, and `runId` where applicable.
- Require approval for posting, emailing, purchasing, deleting, publishing, credential access, or data exports above limits.

## Open questions

1. Should first Agent Creator execution be handled by `services/agent-runtime` or a separate `services/agent-creator` Lambda/ECS task?
   - Recommendation: separate package/service but same Step Functions/ECS pattern.

2. Should Apify be exposed through hosted MCP or internal connector first?
   - Recommendation: MCP for discovery in development; internal connector for production repeatability/governance.

3. Should profile artifacts be global or per workspace?
   - Recommendation: support global curated templates later; start with per-workspace profile versions.

4. How should user-provided company knowledge enter profiles?
   - Recommendation: memory scopes and read-only context snapshots, not copied permanently into every generated skill.

5. How much autonomous self-improvement should be allowed?
   - Recommendation: profile/skill candidate generation only; promotion requires evals and human approval.

## Recommended immediate next step

Implement the non-autonomous v0 Agent Creator contracts and static profile renderer after the WorkItem/run loop is stable enough to attach profile creation to a WorkItem.

Order:

```text
1. Finish durable WorkItem loop if not already complete.
2. Add AgentProfile protocol types/events.
3. Add services/agent-creator static renderer with tests.
4. Add profile artifact storage and read APIs.
5. Add quarantine eval runner with mocked tools.
6. Add Apify catalog adapter in readonly mode.
7. Add runtime profile materialization in smoke mode.
8. Only then enable real Hermes CLI profile execution with scoped secrets.
```

This gives Agents Cloud the right modular shape without violating the current highest-priority build rule: durable AWS-owned work/run truth first, advanced specialist behavior second.
