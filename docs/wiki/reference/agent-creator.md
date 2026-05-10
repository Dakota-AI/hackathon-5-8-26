# Agent Creator (Workshop CLI) — Reference

[← reference](README.md) · [wiki index](../README.md) · related: [agent-profile-package](agent-profile-package.md), [admin-console](admin-console.md)

> Standalone deterministic CLI workshop for drafting, validating, and bundling specialist agent profiles before they're promoted into production. The offline counterpart to the web admin's Agent Workshop panel.

**Path:** `services/agent-creator/`
**Status:** ⚠️ functional CLI; not wired to HTTP

---

## What `agent-creator:smoke` does

Defined in repo `package.json:27`:

```json
"agent-creator:smoke": "pnpm --filter @agents-cloud/agent-creator run smoke"
```

Delegates to package script (`services/agent-creator/package.json:18`):

```json
"smoke": "pnpm build && node dist/src/cli.js --scenario test/fixtures/marketing-workshop-scenario.json"
```

Flow:
1. Build `@agents-cloud/agent-profile` and the service.
2. Run CLI in `--scenario` mode against bundled fixture.
3. Print full `WorkshopSimulationResult` JSON to stdout and exit.

No network, no S3, no DynamoDB. Deterministic check that draft assembly, profile validation (via shared `validateAgentProfileVersion`), scorecard generation, and audit/transcript shape still work after a code change.

`Dockerfile` wraps the same command as default `CMD` — container run is equivalent to smoke minus the build.

---

## CLI modes (`src/cli.ts`)

### `--scenario <path.json>`
Non-interactive. Reads file, parses as `AgentWorkshopRequest`, calls `runScenarioFile` → `runWorkshopSimulation`, dumps result as JSON. The smoke path.

### `--interactive`
TTY-driven. Builds an `InteractiveAnswers` object via `node:readline/promises` prompts:
- role, project name, goals, constraints
- cadence, report style, verbosity
- free-text feedback

Prints demo transcript, audit trail, draft profile summary, full JSON. With `--bundle-dir <out-dir>`, also calls `writeProfileBundle` and prints local bundle path + hash.

### Piped stdin
If stdin is non-TTY, `readAnswersFromPipedStdin` reads 8 newline-separated lines in fixed order with safe defaults. Useful for headless scripted runs. Doesn't require `--interactive`.

### `help`
Anything else exits with usage text and code 2.

---

## Scenario files

Single file in repo: `test/fixtures/marketing-workshop-scenario.json`. Shape is `AgentWorkshopRequest`:

```ts
{
  workspaceId: string,
  requestedByUserId: string,
  requestedRole: string,                     // "Marketing Strategist"
  projectContext: { name, goals[], constraints[] },
  userPreferences: {
    communicationCadence,
    reportStyle,
    verbosity,
    approvalPreference
  },
  feedback: [{source, message}],             // typed: user|agent|evaluator|system
  candidateTools: CandidateTool[]            // 3 tools in fixture
}
```

The fixture's three candidate tools:
- `apify.search-actors` (low risk)
- `apify.call-actor` (high)
- `email.send` (high)

Canonical "Solo CEO launch / Marketing Strategist" demo case.

---

## AgentProfile draft shape

`renderDraftProfile(request)` (`src/workshop.ts:41-150`) emits an `AgentProfileVersion`:

| Field | Value |
|---|---|
| `schemaVersion` | `"agent-profile/v1"` |
| `version` | `"0.1.0-draft"` |
| `lifecycleState` | `"draft"` |
| `profileId` | slugified role (e.g. `"marketing-strategist"`) |
| `mission` | `"Act as a {role} for {project}. Optimize for: {goals}."` |
| `behavior.instructions` | three opinionated defaults + per-feedback adaptations from `deriveFeedbackAdaptations` |
| `behavior.preferencePolicy` | translates user prefs into verbosity / interruptionTolerance:`"low"` / cadence / format / `expensiveToolPolicy` / `externalActionPolicy` / `sourcePolicy` |
| `toolPolicy` | splits `candidateTools` by `risk`: `low` → `allowedTools`; `medium|high` → `approvalRequiredTools` (each `requiresApproval: true`); `deniedTools: []`; tool entries get inferred `source` (apify/mcp/email/internal) and placeholder `catalogHash` |
| `mcpPolicy` | hardcoded single allowlisted MCP server (`apify-catalog-readonly`) with `allowDynamicServers: false`, `responseInspectionRequired: true` |
| `evalPack` | three quarantine scenarios: `source-quality`, `low-interruption`, `approval-gate` with explicit pass criteria |
| `changeLog` | single `0.1.0-draft` entry citing user-pref mapping, risk-split tool policy, pre-promotion eval generation |

`deriveFeedbackAdaptations` does substring matching on "interrupt", "out of date", "verbose", etc. — heuristic, not LLM-driven.

`evaluateProfileDraft` (`src/workshop.ts:152-185`) wraps the shared `validateAgentProfileVersion` and produces `AgentProfileScorecard`. Always `readyForPromotion: false` — promotion gates on quarantine evidence + recorded user approval.

---

## Local bundle output

⚠️ **Agent-creator does NOT write to S3.** No `@aws-sdk/client-s3` dep. The `--bundle-dir` flag writes a *local* directory bundle.

`writeProfileBundle(profile, rootDir)` materializes 9 files relative to `rootDir`:

```
<rootDir>/
├── profile.json                  # pretty-printed AgentProfileVersion
├── SOUL.md                       # human-readable mission/behavior/tools
├── config.fragment.yaml          # runtime config stub
├── skills/README.md              # placeholder
├── policy/tool-policy.json
├── policy/mcp-policy.json
├── evals/eval-pack.json
├── scorecards/latest.json
├── CHANGELOG.md
└── manifest.json                 # AgentProfileManifest with sha256 per file
```

Manifest's `generatedAt` is intentionally `new Date(0).toISOString()` so bundles are byte-stable across runs.

---

## Promotion to a real `AgentProfileRecord`

The workshop's draft is promoted by handing the same `AgentProfileVersion` JSON to `services/control-api/src/agent-profiles.ts`. `createAgentProfileDraft`:

1. Validates `workspaceId`, asserts `profile.workspaceId` and `profile.createdByUserId` match authenticated user.
2. Re-runs `validateAgentProfileVersion` + `safeTokenError` regex on identifiers.
3. Computes `artifactKey = workspaces/{workspaceId}/agent-profiles/{profileId}/versions/{version}/profile.json`.
4. `S3AgentProfileBundleStore.putAgentProfileArtifact` does PutObject of pretty-printed JSON to `PROFILE_BUNDLES_BUCKET_NAME` with `ServerSideEncryption: AES256`. Returns `s3://bucket/key`.
5. Persists `AgentProfileRecord` (`profileVersionKey: "{profileId}#{version}"`, `lifecycleState`, `artifactS3Uri`, embedded `profile`, `validationSummary`, timestamps) via `store.putAgentProfileVersion`.

`approveAgentProfileVersion` re-writes the artifact with an `approval` block and new changelog entry, sets `lifecycleState: "approved"`.

The agent-creator's local bundle is essentially a richer, file-per-concern preview of what `createAgentProfileDraft` writes as a single JSON object.

---

## Relationship to web admin Agent Workshop

The web admin's Agent Workshop panel does **not** call agent-creator. It uses a parallel TS implementation in `apps/web/lib/agent-workshop.ts`:

- `buildAgentWorkshopDraftProfile(input)` starts from `createMarketingStrategistFixture()` (in `@agents-cloud/agent-profile`) and overlays operator's role/context/goals/constraints. Same `AgentProfileVersion` shape that agent-creator's `renderDraftProfile` produces from `AgentWorkshopRequest`.
- The admin console then `POST`s to Control API via `createControlApiAgentProfileDraft` → `POST /agent-profiles/drafts`. Approve/Inspect/Refresh buttons wire to the same handlers.
- `agentWorkshopLifecycle()` returns 7 canonical stages shown as the lifecycle timeline. See [admin-console](admin-console.md).

So agent-creator and the web admin draft path are **two independent renderers of the same schema**. The web path is what actually exercises Control API/DDB/S3; agent-creator is the local CLI mirror.

⚠️ **Two divergent renderers** — different default tool sets, different MCP policy literals. For demo coherence, picking one as source of truth (likely promoting agent-creator's output through an HTTP wrapper or moving its logic into `@agents-cloud/agent-profile`) would be the highest-value tightening.

---

## What's missing for hackathon use

- ❌ **No HTTP surface.** CLI/library only. No Express/Fastify/Lambda entrypoint and no client in services/control-api calls into it. The web Agent Workshop panel re-implements draft assembly client-side.
- ❌ **No S3/DDB writes.** Bundles are local-disk only. Promotion requires the Control API.
- ❌ **No worker wiring.** Eval pack generated but never executed. `agentWorkshopLifecycle()` correctly marks `quarantine_eval` and `promotion_runtime` as `next`. `lifecycleState=approved` doesn't inject the profile into any resident runner today.
- ❌ **Heuristic feedback adaptation.** `deriveFeedbackAdaptations` is a tiny substring matcher.
- ❌ **No README** — this wiki page is the first prose description.
- ❌ Two divergent draft renderers (see above).

---

## Tests

`services/agent-creator/test/`:
- `workshop.test.ts` — scenario validation, draft assembly, scorecard
- `interactive.test.ts` — interactive answer parsing
- `profile-bundle.test.ts` — bundle file structure, manifest hashing

Run: `pnpm agent-creator:test` or `pnpm agent-creator:smoke` (smoke runs the marketing scenario and prints JSON).

---

## Key paths

- `services/agent-creator/package.json`
- `services/agent-creator/Dockerfile`
- `services/agent-creator/src/{cli, index, interactive, workshop, profile-bundle, types}.ts`
- `services/agent-creator/test/{workshop, interactive, profile-bundle}.test.ts`
- `services/agent-creator/test/fixtures/marketing-workshop-scenario.json`
- `services/control-api/src/agent-profiles.ts`
- `apps/web/lib/agent-workshop.ts`
- `apps/web/components/admin-console.tsx`
- `package.json` (root scripts)

[← reference](README.md) · [→ agent-profile-package](agent-profile-package.md) · [→ admin-console](admin-console.md)
