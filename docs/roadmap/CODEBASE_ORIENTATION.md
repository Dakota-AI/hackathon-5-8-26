# Agents Cloud Codebase Orientation

Date: 2026-05-09
Status: Orientation snapshot generated from current repository state

## What This Repository Is

`agents-cloud` is currently a foundation/planning workspace for an autonomous AI agent cloud platform. It is not yet a working application. The committed implementation is mostly documentation, architecture decisions, and a small protocol/schema package.

The intended product is an agent operating system: a user issues high-level goals, the platform plans work, dispatches isolated specialist workers, streams progress to clients, requests approval for risky actions, archives artifacts, and promotes/evaluates improved agent definitions safely.

## Current Concrete Implementation

The current implemented code is:

- pnpm monorepo root with Node 22 requirement.
- `packages/protocol` package with JSON Schemas for the canonical event envelope and first event payloads.
- AJV-based schema validation script.
- Example run-status event fixture.
- Directory skeletons for apps, services, infrastructure, and tests.
- ADRs and roadmap docs describing the target architecture.

There is no CDK app yet, no Cloudflare Worker code yet, no Control API service code yet, no AgentManager service code yet, no Flutter app code yet, and no Next.js app code yet.

## Verified Commands

From repository root:

```bash
pnpm install --frozen-lockfile
pnpm contracts:test
```

Result observed: `Protocol schemas validated.`

## Size Snapshot

Excluding `.git`, `node_modules`, and `.research`, pygount reported:

- 48 files total
- 35 Markdown files
- 10 JSON files
- 1 JavaScript file
- 1 YAML file
- 333 code lines
- 2423 Markdown/comment lines

This confirms the repo is architecture-first and contract-first, not application-code-heavy yet.

## Top-Level Map

```text
agents-cloud/
  apps/
    web-next/        planned Next.js web client
    flutter/         planned Flutter desktop/mobile client
  packages/
    protocol/        current canonical schemas and schema validator
  services/
    control-api/     planned app/control API
    agent-manager/   planned ECS scheduler/lifecycle service
    agent-runtime/   planned Hermes/OpenAI agent worker runtime wrapper
    builder-runtime/ planned build/test/browser-heavy runtime
    preview-router/  planned wildcard project preview router
    event-relay/     planned AWS-to-Cloudflare event relay
    miro-bridge/     planned Miro OAuth/REST/MCP bridge
  infra/
    cdk/             planned AWS CDK foundation
    cloudflare/      planned Workers/Durable Objects/Queues realtime plane
    amplify/         planned product-facing Amplify integration
  docs/
    adr/             accepted architectural decisions
    roadmap/         main implementation plan and next steps
    research/        source research reports
  tests/
    contract/        intended protocol compatibility tests
```

## Architectural Spine

The key architectural rule is separation of durable execution from realtime presentation:

- AWS is the durable source of truth.
- Cloudflare is the realtime fanout/sync layer.
- ECS runs heavy, long-running agent/code/build/eval workloads.
- S3 is the durable artifact/workspace ledger.
- EFS is only the hot POSIX filesystem layer when agents need mounted workspace semantics.
- DynamoDB records authoritative run/task/event/artifact/approval state.
- Step Functions orchestrates durable run lifecycles and ECS callbacks.
- Clients render canonical events and A2UI surfaces; they do not own run truth.

## Accepted ADRs

1. `0001-platform-control-plane`: Use AWS DynamoDB, Step Functions, EventBridge/SQS, ECS, and S3 as durable control plane. Cloudflare must not own durable run truth.
2. `0002-agent-harness`: Use OpenAI Agents SDK for manager/specialist orchestration, Hermes as selected isolated ECS worker runtime, Codex CLI as MCP-backed coding tool, AWS for durable lifecycle truth.
3. `0003-realtime-plane`: Use Cloudflare Workers plus Durable Objects or Cloudflare Agents SDK for realtime sync; keep AWS DynamoDB/S3 authoritative.
4. `0004-workspace-storage`: S3 for durable artifact ledger; EFS only for hot mounted POSIX workspaces. Split mutable artifacts, immutable audit log, preview static, and research datasets.
5. `0005-genui-protocol`: Use A2UI v0.8 stable wrapped in the platform event envelope; allowlisted component catalogs only.
6. `0006-codex-openai-auth`: Use OpenAI API-key/service-account auth as production default; linked Codex/ChatGPT auth only later for trusted private runners.
7. `0007-preview-hosting`: Use one wildcard ingress path and a preview-router service instead of per-project ALB listener rules/target groups.

## Protocol Package

`packages/protocol` is the only actual package with logic today.

Schemas:

- `schemas/event-envelope.schema.json`
  - Required: `id`, `type`, `seq`, `createdAt`, `orgId`, `userId`, `workspaceId`, `runId`, `source`, `payload`.
  - Supports optional `projectId`, `taskId`, `correlationId`, `idempotencyKey`, and `payloadRef`.
  - `seq` is server-assigned and monotonically increasing within a run or stream.
  - `source.kind` enum: `control-api`, `agent-manager`, `worker`, `cloudflare`, `client`, `system`.

- `schemas/events/run-status.schema.json`
  - Status enum: `queued`, `planning`, `waiting_for_approval`, `running`, `testing`, `archiving`, `succeeded`, `failed`, `cancelled`.
  - Worker class enum: `agent-light`, `agent-code`, `agent-builder-heavy`, `agent-eval`, `preview-app`.

- `schemas/events/tool-approval.schema.json`
  - Models both request and decision payloads.
  - Risk enum: `low`, `medium`, `high`, `critical`.
  - Decision enum: `approved`, `rejected`.

- `schemas/events/artifact.schema.json`
  - Artifact kind enum includes document, website, dataset, report, diff, miro-board, log, trace, other.
  - Supports URI, content type, preview URL, sha256, bytes, and metadata.

- `schemas/events/a2ui-delta.schema.json`
  - Wraps A2UI messages by `surfaceId` and `catalogId`.
  - Current allowed message forms: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`.
  - Action policy enum: `none`, `auto`, `approval-required`.

## Main Data Flow Intended

```text
Client command
  -> Cloudflare Worker / realtime edge command envelope
  -> AWS Control API
  -> DynamoDB run/task records
  -> Step Functions run state machine
  -> AgentManager chooses worker class
  -> ECS worker starts
  -> Worker emits status/artifact/approval/A2UI events
  -> DynamoDB/S3 store durable truth
  -> EventBridge/SQS/Lambda event relay pushes small envelopes to Cloudflare
  -> SessionDO/WorkspaceDO fans out over WebSocket
  -> Flutter and Next.js render canonical event stream and A2UI surfaces
```

## What Is Next

The repository's own `FOUNDATION_NEXT_STEPS.md` says the highest-value next part is not the full platform at once. It is the contract and control-plane skeleton that every later stack, service, and client depends on.

Recommended next implementation sequence:

1. Tighten/freeze protocol contracts.
2. Scaffold AWS CDK foundation.
3. Add storage/state stacks.
4. Add Control API skeleton.
5. Add AgentManager scheduling skeleton.
6. Add one simple Fargate worker that writes a test artifact and status event.
7. Add event relay to Cloudflare.
8. Add tiny Next.js status console.
9. Add Flutter protocol client.
10. Only after this, add Codex/Hermes/Miro/A2UI richness.

## Immediate Build Step

The next concrete code-building step should be:

```bash
pnpm install --frozen-lockfile
pnpm contracts:test
# then scaffold infra/cdk as a TypeScript CDK app
# then add FoundationStack, StorageStack, StateStack, and dev environment config
# then run cdk synth
```

## Practical Warning

Do not start by building the flashy agent UI, Hermes worker, Codex worker, or Miro bridge. Those will need the event schema, run ledger, storage model, and state-machine lifecycle underneath them. The fastest path to a real product is a boring but verifiable first run path: create run -> schedule worker -> emit status -> write artifact -> persist event -> stream status.
