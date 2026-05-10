# Specialist Creation Current Plan

Workstream: Specialist Creation
Owner: Specialist Creation Workstream
Updated: 2026-05-10
Status: planned; local prototype exists

## Current Scope

Turn a user request such as "create a marketing agent" into a researched,
reviewable, testable specialist profile draft.

## Current State

- `services/agent-creator` local prototype can produce deterministic workshop
  plans, profile drafts, scorecards, and demo transcripts.
- `packages/agent-profile` local scaffold defines versioned profile contracts
  and validators.
- Promotion is blocked in the prototype until eval and user approval evidence
  exists.

## Gaps

- No durable profile registry.
- No profile bundle S3 layout.
- No Control API routes.
- No client review UI.
- No runtime materialization.
- No live domain research workflow yet.

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
