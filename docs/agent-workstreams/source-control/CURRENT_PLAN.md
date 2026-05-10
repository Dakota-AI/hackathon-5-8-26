# Source Control Current Plan

Workstream: Source Control
Owner: Source Control Workstream
Updated: 2026-05-10
Status: planned; blocked on credential broker and access control

## Current Scope

Own the safe path for agents to inspect repositories, create branches, commit
changes, run tests, and open pull requests.

## Current State

- Product scope requires commit/PR workflows.
- Tool policy notes reference `workspace.git_commit` and `github.pr.create`.
- No GitHub App/OAuth integration, repository registry, commit broker, or PR
  broker exists yet.

## Gaps

- GitHub App vs OAuth decision.
- Workspace-bound repository registry.
- Installation/token broker.
- Branch naming/collision policy.
- Secret scanning before commit/PR.
- Test result and diff artifacts.
- Human approval gates for protected actions.
- Source-control protocol events.

## Risks

- Raw tokens in workers would be a major security boundary failure.
- Agents can leak secrets if diffs are not scanned before commit.
- Direct pushes should be blocked unless explicitly approved and scoped.
- Repository access must be tied to workspace membership, not just a signed-in
  user.

## Files Expected To Change

- future `services/github-bridge/**` or equivalent source-control broker
- `services/control-api/**`
- `services/agent-runtime/**`
- `packages/protocol/**`
- `infra/cdk/**`
- client source-control cards/review surfaces

## Cross-Workstream Dependencies

- Access Control: repository membership and source-control capabilities.
- Agent Harness: git tool execution sandbox and approval policy.
- Quality Audit: code-review and secret-scan gates.
- Clients: diff/PR cards and approval prompts.

## Implementation Plan

1. Add ADR for GitHub App vs OAuth/PAT.
2. Define `GITHUB_APP_AND_REPO_REGISTRY_PLAN.md`.
3. Define `COMMIT_PR_WORKFLOW_CONTRACT.md`.
4. Add repository registry and credential broker.
5. Add read-only repo inspection first.
6. Add branch/commit artifacts with secret scan.
7. Add PR creation behind approval and test gates.

## Validation Plan

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
```

Add tests for unauthorized repo, revoked token, branch collision, protected
branch denial, secret detected, failing tests before PR, and approval-required
publish.

## Completion Criteria

- Agents can open a reviewable PR through a brokered token without exposing raw
  credentials.
- Diffs/tests/PR links are recorded as artifacts/events.
- Protected actions require approval and audit evidence.
