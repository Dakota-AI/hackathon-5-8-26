# Agents Cloud Codebase Orientation

Date: 2026-05-09
Status: Current repository orientation

## What This Repository Is

`agents-cloud` is the foundation repository for an autonomous AI agent cloud
platform. The target system is an agent operating system: a user gives strategic
CEO-style commands, the platform plans work, delegates to specialist agents,
runs isolated ECS workers, streams progress to every client, requests approvals,
archives artifacts, and improves agent definitions through tested promotion
workflows.

This is not yet a finished product application. It contains a deployed AWS CDK
foundation, a deployed Amplify Auth sandbox, a working web build path, a first
Control API slice, a first ECS agent-runtime package, an AWS-native realtime
slice, a Cloudflare realtime fallback package, and protocol contracts.

Read these first:

- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/roadmap/PROJECT_STATUS.md`
- `docs/adr/README.md`
- `docs/roadmap/FOUNDATION_NEXT_STEPS.md`

## Current Concrete Implementation

Implemented:

- pnpm monorepo root with Node 22 requirement.
- `packages/protocol` package with JSON Schemas and validation script.
- AWS CDK app under `infra/cdk`.
- Deployed CDK stacks for foundation, network, storage, state, cluster,
  runtime, and orchestration.
- Agent runtime Fargate task definition.
- Step Functions state machine that launches ECS Fargate.
- Successful Step Functions to ECS smoke execution.
- Control API stack with create/query run endpoints and Cognito JWT authorizer.
- AWS-native realtime stack with API Gateway WebSocket handlers and DynamoDB
  stream relay.
- Agent runtime package under `services/agent-runtime`.
- Agent creator workshop prototype under `services/agent-creator`.
- Preview deployment registry table.
- Optional preview ingress stack.
- Amplify Gen 2 Auth backend under `infra/amplify`.
- Deployed Amplify Auth sandbox with Cognito email login.
- Amplify Hosting build through root `amplify.yml`.
- Flutter console under `apps/desktop_mobile` with a
  command-center shell, planning pages, and local GenUI/A2UI preview.
- Next.js command center under `apps/web`.
- Cloudflare Worker/Durable Object realtime package under
  `infra/cloudflare/realtime` with health, WebSocket route, internal event relay
  endpoint, Cognito JWT helpers, and run-scoped `SessionHubDO` fanout. This is
  an alternate/fallback path, not the current primary realtime implementation.
- Planning docs and ADRs.

Not implemented:

- Production-grade run lifecycle hardening.
- Production model/provider runtime policy.
- Event relay.
- Product-grade replay/gap repair and optional Cloudflare fallback integration.
- Production Flutter auth/API/realtime integration.
- A2UI/GenUI renderers.
- Codex/Hermes worker integrations.
- Miro bridge.
- GitHub commit/PR integration.
- Specialist-agent creation and self-improvement workflows.

## Verified Commands

From repository root:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

These commands were verified on 2026-05-09.

## Top-Level Map

```text
agents-cloud/
  apps/
    desktop_mobile/
                     Flutter command-center app
    web/
                     Next.js web command center
  packages/
    protocol/        canonical event schemas and validator
  services/
    control-api/     API for run creation/query/callbacks and product routes
    agent-manager/   planned ECS scheduler/lifecycle service
    agent-creator/   adaptive specialist profile workshop prototype
    agent-runtime/   Hermes/OpenAI agent worker runtime wrapper
    builder-runtime/ planned build/test/browser-heavy runtime
    preview-router/  planned wildcard project preview router
    event-relay/     planned AWS-to-Cloudflare event relay
    miro-bridge/     planned Miro OAuth/REST/MCP bridge
  infra/
    cdk/             current AWS CDK foundation
    cloudflare/      planned Workers/Durable Objects/Queues realtime plane
    amplify/         current Amplify Gen 2 Auth backend
  docs/
    adr/             accepted architectural decisions
    roadmap/         source-of-truth status, roadmap, and plans
    research/        source research reports
  tests/
    contract/        intended cross-package protocol tests
```

## Architectural Spine

The key rule is separation of durable execution from realtime presentation.

- AWS is the durable source of truth.
- Cloudflare is the realtime fanout and sync layer.
- ECS runs heavy, long-running agent, coding, build, test, browser, and eval
  workloads.
- S3 stores durable workspaces, artifacts, audit records, previews, and research
  datasets.
- EFS is deferred until mounted POSIX workspace semantics are truly needed.
- DynamoDB records authoritative run, task, event, artifact, approval, and
  preview deployment state.
- Step Functions orchestrates durable run lifecycles and ECS task launch.
- Amplify Auth/Cognito is the initial product identity layer.
- Clients render canonical events and A2UI surfaces; they do not own run truth.

## Accepted ADRs

1. `0001-platform-control-plane`: AWS owns durable control plane state. Cloudflare
   must not own durable run truth.
2. `0002-agent-harness`: OpenAI Agents SDK-style orchestration, Hermes as an
   isolated ECS worker target, Codex CLI as a coding tool where policy and auth
   allow, with AWS as lifecycle truth.
3. `0003-realtime-plane`: Cloudflare Workers plus Durable Objects or Cloudflare
   Agents SDK for realtime sync, with DynamoDB/S3 authoritative.
4. `0004-workspace-storage`: S3 for durable artifact ledger; EFS only for hot
   mounted POSIX workspaces.
5. `0005-genui-protocol`: A2UI-style messages wrapped in platform events and
   restricted by allowlisted component catalogs.
6. `0006-codex-openai-auth`: API key/service-account style auth as production
   default; linked Codex/ChatGPT auth only later for trusted private runners.
7. `0007-preview-hosting`: One wildcard ingress path and preview-router service
   instead of per-project ALB listener rules.

## Protocol Package

`packages/protocol` currently owns:

- Event envelope schema.
- Run status payload schema.
- Tool approval payload schema.
- Artifact payload schema.
- A2UI delta wrapper schema.
- Example run-status event.
- AJV schema validation script.

Known protocol gaps:

- [ ] Event `type` is not strongly bound to one payload schema.
- [ ] `payloadRef` behavior is not fully modeled for large payload replacement.
- [ ] Negative fixtures are missing.
- [ ] A2UI body validation is intentionally loose.
- [ ] TypeScript and Dart model generation are not implemented.
- [ ] Replay/gap-repair contract tests are not implemented.

## Current CDK Stack Shape

Default current stack ids:

- `agents-cloud-dev-foundation`
- `agents-cloud-dev-network`
- `agents-cloud-dev-storage`
- `agents-cloud-dev-state`
- `agents-cloud-dev-cluster`
- `agents-cloud-dev-runtime`
- `agents-cloud-dev-orchestration`

Important note: the current environment label is `dev`, but the user has asked
to proceed without a dev/prod split. Treat the existing environment as the
single live environment unless an explicit migration/rename is planned.

## Intended Data Flow

```text
Client command
  -> Control API
  -> AWS Control API
  -> DynamoDB run/task records
  -> Step Functions run state machine
  -> ECS worker starts
  -> Worker emits status/artifact/approval/A2UI events
  -> DynamoDB/S3 store durable truth
  -> EventBridge/SQS/Lambda event relay pushes small envelopes to Cloudflare
  -> Durable Object fans out over WebSocket
  -> Flutter and Next.js render canonical event stream and A2UI surfaces
```

The web app can call the Control API directly while realtime fanout is being
hardened. AWS remains durable truth and the API shape must stay compatible with
later realtime fanout.

## What Is Next

The highest-priority backend work is hardening the durable run loop: canonical
events, idempotent run creation, retry-safe worker sequencing, and workspace
authorization.

Recommended next implementation sequence:

1. Tighten protocol gaps that affect the API.
2. Add `ControlApiStack`.
3. Add authenticated `POST /runs`.
4. Add `GET /runs/{runId}`.
5. Add `GET /runs/{runId}/events`.
6. Start the existing Step Functions state machine from the API.
7. Harden the agent-runtime worker path.
8. Add event relay and Cloudflare realtime.
9. Add Next.js command center.
10. Add Flutter clients.
11. Add Codex/Hermes/Miro/A2UI richness after the run lifecycle is real.

## Practical Warning

Do not start by building the most visible pieces first. Miro, Codex, Hermes,
Flutter, specialist agents, and generated dashboards all depend on the same
core path:

```text
create run
  -> schedule worker
  -> emit status
  -> write artifact
  -> persist event
  -> query/stream status
```

The fastest path to the real product is to make that path boring, durable,
tested, and observable.
