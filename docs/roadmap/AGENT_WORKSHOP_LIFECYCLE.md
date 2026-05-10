# Agent Workshop lifecycle

Last updated: 2026-05-10

This document explains how the Agents Cloud Agent Workshop / Agent Creator path is
supposed to work, what is wired today, and what still needs to be built before a
created specialist becomes an autonomous production runtime agent.

## Product intent

Agent Workshop is the governed factory for Solo CEO / Agents Cloud specialist
agents. The goal is not to let arbitrary prompts immediately become arbitrary
workers. The goal is to produce reviewable, versioned, auditable specialist
profiles that can later be promoted into the Hermes/ECS runner boundary with
scoped tools, scoped credentials, eval evidence, approval history, and durable
lineage.

The user-facing shape is:

1. The operator describes a role or business need.
2. Agent Workshop interviews/researches enough to design the specialist.
3. The system drafts a versioned profile.
4. The profile is validated against platform policy.
5. Tools, MCP surfaces, Apify actors, and external actions are split into
   allowed, approval-required, and denied sets.
6. Eval scenarios are attached before promotion.
7. The operator reviews the profile, scorecard, and policy posture.
8. Approval is recorded durably.
9. A later promotion gate binds the approved version into a resident user runner
   / ECS Hermes execution context.

## Current live slice

The current implemented slice is live through draft creation, policy validation,
artifact persistence, registry listing/get, and explicit approval.

Implemented backend routes:

- `POST /agent-profiles/drafts`
- `GET /agent-profiles`
- `GET /agent-profiles/{profileId}/versions/{version}?workspaceId=...`
- `POST /agent-profiles/{profileId}/versions/{version}/approve?workspaceId=...`

Implemented durability:

- DynamoDB Agent Profiles registry table.
- S3 materialized profile JSON bundle under:
  `workspaces/{workspaceId}/agent-profiles/{profileId}/versions/{version}/profile.json`
- Approval metadata persisted into the registry record and rewritten profile
  artifact.

Implemented admin UI:

- `/admin` and `admin.solo-ceo.ai` render an Agent Workshop panel.
- The panel can create a governed draft from role/context/goals/constraints.
- The panel can list profile versions from Control API.
- The panel can inspect a profile version.
- The panel can approve a version and show lifecycle state updates.
- The panel also shows which lifecycle stages are live, partial, or next.

## Lifecycle stages

### 1. Intake and role design

Status: partial.

Today the admin playground accepts a role, project context, goals, and
constraints. It deterministically maps those fields into an `AgentProfileVersion`
draft.

The full future version should be conversational:

- ask clarifying questions,
- infer role boundaries,
- ask whether research is allowed,
- ask permission before expensive tools or external side effects,
- collect user preferences such as verbosity, interruption tolerance, reporting
  cadence, and source-quality policy,
- record the evidence used to design the profile.

Durable evidence expected:

- intake transcript,
- role brief,
- preference snapshot,
- design assumptions,
- change log entry.

### 2. Draft profile assembly

Status: live.

Agent Workshop produces an `AgentProfileVersion` using the shared
`@agents-cloud/agent-profile` contract. The profile includes:

- schema version,
- profile ID,
- semantic version,
- workspace ID,
- creator user ID,
- role,
- lifecycle state,
- mission,
- project context summary,
- behavior policy,
- tool policy,
- MCP policy,
- eval pack,
- scorecard,
- changelog,
- optional approval and manifest.

The Control API draft route normalizes the profile to the authenticated user and
requested workspace, validates the profile, writes the S3 artifact, then writes
the registry row.

### 3. Policy and tool audit

Status: live for structural policy validation; partial for external catalog
runtime checks.

The shared profile validator fails closed for the most important profile-policy
classes:

- missing required profile fields,
- missing eval scenarios,
- high-risk tools without approval gates,
- secret-like strings in profile content,
- unpinned MCP servers,
- dynamic MCP allowlists without explicit allowlisting,
- promotion without approval,
- missing changelog,
- tool-policy conflicts.

Tool posture is represented as:

- `allowedTools` for low-risk or read-only tools,
- `approvalRequiredTools` for expensive, irreversible, public, credentialed, or
  external-side-effect tools,
- `deniedTools` for tools the profile must not use.

Apify posture today:

- Agent Creator uses the local zero-dependency `tools/apifycli/apifycli` CLI for
  discovery/prototyping instead of Apify MCP.
- read-only store search, actor metadata, OpenAPI, README, and input validation
  are discovery activities.
- actor runs are high-risk and approval-gated because they spend credits and use
  external compute/proxies.
- paid/external-side-effect operations remain approval-gated.
- the verified `saas-pricing-watcher` workshop ran real Apify prototypes and
  kept the passing actor (`apify/website-content-crawler`) in
  `approvalRequiredTools`; failing actors were denied.

MCP posture today:

- dynamic MCP server access is disabled by default,
- allowed servers require pinned definition hashes,
- response inspection can be required by policy.

Not yet complete:

- production Apify connector/broker that runs approved actors without exposing a
  raw APIFY_TOKEN to specialists,
- live tool-catalog signing and catalog-hash refresh,
- live MCP definition fetch/diff in the profile creation loop,
- scenario-mode full profile-bundle writing from `services/agent-creator`,
- quarantine eval execution against throwaway specialist profiles.

### 4. Artifact registry

Status: live.

Every draft or approved version stores its materialized JSON profile artifact in
S3. The DynamoDB registry record stores metadata plus the profile snapshot needed
by clients and backend workflows.

Why this matters:

- clients can review exactly what exists,
- approval refers to a concrete version,
- later runner promotion can bind to a specific artifact hash/version,
- audits can compare profile versions over time.

### 5. Human review and approval

Status: live.

The approval route requires the authenticated user to own the profile version.
Approval writes:

- `lifecycleState = approved`,
- approval user ID,
- approval timestamp,
- approval event ID,
- optional notes,
- updated changelog evidence,
- rewritten S3 profile artifact.

Approval is not the same as runtime promotion. Approval means the profile is
accepted for the next gate. Promotion still needs quarantine eval evidence.

### 6. Quarantine eval run

Status: next.

The eval pack is attached today, but automated eval execution is not yet wired.
The intended eval stage should:

- run each profile eval scenario in an isolated/quarantined mode,
- use deterministic mocks or explicitly approved external tools,
- record transcript/evidence,
- score pass/fail criteria,
- produce a scorecard artifact,
- block promotion on failed safety/policy criteria,
- expose the scorecard in admin review UI.

This is the next backend slice before automatic promotion.

### 7. Promotion to runtime

Status: next.

Promotion should be a separate, explicit gate that only succeeds when:

- the profile has been approved,
- quarantine evals passed,
- required tool policy and credential scopes are available,
- workspace membership/capability checks pass,
- the runner context can bind to the exact profile version/hash,
- the user or admin approves the promotion policy.

Promotion should then bind the approved profile into the user-runner/Hermes ECS
context as scoped runtime configuration, not as an arbitrary prompt blob.

## How the admin playground works

The admin panel is intentionally practical rather than abstract. It lets an admin
play with the currently live registry flow:

1. Fill in role, context, goals, and constraints.
2. Click `Create live draft`.
3. Browser creates an `AgentProfileVersion` using the shared profile contract.
4. Browser calls `POST /agent-profiles/drafts`.
5. Control API validates policy and schema.
6. Control API writes S3 profile artifact.
7. Control API writes DynamoDB registry row.
8. Admin panel refreshes/list-selects the profile.
9. Click `Inspect from API` to prove the get route works.
10. Click `Approve version` to persist approval metadata and move state to
    `approved`.

The UI still exposes a policy snapshot for admin debugging, but the normal user
product surface should eventually show this as a friendlier scorecard rather than
raw JSON.

## Security and tenant boundaries

Current route protection:

- profile routes are Cognito-protected,
- registry methods filter by authenticated user ownership,
- get/approve require owned profile versions,
- profile creation normalizes workspace/user fields server-side.

Important remaining hardening:

- enforce full workspace membership/capability checks before broad usage,
- connect access-code onboarding gates to admin/product access,
- avoid treating client-supplied workspace IDs as sufficient authorization,
- bind third-party credentials through scoped brokers rather than raw profile
  fields,
- prevent promotion until eval evidence and capability checks exist.

## Current answer to “is it all set up?”

No, not fully. The foundational registry and review/approval slice is set up.
That means the system can now create, validate, persist, list, inspect, and
approve governed specialist profile versions.

The following are still not complete:

- conversational Agent Creator interview loop,
- live external catalog research/audit for every candidate tool,
- automated quarantine eval execution,
- scorecard artifact generation from real evals,
- promotion into resident Hermes/ECS runner context,
- runtime enforcement of the exact approved profile version,
- full workspace/capability authorization on every route,
- polished non-admin user-facing review surface.

The intended implementation order is:

1. Deploy registry and admin playground.
2. Dogfood draft/list/inspect/approve with a real Cognito session.
3. Add quarantine eval runner and scorecard artifacts.
4. Add promotion gate.
5. Bind promoted profile versions into the user-runner/Hermes runtime.
6. Expand conversational creation and external tool catalog research.
