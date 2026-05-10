---
name: agent-profile-schema
description: "Authoritative schema and JSON shape for agents-cloud AgentProfileVersion (agent-profile/v1). Load whenever drafting, validating, or modifying a profile."
version: 1.0.0
metadata:
  hermes:
    tags: [agents-cloud, agent-profile, schema, contracts]
---

# AgentProfileVersion (agent-profile/v1) — schema reference

Source of truth: `packages/agent-profile/src/types.ts` in the agents-cloud
monorepo. Validators: `packages/agent-profile/src/validators.ts` exported as
`validateAgentProfileVersion(profile) -> ValidationResult`.

## Top-level shape

```ts
AgentProfileVersion = {
  schemaVersion: "agent-profile/v1",
  profileId: string,             // kebab-case, derived from role
  version: string,               // e.g. "0.1.0-draft"
  workspaceId: string,
  createdByUserId: string,
  role: string,                  // human-readable role name
  lifecycleState: "draft" | "review" | "approved" | "promoted" | "retired",
  mission: string,               // one sentence purpose statement
  projectContextSummary: string, // includes constraints
  behavior: AgentBehaviorPolicy,
  toolPolicy: AgentToolPolicy,
  mcpPolicy: AgentMcpPolicy,
  evalPack: AgentEvalPack,
  scorecard?: AgentProfileScorecard,
  approval?: AgentProfileApproval,
  changeLog: AgentProfileChangeLogEntry[],   // MUST have >= 1 entry
  manifest?: AgentProfileManifest,
}
```

## behavior.preferencePolicy enums (must match exactly)

```
scope:                "platform" | "org" | "user" | "workspace" | "project" | "agent" | "task"
verbosity:            "concise" | "balanced" | "detailed"
interruptionTolerance:"low" | "normal" | "high"
reportCadence:        "on_completion" | "end_of_day" | "daily" | "weekly" | "custom_cron"
reportFormat:         "chat_summary" | "pdf_brief" | "markdown" | "email" | "genui_workspace"
expensiveToolPolicy:  "never" | "ask" | "budgeted" | "autonomous"
externalActionPolicy: "ask" | "allowed_for_approved_recipients" | "never"
sourcePolicy:         "verified_first" | "broad_research" | "internal_only"
```

## toolPolicy

```
allowedTools:           AgentToolPolicyEntry[]   // risk:"low" only by default
approvalRequiredTools:  AgentToolPolicyEntry[]   // every entry requiresApproval:true
deniedTools:            AgentToolPolicyEntry[]
notes:                  string[]                  // explain each gate
```

`AgentToolPolicyEntry`:

```
toolId, name, category, risk, description,
source: "platform" | "mcp" | "apify" | "internal" | "user_connected",
requiresApproval: boolean,
catalogHash?: string,        // sha256:<id>-... placeholder OK for draft
budget?: { maxCallsPerRun?, maxCostUsdPerRun? }
```

## mcpPolicy

```
allowDynamicServers: false      // ALWAYS false for drafts
allowedServers: [
  {
    id, serverUrl, description,
    trustLevel: "trusted" | "reviewed" | "untrusted",
    pinnedDefinitionHash: "sha256:...",   // REQUIRED — validators reject unpinned
    allowedToolIds: string[],
  }
]
responseInspectionRequired: true
```

## evalPack

`{ version, scenarios: AgentEvalScenario[] }`. Each scenario:
`{ id, name, prompt, passCriteria: string[], requiredToolBehavior?: string[] }`.
At least 3 scenarios; one MUST be a guardrail/negative case (approval gate or
out-of-scope refusal).

## changeLog

Required and non-empty. Each entry: `{ version, summary, evidence: string[] }`.

## Validator error codes

If `validateAgentProfileVersion` returns `valid:false`, fix the underlying
field, do not paper over it:

```
MISSING_REQUIRED_FIELD          -> add the field
MISSING_EVAL_SCENARIOS          -> add at least one scenario
HIGH_RISK_TOOL_WITHOUT_APPROVAL -> move tool into approvalRequiredTools
SECRET_PATTERN                  -> strip the value, replace with secretRef placeholder
UNPINNED_MCP_SERVER             -> add pinnedDefinitionHash
DYNAMIC_MCP_WITHOUT_ALLOWLIST   -> set allowDynamicServers:false and add allowedToolIds
PROMOTION_WITHOUT_APPROVAL      -> set lifecycleState back to "draft" or "review"
MISSING_CHANGELOG               -> add a changelog entry
TOOL_POLICY_CONFLICT            -> a tool appears in multiple lists; pick one
```

## Local validation snippet

```bash
cd /Users/sebastian/Developer/agents-cloud
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateAgentProfileVersion } from './packages/agent-profile/dist/src/index.js';
const draft = JSON.parse(readFileSync('/tmp/draft-profile.json','utf8'));
const r = validateAgentProfileVersion(draft);
console.log(JSON.stringify(r, null, 2));
process.exit(r.valid ? 0 : 1);
"
```

If `dist/` is stale: `pnpm --filter @agents-cloud/agent-profile build`.
