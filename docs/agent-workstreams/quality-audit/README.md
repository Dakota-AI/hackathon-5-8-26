# Quality Audit Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own cross-agent audit phases, implementation readiness checks, contract reviews,
and validation discipline.

This platform is intentionally parallel-agent heavy. That only works if every
lane has explicit audit points and shared contracts stay coherent.

## Primary Docs

- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
- `docs/IMPLEMENTATION_READINESS_AUDIT.md`
- `docs/roadmap/NEXT_SYSTEM_AUDIT_AND_EXECUTION_PLAN_2026_05_10.md`
- `docs/agent-workstreams/COORDINATION.md`

## Ownership

Own:

- Cross-agent audit template and expectations.
- Release/readiness checklists.
- Contract mismatch detection.
- Required validation matrices by lane.
- Documentation truth checks.
- Risk register and residual-risk reporting.

Do not own:

- Implementing every product feature.
- Replacing each lane's own tests.
- Broad refactors that do not close a real audit finding.

## Current State

- Engineering quality gates exist.
- Implementation readiness audit exists.
- Workstream coordination docs exist.
- Cross-agent audit phases are now documented as required, but not automated.

## Required Audit Flow

Every substantial lane should follow:

```text
implementation agent
  -> lane self-audit
  -> adjacent workstream audit
  -> product coordination audit
  -> validation matrix
  -> docs/status update
```

Examples:

- Access Control must be audited by Realtime Streaming and Clients.
- Runtime changes must be audited by Infrastructure and Protocol.
- GenUI changes must be audited by Protocol and Access Control.
- Preview hosting must be audited by Infrastructure and Clients.
- Source-control workflows must be audited by Security/Access Control and
  Quality Audit before enabling real pushes.

## Near-Term Plan

1. Add a reusable audit handoff template if the current handoff template is too
   generic.
2. Add per-workstream validation tables to current plan files.
3. Add a contract mismatch checklist for `packages/protocol`,
   `services/control-api`, realtime, and clients.
4. Audit stale docs that still claim completed pieces are missing.
5. Track unresolved findings in product coordination until closed or accepted.

## Validation

For docs-only audit changes:

```bash
git diff --check
```

For implementation audit signoff, run the lane-specific commands and record
which commands passed, failed, or were skipped.

## Handoffs

Expected handoffs:

- To all lanes: audit findings with explicit owner and validation required.
- To Product Coordination: status reconciliation and release readiness notes.
- To Access Control: isolation and denial-case gaps.
- To Clients/Realtime: contract mismatch findings.
