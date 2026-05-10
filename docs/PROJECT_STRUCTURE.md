# Agents Cloud Project Structure

_Last updated: 2026-05-10_

This document explains the repository structure, ownership boundaries, and where
new work should live. It is the practical map for navigating the codebase before
implementing features.

For current progress, read `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md` and
`docs/roadmap/PROJECT_STATUS.md`. For implementation blockers, read
`docs/IMPLEMENTATION_READINESS_AUDIT.md`. For mandatory self-audit and test
rules, read `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`. For locked
architecture decisions, read `docs/adr/README.md`.

## Product Shape

Agents Cloud is a CDK-backed autonomous agent platform. The intended product is
a command center where a user can issue high-level objectives, delegate work to
agent teams, watch progress across web and native clients, approve risky
actions, and receive durable artifacts such as reports, code changes, previews,
datasets, Miro boards, and generated UI surfaces.

The repository is organized around these planes:

- Client plane: web and desktop/mobile apps.
- Shared contract plane: canonical event and payload schemas.
- Durable AWS plane: CDK, DynamoDB, S3, Step Functions, ECS, IAM.
- Product auth/hosting plane: Amplify Gen 2 and Cognito.
- Execution plane: ECS worker services such as agent runtime and future builder
  runtime.
- Realtime plane: Cloudflare Workers, Durable Objects or Cloudflare Agents SDK,
  queues, and event relay.
- Integration plane: Miro, GitHub, Codex/OpenAI, preview hosting, and future
  provider bridges.

AWS owns durable execution truth. Cloudflare owns realtime client fanout and hot
sync only. Clients render state; they do not own run truth.

## Source Of Truth Order

Use these documents in this order when trying to understand the project:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/PROJECT_STRUCTURE.md`
3. `docs/IMPLEMENTATION_READINESS_AUDIT.md`
4. `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
5. `docs/roadmap/PROJECT_STATUS.md`
6. `docs/adr/README.md`
7. `infra/cdk/README.md`
8. Package and service README files under the directory you are changing
9. Supporting roadmap and research docs under `docs/roadmap/` and
   `docs/research/`

The master/status docs define current state. Supporting docs should be kept
aligned when implementation changes.

## Top-Level Layout

```text
agents-cloud/
  AGENTS.md
  README.md
  package.json
  pnpm-workspace.yaml
  amplify.yml
  apps/
  packages/
  services/
  infra/
  docs/
  tests/
  scripts/
```

`AGENTS.md`
: Operating instructions for coding agents working in this repo. Keep it short
  and current enough to route agents toward the right source docs.

`README.md`
: Human entrypoint. It should link to the structure guide, current status, ADRs,
  and high-value package docs. Do not turn it into a full manual.

`package.json`
: Root pnpm scripts and cross-package commands. Root scripts should orchestrate
  package-local scripts; package implementation details should stay in each
  package's own `package.json`.

`pnpm-workspace.yaml`
: Defines workspace package roots:

```text
apps/*
infra/*
packages/*
services/*
```

Any TypeScript/Node package that should participate in root pnpm commands must
live under one of those roots and have its own `package.json`.

`amplify.yml`
: Amplify Hosting build specification. It describes how the hosted web app is
  built from the monorepo. It is not the place for backend architecture.

## Apps

`apps/` contains user-facing clients. Clients should consume Control API and
realtime APIs; they should not talk directly to DynamoDB, S3, Step Functions, or
ECS.

Current canonical app directories:

```text
apps/
  web/
  desktop_mobile/
```

The current canonical names are `apps/web` and `apps/desktop_mobile`.

### `apps/web`

Purpose: Next.js web command center.

Current responsibilities:

- Render the browser product shell.
- Configure Amplify/Cognito when public auth outputs are provided.
- Call the CDK-owned Control API for run creation and query workflows.
- Eventually connect to Cloudflare realtime for live event fanout.
- Render validated A2UI/GenUI surfaces from canonical events.

Expected structure:

```text
apps/web/
  package.json
  next.config.mjs
  tsconfig.json
  .env.example
  app/
    layout.tsx
    page.tsx
    globals.css
  components/
    amplify-provider.tsx
    command-center.tsx
  lib/
    amplify-config.ts
    control-api.ts
    fixtures.ts
```

What belongs here:

- Next.js routes, layouts, pages, and web-specific components.
- Browser-safe client helpers for Control API and future realtime APIs.
- Web-only view state, fixture data, and presentation helpers.
- Public environment variable examples with `NEXT_PUBLIC_*` names.

What does not belong here:

- Durable run state logic.
- Direct AWS SDK calls to core tables or buckets.
- Secrets, service credentials, or server-only provider tokens.
- Worker or orchestration code.

When adding web features, keep data access behind a small typed helper in
`apps/web/lib/`. UI components should depend on that helper or repository
interfaces, not on raw `fetch` calls scattered through pages.

### `apps/desktop_mobile`

Purpose: Flutter desktop/mobile command center.

Current responsibilities:

- Render the native command center shell.
- Provide desktop/mobile navigation for runs, agents, artifacts, Miro, and
  approvals.
- Preview local GenUI/A2UI rendering patterns.
- Eventually use Amplify Auth, Control API, Cloudflare realtime, and push
  notifications.

Expected structure:

```text
apps/desktop_mobile/
  pubspec.yaml
  analysis_options.yaml
  lib/
    main.dart
    backend_config.dart
  android/
  ios/
  macos/
  scripts/
    testflight_publish.sh
  test/
```

What belongs here:

- Flutter app shell and native platform project files.
- Dart client models, repositories, and API clients for the native app.
- Native app tests and widget tests.
- App-store/TestFlight scripts that only apply to this Flutter app.

What does not belong here:

- Backend business logic.
- Cloud resource definitions.
- Provider credentials.
- Generated server schemas copied by hand. Generate or share them from
  `packages/protocol` when that pipeline exists.

Future code should split `lib/main.dart` into feature modules once the shell
grows:

```text
lib/src/app/
lib/src/data/
lib/src/domain/
lib/src/features/
lib/src/realtime/
lib/src/theme/
```

Use the Flutter UI standards in `AGENTS.md`: `shadcn_flutter` should be the
primary UI system for reusable app surfaces.

## Packages

`packages/` contains shared libraries that are consumed by multiple apps,
services, or tests. Shared packages must stay platform-neutral when possible.

### `packages/protocol`

Purpose: canonical platform contracts.

Current structure:

```text
packages/protocol/
  package.json
  README.md
  schemas/
    event-envelope.schema.json
    events/
      a2ui-delta.schema.json
      artifact.schema.json
      run-status.schema.json
      tool-approval.schema.json
  examples/
    run-status-event.json
  scripts/
    validate-schemas.mjs
```

What belongs here:

- JSON Schemas for canonical envelopes and payloads.
- Examples that demonstrate valid events.
- Schema validation scripts.
- Future TypeScript and Dart model generation.
- Backward-compatibility tests for event evolution.

What does not belong here:

- App-specific UI components.
- Service-specific DynamoDB item shapes unless they are part of the public event
  contract.
- Provider-native raw event formats that are not normalized.

When adding an event type:

1. Add or update a schema under `schemas/events/`.
2. Update the envelope or examples if needed.
3. Add validation coverage.
4. Document how clients should reduce/render the event.
5. Keep large payloads behind `payloadRef` pointers instead of inlining them.

## Services

`services/` contains backend runtime and integration code. A service can be a
Lambda handler package, an ECS image package, or a reserved boundary for a future
service boundary.

Service code should expose explicit ports/interfaces for side effects. That
keeps unit tests fast and lets CDK wire concrete AWS implementations later.

Current service directories:

```text
services/
  control-api/
  agent-runtime/
  agent-manager/
  builder-runtime/
  event-relay/
  preview-router/
  miro-bridge/
```

### `services/control-api`

Purpose: authenticated command/query boundary for durable run lifecycle.

Current structure:

```text
services/control-api/
  package.json
  README.md
  src/
    create-run.ts
    dynamo-store.ts
    handlers.ts
    ports.ts
    query-runs.ts
    step-functions.ts
  test/
    create-run.test.ts
    query-runs.test.ts
  tsconfig.json
```

Current implemented slice:

- `POST /runs`
- `GET /runs/{runId}`
- `GET /runs/{runId}/events`
- DynamoDB run/task/event writes.
- Step Functions execution start.
- Cognito JWT-based ownership from API Gateway authorizer claims.

What belongs here:

- Request validation and command/query handlers.
- User/workspace authorization checks.
- Idempotency behavior for externally retried commands.
- Translation between HTTP requests and durable platform records.
- Small application services for run, approval, artifact, credential-linking,
  and project APIs.

What does not belong here:

- Long-running polling loops.
- Worker execution logic.
- Direct model/tool orchestration.
- UI rendering logic.
- Provider refresh tokens exposed to arbitrary agent code.

The Control API is a boundary, not the source of execution truth. DynamoDB,
Step Functions, S3, and ECS remain authoritative.

### `services/agent-runtime`

Purpose: ECS worker image for autonomous run execution.

Current structure:

```text
services/agent-runtime/
  Dockerfile
  package.json
  README.md
  src/
    aws-artifact-sink.ts
    dynamo-event-sink.ts
    hermes-runner.ts
    index.ts
    ports.ts
    worker.ts
  test/
    worker.test.ts
  tsconfig.json
```

Current responsibilities:

- Read run context from environment variables.
- Emit status events into DynamoDB.
- Write artifact records and S3 objects.
- Run Hermes through a CLI adapter or smoke mode.
- Exit with a clear success/failure result for ECS/Step Functions.

What belongs here:

- Runtime worker orchestration inside one task.
- Worker-local adapters for events, artifacts, workspace setup, and harness
  execution.
- Image build inputs for the default agent worker.
- Tests for worker sequencing and artifact/event behavior.

What does not belong here:

- Multi-tenant auth policy decisions.
- Control API request handling.
- Cloudflare WebSocket fanout.
- UI state reducers.
- Hardcoded long-lived secrets.

Future worker classes should either extend this package deliberately or get
their own service directory if their dependencies and runtime shape diverge.

### `services/agent-manager`

Purpose: future worker-class selection and ECS task lifecycle manager.

What belongs here:

- Worker class selection before scheduling.
- Capacity provider selection.
- Heartbeat and cancellation coordination.
- Parent/child task graph coordination.
- Platform-level delegation tools.

What does not belong here:

- Durable state storage that bypasses DynamoDB.
- Long-running model execution.
- Web client concerns.

This directory is currently a reserved boundary.

### `services/builder-runtime`

Purpose: future heavy build/test/browser worker runtime.

Use this for workloads that outgrow normal Fargate tasks:

- Large repository builds.
- Browser-heavy automation.
- Docker or container-like builds where allowed.
- Large monorepo test suites.

Expected future capacity is ECS Managed Instances, CodeBuild, or another
explicitly approved sandbox. Do not silently mix Fargate and Managed Instances in
one capacity provider strategy.

### `services/event-relay`

Purpose: future AWS-to-Cloudflare event relay.

What belongs here:

- Reading events from EventBridge, SQS, DynamoDB Streams, or callback APIs.
- Converting authoritative backend events into hot realtime envelopes.
- Pushing small payloads to Cloudflare Durable Objects or Agents SDK endpoints.
- Preserving idempotency, ordering metadata, and replay/gap-repair pointers.

What does not belong here:

- Durable event truth.
- UI rendering.
- Long-running agent work.

### `services/preview-router`

Purpose: future wildcard preview host router.

The routing model is:

```text
*.preview.example.com -> ALB -> preview-router -> registry lookup
```

What belongs here:

- Host header parsing.
- `PreviewDeploymentsTable` lookup.
- Static S3 preview serving.
- SPA fallback.
- Archived/unavailable preview responses.
- Later dynamic preview proxying to ECS tasks/services.

What does not belong here:

- One ALB rule per preview.
- Per-project target group creation.
- Agent build logic.

### `services/miro-bridge`

Purpose: future Miro OAuth, REST, MCP, webhook, and token broker service.

What belongs here:

- OAuth callback handling and token refresh.
- Miro REST board/item operations.
- Miro MCP connection brokerage.
- Webhook processing.
- Board artifact metadata.
- Prompt-injection filtering for board content.

What does not belong here:

- Raw refresh tokens passed to agent containers.
- Generic run lifecycle logic.
- Client-only Miro display widgets.

## Infrastructure

`infra/` contains deployable infrastructure definitions. Infrastructure packages
own cloud resources, IAM wiring, and deployment configuration. Runtime behavior
should live in `services/`.

```text
infra/
  cdk/
  amplify/
  cloudflare/
```

### `infra/cdk`

Purpose: durable AWS platform infrastructure.

Current structure:

```text
infra/cdk/
  package.json
  cdk.json
  tsconfig.json
  src/
    bin/
      agents-cloud-cdk.ts
    config/
      environments.ts
    stacks/
      agents-cloud-stack.ts
      foundation-stack.ts
      network-stack.ts
      storage-stack.ts
      state-stack.ts
      cluster-stack.ts
      runtime-stack.ts
      orchestration-stack.ts
      control-api-stack.ts
      preview-ingress-stack.ts
```

Stack ownership:

- `FoundationStack`: shared naming, tags, SSM metadata, app/environment outputs.
- `NetworkStack`: VPC, subnet groups, endpoints, worker security group.
- `StorageStack`: S3 buckets for live artifacts, audit log, preview static
  assets, and research datasets.
- `StateStack`: DynamoDB tables for runs, tasks, events, artifacts, approvals,
  and preview deployments.
- `ClusterStack`: ECS cluster and runtime log group.
- `RuntimeStack`: agent-runtime Docker image asset, Fargate task definition,
  container environment, and task-role grants.
- `OrchestrationStack`: Step Functions state machine that launches the worker
  task.
- `ControlApiStack`: API Gateway HTTP API, Cognito JWT authorizer, Lambda
  handlers, grants to DynamoDB and Step Functions.
- `PreviewIngressStack`: optional wildcard HTTPS ALB and temporary
  preview-router ECS service.

What belongs here:

- AWS resource definitions.
- IAM grants and boundaries.
- Stack outputs and environment-driven configuration.
- Wiring between deployed resources and service packages.
- Docker image assets and Lambda asset bundling references.

What does not belong here:

- Business logic that should be unit tested as service code.
- Generated `cdk.out` or `dist` as source.
- Secrets or local credentials.
- Cloudflare Worker source, unless intentionally managed as a CDK asset.

When adding AWS infrastructure:

1. Prefer adding to an existing stack if it fits that stack's ownership.
2. Add a new stack only for a real lifecycle or blast-radius boundary.
3. Keep environment config in `src/config/environments.ts`.
4. Export values needed by apps/services through outputs or environment
   variables.
5. Grant least privilege from the resource-owning stack.

### `infra/amplify`

Purpose: product-facing Amplify Gen 2 backend shell.

Current structure:

```text
infra/amplify/
  package.json
  tsconfig.json
  amplify/
    backend.ts
    auth/
      resource.ts
```

What belongs here:

- Amplify Auth/Cognito resources.
- Product-facing Amplify resources when they are intentionally lightweight.
- Amplify output generation for frontend clients.
- Future app-facing functions only when they do not belong in the durable CDK
  platform.

What does not belong here:

- Core run ledger tables.
- ECS worker infrastructure.
- Step Functions orchestration.
- Heavy IAM/network/storage resources that already belong in CDK.

The project boundary is: Amplify owns app auth and hosting integration; CDK owns
durable platform execution.

### `infra/cloudflare`

Purpose: future realtime edge infrastructure.

What belongs here:

- Worker source and config.
- Durable Object or Cloudflare Agents SDK classes.
- Queue bindings and DLQs.
- WebSocket routes for users, workspaces, sessions, notifications, and replay.
- Signed AWS callback/command bridge code.

What does not belong here:

- Durable run truth.
- Large payload storage.
- Long-running research, coding, build, or eval work.

Cloudflare should carry small command envelopes and hot state. DynamoDB/S3 remain
the authoritative ledger.

## Documentation

`docs/` contains planning, decisions, research, status, and structure docs.

```text
docs/
  PROJECT_STRUCTURE.md
  IMPLEMENTATION_READINESS_AUDIT.md
  AI_AGENT_ENGINEERING_QUALITY_GATES.md
  README.md
  adr/
  roadmap/
  research/
```

`IMPLEMENTATION_READINESS_AUDIT.md`
: Current implementation audit and gap list. Use it to understand what is
  complete, what is only a current shell, what blocks product implementation, and
  which parallel workstreams can proceed safely.

`AI_AGENT_ENGINEERING_QUALITY_GATES.md`
: Mandatory workflow for agents and humans making changes. It defines required
  self-audit, validation, tests, docs sync, and handoff expectations.

### `docs/adr`

Purpose: accepted architecture decisions.

ADRs should be short and stable. Add a new ADR when a decision would materially
change ownership, control flow, persistence, security, or deployment shape.

Current accepted decisions cover:

- AWS durable control plane.
- OpenAI Agents SDK harness, Hermes worker runtime, Codex MCP tool.
- Cloudflare realtime plane.
- S3/EFS workspace storage.
- A2UI GenUI protocol.
- API-key-first Codex/OpenAI auth.
- Wildcard preview hosting.

Do not bury locked decisions only in roadmap prose. If it changes architecture,
make or update an ADR.

### `docs/roadmap`

Purpose: planning, current progress, implementation sequencing, and status
snapshots.

Important current files:

- `MASTER_SCOPE_AND_PROGRESS.md`: current source-of-truth planning ledger.
- `PROJECT_STATUS.md`: deployed/current implementation status.
- `WEB_APP_STATUS.md`: web app status.
- `DESKTOP_MOBILE_BOILERPLATE_STATUS.md`: Flutter app status.
- `WILDCARD_PREVIEW_HOSTING_STATUS.md`: preview hosting status and checklist.
- `AMPLIFY_NEXT_FRONTEND_PLAN.md`: frontend/auth hosting plan.

When status changes, update the master/status docs and the package README
closest to the change.

### `docs/research`

Purpose: source research and long-form input material.

Research docs should inform decisions but should not be treated as final
architecture unless an ADR or current status doc adopts the recommendation.

## Tests

`tests/` is for cross-package and future end-to-end test areas.

Current structure:

```text
tests/
  README.md
  contract/
    README.md
```

Package-local tests should stay inside the package when they only test that
package:

- `services/control-api/test`
- `services/agent-runtime/test`
- `apps/desktop_mobile/test`

Cross-cutting tests belong under `tests/`:

- contract compatibility across clients/services,
- replay/gap-repair behavior,
- end-to-end run creation and worker execution,
- load/concurrency checks,
- security and tenant-isolation checks,
- eval harness tests.

## Scripts

`scripts/` contains small root-level helper scripts that support the monorepo.

Current examples:

- Static hosting helper scripts are superseded by the real web build in root
  scripts.
- `create-cloudflare-acm-validation-record.py`: helper for ACM validation with
  Cloudflare-managed DNS.

Scripts should be small and operational. If a script grows into product logic,
move it into an appropriate package under `services/`, `apps/`, `infra/`, or
`packages/`.

## Generated And Local-Only Paths

These directories are generated or local-only and should not be treated as
source of truth:

```text
node_modules/
**/node_modules/
dist/
**/dist/
cdk.out/
**/cdk.out/
apps/web/.next/
apps/desktop_mobile/build/
infra/amplify/.amplify/
infra/amplify/amplify_outputs.*
.research/
```

Local scratch, research, and generated directories are not source of truth.
Product code should not import from local-only material. If code or assets become
product dependencies, add them intentionally through the normal package/dependency
path and document licensing/ownership.

## Runtime Data Placement

Durable runtime data should land in the platform stores, not in app directories:

- Run/task/event/approval metadata: DynamoDB tables from `StateStack`.
- Live mutable artifacts: `workspace-live-artifacts` S3 bucket.
- Immutable audit archives: `workspace-audit-log` S3 bucket.
- Static preview outputs: `preview-static` S3 bucket.
- Research/eval corpora: `research-datasets` S3 bucket.
- Future hot POSIX workspaces: EFS, mounted into ECS tasks only when needed.

Local `.env`, `.env.local`, Amplify outputs, AWS credentials, Codex auth files,
and provider tokens must not be committed.

## Cross-Plane Flow

The intended first durable run flow is:

```text
Web or desktop/mobile client
  -> Amplify/Cognito authentication
  -> Control API
  -> DynamoDB run/task/event records
  -> Step Functions state machine
  -> ECS agent-runtime task
  -> DynamoDB status/events and S3 artifacts
  -> Control API polling now
  -> Cloudflare realtime fanout later
  -> web and desktop/mobile render the same canonical event stream
```

The future realtime flow is:

```text
Worker or backend event
  -> DynamoDB/EventBridge/SQS durable movement
  -> event-relay
  -> Cloudflare Worker/Durable Object
  -> WebSocket fanout
  -> client reducer and A2UI renderer
```

The future preview flow is:

```text
Agent builds artifact
  -> uploads static files to preview-static S3
  -> writes PreviewDeploymentsTable record
  -> wildcard DNS and ALB route host to preview-router
  -> preview-router serves S3 or proxies dynamic ECS target
```

## Adding New Work

### New HTTP API Endpoint

Put request handling in `services/control-api/src/`. Add domain logic behind a
small function with explicit dependencies, add tests under
`services/control-api/test/`, then wire the Lambda route in
`infra/cdk/src/stacks/control-api-stack.ts`.

Do not implement HTTP behavior directly inside the CDK stack.

### New Worker Capability

If it belongs in the default autonomous worker, add it to
`services/agent-runtime/src/` behind a port/interface and update tests. If it is
a materially different worker class, create a new package under `services/` and
wire a separate image/task definition in CDK.

### New Shared Event

Add the schema to `packages/protocol`, add examples/tests, then update producer
and consumer packages. Clients should render canonical events, not provider
native events.

### New Web Screen

Add route or UI code under `apps/web/app` and `apps/web/components`. Add data
access in `apps/web/lib`. The screen should consume Control API/realtime
interfaces, not AWS resources directly.

### New Flutter Screen

Add feature code under `apps/desktop_mobile/lib/src/features/` once the app is
split from the current shell. Keep data access behind repositories in
`lib/src/data/` and shared models in `lib/src/domain/`.

### New AWS Resource

Add it to the CDK stack that owns the resource type. If the resource crosses
plane boundaries, document the boundary in the nearest README and grant least
privilege explicitly.

### New Cloudflare Realtime Code

Put Worker, Durable Object, queue, and replay code under `infra/cloudflare`. If
there is an AWS-side relay component, put that runtime code under
`services/event-relay`.

### New Integration

Use a dedicated service directory when the integration has OAuth, token refresh,
webhooks, external writes, or complex security policy. Keep raw refresh tokens in
a broker or credential vault, not in app code or agent workspaces.

## Boundary Rules

- Clients never own durable run state.
- Cloudflare never owns durable ordered run history.
- Control API never runs long-lived agent work.
- ECS workers never receive broad platform credentials.
- S3 is not a live POSIX filesystem.
- EFS is not the permanent artifact ledger.
- A2UI/GenUI is declarative and server-validated; agents do not send arbitrary
  React, JavaScript, Dart, or Flutter code.
- Preview hosting uses one wildcard ingress and a registry lookup, not one ALB
  rule or target group per generated site.
- Root scripts should orchestrate packages, not hide package-specific logic.
- Generated build output is disposable and must not be edited as source.

## Current Alignment Notes

- The current canonical client directories are `apps/web` and
  `apps/desktop_mobile`.
- The implemented DynamoDB layout uses focused tables for runs, tasks, events,
  artifacts, approvals, and preview deployments.
- Control API V1 exists as a first slice. The broader product workflow still
  needs real client auth calls, stronger idempotency, richer schemas, realtime
  fanout, and a production worker path.
- Agent runtime has a smoke/Hermes adapter path. Production model/provider
  policy, secrets brokering, and workspace isolation are still future work.
