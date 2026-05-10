# Agents Cloud Master Scope And Progress

_Last updated: 2026-05-09_

## Purpose

This is the current source-of-truth planning document for `agents-cloud`.
Read this before starting new implementation work.

The repository already contains deeper research and architecture documents. This
document consolidates that material into the practical path forward:

- what the platform is supposed to become,
- what has already been built,
- what is missing,
- what must be built next,
- which decisions are accepted,
- which decisions are still open,
- which tests and quality gates must exist before each phase is treated as done.

The main product goal is to architect and implement a CDK-backed cloud platform
that can run autonomous AI agent teams 24/7. The platform must support agent
teams that collaborate, delegate work, run in parallel, build software and
artifacts, perform deep research, create custom tools, commit code, run tests,
and improve safely over time.

## Product North Star

The user should be able to interact with the system like a CEO interacts with a
trusted executive assistant.

The CEO-style user issues a strategic command:

```text
Create a new product for X market.
Hire/build a marketing team for this workspace.
Research competitors and tell me the best next moves.
Build a preview website and publish it.
Summarize this Miro board and turn it into an execution plan.
```

The platform should then:

- clarify missing inputs only when needed,
- plan the work,
- delegate to specialist agents,
- run multiple workstreams in parallel,
- isolate risky or heavy work in dedicated ECS containers,
- report progress across web, desktop, and mobile clients,
- request approval before sensitive actions,
- generate artifacts such as documents, websites, dashboards, code changes,
  datasets, market reports, Miro boards, prototypes, and previews,
- test its own work,
- archive the full trace,
- produce an executive report with next steps.

The user should not have to manually manage every agent, container, test run, or
deployment. They should see a coherent command center with live status,
notifications, reports, approvals, artifacts, and generated UI.

## Core Architecture Decision

The platform is an agent operating system, not a loose chatbot swarm.

Accepted architecture boundary:

```text
Clients
  -> Cloudflare realtime plane for low-latency sync and WebSockets
  -> AWS Control API for durable commands
  -> DynamoDB / Step Functions / ECS / S3 for authoritative execution
  -> Event relay back to Cloudflare for live fanout
  -> Next.js and Flutter render the same canonical events and A2UI surfaces
```

AWS is the durable source of truth. Cloudflare is the realtime presentation and
coordination edge. ECS is the isolated execution plane. S3 is the durable
workspace/artifact ledger. Clients render state; clients do not own run truth.

## Current Verified State

The project has moved beyond pure planning. It has a real AWS foundation, a
green Amplify Auth sandbox, green Amplify Hosting, and a deployed Control API
first slice for durable run creation/querying.

Verified on 2026-05-09:

- `pnpm contracts:test` passed.
- `pnpm infra:build` passed.
- `pnpm infra:synth` passed.
- `pnpm --filter @agents-cloud/infra-amplify run typecheck` passed.
- `pnpm amplify:hosting:build` passed.
- `flutter analyze` passed for the Flutter console.
- `flutter test` passed for the Flutter console.
- Step Functions launched ECS Fargate and the smoke execution succeeded.
- `agents-cloud-dev-control-api` deployed successfully.
- Cloudflare realtime Worker/Durable Object package created under
  `infra/cloudflare/realtime`; `pnpm cloudflare:test` and Wrangler dry-run pass.
- Control API smoke: unauthenticated `POST /runs` returned `401`; deployed
  Lambda-created smoke run `run-362d8866-ac8e-4b00-82d2-6b7eddaca43e` wrote a
  DynamoDB run/event, started Step Functions execution
  `arn:aws:states:us-east-1:625250616301:execution:agents-cloud-dev-simple-run:run-362d8866-ac8e-4b00-82d2-6b7eddaca43e`, and the execution reached `SUCCEEDED`.

Current AWS environment:

- Account: `625250616301`
- Region: `us-east-1`
- Local AWS profile: `agents-cloud-source`
- Current CDK environment label: `dev`
- Important note: the user has asked to run this in a production-shaped mode
  without a dev/prod split. The deployed stack names still include `dev`.
  Treat this as the current single live environment until renamed intentionally.

## Repository Source Documents

Use these docs in this order:

1. `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
2. `docs/roadmap/PROJECT_STATUS.md`
3. `docs/adr/README.md`
4. `docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_EXA_AUDIT_ADDENDUM.md`
5. `docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md`
6. `docs/roadmap/AUTONOMOUS_AGENT_COMPANY_ARCHITECTURE.md`
7. `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md`
8. `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md`
9. `docs/roadmap/DESKTOP_MOBILE_BOILERPLATE_STATUS.md`
10. `docs/roadmap/DESKTOP_MOBILE_IMPLEMENTATION_PLAN.md`
11. `docs/roadmap/TESTFLIGHT_SETUP.md`
12. `docs/roadmap/WEB_APP_STATUS.md`
13. `docs/roadmap/SHADCN_FLUTTER_UI_SYSTEM.md`

The long roadmap and architecture docs are still useful, but this master
document and `PROJECT_STATUS.md` reflect the current implementation position.

## External Source References

The architecture has been shaped around the following public product/docs areas:

- Miro MCP intro: https://developers.miro.com/docs/mcp-intro
- Miro developer portal: https://developers.miro.com/
- Miro REST API overview: https://developers.miro.com/reference/overview
- Miro introduction: https://developers.miro.com/docs/introduction
- Miro Flows overview:
  https://help.miro.com/hc/en-us/articles/29681832191378-Flows-overview
- Miro Sidekicks overview:
  https://help.miro.com/hc/en-us/articles/29902701849618-Sidekicks-overview
- Miro Prototypes:
  https://help.miro.com/hc/en-us/articles/26654269713682-Miro-Prototypes
- Miro Create with AI:
  https://help.miro.com/hc/en-us/articles/20164358139794-Create-with-AI
- Cloudflare Durable Objects WebSocket hibernation:
  https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Objects limits:
  https://developers.cloudflare.com/durable-objects/platform/limits/
- OpenAI Codex CLI and ChatGPT sign-in help:
  https://help.openai.com/en/articles/11381614
- OpenAI Codex plan usage help:
  https://help.openai.com/en/articles/11369540

Current policy: linked Codex/ChatGPT auth may be useful for trusted private
runner mode later, but the production default should remain OpenAI API key or
service-account style auth unless terms, reliability, and security are all
validated for the exact deployment mode.

## Completion Ledger

### Completed

- [x] Monorepo organized with `apps`, `infra`, `packages`, `services`, `docs`,
  and `tests`.
- [x] Node 22 and pnpm workspace configured.
- [x] ADR set created for durable control plane, agent harness, realtime plane,
  workspace storage, GenUI protocol, Codex/OpenAI auth, and preview hosting.
- [x] Canonical protocol package created under `packages/protocol`.
- [x] JSON Schemas created for event envelope, run status, tool approval,
  artifact pointer, and A2UI delta wrapper.
- [x] Executable protocol schema validation added.
- [x] AWS CDK app created under `infra/cdk`.
- [x] `FoundationStack` implemented.
- [x] `NetworkStack` implemented with VPC, subnets, NAT, and gateway endpoints.
- [x] `StorageStack` implemented with live artifacts, audit log, preview static,
  and research dataset buckets.
- [x] `StateStack` implemented with run, task, event, artifact, approval, and
  preview deployment tables.
- [x] `ClusterStack` implemented with ECS cluster and log group.
- [x] `RuntimeStack` implemented with agent-runtime Fargate task definition and
  IAM grants.
- [x] `OrchestrationStack` implemented with Step Functions launching Fargate.
- [x] Step Functions to ECS smoke path verified.
- [x] Preview deployment registry table added.
- [x] Optional preview ingress CDK stack created and synth-validated with
  dummy domain inputs.
- [x] Amplify Gen 2 Auth sandbox deployed with Cognito email login.
- [x] Amplify Hosting app created and connected to the repository.
- [x] Amplify Hosting web build made green with explicit `amplify.yml`.
- [x] Amplify Next.js frontend plan documented.
- [x] Flutter console exists under `apps/desktop_mobile`
  with a command-center shell, planning pages, and local GenUI/A2UI preview.
- [x] Flutter app widget tests pass locally.
- [x] `ControlApiStack` deployed with API Gateway, Cognito JWT authorizer, and
  Lambda handlers for creating/querying runs.
- [x] Deployed Control API smoke-tested for unauthorized rejection, durable run
  creation, ordered event query, and Step Functions/ECS smoke execution.
- [x] Current project status documented in `PROJECT_STATUS.md`.

### Not Complete

- [x] Root `ControlApiStack` is built and deployed.
- [x] API Gateway and Lambda endpoints exist for creating/querying runs.
- [x] Cognito JWT authorizer is wired into the CDK platform backend.
- [ ] The runtime container has a smoke/Hermes path and does not yet call production models.
- [ ] Worker events are not fully canonical or retry-safe yet.
- [ ] Worker artifact writes are not fully canonical or retry-safe yet.
- [ ] EventBridge/SQS event movement is not implemented.
- [ ] Cloudflare Worker/Durable Object realtime plane is not deployed or wired
  to AWS event relay and clients yet.
- [ ] Next.js app needs full backend and realtime product integration.
- [ ] Production desktop/mobile app is not connected to Auth, Control
  API, Cloudflare realtime, notifications, or real A2UI event streams.
- [ ] A2UI/GenUI renderers are not implemented in either client.
- [ ] Codex CLI worker mode is not implemented.
- [x] Hermes worker mode first slice exists behind a `smoke` runner mode and
  deployed Hermes-runner boundary; real CLI/model mode is implemented in code but
  not enabled in ECS until scoped provider secrets are brokered.
- [ ] Miro OAuth/MCP/REST bridge is not implemented.
- [ ] GitHub App/OAuth integration for commits and PRs is not implemented.
- [ ] Specialist-agent creation workflow is not implemented.
- [ ] Self-testing/self-improvement quarantine is not implemented.
- [ ] CI/CD validation workflow is not implemented.
- [ ] Observability dashboards and alarms are not implemented.
- [ ] Security review, tenant isolation tests, and cost controls are not done.

## Architecture Plan By Plane

### Durable AWS Control Plane

Purpose:

- own run lifecycle truth,
- validate auth and authorization,
- persist task/event/artifact/approval state,
- orchestrate long-running work,
- launch isolated worker containers,
- preserve auditable execution records.

Current status:

- [x] CDK app exists.
- [x] Network/storage/state/cluster/runtime/orchestration stacks exist.
- [x] Step Functions to ECS path works.
- [x] Control API CDK/Lambda stack exists, deploys, and has an unauthenticated
  route smoke check returning `401` for `POST /runs` without a JWT.
- [ ] Authenticated Control API smoke test is still pending.
- [ ] Event bus/queues for canonical event fanout do not exist.
- [x] Real worker image pipeline first slice exists: CDK builds/pushes the
  `services/agent-runtime` Docker image as an ECR asset for the Fargate task.

Required next resources:

- [x] API Gateway HTTP API or REST API.
- [x] Lambda `CreateRunFunction`.
- [x] Lambda `GetRunFunction`.
- [x] Lambda `ListRunEventsFunction`.
- [x] Cognito JWT authorizer wired to Amplify Auth user pool.
- [x] IAM grants from API Lambdas to DynamoDB and Step Functions.
- [ ] Idempotency handling for `POST /runs`.
- [x] Server-assigned first event sequence allocation.
- [ ] EventBridge bus or SQS path for event propagation.
- [ ] DLQs for failed event relay and failed worker callbacks.

Acceptance criteria:

- [x] Authenticated JWT-shaped Lambda smoke event can call `POST /runs`.
- [x] API writes a run row and initial event row in the handler implementation.
- [x] API starts a Step Functions execution in the handler implementation.
- [x] API returns run id, status, and execution ARN.
- [x] `GET /runs/{runId}` returns durable status in the handler implementation.
- [x] `GET /runs/{runId}/events` returns ordered events with cursor support in the handler implementation.
- [x] Unauthorized user cannot read another user/workspace run in unit tests.
- [ ] Repeated idempotent create request does not create duplicate runs.
- [x] CDK synth/build pass.
- [x] Contract tests pass.

### ECS Execution Plane

Purpose:

- run each agent or agent team in dedicated ECS containers,
- isolate code execution and heavy browser/build/test workloads,
- support parallel work,
- support delegation to specialist containers,
- make workspaces reproducible and auditable.

Target worker classes:

- `agent-light`: planning, research, low-compute tool use.
- `agent-code`: coding agent with Git, tests, Codex/Hermes/OpenAI tools.
- `agent-builder-heavy`: websites, browser automation, Playwright, builds.
- `agent-eval`: regression tests, quality review, benchmark/eval jobs.
- `preview-app`: project-hosted websites and live previews.

Current status:

- [x] ECS cluster exists.
- [x] Real Fargate task definition first slice exists for `services/agent-runtime`.
- [x] Step Functions can launch the Hermes/smoke worker task.
- [ ] Separate worker classes are not defined.
- [x] Worker image is built/pushed through CDK ECR assets for the dev runtime.
- [x] Worker runtime protocol first slice is implemented.
- [ ] Workspaces are not materialized from S3/EFS.
- [x] Worker writes status, artifact metadata, S3 artifact, and terminal events in the deployed smoke path.

Required build items:

- [x] Define worker bootstrap contract: env vars, S3 pointers, run id, task id,
  workspace id, event sink, artifact sink.
- [x] Add minimal runtime worker package.
- [x] Add status event writer.
- [x] Add artifact writer.
- [x] Add structured logs with run/task/workspace correlation.
- [ ] Add cancellation polling.
- [ ] Add timeout handling.
- [ ] Add retry semantics with idempotency.
- [ ] Add worker role boundaries per worker class.
- [x] Add container image build/push workflow for the dev runtime ECR asset.
- [ ] Add basic egress policy and allowlist strategy for later.

Acceptance criteria:

- [x] Worker receives a run request.
- [x] Worker writes `running` status.
- [x] Worker writes a small artifact to S3.
- [x] Worker writes an artifact event.
- [x] Worker writes `succeeded` or `failed`.
- [x] Step Functions execution reflects terminal status.
- [x] Logs can be located by run id.
- [x] A failed worker produces a durable error event in unit tests; deployed failure smoke is still pending.

### Workspace And Artifact Storage

Purpose:

- store per-user, per-workspace, per-project artifacts,
- keep mutable working files separate from immutable audit records,
- support generated websites, documents, reports, datasets, code patches,
  Miro references, traces, and build outputs,
- allow hot POSIX workspaces only when necessary.

Accepted storage model:

- S3 is the durable ledger.
- EFS is optional hot mounted workspace storage for active workers.
- DynamoDB stores metadata and pointers.
- Large payloads use S3 object refs, not inline event payloads.

Current status:

- [x] Live artifacts bucket exists.
- [x] Immutable audit bucket exists with Object Lock enabled from creation.
- [x] Preview static bucket exists.
- [x] Research dataset bucket exists.
- [x] Artifact table exists.
- [ ] Per-user/per-workspace object key convention is not documented in code.
- [ ] Artifact registry API is not implemented.
- [ ] EFS hot workspace layer is not implemented.
- [ ] Lifecycle rules are not finalized.

Recommended S3 key shape:

```text
s3://workspace-live-artifacts/
  org/{orgId}/user/{userId}/workspace/{workspaceId}/project/{projectId}/
    runs/{runId}/artifacts/{artifactId}/{filename}

s3://workspace-audit-log/
  org/{orgId}/workspace/{workspaceId}/runs/{runId}/events/{seq}.json
  org/{orgId}/workspace/{workspaceId}/runs/{runId}/traces/{traceId}.jsonl

s3://preview-static/
  org/{orgId}/workspace/{workspaceId}/project/{projectId}/deployments/{deploymentId}/
    index.html
    assets/...

s3://research-datasets/
  org/{orgId}/workspace/{workspaceId}/datasets/{datasetId}/...
```

Storage TODOs:

- [ ] Encode key builders in a shared package.
- [ ] Enforce org/user/workspace path scoping in write helpers.
- [ ] Store object metadata: `orgId`, `userId`, `workspaceId`, `projectId`,
  `runId`, `artifactId`, `contentType`, `sha256`.
- [ ] Add lifecycle policies for temporary build outputs.
- [ ] Add retention policy for immutable audit logs.
- [ ] Add bucket metrics and alarms.
- [ ] Add tests for cross-user/workspace access denial.

### Cloudflare Realtime Plane

Purpose:

- synchronize web, mobile, and desktop clients,
- keep live messages, status, notifications, approvals, and generated UI in sync,
- handle WebSocket fanout at low latency,
- replay recent events,
- repair gaps from AWS durable state,
- avoid placing durable execution truth at the edge.

Target components:

- Worker HTTP/WebSocket gateway.
- `UserHubDO` for per-user active sessions and notifications.
- `WorkspaceDO` for workspace-scoped presence, run stream cursors, and A2UI
  surface fanout.
- `SessionDO` if individual sessions need isolated transient state.
- Queue for small command envelopes from Cloudflare to AWS.
- Signed AWS-to-Cloudflare publisher endpoint for live event fanout.

Current status:

- [x] Architecture decision accepted.
- [x] `infra/cloudflare` realtime package exists.
- [ ] Wrangler project does not exist.
- [ ] Durable Objects do not exist.
- [ ] WebSocket endpoints do not exist.
- [ ] AWS event relay does not exist.
- [ ] Reconnect/gap repair protocol does not exist.

Recommended implementation order:

- [ ] Build raw Durable Objects first unless Cloudflare Agents SDK removes real
  work without hiding required control.
- [ ] Add `/ws` endpoint that validates JWT or signed session token.
- [ ] Add join/leave/ping/pong and cursor messages.
- [ ] Add server fanout from AWS event publisher.
- [ ] Add gap repair by fetching from Control API when a sequence is missing.
- [ ] Add client compatibility tests for Next.js and Flutter.
- [ ] Add hibernation-friendly connection handling.

Acceptance criteria:

- [ ] Two clients for the same user/workspace receive the same event.
- [ ] Desktop/mobile/web clients see consistent messages and notifications.
- [ ] Disconnect/reconnect resumes from a provided cursor.
- [ ] Missing event sequence triggers durable fetch from AWS.
- [ ] Cloudflare never becomes the only place an event exists.
- [ ] Replay and fanout behavior is covered by tests.

### Web, Desktop, And Mobile Clients

Purpose:

- offer a synchronized command center across web, desktop, and mobile,
- let the user command agents, inspect work, approve actions, view artifacts,
  receive notifications, and interact with generated UI.

Client stack:

- Next.js for web.
- Flutter for desktop and mobile.
- Amplify Auth/Cognito for initial identity.
- Control API for durable commands and queries.
- Cloudflare WebSockets for live updates.
- A2UI/GenUI-compatible rendering for agent-generated interfaces.

Current status:

- [x] Amplify Hosting web build is live.
- [x] Amplify Auth sandbox exists.
- [x] Frontend plan exists.
- [x] Flutter console exists under `apps/desktop_mobile`.
- [x] Flutter app currently has passing `flutter analyze` and
  `flutter test`.
- [ ] `apps/web-next` is README-only.
- [ ] `apps/flutter` is README-only.
- [ ] No login UI exists.
- [ ] No dashboard exists.
- [ ] No event stream UI exists.
- [ ] No A2UI renderer exists.

Web app initial screens:

- [ ] Sign in/sign up.
- [ ] Workspace picker or default workspace.
- [ ] CEO command box.
- [ ] Run list.
- [ ] Run detail with status timeline.
- [ ] Artifact list.
- [ ] Approval queue.
- [ ] Notifications.
- [ ] Generated UI surface panel.
- [ ] Preview website links.
- [ ] Miro board links.

Flutter initial screens:

- [ ] Sign in.
- [ ] Command center.
- [ ] Run timeline.
- [ ] Notifications.
- [ ] Approval review.
- [ ] Artifact viewer for common artifact kinds.
- [ ] A2UI surface renderer subset.
- [ ] Offline/reconnect state.

Acceptance criteria:

- [ ] Same user can sign in on web and Flutter.
- [ ] A command sent from one client appears on the other.
- [ ] A run status update appears on all connected clients.
- [ ] Approval requested on one client can be resolved and reflected everywhere.
- [ ] A generated A2UI surface renders from an allowlisted catalog.
- [ ] Clients do not render arbitrary untrusted components.

### GenUI / A2UI Surface Layer

Purpose:

- let agents produce dynamic dashboards, forms, reports, tables, charts,
  approvals, and workflow-specific controls,
- render those surfaces consistently across Next.js and Flutter,
- allow client interaction to flow back to the agent as structured events.

Current decision:

- Use A2UI-style messages wrapped inside the platform canonical event envelope.
- Keep a server-validated, allowlisted component catalog.
- Treat arbitrary UI generation as untrusted until validated.

Current status:

- [x] A2UI delta schema exists.
- [ ] Payload validation is still too loose.
- [ ] No renderer exists.
- [ ] No catalog exists.
- [ ] No interaction protocol exists.

Required next work:

- [ ] Define the first component catalog: text, markdown, stat card, table,
  chart surface, artifact link, approval form, status timeline.
- [ ] Bind event `type` to payload schema.
- [ ] Tighten A2UI schema validation.
- [ ] Add negative fixtures and malformed payload tests.
- [ ] Add TypeScript type generation.
- [ ] Add Dart model generation.
- [ ] Add renderer compatibility fixtures.
- [ ] Add approval-required actions for dangerous operations.

Acceptance criteria:

- [ ] Invalid catalog id is rejected server-side.
- [ ] Unknown component is rejected server-side.
- [ ] Client action emits a structured event with idempotency key.
- [ ] Same fixture renders equivalently in web and Flutter.
- [ ] Large data models are stored by reference, not embedded in hot events.

### Agent Harness And Specialist Creation

Purpose:

- provide a reliable harness for autonomous teams,
- support deep research,
- create specialist agents on demand,
- test agent outputs,
- improve agent definitions through a gated process.

Recommended harness posture:

- Use OpenAI Agents SDK-style manager/specialist orchestration where useful.
- Use Hermes as an isolated ECS worker runtime target.
- Use Codex CLI as a coding tool in dedicated coding containers when auth and
  policy are validated.
- Keep platform lifecycle truth in AWS instead of inside any one harness.
- Treat harnesses as pluggable executors behind the platform run/task protocol.

Specialist creation flow:

```text
User asks for a specialist
  -> executive assistant creates specialist brief
  -> research phase gathers domain knowledge and success criteria
  -> harness creates agent definition, tools, evals, and permissions
  -> quarantine test runs validate behavior
  -> user approves promotion
  -> specialist becomes available in the workspace
```

Examples:

- Marketing strategist.
- Competitive analyst.
- Product manager.
- Research analyst.
- Frontend engineer.
- Backend engineer.
- QA/eval engineer.
- Miro board designer.
- SEO/content specialist.
- Fundraising analyst.

Current status:

- [x] ADR selects the general harness posture.
- [ ] No agent manager service exists.
- [ ] No specialist registry exists.
- [ ] No agent definition format exists.
- [ ] No eval suite exists.
- [ ] No promotion/quarantine workflow exists.

Required next work:

- [ ] Define `AgentDefinition` schema.
- [ ] Define `ToolPolicy` schema.
- [ ] Define specialist registry DynamoDB table or table entity.
- [ ] Add research brief artifact format.
- [ ] Add eval plan artifact format.
- [ ] Add agent capability manifest.
- [ ] Add agent versioning and promotion states.
- [ ] Add tests that compare specialist output against accepted rubrics.
- [ ] Add rollback and disable controls.

Acceptance criteria:

- [ ] Specialist creation produces a durable agent definition artifact.
- [ ] Specialist has explicit tools, scopes, budget, and allowed workspaces.
- [ ] Specialist cannot be promoted without passing eval gates.
- [ ] Specialist changes are versioned and auditable.
- [ ] Failed specialists remain quarantined.

### Code, GitHub, Codex, And Build Work

Purpose:

- let agents safely modify code, run tests, commit, open PRs, and publish
  previews.

Current status:

- [x] Target architecture recognizes isolated code workers.
- [ ] GitHub App/OAuth integration is not implemented.
- [ ] Repository checkout/mount workflow is not implemented.
- [ ] Codex CLI auth/worker mode is not implemented.
- [ ] Commit/PR workflow is not implemented.
- [ ] Sandbox/network policy is not implemented.

Required build items:

- [ ] GitHub credential/linking model.
- [ ] Per-workspace repository registry.
- [ ] Worker checkout strategy.
- [ ] Branch naming policy.
- [ ] Commit signing/author policy.
- [ ] PR creation and update tool.
- [ ] Test command discovery and allowlist.
- [ ] Build artifact capture.
- [ ] Patch/diff review artifact.
- [ ] Approval gate before pushing to protected branches.
- [ ] Secret redaction and exfiltration checks.

Codex/OpenAI auth policy:

- [ ] Default production path uses API key/service-account style auth.
- [ ] Linked Codex/ChatGPT auth is optional and private/trusted-runner only
  until policy and operational constraints are verified.
- [ ] No Codex session is shared across users or tenants.
- [ ] User-linked credentials must be encrypted, scoped, revocable, and audited.

### Miro Integration

Purpose:

- let agents read and write Miro boards,
- create diagrams, prototypes, flows, and visual collaboration artifacts,
- use Miro boards as context for product/design/research work.

Integration shape:

- Miro OAuth for user/team authorization.
- Miro MCP for agent-native board operations when appropriate.
- Miro REST API for predictable backend operations and artifact sync.
- Miro bridge service to isolate credentials and rate limits.

Current status:

- [x] Source docs identified.
- [x] Service package boundary exists.
- [ ] OAuth app/callback is not implemented.
- [ ] Miro token storage is not implemented.
- [ ] MCP broker is not implemented.
- [ ] REST helper is not implemented.
- [ ] Miro artifacts are not linked into run events.

Required build items:

- [ ] Miro OAuth callback endpoint.
- [ ] Per-user/per-workspace Miro team binding.
- [ ] Secrets Manager storage for Miro tokens.
- [ ] Short-lived token broker for agents.
- [ ] Rate-limited queue for Miro writes.
- [ ] Board read/summarize tool.
- [ ] Board create/update tool.
- [ ] Artifact event type for Miro board references.
- [ ] Approval gate for destructive or broad Miro writes.

Acceptance criteria:

- [ ] User can connect Miro.
- [ ] Agent can summarize a selected board.
- [ ] Agent can create a board artifact.
- [ ] Board links appear in run artifacts.
- [ ] Miro token is never exposed directly to arbitrary agent code.

### Preview Website Hosting

Purpose:

- let agents build websites and host many previews concurrently,
- expose previews through wildcard domains such as `xyz.domain.com`,
- support multiple projects at the same time with different domains.

Accepted approach:

- Use one wildcard ingress and preview-router rather than per-project ALB rules.
- Static preview assets can live in S3.
- Dynamic previews can route to preview containers later.
- Route53 wildcard DNS and ACM wildcard certificate are required for live custom
  preview domains.

Current status:

- [x] Preview static S3 bucket exists.
- [x] Preview deployments DynamoDB table exists.
- [x] Optional preview ingress stack is created.
- [ ] Base domain is not selected.
- [ ] Route53 hosted zone is not wired.
- [ ] ACM wildcard certificate is not deployed.
- [ ] Preview-router currently uses a temporary nginx image.
- [ ] Control API endpoint to register previews does not exist.

Required next work:

- [ ] Choose preview base domain.
- [ ] Confirm Route53 owns DNS or migrate DNS.
- [ ] Deploy ACM certificate.
- [ ] Deploy wildcard ALB/Route53 ingress.
- [ ] Implement preview-router lookup from `PreviewDeploymentsTable`.
- [ ] Add preview registration endpoint.
- [ ] Add preview artifact writer in worker.
- [ ] Add preview health checks and expiry/cleanup.

Acceptance criteria:

- [ ] Worker registers a preview deployment.
- [ ] `project.domain.com` routes to the registered preview.
- [ ] Unknown subdomain returns a controlled 404.
- [ ] Expired preview is no longer served.
- [ ] Preview URL appears in run artifacts.

## Phased Implementation Plan

### Phase 0: Documentation And Repo Alignment

Goal: keep the repo organized and current before implementation
continues.

Status:

- [x] Monorepo structure exists.
- [x] ADRs exist.
- [x] Long roadmap docs exist.
- [x] Current status doc exists.
- [x] Master scope/progress doc exists.
- [x] Root `AGENTS.md` exists.
- [ ] Docs remain to be audited continuously as implementation changes.

Exit criteria:

- [ ] `README.md` points to this master doc first.
- [ ] `docs/README.md` and `docs/roadmap/README.md` point to this master doc.
- [ ] `CODEBASE_ORIENTATION.md` reflects actual CDK/Amplify progress.
- [ ] `FOUNDATION_NEXT_STEPS.md` reflects the post-CDK next step.

### Phase 1: Control API And Durable Run Lifecycle

Goal: make the deployed platform app-callable.

Build:

- [ ] `ControlApiStack`.
- [ ] API Gateway.
- [ ] Cognito JWT authorizer.
- [ ] Lambda handlers for run creation and queries.
- [ ] DynamoDB data access layer.
- [ ] Step Functions start integration.
- [ ] Cursor-based event query.
- [ ] Contract fixtures for API responses.

Testing:

- [ ] Unit tests for request validation.
- [ ] Unit tests for auth claims to tenant/workspace scope.
- [ ] Unit tests for DynamoDB item shapes.
- [ ] Contract tests for event envelope and status events.
- [ ] CDK synth/build tests.
- [ ] Deployed smoke test: `POST /runs` starts an ECS task.
- [ ] Deployed smoke test: `GET /runs/{runId}/events` returns ordered events.

Exit criteria:

- [ ] A signed-in user can start a run from API tooling.
- [ ] The ECS worker runs.
- [ ] Run reaches a terminal state.
- [ ] Events can be queried durably.

### Phase 2: Runtime Hardening

Goal: harden the agent-runtime task with a small worker that proves the full
runtime contract.

Build:

- [ ] Worker package and Dockerfile.
- [ ] Run context loader.
- [ ] Status event writer.
- [ ] Artifact writer.
- [ ] Failure event writer.
- [ ] Structured logs.
- [ ] Container image build/push flow.

Testing:

- [ ] Worker unit tests.
- [ ] Local container run test.
- [ ] Deployed ECS task smoke test.
- [ ] Artifact object exists in S3.
- [ ] Event rows exist in DynamoDB.
- [ ] CloudWatch logs include run id.

Exit criteria:

- [ ] API-created run launches worker.
- [ ] Worker writes an artifact.
- [ ] Worker marks run succeeded or failed.

### Phase 3: Event Spine And Cloudflare Realtime

Goal: make live client sync real.

Build:

- [ ] EventBridge/SQS fanout path.
- [ ] Event relay Lambda or Worker publisher.
- [ ] `infra/cloudflare` Wrangler project.
- [ ] Durable Object session/workspace implementation.
- [ ] WebSocket protocol.
- [ ] Signed AWS-to-Cloudflare publish endpoint.
- [ ] Replay and gap repair.

Testing:

- [ ] Durable Object unit tests where possible.
- [ ] WebSocket integration test.
- [ ] Reconnect/gap repair test.
- [ ] AWS publisher signature validation test.
- [ ] Backpressure and duplicate event tests.

Exit criteria:

- [ ] Live run status appears on a connected WebSocket client.
- [ ] Two clients see the same event stream.
- [ ] Reconnect resumes from cursor.

### Phase 4: Next.js Command Center

Goal: give the user the first usable web dashboard.

Build:

- [ ] Next.js App Router package under `apps/web-next`.
- [ ] Amplify Auth client setup.
- [ ] Authenticated shell.
- [ ] Create run form.
- [ ] Runs list.
- [ ] Run detail timeline.
- [ ] Artifact list.
- [ ] WebSocket live updates.
- [ ] A2UI surface renderer.

Testing:

- [ ] Typecheck.
- [ ] Unit tests for API client.
- [ ] Component tests for run timeline.
- [ ] Playwright smoke: sign-in shell renders.
- [ ] Playwright smoke: run detail receives mocked events.
- [ ] Amplify Hosting build.

Exit criteria:

- [ ] User can sign in.
- [ ] User can create a run.
- [ ] User can watch run status update.

### Phase 5: Flutter Desktop And Mobile

Goal: build the synchronized non-web clients.

Build:

- [x] Flutter app under `apps/desktop_mobile`.
- [ ] Amplify/Cognito auth integration.
- [ ] Control API client.
- [ ] WebSocket client.
- [ ] Run list and run detail.
- [ ] Notification surface.
- [ ] Approval surface.
- [ ] A2UI subset renderer.

Testing:

- [ ] Dart model generation from protocol.
- [ ] Widget tests for command center.
- [ ] Integration test with mocked WebSocket.
- [ ] Desktop smoke build.
- [ ] Mobile smoke build.

Exit criteria:

- [ ] Same account can sign in on Flutter and web.
- [ ] Messages and run status synchronize across clients.

### Phase 6: Specialist Agents And Harness Runtime

Goal: create real autonomous agent teams instead of a single test worker.

Build:

- [ ] Executive assistant orchestrator.
- [ ] Agent manager service.
- [ ] Specialist registry.
- [ ] Agent definition schema.
- [ ] Tool policy schema.
- [ ] Research planner.
- [ ] Specialist creation workflow.
- [ ] Delegation workflow.
- [ ] Parallel task fanout.
- [ ] Consolidated executive report.

Testing:

- [ ] Agent definition schema tests.
- [ ] Tool policy authorization tests.
- [ ] Delegation workflow tests.
- [ ] Eval fixtures for marketing/research/coding specialists.
- [ ] Quarantine/promotion tests.

Exit criteria:

- [ ] User can ask for a specialist.
- [ ] System creates a researched, tested specialist definition.
- [ ] Specialist can be delegated a scoped task.
- [ ] Results are reported back through canonical events.

### Phase 7: Coding, Codex, GitHub, And Build Agents

Goal: let agents safely build real software.

Build:

- [ ] Coding worker image.
- [ ] GitHub App/OAuth integration.
- [ ] Repository checkout.
- [ ] Branch/commit/PR workflow.
- [ ] Test command runner.
- [ ] Codex CLI integration for trusted private mode.
- [ ] Build artifact upload.
- [ ] Patch review artifacts.
- [ ] Protected action approvals.

Testing:

- [ ] Repo checkout tests.
- [ ] Branch/commit tests.
- [ ] Test-runner tests.
- [ ] Secret redaction tests.
- [ ] PR creation integration test against a test repo.
- [ ] Codex session expiry/refusal tests before enabling linked mode.

Exit criteria:

- [ ] Agent can modify a test repo.
- [ ] Agent can run tests.
- [ ] Agent can produce a diff artifact.
- [ ] Agent can open a PR after approval.

### Phase 8: Preview Hosting

Goal: let agents publish generated websites and apps under wildcard domains.

Build:

- [ ] Preview base domain.
- [ ] Route53 hosted zone wiring.
- [ ] ACM wildcard cert.
- [ ] Preview ingress deployment.
- [ ] Preview router service.
- [ ] Preview registration endpoint.
- [ ] Static preview writer.
- [ ] Dynamic preview task class.

Testing:

- [ ] Router lookup unit tests.
- [ ] Unknown host test.
- [ ] Registered host test.
- [ ] Expiry cleanup test.
- [ ] Browser smoke test for generated website.

Exit criteria:

- [ ] Agent publishes a website artifact.
- [ ] Wildcard subdomain serves it.
- [ ] Preview link appears in web and Flutter clients.

### Phase 9: Miro Integration

Goal: make Miro a first-class agent collaboration/artifact surface.

Build:

- [ ] Miro OAuth app.
- [ ] Callback and token storage.
- [ ] Miro bridge service.
- [ ] Miro MCP broker path.
- [ ] Miro REST helper path.
- [ ] Board read/summarize tool.
- [ ] Board create/update tool.
- [ ] Miro artifact event integration.

Testing:

- [ ] OAuth callback tests.
- [ ] Token scope/refresh tests.
- [ ] Rate limit handling tests.
- [ ] Mock Miro API tests.
- [ ] Live sandbox board smoke test.

Exit criteria:

- [ ] User connects Miro.
- [ ] Agent reads a board.
- [ ] Agent creates or updates a board after approval.
- [ ] Board links appear in reports/artifacts.

### Phase 10: Self-Testing And Self-Improvement

Goal: let the system improve agent definitions without unsafe self-modification.

Build:

- [ ] Eval harness.
- [ ] Rubric library.
- [ ] Regression dataset store.
- [ ] Quarantine environment.
- [ ] Promotion workflow.
- [ ] Rollback workflow.
- [ ] Human approval gates.
- [ ] Drift and quality monitoring.

Testing:

- [ ] Eval reproducibility tests.
- [ ] Regression tests for promoted agents.
- [ ] Failed-promotion tests.
- [ ] Rollback tests.
- [ ] Prompt injection tests.

Exit criteria:

- [ ] Agent improvements are proposed as versioned artifacts.
- [ ] Improvements cannot be promoted without passing evals.
- [ ] Promotion is auditable and reversible.

## Testing And Quality Strategy

Testing must be designed into the platform rather than added after the fact.

### Required Test Layers

- [ ] Protocol/schema tests: validate canonical event envelopes and payloads.
- [ ] Contract fixture tests: verify examples stay backward-compatible.
- [ ] CDK build/synth tests: keep infrastructure deployable.
- [ ] CDK assertion tests: verify security-sensitive resources and grants.
- [ ] Lambda unit tests: validate API behavior and auth claims.
- [ ] Worker unit tests: validate runtime contract and failure behavior.
- [ ] Container smoke tests: verify worker images boot locally.
- [ ] Deployed AWS smoke tests: verify API to Step Functions to ECS to DynamoDB
  to S3 path.
- [ ] Cloudflare WebSocket tests: verify fanout, replay, hibernation-safe
  behavior, and gap repair.
- [ ] Client tests: verify Next.js and Flutter render the same fixtures.
- [ ] E2E tests: create run, watch status, view artifact, approve action.
- [ ] Security tests: tenant isolation, unauthorized access, token handling,
  prompt/tool injection, secret redaction.
- [ ] Agent evals: domain-specific quality gates for specialist agents.
- [ ] Observability smoke tests: logs, metrics, alarms, traces are emitted.
- [ ] Cost guard tests: budget alarms, max task concurrency, runaway run
  prevention.

### Current Tests

- [x] `pnpm contracts:test`
- [x] `pnpm infra:build`
- [x] `pnpm infra:synth`
- [x] `pnpm --filter @agents-cloud/infra-amplify run typecheck`
- [x] `pnpm amplify:hosting:build`
- [x] `flutter analyze` in `apps/desktop_mobile`
- [x] `flutter test` in `apps/desktop_mobile`
- [x] Manual deployed Step Functions to ECS smoke execution.

### Missing Test Coverage

- [ ] Negative protocol fixtures.
- [ ] Event `type` to payload schema binding tests.
- [ ] Contract tests for `payloadRef` behavior.
- [ ] CDK assertion tests.
- [ ] Lambda unit tests.
- [ ] Worker tests.
- [ ] Cloudflare tests.
- [ ] Client tests.
- [ ] E2E tests.
- [ ] Security/tenant isolation tests.

## Immediate Next Implementation Slice

The next practical build slice should be:

```text
Control API V1
  -> authenticated create-run endpoint
  -> durable run/event rows
  -> Step Functions execution start
  -> ordered event query
  -> smoke test from API to ECS
```

Do not start with advanced Miro, Codex, Hermes, Flutter, or full GenUI work until
the platform can create and observe a run through a real API. Those features
need the run ledger, event schema, auth boundary, and worker lifecycle.

Recommended task order:

1. Tighten protocol package.
2. Add `ControlApiStack`.
3. Add Lambda handlers and data access.
4. Wire Cognito JWT validation.
5. Add API smoke scripts or tests.
6. Harden agent-runtime worker path.
7. Add event spine.
8. Add Cloudflare realtime.
9. Add Next.js dashboard.
10. Add Flutter clients.

## Decisions Still Open

These need explicit decisions before or during the next implementation phases:

- [ ] Keep stack name environment label as `dev` for the live single environment
  or rename to `prod` and migrate/redeploy deliberately.
- [ ] Choose preview base domain.
- [ ] Confirm whether Route53 already owns the selected domain.
- [ ] Choose raw Durable Objects versus Cloudflare Agents SDK for V1.
- [ ] Decide Control API shape: HTTP API + Lambda is the recommended V1.
- [ ] Decide event relay shape: Lambda publisher is the recommended V1.
- [ ] Decide whether Amplify backend remains in `infra/amplify` or moves to
  repo-root `amplify/` for branch deploy convenience.
- [ ] Decide exact Codex linked-auth policy after official terms and operational
  behavior are validated.
- [ ] Decide first supported GitHub mode: GitHub App is recommended for
  multi-user, OAuth/PAT only for private trusted-runner usage.
- [ ] Decide EFS timing: defer until a worker truly needs mounted POSIX
  semantics.
- [ ] Decide which A2UI component catalog is allowed in the first client release.

## Main Risks

- [ ] Building flashy clients before the durable run lifecycle exists.
- [ ] Letting Cloudflare become the source of truth for execution state.
- [ ] Treating Codex/ChatGPT linked auth as a production billing backbone before
  policy and reliability are proven.
- [ ] Letting arbitrary generated UI execute in clients without allowlisted
  catalogs and server validation.
- [ ] Giving agent containers broad credentials or shared user tokens.
- [ ] Skipping per-user/per-workspace storage scoping.
- [ ] Creating specialist agents without evals, quarantine, and promotion gates.
- [ ] Running 24/7 workers without concurrency, budget, timeout, and cancellation
  controls.
- [ ] Storing large payloads directly in hot realtime events.
- [ ] Letting Miro/GitHub/web content become trusted prompt context without
  injection defenses.

## Definition Of MVP

The MVP is not "all agents are perfect." The MVP is a reliable vertical slice:

- [ ] User signs in.
- [ ] User creates a run from the web app.
- [ ] Control API creates durable run/event records.
- [ ] Step Functions launches an isolated ECS worker.
- [ ] Worker writes status and artifact records.
- [ ] User sees status and artifact in the web app.
- [ ] Realtime updates work in at least one client.
- [ ] A generated preview website can be registered and viewed.
- [ ] Basic approval gate exists for sensitive actions.
- [ ] Logs and artifacts are tied to the run id.
- [ ] Tests prove the end-to-end path.

After that MVP, build the richer CEO assistant behavior, specialist creation,
Miro, Flutter, Codex/Hermes, and self-improvement layers on top of a real
platform spine.
