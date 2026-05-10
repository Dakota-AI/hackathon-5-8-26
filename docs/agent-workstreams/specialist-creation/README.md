# Specialist Creation Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own creation of specialist agent profiles from user requests, including domain
research requirements, profile drafts, tool policies, scorecards, review UI
contracts, and approved profile materialization.

This lane is distinct from self-improvement. Specialist creation creates and
reviews new agents. Self-improvement governs ongoing eval, quarantine,
promotion, regression, and rollback.

## Primary Docs

- `docs/plans/2026-05-10-adaptive-agent-workshop-implementation-plan.md`
- `docs/plans/2026-05-10-agent-creator-hermes-profiles-apify.md`
- `docs/plans/2026-05-10-agent-creator-next-implementation-slices.md`
- `docs/agent-workstreams/self-improvement/README.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- Specialist profile request intake.
- Domain research/discovery before profile claims expertise.
- Draft profile, tool policy, MCP policy, eval pack, scorecard, and changelog.
- Profile review and revision contracts.
- Bundle/storage contract for approved profile versions.

Do not own:

- Runtime placement.
- Continuous self-improvement loops after promotion.
- Credential brokers except policy requirements.

## Current State

- `services/agent-creator` exists as an early deterministic workshop prototype.
- `packages/agent-profile` exists locally as shared profile contract/validator
  scaffolding.
- No profile registry table/API, bundle S3 layout, review UI, or runtime
  materialization exists yet.

## Near-Term Plan

1. Commit `services/agent-creator` and `packages/agent-profile` only after tests
   pass and generated `dist`/`node_modules` stay ignored.
2. Add profile registry/state model.
3. Add Control API draft/list/review/promote routes.
4. Add client review surface handoff.
5. Add runtime handoff for loading approved versions only.

## Validation

```bash
pnpm agent-creator:test
pnpm --filter @agents-cloud/agent-profile test
pnpm contracts:test
```

## Handoffs

- To Self-Improvement: eval/quarantine/promotion contract.
- To Agent Harness: approved profile loading.
- To Access Control: `agent:create`, `agent:review`, and `agent:promote`
  capabilities.
- To Clients: profile review UI and revision requests.
