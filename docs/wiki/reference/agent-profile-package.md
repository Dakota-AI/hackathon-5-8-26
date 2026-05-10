# Agent Profile Package — `@agents-cloud/agent-profile`

[← reference](README.md) · [wiki index](../README.md) · related: [protocol-package](protocol-package.md), [agent-creator](agent-creator.md), [admin-console](admin-console.md)

> Versioned specialist-agent profile contract. Used by the agent-creator workshop, the Control API registry endpoints, and any future runtime that must enforce per-profile policy.

**Path:** `packages/agent-profile/`
**Status:** ✅ active

---

## Package metadata

```json
{
  "name": "@agents-cloud/agent-profile",
  "private": true,
  "type": "module",
  "main": "./dist/src/index.js"
}
```

No runtime deps. TypeScript only.

---

## Type surface (`src/types.ts`)

### Top-level aliases
- `ToolRisk = "low" | "medium" | "high"`
- `ProfileLifecycleState = "draft" | "review" | "approved" | "promoted" | "retired"`
- `PreferenceScope = "platform" | "org" | "user" | "workspace" | "project" | "agent" | "task"`
- `McpTrustLevel = "trusted" | "reviewed" | "untrusted"`

### `CandidateTool`
Discovery-time tool descriptor.
- `id`, `name`, `category`, `risk`, `description`
- Optional `source` enum: `"platform" | "mcp" | "apify" | "internal" | "user_connected"`
- Optional `catalogHash`

### `AgentPreferencePolicy`
- `scope: PreferenceScope`
- `verbosity: concise | balanced | detailed`
- `interruptionTolerance: low | normal | high`
- `reportCadence: on_completion | end_of_day | daily | weekly | custom_cron`
- `reportFormat: chat_summary | pdf_brief | markdown | email | genui_workspace`
- `expensiveToolPolicy: never | ask | budgeted | autonomous`
- `externalActionPolicy: ask | allowed_for_approved_recipients | never`
- `sourcePolicy: verified_first | broad_research | internal_only`

### `AgentBehaviorPolicy`
- `instructions[]`, `communicationCadence`, `reportStyle`, `escalationPolicy`, `feedbackAdaptations[]`
- Nested `preferencePolicy: AgentPreferencePolicy`

### `AgentToolPolicyEntry`
- Tool reference (id) + `requiresApproval`
- Optional `catalogHash`
- Optional `budget: {maxCallsPerRun?, maxCostUsdPerRun?}`

### `AgentToolPolicy`
- `allowedTools[]` — auto-execute
- `approvalRequiredTools[]` — gated
- `deniedTools[]` — banned
- `notes[]`

### `AgentMcpServerPolicy` and `AgentMcpPolicy`
Pinned MCP server allowlist with `allowDynamicServers`, `responseInspectionRequired`, optional `pinnedDefinitionHash`, optional `trustLevel`.

### `AgentEvalScenario` and `AgentEvalPack`
Quarantine eval scenarios. Each has `passCriteria[]` and optional `requiredToolBehavior[]`.

### `AgentProfileScorecard`
- `readyForUserReview`, `readyForPromotion` (booleans)
- Metric counters
- `requiredBeforePromotion[]`
- `findings[]` with severity `info | warning | blocker`

### `AgentProfileApproval`
- `approvedByUserId`, `approvedAt`, `approvalEventId`
- Optional `notes`

### `AgentProfileChangeLogEntry`
- `version`, `summary`, `evidence[]`

### `AgentProfileManifest`
- `schemaVersion: "agent-profile/v1"`
- Optional `profileHash`, `bundleHash`, `generatedAt`
- `files: [{path, sha256}]`

### `AgentProfileVersion` (canonical aggregate)

**Required:**
- `schemaVersion: "agent-profile/v1"`
- `profileId`
- `version`
- `workspaceId`
- `createdByUserId`
- `role`
- `lifecycleState`
- `mission`
- `projectContextSummary`
- `behavior: AgentBehaviorPolicy`
- `toolPolicy: AgentToolPolicy`
- `mcpPolicy: AgentMcpPolicy`
- `evalPack: AgentEvalPack`
- `changeLog: AgentProfileChangeLogEntry[]`

**Optional:**
- `scorecard: AgentProfileScorecard`
- `approval: AgentProfileApproval`
- `manifest: AgentProfileManifest`

### `AgentProfileChangeRequest`
Captures user revision requests. `changeType` enum:
`behavior.preference | communication.cadence | tool.cost_policy | tool.add | tool.remove | eval.add | reporting.change | source_policy.change`

### `AgentProfileLineageEvent`
Append-only event types:
- `agent.profile.draft.created`
- `agent.profile.draft.validated`
- `agent.profile.eval.completed`
- `agent.profile.approved`
- `agent.profile.promoted`
- `agent.profile.revision.requested`
- `agent.profile.retired`

### Validation types
- `ValidationError` — `code` enum:
  - `MISSING_REQUIRED_FIELD`
  - `MISSING_EVAL_SCENARIOS`
  - `HIGH_RISK_TOOL_WITHOUT_APPROVAL`
  - `SECRET_PATTERN`
  - `UNPINNED_MCP_SERVER`
  - `DYNAMIC_MCP_WITHOUT_ALLOWLIST`
  - `PROMOTION_WITHOUT_APPROVAL`
  - `MISSING_CHANGELOG`
  - `TOOL_POLICY_CONFLICT`
- `ValidationResult` — `valid`, `errors[]`, `warnings[]`, `summary` counters

---

## `validateAgentProfileVersion(profile)` (`src/validators.ts`)

Single exported function. Logic:

1. **`requireField`** — checks all six required string fields (`schemaVersion`, `profileId`, `version`, `workspaceId`, `role`, `mission`).
2. Enforces non-empty `changeLog` (→ `MISSING_CHANGELOG`) and non-empty `evalPack.scenarios` (→ `MISSING_EVAL_SCENARIOS`).
3. **Tool policy rules:**
   - Any tool in allowed-or-approval-required lists with `risk: medium|high` and not `requiresApproval` → `HIGH_RISK_TOOL_WITHOUT_APPROVAL`
   - Any medium/high-risk tool in `allowedTools` (rather than `approvalRequiredTools`) → also rejected
   - Cross-list duplicates → `TOOL_POLICY_CONFLICT`
4. **MCP rules:**
   - `allowDynamicServers` with empty `allowedServers` → `DYNAMIC_MCP_WITHOUT_ALLOWLIST`
   - Servers without `pinnedDefinitionHash` → `UNPINNED_MCP_SERVER`
   - `trustLevel: untrusted` → warning
5. **Lifecycle rule:** `approved` or `promoted` without an `approval` block → `PROMOTION_WITHOUT_APPROVAL`.
6. **Secret scan:** recursive `findSecretPatterns` walks the entire profile, matching against `SECRET_PATTERNS` regexes:
   - OpenAI-style `sk-...` keys
   - AWS access key IDs `AKIA...`
   - PEM private-key headers
   - Env var names like `APIFY_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `SECRET_ACCESS_KEY`, `PRIVATE_KEY`
   - Bearer tokens

Hits emit `SECRET_PATTERN` errors with a JSON-pointer-like path (e.g. `$.behavior.instructions[3]`).

`summary` counters populated regardless of validity.

---

## `createMarketingStrategistFixture()` (`src/fixtures.ts`)

Single exported factory. Returns a fully populated, lifecycle-`draft` `AgentProfileVersion` for the demo "Marketing Strategist":

- `workspaceId: "workspace-demo"`, `createdByUserId: "user-demo"`
- 3 tool-policy entries (Apify search allowed; Apify call-actor and email send approval-required with budgets)
- 1 pinned read-only Apify MCP server
- 3 eval scenarios (`source-quality`, `low-interruption`, `approval-gate`)
- Scorecard ready-for-review but blocked from promotion
- 1 changelog entry

The canonical happy-path input for tests and downstream services (e.g., the web admin Workshop panel uses this fixture as the seed for `buildAgentWorkshopDraftProfile`).

---

## Tests (`test/validators.test.ts`)

6 `node:test` cases:
1. Fixture passes validation
2. High-risk tool without approval is rejected
3. Empty eval scenarios rejected
4. Injected `sk-...` secret rejected
5. Unpinned untrusted MCP server rejected
6. `lifecycleState: "promoted"` with `approval: undefined` rejected

Run: `pnpm --filter @agents-cloud/agent-profile run test`.

---

## Consumers

### `services/control-api/src/agent-profiles.ts`
- Imports `validateAgentProfileVersion` and `AgentProfileVersion`
- Exports `createAgentProfileDraft`, `listAgentProfiles`, `getAgentProfileVersion`, `approveAgentProfileVersion`
- `S3AgentProfileBundleStore` writes `profile.json` artifacts to `WorkspaceLiveArtifactsBucket`
- `safeValidateAgentProfile` wraps the shared validator with safe-identifier regex on `workspaceId`/`profileId`/`version` (DynamoDB key + S3 path safety)
- `approveAgentProfileVersion` mutates `lifecycleState → "approved"`, attaches `AgentProfileApproval`, appends changelog, re-validates, re-uploads

### `services/control-api/src/dynamo-store.ts`
Implements `AgentProfileRegistryStore` port: `putAgentProfileVersion`, `getAgentProfileVersion`, `listAgentProfilesForUser`, `updateAgentProfileVersion`.

### `services/agent-creator/`
Depends on the package via `workspace:*`. Re-exports `AgentProfileScorecard`, `AgentProfileVersion`, `CandidateTool`, `ToolRisk` from `src/types.ts`. Calls `validateAgentProfileVersion` in `src/workshop.ts` to gate scorecard generation. Uses `AgentProfileManifest` and `AgentProfileVersion` in `src/profile-bundle.ts` for deterministic file bundling.

### `apps/web/lib/agent-workshop.ts`
`buildAgentWorkshopDraftProfile(input)` clones `createMarketingStrategistFixture()` and overlays role/context/goals/constraints. Produces the same shape `agent-creator`'s `renderDraftProfile` produces.

⚠️ **Two divergent renderers** — agent-creator and web Agent Workshop produce slightly different default tool sets and MCP policy literals. Picking one as source of truth is a hackathon polish.

[→ protocol package](protocol-package.md) · [→ agent-creator](agent-creator.md) · [→ admin-console](admin-console.md)
