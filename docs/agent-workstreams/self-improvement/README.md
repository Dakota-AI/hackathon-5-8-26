# Self-Improvement Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own self-testing, evals, quarantine, promotion, rollback, regression controls,
and ongoing improvement after specialist profiles exist.

Specialist profile creation is owned by `docs/agent-workstreams/specialist-creation/`.
This lane governs whether a draft or revised profile is safe to promote and how
it can improve over time.

## Primary Docs

- `docs/plans/2026-05-10-adaptive-agent-workshop-implementation-plan.md`
- `docs/plans/2026-05-10-agent-creator-hermes-profiles-apify.md`
- `docs/plans/2026-05-10-agent-creator-next-implementation-slices.md`
- `docs/agent-workstreams/agent-harness/AGENT_BUILDER_RUNTIME_INTEGRATION_PLAN.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- Specialist agent profile lifecycle.
- Domain discovery and research requirements before claiming expertise.
- Tool policy and approval gates for new specialist agents.
- Quarantine eval scenarios and deterministic mocks.
- Scorecards, changelogs, promotion gates, and rollback.
- Regression datasets and improvement evidence.

Do not own:

- Generic runtime worker placement.
- Credential brokering except tool policy requirements.
- Client UI beyond review/approval surface contracts.

## Current State

- Specialist creation and agent-profile packages exist locally as early
  deterministic scaffolds.
- Planning docs exist for Hermes profiles, Apify discovery, and next slices.
- Promotion/quarantine is documented but not integrated into the Control API,
  clients, or runtime.

## Near-Term Plan

1. Commit the agent creator package without generated `dist` or `node_modules`.
2. Add protocol objects for agent profile, scorecard, eval scenario, and
   promotion request.
3. Add Control API routes for draft/list/review/promote profile flows.
4. Add deterministic eval runner with mocked tools before live tools.
5. Add human approval and rollback policy for profile promotion.
6. Attach scorecard artifacts to the run/work item ledger.
7. Add runtime loading of approved profile versions only.

## Validation

Required before implementation is considered product-ready:

```bash
pnpm agent-creator:test
pnpm agent-creator:smoke
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
```

Add tests for:

- profile draft from user request,
- stale information requiring research,
- tool approval gate generation,
- quarantine eval failure,
- promotion blocked without user approval,
- rollback to prior profile version,
- runtime refusing draft/quarantined profiles.

## Handoffs

Expected handoffs:

- To Agent Harness: approved profile loading and runtime behavior.
- To Access Control: `agent:create` and `agent:promote` capabilities.
- To Clients: review UI, scorecard display, revision requests.
- To Quality Audit: audit gates for promotion evidence.
