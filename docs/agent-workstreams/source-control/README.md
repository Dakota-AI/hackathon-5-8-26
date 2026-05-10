# Source Control Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own GitHub/source-control integration for agent-created branches, commits, pull
requests, code reviews, and repository-aware work.

This is critical because the platform promise includes agents that can build,
test, commit code, and open reviewable changes without leaking credentials or
mutating repositories outside the authorized workspace boundary.

## Primary Docs

- `docs/roadmap/NEXT_SYSTEM_AUDIT_AND_EXECUTION_PLAN_2026_05_10.md`
- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
- `docs/agent-workstreams/agent-harness/TOOL_CATALOG_AND_POLICY_PLAN.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- GitHub App or OAuth integration design.
- Repository registry and workspace binding.
- Branch, commit, diff, pull request, review, and status-check workflows.
- Policy for when agents can push directly versus require approval.
- Secret scanning and repository safety checks before commit/PR.
- Source-control audit events and artifacts.

Do not own:

- Generic runtime sandboxing.
- Non-GitHub source-control providers until GitHub V1 works.
- Product-specific UI beyond source-control handoffs.

## Current State

- The platform scope requires commit/PR workflows.
- No production GitHub App/OAuth, repo registry, commit broker, or PR broker is
  implemented yet.

## Near-Term Plan

1. Decide GitHub App first unless OAuth is required for personal private repos.
2. Add workspace-bound repository registry.
3. Add brokered credentials so workers never hold long-lived tokens directly.
4. Add run-scoped clone/branch naming policy.
5. Add code-change artifact records for diffs, test output, and PR links.
6. Add approval gates for pushing to protected branches, opening PRs, or using
   external CI minutes.
7. Add cross-agent code review phase before PR creation where possible.

## Validation

Required before implementation is considered product-ready:

```bash
pnpm contracts:test
pnpm agent-runtime:test
pnpm control-api:test
```

Add tests for:

- no linked repository,
- unauthorized repository,
- revoked installation token,
- branch collision,
- protected branch denial,
- secret detected in diff,
- failing tests before PR,
- approval required before publish.

## Handoffs

Expected handoffs:

- To Access Control: workspace/repository authorization checks.
- To Agent Harness: git tool execution policy and sandbox paths.
- To Clients: PR cards, diff review surfaces, approval prompts.
- To Quality Audit: required review/eval gates for code-writing agents.
