# Repository Agent Instructions

This repository is building Agents Cloud: a CDK-backed autonomous AI agent
platform for 24/7 agent teams, isolated ECS workers, durable AWS state,
AWS-native realtime sync, synchronized Next.js and Flutter clients, generated UI
surfaces, collaboration integrations, safe coding/build agents, and an optional
Cloudflare realtime fallback path.

## Read First

Before making implementation decisions, read these in order:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/PROJECT_STRUCTURE.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
5. `docs/roadmap/PROJECT_STATUS.md`
6. `docs/roadmap/NEXT_SYSTEM_AUDIT_AND_EXECUTION_PLAN_2026_05_10.md`
7. `docs/roadmap/TENANT_AUTHORIZATION_AND_ACCESS_CODES_PLAN_2026_05_10.md`
8. `docs/roadmap/PROJECT_REMAINING_WORK_AUDIT_2026_05_10.md`
9. `docs/agent-workstreams/README.md`
10. `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
11. `docs/roadmap/CODEBASE_ORIENTATION.md`
12. `docs/adr/README.md`
13. `docs/adr/0008-user-runner-placement.md`
14. `docs/adr/0010-tenant-access-control-and-access-codes.md`
15. `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`
16. `infra/cdk/README.md`
17. `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md` when touching the web app.
18. `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md` when touching previews.

The master scope document is the current source of truth. Supporting roadmap and
architecture docs should stay aligned with current implementation status.

## Parallel Agent Workstreams

Parallel agents must use `docs/agent-workstreams/` as their coordination map.

Available workstreams:

- Infrastructure: `docs/agent-workstreams/infrastructure/`
- Clients: `docs/agent-workstreams/clients/`
- Agent Harness: `docs/agent-workstreams/agent-harness/`
- Realtime Streaming: `docs/agent-workstreams/realtime-streaming/`
- Product Coordination: `docs/agent-workstreams/product-coordination/`
- Access Control: `docs/agent-workstreams/access-control/`
- Miro Integration: `docs/agent-workstreams/miro-integration/`
- Source Control: `docs/agent-workstreams/source-control/`
- Preview Hosting: `docs/agent-workstreams/preview-hosting/`
- Specialist Creation: `docs/agent-workstreams/specialist-creation/`
- Self-Improvement: `docs/agent-workstreams/self-improvement/`
- Quality Audit: `docs/agent-workstreams/quality-audit/`

Before starting, each agent must read its workstream README and
`docs/agent-workstreams/COORDINATION.md`. If a change affects another
workstream, create a handoff note in `docs/agent-workstreams/handoffs/` using
`docs/agent-workstreams/HANDOFF_TEMPLATE.md`.

Parallel agents should stay in their primary paths by default, inspect current
git status before editing, preserve unrelated changes, and run the validation
commands listed for their workstream before claiming completion.

Every workstream agent must scope first. Before broad implementation, create or
update that lane's `CURRENT_PLAN.md` using
`docs/agent-workstreams/CURRENT_PLAN_TEMPLATE.md`. The plan must describe
current state, gaps, risks, expected files, cross-workstream dependencies,
implementation steps, validation, and completion criteria. Other agents should
be able to read that plan to understand what is in progress and what contracts
may change.

If a scheduled agent finds handoffs addressed to its lane, it should triage them
before starting new work. If it cannot complete a requested handoff, it should
mark the handoff `blocked` and explain what is missing.

## Product Scope

The system must support a CEO-style user experience:

- user gives high-level objectives,
- executive/manager agents plan and delegate,
- specialist agents work in parallel,
- each agent or team can run in isolated ECS containers,
- each user can have a dedicated resident runner container with many logical
  agents inside that user boundary,
- agents can research deeply, build software, create custom tools, commit code,
  run tests, produce artifacts, publish websites, and create reports,
- clients show live messages, status, approvals, notifications, and generated
  UI consistently across web, desktop, and mobile,
- a collaborative canvas can become a first-class collaboration/artifact surface,
- wildcard preview domains can serve many generated websites at once,
- self-improvement must be gated by tests, evals, quarantine, and human approval.

## Current Implementation Reality

Completed:

- pnpm monorepo.
- Protocol schema package.
- Deployed AWS CDK foundation.
- Deployed Step Functions to ECS smoke path.
- Deployed Amplify Auth sandbox.
- Green Amplify Hosting web build.
- First Control API slice for run creation/querying.
- AWS-native realtime WebSocket first slice.
- Preview deployment registry and optional preview ingress stack.
- Next.js command center under `apps/web`.
- Flutter console under `apps/desktop_mobile`.
- Agent runtime smoke adapter package under `services/agent-runtime`.
- Cloudflare realtime Worker/Durable Object package under
  `infra/cloudflare/realtime` as an alternate/fallback path.

Not complete:

- Full production run lifecycle.
- Tenant/workspace membership authorization and invite/access-code gating.
- Production worker runtime with real model/provider/secrets/workspace policy.
- Event relay.
- Product-grade realtime replay, subscription authorization, and optional
  Cloudflare fallback integration.
- Production web and Flutter auth/API/realtime integration.
- advanced coding-agent and collaboration integrations.
- Specialist-agent creation and self-improvement.

## Highest-Priority Build Rule

The durable run loop exists as a first slice. The next implementation slice is
making it tenant-safe and access-gated before widening agent capabilities:

```text
access-code admitted Cognito user
  -> Cognito group gate
  -> workspace membership/capability check
  -> Control API run/work/resource route
  -> realtime subscription authorization
  -> scoped runner context
```

Do not start by enabling Miro writes, GitHub pushes, broad preview publishing,
or self-improving specialist agents before tenant authorization, access-code
onboarding, workspace membership, and capability checks are in place.

## Architecture Rules

- AWS is the durable source of truth.
- AWS-native realtime is the primary realtime path for this phase.
- Cloudflare is an alternate/fallback realtime fanout/sync plane only.
- DynamoDB/S3/Step Functions/ECS own execution truth.
- S3 stores durable per-user/per-workspace artifacts and large payloads.
- EFS is optional and deferred until hot POSIX workspace semantics are required.
- User runners are the resident execution boundary: one warm runner container per
  user, many logical agents inside it.
- Use one balanced runner class first; do not add basic, power, or GPU runner
  classes until real usage data proves they are needed.
- Local Docker hosts and ECS are placement targets for the same user-runner
  contract.
- Do not mount the Docker socket into user runner containers.
- Clients render canonical events and generated UI; they do not own run truth.
- A2UI/GenUI content must be server-validated against allowlisted catalogs.
- Agent containers must receive scoped credentials only.
- User-linked third-party assistant auth is optional private/trusted-runner work
  until policy, terms, session handling, and isolation are verified. Production
  default should be API-key/service-account style model auth.
- External collaboration and source-control credentials must be brokered and
  scoped; never expose refresh tokens directly to arbitrary agent code.
- Access-code onboarding and Cognito group gates are required before broad user
  onboarding or public signup.
- Every workspace-scoped route, realtime subscription, and worker context must
  derive workspace access from server-side membership, not client-supplied
  workspace IDs alone.

## Implementation Standards

- Keep changes scoped to the layer being implemented.
- Use the existing pnpm workspace and TypeScript patterns.
- Prefer structured schemas and generated/shared types over ad hoc strings.
- Treat `packages/protocol` as the contract source for public event payloads.
- Make retries, duplicate requests, and partial failures explicit in code and
  tests for durable workflows.
- Enforce tenant/workspace authorization before exposing product data across
  users or clients.
- Update docs when implementation state changes.
- Do not commit secrets or environment-specific generated outputs.
- Do not treat generated `dist`, `cdk.out`, `node_modules`, or Amplify outputs as
  source files.
- Preserve user changes in the working tree.

## Mandatory Self-Audit Gate

Before finishing any non-trivial implementation, agents must self-review against
`docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`.

At minimum, verify:

- architecture still follows the accepted ADRs,
- events and API payloads match shared protocol contracts,
- idempotency and retry behavior are safe,
- workspace/tenant boundaries are enforced or clearly documented as not yet in
  scope,
- secrets and credentials are not exposed to clients, logs, or broad worker
  environments,
- failure paths cannot silently corrupt durable state,
- tests cover the behavior or risk introduced,
- package/status docs changed when implementation reality changed.

Do not claim a feature is complete because it compiles. Completion requires code,
tests, docs, and implementation status to agree.

## Flutter Client UI Standards

- The Flutter desktop/mobile client at `apps/desktop_mobile` should use
  `shadcn_flutter` as the primary and preferred UI system.
- Do not introduce new Material or Cupertino visual dependencies for app UI unless
  there is a documented platform integration reason. Prefer `ShadcnApp`,
  `ThemeData`, `ColorSchemes`, `Scaffold`, `Card`, `Button`, `NavigationItem`,
  `OutlineBadge`, `Divider`, shadcn form controls, and shadcn/Radix/Lucide icons.
- Keep the visual language minimal, professional, monochrome, and black/white by
  default. Use neutral grays for status and hierarchy; avoid colorful dashboard
  accents unless a product requirement explicitly calls for semantic color.
- Raw Flutter layout primitives (`Row`, `Column`, `SizedBox`, `Container`,
  `Padding`, etc.) are acceptable for layout/composition, but reusable surfaces,
  buttons, navigation, badges, inputs, cards, dialogs, tables, and controls should
  come from `shadcn_flutter`.
- Use `shadcn_flutter` through the declared Flutter package dependency; do not
  vendor local source copies into product code.

## Required Validation Commands

Run the relevant subset before finishing a change. For broad contract, infra,
runtime, or client changes, run the full applicable matrix from
`docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`.

Core commands:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
pnpm cloudflare:test
pnpm web:test
pnpm web:typecheck
pnpm web:build
pnpm infra:build
pnpm infra:test
pnpm infra:synth
pnpm agent-creator:test
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
```

When touching the Flutter console, also run:

```bash
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

When extending Control API work, keep or add tests for:

- request validation,
- Cognito JWT claim handling,
- tenant/workspace authorization,
- idempotent run creation,
- DynamoDB item shapes,
- Step Functions execution start,
- ordered event queries.

## Documentation Expectations

When progress changes, update:

- `docs/IMPLEMENTATION_READINESS_AUDIT.md` when readiness gaps are closed or new
  blockers are found.
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/roadmap/PROJECT_STATUS.md`
- `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
- relevant package/service/infra README files.

Checkboxes in the master scope document should reflect real status. Only mark a
task complete when code, deployment, and validation match the claim.
