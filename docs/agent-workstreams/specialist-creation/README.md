# Specialist Creation Workstream

Status: local Agent Creator Hermes profile and Apify CLI workshop verified
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
- `packages/agent-profile` exists as shared profile contract/validator
  scaffolding.
- `~/.hermes/profiles/agentcreator` is the local Hermes Agent Creator profile;
  a reproducible non-secret bundle is committed under
  `docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle/`.
- `tools/apifycli/apifycli` is the local Apify OpenAPI CLI used for Actor
  discovery/prototyping; Apify MCP is intentionally not used.
- A `saas-pricing-watcher` workshop has been verified end-to-end locally: real
  Apify actor discovery, prototype runs, cost/risk trace, valid draft profile,
  and no Control API POST without explicit approval.
- No profile registry table/API, full scenario bundle writer, review UI, or
  runtime materialization exists yet.

## Near-Term Plan

1. Add scenario-mode bundle writing to `services/agent-creator` so non-interactive
   workshop runs can emit a complete profile bundle directory.
2. Add quarantine eval execution against throwaway specialist Hermes profiles and
   persist `eval-results.json` as a review artifact.
3. Productize prototype traces (`TRACE.md`, cost/risk decisions, sample outputs)
   into S3-backed review artifacts.
4. Add client review surface for profile JSON, tool-policy buckets, prototype
   traces, eval scorecards, and explicit approve/revise/reject actions.
5. Add runtime handoff for loading approved immutable versions only.
6. Replace local Apify token usage in production with a curated platform
   connector/broker that enforces actor allowlists, workspace/run IDs, budgets,
   and approval gates.

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
