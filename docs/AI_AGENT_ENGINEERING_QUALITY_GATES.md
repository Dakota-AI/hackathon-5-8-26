# AI Agent Engineering Quality Gates

_Last updated: 2026-05-10_

This document is the operating standard for AI agents and humans making changes
in this repository. It exists to keep implementation work solid, tested, and
aligned with the architecture rather than only compiling locally.

Every agent should treat this as part of the definition of done.

## Required Reading Order

Before implementation work:

1. `AGENTS.md`
2. `docs/PROJECT_STRUCTURE.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
5. `docs/roadmap/PROJECT_STATUS.md`
6. `docs/adr/README.md`
7. The README closest to the code being changed

When touching a specific area, also read:

- Web: `apps/web/README.md` and `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md`
- Flutter: `apps/desktop_mobile/README.md` when present,
  `docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md`, and
  `docs/roadmap/SHADCN_FLUTTER_UI_SYSTEM.md`
- CDK: `infra/cdk/README.md`
- Cloudflare: `infra/cloudflare/README.md`
- Protocol: `packages/protocol/README.md` when present and schemas under
  `packages/protocol/schemas`
- Runtime: service README when present and nearby tests

If the closest package README is misaligned, update it as part of the change.

## Operating Loop

Use this loop for every non-trivial change.

### 1. Orient

Understand the current repository state before editing.

Do:

- Check `git status --short`.
- Read the files you will modify.
- Search existing patterns with `rg`.
- Identify the owning plane from `docs/PROJECT_STRUCTURE.md`.
- Identify the relevant ADRs.
- Identify current tests for the area.

Do not:

- Assume supporting roadmap prose is current when status docs or code disagree.
- Add a new abstraction before checking existing package patterns.
- Move work across ownership boundaries without documenting why.

### 2. Design The Smallest Safe Change

State the intended behavior before implementation.

For each change, answer:

- What user/system behavior changes?
- What durable state changes?
- What event/API/payload shape changes?
- What failure mode matters most?
- What test proves the behavior?
- What docs need to change?

If those answers are unclear, pause implementation and clarify through docs or a
small ADR.

### 3. Implement In The Owning Layer

Keep code where it belongs.

Examples:

- HTTP request handling belongs in `services/control-api`, not in CDK stacks.
- Shared event schemas belong in `packages/protocol`, not duplicated in clients.
- Long-running work belongs in ECS runtime packages, not Lambda handlers.
- Realtime fanout belongs in Cloudflare packages, not in client-only state.
- Web data access belongs in `apps/web/lib`, not inside rendering components
  when it can be isolated.
- Flutter backend access belongs behind data/domain boundaries as the app grows.

### 4. Add Or Update Tests

Tests are required when behavior changes. The test depth must match the risk.

Minimum expectation:

- Bug fix: add a regression test when feasible.
- New API behavior: add request validation, success, authorization, and failure
  tests.
- New event shape: add protocol validation and producer tests.
- New runtime behavior: add success, failure, retry, and partial-write tests.
- New CDK resource: add synth/build validation and assertions when safety or IAM
  matters.
- New UI workflow: add component, reducer, or integration tests when the workflow
  has meaningful logic.

Do not rely only on manual inspection for idempotency, authorization, event
shape, or state transition changes.

### 5. Self-Audit Before Finishing

Review your own diff as if doing a code review.

Check:

- Is the code in the right directory?
- Are public schemas and generated events aligned?
- Are retries and duplicates safe?
- Are tenant/workspace boundaries enforced?
- Are secrets, tokens, and credentials scoped?
- Can a partial failure corrupt durable state?
- Are terminal statuses protected from regression?
- Are tests meaningful, or only proving mocks were called?
- Did docs/status change if behavior changed?
- Did you avoid touching unrelated user changes?

If the answer to any high-risk item is "not sure", keep working.

### 6. Validate

Run the relevant validation commands. Use the matrix below.

If a command cannot run because tooling or credentials are missing, document that
clearly in the final handoff and say what remains unverified.

### 7. Handoff

A completed handoff should include:

- What changed.
- What tests ran.
- What remains risky or intentionally deferred.
- Any docs updated.
- Any follow-up work that blocks implementation readiness.

Do not claim production readiness because local tests pass. Production readiness
requires architecture, policy, deployment, observability, and rollback checks.

## Risk Tiers

### Tier 0: Docs Only

Examples:

- README updates.
- Roadmap/status clarification.
- Architecture notes that do not change code.

Required validation:

- Read rendered markdown mentally for broken structure.
- Check links/paths if new links were added.
- No build required unless docs describe commands or generated outputs that need
  verification.

### Tier 1: Local Code, No Contract Change

Examples:

- Small refactor.
- UI copy adjustment.
- Internal helper with no behavior change.

Required validation:

- Package-local build/typecheck/test for the touched area.
- Existing relevant tests.

### Tier 2: Behavior Change

Examples:

- New Control API validation.
- New worker behavior.
- New client workflow.
- New Cloudflare route.

Required validation:

- Package-local tests.
- Regression tests for the changed behavior.
- Adjacent integration checks where feasible.
- Docs/status update if user-visible or architecture-relevant.

### Tier 3: Contract Or Persistence Change

Examples:

- Event schema change.
- DynamoDB item shape change.
- API response shape change.
- Artifact naming/storage change.
- Auth or tenancy change.

Required validation:

- Protocol/schema tests.
- Producer tests.
- Consumer tests or fixture updates.
- Migration/backfill notes if existing data is affected.
- Docs and ADR update when architecture changes.

### Tier 4: Infrastructure Or Security Boundary Change

Examples:

- IAM grants.
- VPC/networking.
- Cognito/Auth.
- Runtime secrets.
- Cloudflare relay auth.
- Data retention/deletion settings.

Required validation:

- CDK build and synth.
- CDK assertions where practical.
- Least-privilege review.
- Secret exposure review.
- Rollback/deployment notes.
- ADR or status doc update for significant policy changes.

## Validation Matrix

Run the relevant subset. For broad changes, run the full matrix.

### Protocol

```bash
pnpm contracts:test
```

Add or update examples whenever schemas change.

### Control API

```bash
pnpm control-api:build
pnpm control-api:test
```

Required test areas:

- request validation,
- malformed JSON,
- Cognito/JWT claims,
- workspace authorization,
- idempotent create-run,
- write/start failure ordering,
- DynamoDB item shapes,
- Step Functions start behavior,
- ordered event queries.

### Agent Runtime

```bash
pnpm agent-runtime:build
pnpm agent-runtime:test
```

Required test areas:

- success event sequence,
- failure event sequence,
- duplicate invocation,
- partial write failure,
- artifact record shape,
- terminal state transition protection,
- Hermes config validation when CLI mode changes.

### Cloudflare Realtime

```bash
pnpm cloudflare:build
pnpm cloudflare:test
```

Required test areas:

- JWT/token handling,
- relay signature validation,
- expired/replayed relay requests,
- Durable Object broadcast,
- reconnect/replay cursor behavior,
- malformed event rejection,
- authorization failure for wrong workspace.

### Web

```bash
pnpm web:typecheck
pnpm web:build
```

Add UI/data tests as workflows become real. For data-heavy UI changes, test
reducers and API adapters before testing layout details.

### Flutter

```bash
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

Required test areas as the app grows:

- auth state transitions,
- backend config loading,
- API client error behavior,
- run creation flow,
- event reducer behavior,
- navigation for run list/detail.

### CDK Infrastructure

```bash
pnpm infra:build
pnpm infra:synth
```

Add CDK assertions for:

- IAM scope,
- DynamoDB retention/PITR/deletion protection,
- log retention,
- environment-specific config,
- public ingress/CORS policy,
- relay queues and DLQs.

### Amplify Hosting/Auth

```bash
pnpm amplify:hosting:build
pnpm --filter @agents-cloud/infra-amplify run typecheck
```

If the Amplify package does not expose a typecheck script, document the gap and
either add the script or remove misaligned references from docs.

## Mandatory Self-Review Checklist

Before final handoff, answer every item.

### Architecture

- Does this follow accepted ADRs?
- Does this keep AWS as durable truth?
- Does this keep Cloudflare as realtime fanout only?
- Does this avoid putting long-running work in request handlers?
- Does this avoid clients talking directly to AWS data stores?
- Does this keep generated UI declarative and server-validated?

### Contracts

- Are event names canonical?
- Do payloads validate against `packages/protocol`?
- Are required envelope fields present?
- Are TypeScript/Dart client models aligned with backend responses?
- Did fixtures/examples change with schemas?

### Data And Idempotency

- Is there a clear primary key and access pattern?
- Are writes conditional where duplicates matter?
- Are retries safe?
- Can partial failure leave orphaned work?
- Can terminal state regress?
- Is ordering explicit and testable?

### Security And Tenancy

- Is the authenticated user derived from trusted claims?
- Is workspace/org membership checked?
- Are roles/permissions considered?
- Are tokens excluded from logs, URLs, and persisted client state?
- Are credentials scoped to the specific worker/action?
- Are IAM grants least-privilege for this phase?

### Runtime And Operations

- Is failure visible in logs/events/status?
- Is timeout behavior explicit?
- Is cancellation/resume/retry impact understood?
- Are metrics or future metrics points obvious?
- Is the change deployable without destroying live data?

### Tests

- Is there a regression test for the core behavior?
- Does a test fail on the bug this change prevents?
- Do tests cover error paths, not just happy paths?
- Are mocks hiding important contract violations?
- Did all relevant validation commands run?

### Docs

- Did `AGENTS.md` need updates?
- Did `docs/PROJECT_STRUCTURE.md` need updates?
- Did `docs/roadmap/PROJECT_STATUS.md` need updates?
- Did the nearest package README need updates?
- Did the change require an ADR?

## Required Tests By Change Type

### Create Or Modify An HTTP Endpoint

Required:

- Unit test for handler/domain success.
- Validation test for required fields.
- Malformed JSON test when body parsing is involved.
- Authorization test.
- Failure-mode test for downstream dependency failure.
- OpenAPI/schema/docs update if public shape changes.

### Create Or Modify A DynamoDB Item Shape

Required:

- Test expected item keys and attributes.
- Test query path.
- Test duplicate/conditional write behavior if relevant.
- Update structure/status docs if access pattern changes.
- Add migration notes if existing deployed data is affected.

### Create Or Modify A Canonical Event

Required:

- Schema update.
- Golden valid example.
- Invalid example when feasible.
- Producer test.
- Consumer fixture update.
- Event name/status vocabulary update in clients.

### Create Or Modify Worker Behavior

Required:

- Success path test.
- Failure path test.
- Partial failure test.
- Duplicate invocation or retry test.
- Artifact shape test if artifacts are written.
- Runtime timeout/config test if external tools are invoked.

### Create Or Modify Realtime Behavior

Required:

- Auth test.
- Wrong-workspace test.
- Relay signature/replay test.
- Broadcast test.
- Reconnect/replay test.
- Malformed event test.

### Create Or Modify Client Data Flow

Required:

- API adapter test when logic exists.
- Loading/error/empty/success states.
- Auth-required state.
- Event reducer test for ordered events.
- Fixture cleanup or explicit fixture labeling.

### Create Or Modify CDK/IAM

Required:

- `pnpm infra:build`.
- `pnpm infra:synth`.
- Assertion or clear manual review for IAM changes.
- Safety review for deletion/retention changes.
- Docs update for required env vars and deployment impact.

## Parallel Agent Coordination

Parallel work is encouraged only when ownership boundaries are clear.

Safe parallel lanes:

- Protocol contracts.
- Control API durability.
- Runtime reliability.
- Realtime relay.
- Web client data surfaces.
- Flutter client data surfaces.
- CDK safety/ops.
- Docs/ADR reconciliation.

Coordination rules:

- Protocol changes land before dependent producer/consumer assumptions.
- One agent owns a file at a time when possible.
- If two lanes need the same file, coordinate through a small interface doc or
  issue list first.
- Shared vocabulary changes must update protocol, docs, and fixtures together.
- Do not silently change another agent's unrelated work.
- Do not mark roadmap checkboxes complete for another lane without validating
  that lane.

## Documentation Sync Rules

Update docs in the same change when implementation reality changes.

Use this routing:

- `README.md`: entrypoint links and one-screen current direction.
- `AGENTS.md`: operating rules for future agents.
- `docs/PROJECT_STRUCTURE.md`: where things live and ownership boundaries.
- `docs/IMPLEMENTATION_READINESS_AUDIT.md`: current blockers and readiness gaps.
- `docs/roadmap/PROJECT_STATUS.md`: current implementation/deployment state.
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`: scope/progress ledger.
- Package READMEs: local commands, current package behavior, env vars.
- ADRs: stable architecture decisions.

Do not put long-lived architecture decisions only in chat, comments, or roadmap
prose. Promote them to ADRs when they change ownership, persistence, security,
deployment, or control flow.

## Stop Conditions

Stop and clarify before continuing when:

- The change would contradict an accepted ADR.
- The change needs a new security or tenancy model.
- A migration is required but no migration path exists.
- Tests require credentials or infrastructure that are not available.
- The repo has conflicting edits in the same files and the intent is unclear.
- You cannot determine whether data loss is possible.

When stopping, document the blocker precisely and propose the smallest decision
needed to proceed.

## Final Handoff Standard

A final handoff should be factual and short:

- Files or areas changed.
- Tests run and whether they passed.
- Known risks or gaps.
- Follow-up work that should happen next.

Do not hide failed or skipped validation. Do not claim a feature is complete
unless docs, tests, and implementation all support that claim.
