# Self-Improvement Current Plan

Workstream: Self-Improvement
Owner: Self-Improvement Workstream
Updated: 2026-05-10
Status: planned; depends on specialist creation and eval harness

## Current Scope

Own ongoing quality improvement after specialist profiles exist:

- quarantine evals,
- regression datasets,
- scorecards,
- promotion/rollback,
- trace monitoring,
- human-governed improvement loops.

## Current State

- Prototype scorecards block promotion without eval/user approval evidence.
- Planning docs exist.
- No eval runner, profile promotion API, regression dataset store, trace monitor,
  or rollback path exists yet.

## Gaps

- Deterministic eval harness with mocked tools.
- Regression dataset storage and versioning.
- Scorecard artifact schema.
- Promotion/rollback API.
- Runtime refusal of draft/quarantined profiles.
- Monitoring that turns production failures into proposed evals.

## Risks

- Self-improvement without quarantine can degrade behavior silently.
- Automated profile promotion without approval can change agent behavior in ways
  users did not consent to.
- Eval data can leak sensitive workspace content unless scoped and redacted.

## Files Expected To Change

- `packages/agent-profile/**`
- `services/agent-creator/**`
- future eval runner service/package
- `services/control-api/**`
- `services/agent-runtime/**`
- `infra/cdk/**`
- `packages/protocol/**`

## Cross-Workstream Dependencies

- Specialist Creation for profile lifecycle.
- Quality Audit for promotion evidence requirements.
- Access Control for profile/eval capabilities.
- Agent Harness for runtime policy enforcement.

## Implementation Plan

1. Define `EVAL_AND_QUARANTINE_CONTRACT.md`.
2. Define `PROFILE_PROMOTION_POLICY.md`.
3. Add deterministic eval runner with mocked tools.
4. Store scorecard artifacts and eval evidence.
5. Add promotion/rollback API.
6. Enforce approved-only loading in runtime.
7. Add trace-to-eval proposal flow later.

## Validation Plan

```bash
pnpm --filter @agents-cloud/agent-profile test
pnpm agent-creator:test
pnpm control-api:test
pnpm agent-runtime:test
```

## Completion Criteria

- Profiles cannot promote without passing eval evidence and user approval.
- Failed evals keep profiles quarantined.
- Rollback to prior approved version is tested.
- Evidence is durable and auditable.
