# Repository Agent Instructions

This repository is building Agents Cloud: a CDK-backed autonomous AI agent
platform for 24/7 agent teams, isolated ECS workers, durable AWS state,
Cloudflare realtime sync, synchronized Next.js and Flutter clients, generated UI
surfaces, Miro integration, and safe coding/build agents.

## Read First

Before making implementation decisions, read these in order:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/PROJECT_STRUCTURE.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
5. `docs/roadmap/PROJECT_STATUS.md`
6. `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
7. `docs/roadmap/CODEBASE_ORIENTATION.md`
8. `docs/adr/README.md`
9. `infra/cdk/README.md`
10. `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md` when touching the web app.
11. `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md` when touching previews.

The master scope document is the current source of truth. Supporting roadmap and
architecture docs should stay aligned with current implementation status.

## Product Scope

The system must support a CEO-style user experience:

- user gives high-level objectives,
- executive/manager agents plan and delegate,
- specialist agents work in parallel,
- each agent or team can run in isolated ECS containers,
- agents can research deeply, build software, create custom tools, commit code,
  run tests, produce artifacts, publish websites, and create reports,
- clients show live messages, status, approvals, notifications, and generated
  UI consistently across web, desktop, and mobile,
- Miro can become a first-class collaboration/artifact surface,
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
- Preview deployment registry and optional preview ingress stack.
- Next.js command center under `apps/web`.
- Flutter console under `apps/desktop_mobile`.
- Agent runtime smoke/Hermes adapter package under `services/agent-runtime`.
- Cloudflare realtime Worker/Durable Object package under
  `infra/cloudflare/realtime`.

Not complete:

- Full production run lifecycle.
- Production worker runtime with real model/provider/secrets/workspace policy.
- Event relay.
- Deployed production Cloudflare realtime relay, replay, and client integration.
- Production web and Flutter auth/API/realtime integration.
- Codex/Hermes/Miro integrations.
- Specialist-agent creation and self-improvement.

## Highest-Priority Build Rule

The next implementation slice is completing the durable run loop through real
clients and a production-shaped worker path:

```text
authenticated web/native command
  -> Control API
  -> DynamoDB run/event records
  -> Step Functions execution
  -> ECS worker
  -> worker status/events/artifacts
  -> queryable ordered events
```

Do not start by building advanced UI, Codex, Hermes, Miro, specialist agents, or
full GenUI until the durable run lifecycle exists. Those features should plug
into the run ledger, event schema, auth boundary, and worker lifecycle.

## Architecture Rules

- AWS is the durable source of truth.
- Cloudflare is realtime fanout/sync only.
- DynamoDB/S3/Step Functions/ECS own execution truth.
- S3 stores durable per-user/per-workspace artifacts and large payloads.
- EFS is optional and deferred until hot POSIX workspace semantics are required.
- Clients render canonical events and generated UI; they do not own run truth.
- A2UI/GenUI content must be server-validated against allowlisted catalogs.
- Agent containers must receive scoped credentials only.
- User-linked Codex/ChatGPT auth is optional private/trusted-runner work until
  policy, terms, session handling, and isolation are verified. Production
  default should be API-key/service-account style model auth.
- Miro and GitHub credentials must be brokered and scoped; never expose refresh
  tokens directly to arbitrary agent code.

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
pnpm cloudflare:test
pnpm web:typecheck
pnpm web:build
pnpm infra:build
pnpm infra:synth
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
