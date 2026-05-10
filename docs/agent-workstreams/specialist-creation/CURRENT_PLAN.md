# Specialist Creation Current Plan

Workstream: Specialist Creation
Owner: Specialist Creation Workstream
Updated: 2026-05-10
Status: local Agent Creator Hermes profile and Apify CLI workflow verified

## Current Scope

Turn a user request such as "create a marketing agent" into a researched,
reviewable, testable specialist profile draft.

## Current State

- `services/agent-creator` local prototype can produce deterministic workshop
  plans, profile drafts, scorecards, and demo transcripts.
- `packages/agent-profile` defines versioned profile contracts and validators.
- A local Hermes profile named `agentcreator` is reproducibly documented under
  `docs/agent-workstreams/specialist-creation/AGENT_CREATOR_HERMES_PROFILE.md`.
- Apify discovery/prototyping uses `tools/apifycli/apifycli`, a zero-dependency
  CLI around the Apify OpenAPI surface, not MCP.
- A real `saas-pricing-watcher` workshop run prototyped Apify actors, measured
  cost, denied failing actors, generated a valid `AgentProfileVersion`, and
  kept Control API posting behind explicit user approval.
- Promotion remains blocked until quarantine eval evidence and approval exist.

## Gaps

- Scenario-mode bundle writing is incomplete: `services/agent-creator` can emit
  scenario simulation output, but full bundle directory writing is currently
  only available in interactive mode.
- No quarantine eval runner that executes scenarios against a throwaway
  specialist Hermes profile and writes `eval-results.json`.
- Runtime materialization still needs to load only approved immutable bundles.
- Production Apify execution still needs a curated platform connector with
  actor allowlists, workspace/run IDs, and budget enforcement. The local CLI is
  for Agent Creator discovery/prototyping, not direct production specialist
  credentials.
- Client review UI still needs to present prototype traces, costs, scorecards,
  and explicit approval/revision actions.

## Risks

- "Expert" profiles can become generic if the system skips deep research and
  domain-specific evals.
- Tool policies must be conservative by default.
- Approved profile versions must be immutable and auditable.

## Files Expected To Change

- `services/agent-creator/**`
- `packages/agent-profile/**`
- `services/control-api/**`
- `infra/cdk/**`
- `packages/protocol/**`
- client review UI files

## Cross-Workstream Dependencies

- Access Control for profile capabilities.
- Self-Improvement for eval/promotion policy.
- Agent Harness for runtime profile loading.
- Clients for review UI.

## Implementation Plan

1. Validate and commit the local package scaffolds.
2. Define profile registry and bundle storage.
3. Add draft profile API.
4. Add review/revision API.
5. Add approved-version loading handoff to runtime.
6. Add domain research integration after tool policy and access control exist.

## Validation Plan

```bash
pnpm agent-creator:test
pnpm agent-creator:smoke
pnpm --filter @agents-cloud/agent-profile test
pnpm contracts:test
```

## Completion Criteria

- A specialist profile can be drafted, validated, reviewed, and stored without
  being executable until approval.
- Drafts include evals, tool policy, scorecard, changelog, and no secrets.
- Runtime only loads approved immutable versions.
