# Agents Cloud Implementation Readiness Audit

_Last updated: 2026-05-10_

This document captures the current implementation readiness of Agents Cloud as a
repository, not just as a roadmap. It should be read before starting major
backend, runtime, realtime, client, or infrastructure work.

Use this document with:

- `docs/PROJECT_STRUCTURE.md` for where code belongs.
- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md` for how implementation work must
  be audited and tested.
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md` for product scope and progress.
- `docs/roadmap/PROJECT_STATUS.md` for current deployment/status notes.
- `docs/adr/README.md` for locked architecture decisions.

## Executive Summary

The repository is in a credible foundation state. It has a pnpm workspace,
canonical docs, ADRs, CDK stacks, a first Control API, a first ECS
agent-runtime package, a Next.js command center, a Flutter desktop/mobile app,
protocol schemas, and a first Cloudflare realtime package.

It is not ready for broad product implementation yet. The next work must close
the platform contracts that every later feature will depend on:

1. Canonical event envelopes must be produced and validated by services.
2. Run creation must become truly idempotent and failure-safe.
3. Tenant/workspace authorization must be explicit.
4. Worker event sequencing and artifact writes must be retry-safe.
5. Realtime must replay from AWS truth after disconnects.
6. IAM and environment defaults must be tightened before live use.
7. Web and Flutter clients must stop relying on hardcoded workspace and fixture
   assumptions, though the web command panel now has a tested first durable run
   loop against the Control API.

Do not build advanced specialist agents, Codex automation, Miro integration,
full GenUI, or large product UI surfaces before the durable run lifecycle is
contract-correct.

## Current Completion Snapshot

### Complete Enough To Build On

- Root pnpm workspace and package scripts exist.
- Protocol schema package exists under `packages/protocol`.
- AWS CDK app exists under `infra/cdk`.
- Core CDK stacks exist for foundation, network, storage, state, cluster,
  runtime, orchestration, and Control API.
- Amplify Gen 2 auth/hosting path exists under `infra/amplify`.
- Next.js web app exists under `apps/web`.
- Flutter desktop/mobile app exists under `apps/desktop_mobile`.
- Control API first slice exists under `services/control-api`.
- Agent runtime first slice exists under `services/agent-runtime`.
- Cloudflare realtime first slice exists under `infra/cloudflare/realtime`.
- AWS-native realtime WebSocket first slice exists under `services/realtime-api` and `infra/cdk/src/stacks/realtime-api-stack.ts`.
- Root docs now include a project structure guide and clear entrypoints.

### Complete Only As Current Shells

- Durable run lifecycle works structurally, but not yet with production-grade
  idempotency, sequencing, authorization, and schema validation.
- Runtime writes a smoke/Hermes report artifact, but it is not yet a
  production worker policy boundary.
- Web command panel can create a durable run, poll ordered Control API events,
  stop on terminal status, and render artifact cards; broader list-runs,
  workspace selection, artifact download, and realtime client integration remain
  incomplete.
- Cloudflare realtime can accept WebSocket sessions and relay events to a
  Durable Object, but it does not yet do replay, gap repair, or signed relay.
- AWS-native realtime WebSocket first slice is deployed. It can store connections/subscriptions and relay DynamoDB event stream records to subscribed clients; direct Lambda smoke has verified authorizer deny, connect/subscribe/ping/disconnect, and stale/malformed connection cleanup. Real browser/native token smoke is still pending.
- Web creates a Control API run when configured, but the run list, artifacts,
  approvals, and status panels remain mostly fixture-backed.
- Flutter configures Amplify and contains a Control API client, but the user
  experience does not yet perform a real authenticated run workflow.

### Not Complete

- Workspace/organization membership model.
- Tenant authorization enforcement across Control API, runtime, and realtime.
- Canonical service-side event producer library beyond the first protocol helpers.
- Event relay from AWS to Cloudflare clients; AWS-native WebSocket relay first slice is deployed.
- Durable replay cursor protocol.
- Production agent runtime with model/provider secrets, workspace policy, and
  isolation.
- Human approval workflow.
- Cancel/resume/retry semantics.
- Artifact listing/download APIs.
- Observability, alarms, access logs, and operational runbooks.
- Production deployment policy for live environment retention and deletion
  protection.

## Completed / Resume Point: 2026-05-10 Runtime + Realtime Deploy

The latest realtime/control/runtime hardening has now been committed, pushed, deployed, and smoke-tested.

Deployed successfully:

- `agents-cloud-dev-state` is `UPDATE_COMPLETE`; EventsTable stream is enabled, RunsTable has the idempotency-scope GSI, and `RealtimeConnectionsTable` exists.
- `agents-cloud-dev-runtime` is `UPDATE_COMPLETE` with task definition revision `agents-cloud-dev-agent-runtime:7`.
- `agents-cloud-dev-control-api` is `UPDATE_COMPLETE` with transactional run ledger/idempotency hardening.
- `agents-cloud-dev-realtime-api` is `UPDATE_COMPLETE` with WebSocket URL `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`.

Smoke evidence:

- Control API-created run `run-idem-191fa7003b2441188aa1ebbc` reached Step Functions `SUCCEEDED` and ECS task definition `:7`.
- EventsTable contains canonical `run.status/queued`, `run.status/running`, `artifact.created`, and `run.status/succeeded` events for that run.
- Duplicate create-run invocation with the same idempotency key returned the existing run and did not add events.
- S3 artifact verified at `s3://agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m/workspaces/workspace-audit-smoke/runs/run-idem-191fa7003b2441188aa1ebbc/artifacts/artifact-task-idem-191fa7003b2441188aa1ebbc-0001/hermes-report.md`.
- Realtime direct Lambda smoke verified missing-token Deny, connect/subscribe/ping/disconnect, and relay cleanup of malformed stored connection ids.
- Authenticated HTTP e2e smoke now uses a temporary Cognito user and Amplify SRP sign-in to call the deployed Control API over HTTP. Latest verified run `run-idem-40e5c2eeae1183234f86c187` reached Step Functions `SUCCEEDED`, returned run status `succeeded`, and returned four canonical events including `artifact.created` through `GET /runs/{runId}/events`.
- Local browser dogfood with `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1` and `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1` verified the command panel creates a run, polls the ledger to `Succeeded`, shows event sequence `#1` through `#4`, and renders the Hermes smoke report artifact card with no console errors.

Remaining resume point:

1. Use a real Cognito ID token from web/native to perform an actual WebSocket connection to the deployed URL.
2. Replace the local browser self-test mock with a real persisted test account or seeded dev user for full browser-to-HTTP smoke in CI.
3. Add replay/gap repair and workspace membership authorization before calling realtime production-grade.

## Locked Architecture Decisions

These are accepted ADR-level decisions and should not be reopened casually.

### Durable Truth

AWS is the durable control plane. DynamoDB, S3, Step Functions, and ECS own run,
task, event, artifact, approval, and execution truth.

Relevant docs:

- `docs/adr/0001-platform-control-plane.md`
- `docs/adr/0004-workspace-storage.md`

### Realtime

Cloudflare is realtime fanout and hot coordination only. It must not become the
permanent event store.

Relevant docs:

- `docs/adr/0003-realtime-plane.md`

### Agent Harness

OpenAI Agents SDK is the primary orchestration harness. Hermes is an isolated ECS
specialist runtime where useful. Codex is a scoped coding tool inside isolated
worker boundaries.

Relevant docs:

- `docs/adr/0002-agent-harness.md`
- `docs/adr/0006-codex-openai-auth.md`

### Generated UI

A2UI is the initial generated UI protocol baseline. Agents may emit declarative
UI only through server-validated, allowlisted component catalogs.

Relevant docs:

- `docs/adr/0005-genui-protocol.md`

### Preview Hosting

Generated website previews should share a wildcard ingress and route through a
preview-router registry. Do not create one ALB rule or target group per preview.

Relevant docs:

- `docs/adr/0007-preview-hosting.md`

## Readiness Definition

A feature is implementation-ready only when these are true:

- It has a clear owning plane: client, protocol, Control API, runtime, realtime,
  infra, or integration.
- Its durable state model is defined before UI or worker behavior depends on it.
- Its public events match `packages/protocol`.
- Its authorization model is explicit.
- Its idempotency and retry behavior are defined.
- Its failure behavior is observable and testable.
- Its tests cover the risk it introduces.
- Its docs and status notes are updated in the same change.

If any of those are unknown, the task is still design work, not implementation
work.

## Cross-Cutting Blockers

### P0: Canonical Events Are Not Enforced

The protocol package defines the expected event envelope and event payload
shapes, but producers do not yet emit those shapes consistently.

Current progress:

- `@agents-cloud/protocol` now exports TypeScript builders for canonical `run.status` and `artifact.created` events.
- `services/control-api` uses the shared builder for its initial queued event.
- `services/agent-runtime` uses the shared builders for running, artifact-created, succeeded, and failed events.
- Runtime artifact events now use protocol `kind: "report"` and `name` fields.

Remaining risk:

- Event fixtures still need broader validation against payload schemas in service tests.
- Realtime, web, and Flutter consumers still need to converge on the same builder/types or generated models.
- Future approval and GenUI producers still need the same shared-builder treatment.

Required fix:

- Add a shared event builder/validator package or module.
- Validate produced event fixtures against `packages/protocol`.
- Make Control API, agent runtime, event relay, Cloudflare, web, and Flutter
  consume the same vocabulary.
- Add tests that fail when a service-produced event does not validate.

Acceptance criteria:

- Every service-produced event has an envelope id, type, sequence, createdAt,
  org/workspace/user/run identifiers where applicable, source, and payload.
- Payload schemas validate for `run.status`, `artifact.created`, future
  `approval.*`, and future `genui.*` events.
- Clients do not need special cases for provider-native event shapes.

### P0: Run Creation Is Not Idempotent Enough

The Control API accepts an idempotency key, but repeated POST requests can still
create duplicate runs or duplicate Step Functions executions.

Current progress:

- `services/control-api` checks an idempotency scope for `(userId, workspaceId, idempotencyKey)` before creating a run.
- Unit tests now prove a duplicate idempotency key returns the same run and does not start duplicate execution.
- Run, task, and initial event writes happen in one DynamoDB transaction before Step Functions execution starts.
- Unit tests now prove a failed durable ledger write does not start orphan work.
- DynamoDB writes use conditional expressions for run/task/event item creation.

Remaining risk:

- A dedicated idempotency table/outbox would be stronger for highly concurrent duplicate requests.
- The narrow failure case after Step Functions starts but before execution ARN persistence still needs recovery policy.
- Browser/native clients still need stable persisted idempotency keys for retrying the same user action.

Required fix:

- Store idempotency records or make run creation conditional on
  `(userId, workspaceId, idempotencyKey)`.
- Write the initial run/task/event records before starting execution, or use a
  transactional/outbox pattern that can recover safely.
- Reuse the same idempotency key for retrying the same user action.
- Add tests for duplicate request, write failure, Step Functions failure, and
  recovery behavior.

Acceptance criteria:

- Retrying the same create-run request returns the same run.
- A failed write does not start orphan work.
- A failed Step Functions start leaves a clear recoverable run state or rolls
  back safely.

### P0: Runtime Sequencing And Artifacts Are Retry-Unsafe

The first runtime writes fixed event sequence numbers and a fixed artifact id.
That is enough for a smoke path, but not for retries, duplicate ECS starts, or
multi-step worker behavior.

Current progress:

- Runtime events are now canonical envelopes produced by `@agents-cloud/protocol` helpers.
- Artifact ids are deterministic per task attempt instead of globally fixed.
- Artifact records and events use protocol-aligned `kind: "report"` and `name` fields.
- DynamoDB event and artifact writes use conditional expressions to prevent silent overwrite on duplicate attempts.
- Runtime run/task status updates now require existing records, preventing accidental creation of incomplete items.

Remaining risk:

- Fixed sequence slots are still a first-slice convention; a general sequence allocator is needed for multi-step workers.
- Terminal state transition guards still need DynamoDB conditional update expressions.
- Duplicate worker invocation currently fails safely on duplicate event/artifact writes rather than becoming fully idempotent.

Required fix:

- Add a sequence allocator or conditional write strategy.
- Generate deterministic retry-safe artifact ids or unique artifact ids per
  attempt.
- Add state transition guards for queued, running, succeeded, failed, cancelled,
  and future waiting-for-approval states.
- Add tests for duplicate worker invocation, retry after partial failure, and
  terminal status protection.

Acceptance criteria:

- A duplicate ECS attempt cannot corrupt the event ledger.
- Terminal statuses do not regress.
- Every artifact record points to an S3 object and a canonical event.

### P1: Tenancy And Workspace Authorization Are Missing

The current implementation uses Cognito identity but does not yet model
organizations, workspace membership, roles, or permissions.

Current risk:

- A user can provide arbitrary workspace ids.
- Web uses a hardcoded workspace id.
- Cloudflare accepts workspace ids from query params after JWT validation.
- Future team, approval, artifact, and preview actions have no policy model.

Required fix:

- Define org/workspace/user membership records.
- Add role and permission checks in Control API.
- Add realtime connection authorization against workspace membership.
- Include `orgId` and `workspaceId` consistently in canonical events.
- Add tenant isolation tests.

Acceptance criteria:

- A user cannot create, read, stream, or mutate runs in a workspace they do not
  belong to.
- Tests cover same-workspace, different-workspace, different-user, and future
  role boundaries.

### P1: Realtime Relay Needs Replay And Signed Ingress

The first Cloudflare package proves route and Durable Object shape, but it is not
yet a reliable realtime plane.

Current risk:

- WebSocket query-token auth leaks tokens into logs and URLs.
- Relay ingress uses a simple shared secret.
- Durable Objects only broadcast to currently connected sockets.
- Reconnecting clients cannot request missed events.
- Cloudflare validates only a small subset of event shape.

Required fix:

- Add short-lived WebSocket connection tickets or another browser-safe auth
  handshake.
- Replace shared-secret relay with HMAC/timestamp/replay protection or another
  signed mechanism.
- Store cursor metadata and replay from AWS authoritative events after reconnect.
- Add client-visible gap repair behavior.
- Add tests for replay, invalid signature, expired signature, duplicate relay
  event, and out-of-order sequence.

Acceptance criteria:

- A reconnecting client can recover missed run events.
- Cloudflare never claims to be the source of truth.
- Relay accepts only authenticated, non-replayed backend events.

### P1: Infrastructure Defaults Need Live-Environment Policy

The CDK defaults are iteration-friendly. That is useful for local work, but
risky if `dev` is the only live environment.

Current risk:

- Non-prod removal policy destroys resources.
- DynamoDB PITR is disabled in `dev`.
- Runtime task role has broad read/write grants.
- CORS is open while the public API becomes real.
- Deployment config embeds environment-specific Cognito values.

Required fix:

- Decide whether current `dev` is disposable or live.
- Enable retention/PITR/deletion protection for any environment that contains
  real user data.
- Reduce worker IAM to only the tables/buckets and prefixes required.
- Move environment-specific IDs into explicit env/SSM/config inputs.
- Add synth assertions or tests for critical retention and permission policy.

Acceptance criteria:

- A live environment cannot be destroyed accidentally by a routine deploy.
- Worker roles cannot write unrelated buckets/tables.
- Environment config drift is visible before deploy.

### P2: Client Product Surfaces Are Still Mostly Shells

The clients have useful shells, but the product loop is not complete.

Current risk:

- Web still renders fixture lists for runs, teams, artifacts, approvals, and
  GenUI surfaces.
- Web status vocabulary does not fully match the protocol.
- Flutter has backend config and client code but no signed-in create-run flow.
- Flutter backend IDs are hardcoded.
- Neither client has realtime integration yet.

Required fix:

- Add real run list and run detail APIs.
- Replace fixture panels incrementally with backend data.
- Add workspace selection.
- Use canonical status enums everywhere.
- Move backend config to environment/build-time config.
- Add client tests around API state, auth-required paths, and event reducers.

Acceptance criteria:

- A signed-in user can create a run, see it in a list, open details, and see
  ordered events from the authoritative ledger.
- Clients can later switch from polling to realtime without changing event
  semantics.

### P2: Documentation Drift Needs Continuous Cleanup

The docs are improving, but some package READMEs and status docs still reflect
earlier phases.

Current risk:

- Agents may follow misaligned wording about runtime state, Control API state,
  or canonical app names.
- Status docs can overstate or understate implementation reality.
- Package-local READMEs are not always updated when code moves.

Required fix:

- Keep `docs/roadmap/PROJECT_STATUS.md` current.
- Keep package README files current when implementation state changes.
- Add doc sync to every implementation definition of done.
- Prefer ADRs for locked decisions and status docs for current reality.

Acceptance criteria:

- A new agent can read the docs and know what exists, what is planned, and where
  new code belongs without reverse-engineering the repository first.

## Plane-By-Plane Audit

### Documentation Plane

Current setup:

- `README.md` is the human entrypoint.
- `AGENTS.md` is the agent operating contract.
- `docs/README.md` is the docs index.
- `docs/PROJECT_STRUCTURE.md` is the repository map.
- `docs/adr` contains accepted decisions.
- `docs/roadmap` contains status and sequencing docs.
- `docs/research` contains source research inputs.

What is solid:

- Top-level docs now route readers to the important sources.
- Project structure is documented deeply enough to guide placement.
- ADRs cover the major architecture boundaries.

What needs work:

- Status docs should be reconciled after every implementation slice.
- Package-local READMEs need regular updates.
- Future ADRs are needed for tenancy, idempotency, event replay, live
  environment policy, and worker credential brokering.

### Protocol Plane

Current setup:

- JSON schemas live under `packages/protocol/schemas`.
- A schema validation script exists.
- Root commands can run contract validation.

What is solid:

- The envelope and payload intent is directionally correct.
- The package gives producers and consumers a natural contract home.

What needs work:

- Producers do not yet use the schemas as a hard gate.
- There are too few golden examples.
- Event names and payloads need alignment across Control API, runtime,
  Cloudflare, web, and Flutter.
- The schema package should expose helper types/builders or generated types.

### Control API Plane

Current setup:

- `services/control-api` owns Lambda request handlers and domain logic.
- CDK wires routes for create run, get run, and list run events.
- Tests cover happy path, missing objective, owned run read, cross-user denial,
  and ordered event cursor queries.

What is solid:

- Domain logic is separated enough to unit test.
- DynamoDB and Step Functions are behind ports.
- The first authenticated API shape is present.

What needs work:

- Idempotency must be real.
- JSON parse errors should become structured 400 responses.
- Query params need validation.
- Workspace authorization must be added.
- Error handling should be consistent.
- Observability and structured logs should be added.
- Event records must match the protocol.

### Runtime Plane

Current setup:

- `services/agent-runtime` owns the first ECS worker package.
- Runtime can update run/task status, write events, and write one S3 artifact.
- A smoke/Hermes adapter path exists.
- Tests cover success and failure behavior at a narrow unit level.

What is solid:

- The package establishes the right runtime boundary.
- Artifact and event sinks are ported behind interfaces.
- The worker can prove end-to-end ECS execution mechanics.

What needs work:

- Event sequencing must become durable and retry-safe.
- Artifact ids and names must match canonical schemas.
- Worker IAM and environment must be scoped.
- Hermes CLI mode needs validated timeout/config/secrets policy.
- State transition guards are needed.
- More failure-mode tests are needed.

### Realtime Plane

Current setup:

- `infra/cloudflare/realtime` contains Worker and Durable Object code.
- Health, WebSocket entrypoint, JWT helpers, relay route, and tests exist.

What is solid:

- The package location matches the architecture.
- Cloudflare is not treated as durable truth.
- Initial tests validate route and auth helper behavior.

What needs work:

- Add connection-ticket flow.
- Add signed relay with replay protection.
- Add cursor and gap repair.
- Add Durable Object tests for broadcast/reconnect behavior.
- Add client SDK or shared reducer once event contracts are stable.

### AWS Infrastructure Plane

Current setup:

- CDK owns foundation, network, storage, state, cluster, runtime,
  orchestration, Control API, and optional preview ingress.
- `pnpm infra:synth` succeeds.

What is solid:

- Stacks are separated by responsibility.
- CDK synthesizes successfully.
- Control API and runtime stacks are wired to state and orchestration.

What needs work:

- Live environment safety policy.
- Least privilege for runtime roles.
- Access logs, alarms, retention, and operational outputs.
- Production CORS/domain rules.
- EventBridge/SQS relay infrastructure.
- More CDK assertions around destructive settings and IAM scope.

### Web Client Plane

Current setup:

- Next.js app uses Amplify Auth UI.
- Create-run call path exists.
- Production build and typecheck pass.

What is solid:

- App has a real package and build path.
- Authenticator is in place.
- Control API client helper exists.

What needs work:

- Replace fixtures with real list/detail/artifact data.
- Add workspace selection and user-visible run history.
- Reuse stable idempotency keys for retries.
- Align status values with protocol.
- Add event reducer and later realtime transport.
- Add UI/data tests once workflows become real.

### Flutter Client Plane

Current setup:

- Flutter app exists and uses `shadcn_flutter`.
- Amplify config and Control API client exist.
- Analyzer and widget tests pass.

What is solid:

- The native app has a coherent shell.
- The chosen UI system is documented.
- Basic tests exist.

What needs work:

- Move backend config to build-time or generated environment config.
- Add sign-in and token retrieval surfaces.
- Wire create-run and run detail flows.
- Split monolithic UI code into features/data/domain structure.
- Add tests for backend config, API client, auth state, and navigation.

## Required Parallel Workstreams

These workstreams can run in parallel if they coordinate through protocol and
status docs.

### Workstream A: Protocol Contract Hardening

Owner plane: `packages/protocol`

Primary files:

- `packages/protocol/schemas/**`
- `packages/protocol/scripts/**`
- future generated/shared type outputs

Tasks:

- Normalize event type names.
- Add golden event examples.
- Add service-producer validation tests.
- Add a small event builder API or generated types.
- Document canonical status, artifact kind, approval, and GenUI event shapes.

Blocks:

- Control API event fix.
- Runtime event fix.
- Realtime replay.
- Client event reducer.

### Workstream B: Control API Durability

Owner plane: `services/control-api`

Primary files:

- `services/control-api/src/**`
- `services/control-api/test/**`
- `infra/cdk/src/stacks/control-api-stack.ts`

Tasks:

- Implement true idempotent run creation.
- Fix write/start ordering.
- Add malformed JSON and query param validation.
- Add workspace authorization hooks.
- Emit canonical events.
- Add list-runs and artifact read endpoints when required by clients.

Blocks:

- Real web run history.
- Real Flutter run history.
- Safe worker orchestration.

### Workstream C: Runtime Reliability

Owner plane: `services/agent-runtime`

Primary files:

- `services/agent-runtime/src/**`
- `services/agent-runtime/test/**`
- `services/agent-runtime/Dockerfile`
- `infra/cdk/src/stacks/runtime-stack.ts`

Tasks:

- Make event writes conditional and sequence-safe.
- Make artifact ids retry-safe.
- Enforce terminal state transitions.
- Align artifact records/events with protocol.
- Harden Hermes CLI config and secret handling.
- Add duplicate invocation and partial failure tests.

Blocks:

- Production model/provider runtime.
- Codex worker integration.
- Artifact UI.

### Workstream D: Realtime Relay And Replay

Owner planes: `infra/cloudflare/realtime`, future `services/event-relay`

Primary files:

- `infra/cloudflare/realtime/src/**`
- future `services/event-relay/**`
- future CDK relay resources

Tasks:

- Design and implement signed relay.
- Add cursor/replay protocol.
- Add AWS-side relay worker.
- Add Durable Object replay/gap repair behavior.
- Add WebSocket client helpers.

Blocks:

- Live progress streaming.
- Notifications.
- Multi-device sync.

### Workstream E: Client Real Data Loop

Owner planes: `apps/web`, `apps/desktop_mobile`

Primary files:

- `apps/web/app/**`
- `apps/web/components/**`
- `apps/web/lib/**`
- `apps/desktop_mobile/lib/**`
- `apps/desktop_mobile/test/**`

Tasks:

- Add workspace selection.
- Add real run list and run detail.
- Replace fixture status panels.
- Add artifact display.
- Add stable idempotency handling.
- Add event reducer shared semantics across web and Flutter.

Blocks:

- Full command center product loop.
- Approval and GenUI surfaces.

### Workstream F: Infra Safety And Operations

Owner plane: `infra/cdk`

Primary files:

- `infra/cdk/src/config/**`
- `infra/cdk/src/stacks/**`
- future CDK assertion tests

Tasks:

- Decide live/dev retention policy.
- Tighten IAM grants.
- Add PITR/deletion protection for live data.
- Add logs, alarms, metrics, and access logging.
- Move environment-specific IDs to explicit config.
- Add synth assertions for critical safety settings.

Blocks:

- Production deployment.
- Real user data.
- Compliance/security review.

### Workstream G: Documentation And ADR Reconciliation

Owner plane: `docs`

Primary files:

- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/roadmap/PROJECT_STATUS.md`
- package-local README files
- `docs/adr/**`

Tasks:

- Keep status docs aligned with implementation.
- Add ADRs for tenancy, idempotency, replay, live environment policy, and
  credential brokering.
- Add package README updates when package behavior changes.
- Keep supporting docs aligned with the current source-of-truth docs.

Blocks:

- Reliable onboarding for future agents.
- Safe parallel implementation.

## Implementation Sequence Recommendation

### Phase 1: Contract And Durability

Goal: make one create-run-to-worker-to-events flow correct.

Work:

- Protocol event builder and fixtures.
- Idempotent create-run.
- Canonical initial event.
- Runtime canonical running/artifact/terminal events.
- Sequence and artifact id safety.
- Tests for duplicate requests and duplicate worker attempts.

Exit criteria:

- One run can be created, executed, queried, and validated against protocol.
- Retrying the same create-run action does not create duplicate work.
- Runtime retry cannot corrupt the ledger.

### Phase 2: Authorization And Live Environment Safety

Goal: make the same loop safe for real users.

Work:

- Workspace membership model.
- Control API authorization.
- Realtime authorization design.
- Live environment retention policy.
- Least privilege worker IAM.
- Logs and alarms for the run loop.

Exit criteria:

- Cross-tenant reads/writes fail in tests.
- Live data resources are protected.
- Runtime cannot access unrelated stores.

### Phase 3: Client Product Loop

Goal: make web and Flutter useful against real backend data.

Work:

- Run list.
- Run detail.
- Ordered event display.
- Artifact display.
- Workspace selection.
- Stable client idempotency keys.

Exit criteria:

- A signed-in user can create and inspect a durable run from web.
- Flutter can perform the same core workflow or clearly exposes the remaining
  missing native path.

### Phase 4: Realtime

Goal: replace polling with reliable fanout without moving truth out of AWS.

Work:

- Signed AWS relay.
- Durable Object fanout.
- Cursor/replay.
- Client WebSocket helpers.
- Gap repair tests.

Exit criteria:

- Clients can reconnect and recover missed events from AWS truth.
- Realtime is an optimization, not the state owner.

### Phase 5: Advanced Agents And Integrations

Goal: add specialist agents only after the platform loop is safe.

Work:

- OpenAI Agents SDK manager/specialist harness.
- Hermes production mode.
- Codex scoped coding workers.
- Miro bridge.
- GenUI approval surfaces.
- Preview router implementation.

Exit criteria:

- Every advanced integration writes canonical events and artifacts.
- Risky actions require policy and approvals.
- Tests/evals gate self-improvement.

## Testing Baseline

At the time of this audit, the following checks were run successfully:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm cloudflare:test
pnpm web:typecheck
pnpm web:build
pnpm infra:build
pnpm infra:synth
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

Passing these checks means the current repository is buildable. It does not mean
the architecture gaps above are closed.

## Definition Of Done For Future Work

Every implementation change should finish with:

- Code scoped to the correct plane.
- Tests matching the risk level.
- Contract validation when events, APIs, or payloads change.
- CDK synth/build validation when infra changes.
- Web build/typecheck when web changes.
- Flutter analyze/test when Flutter changes.
- Docs updated for behavior/status/architecture changes.
- A self-audit against `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`.

Do not mark roadmap tasks complete until code, tests, deployment state, and docs
all match the claim.
