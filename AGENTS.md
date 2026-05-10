# Repository Agent Instructions

This repository is building Agents Cloud: a CDK-backed autonomous AI agent
platform for 24/7 agent teams, isolated ECS workers, durable AWS state,
Cloudflare realtime sync, synchronized Next.js and Flutter clients, generated UI
surfaces, Miro integration, and safe coding/build agents.

## Read First

Before making implementation decisions, read these in order:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/roadmap/PROJECT_STATUS.md`
3. `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
4. `docs/roadmap/CODEBASE_ORIENTATION.md`
5. `docs/adr/README.md`
6. `infra/cdk/README.md`
7. `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md` when touching the web app.
8. `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md` when touching previews.

The master scope document is the current source of truth. The long roadmap and
paperclip architecture docs remain useful context, but some early-phase wording
predates the deployed CDK and Amplify foundation.

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
- Green Amplify Hosting placeholder.
- Preview deployment registry and optional preview ingress scaffold.
- Local Flutter console scaffold under `apps/desktop_mobile`.

Not complete:

- Control API.
- Real worker runtime.
- Event relay.
- Cloudflare realtime plane.
- Next.js app.
- Production Flutter auth/API/realtime integration.
- Codex/Hermes/Miro integrations.
- Specialist-agent creation and self-improvement.

## Highest-Priority Build Rule

The next implementation slice is Control API V1:

```text
authenticated POST /runs
  -> DynamoDB run/event records
  -> Step Functions execution
  -> ECS worker
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
- Update docs when implementation state changes.
- Do not commit secrets or environment-specific generated outputs.
- Do not treat generated `dist`, `cdk.out`, `node_modules`, or Amplify outputs as
  source files.
- Preserve user changes in the working tree.

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
- The local source clone for deep reference is `tools/shadcn_flutter`; do not
  vendor or edit it as product source.

## Required Validation Commands

Run the relevant subset before finishing a change, and all of these after broad
infra/protocol/doc updates:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
```

When touching the Flutter console scaffold, also run:

```bash
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

When Control API work begins, add tests for:

- request validation,
- Cognito JWT claim handling,
- tenant/workspace authorization,
- idempotent run creation,
- DynamoDB item shapes,
- Step Functions execution start,
- ordered event queries.

## Documentation Expectations

When progress changes, update:

- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/roadmap/PROJECT_STATUS.md`
- `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
- relevant package/service/infra README files.

Checkboxes in the master scope document should reflect real status. Only mark a
task complete when code, deployment, and validation match the claim.
