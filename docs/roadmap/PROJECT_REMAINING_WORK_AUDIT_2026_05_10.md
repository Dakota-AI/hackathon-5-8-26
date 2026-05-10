# Project Remaining Work Audit

Date: 2026-05-10
Status: Current implementation audit

## Executive Summary

The repository has a solid platform foundation, but it is not yet the full
proactive multi-agent product.

What exists today:

- pnpm monorepo with protocol, backend, infra, web, and Flutter packages,
- AWS CDK foundation for Control API, state tables, orchestration, runtime, and
  optional preview hosting,
- a smoke-capable ECS runtime path,
- a Next.js command center shell,
- a Flutter desktop/mobile shell,
- a Cloudflare realtime Worker package,
- architecture decisions for durable AWS state, realtime fanout, workspace
  storage, generated UI validation, preview hosting, and user runner placement.

What is still missing:

- production WorkItem APIs and product surfaces above raw runs,
- tenant/workspace authorization beyond the first user-owned run checks,
- resident user-runner control plane and local host supervisor,
- production runner snapshot/restore, heartbeat, placement, and scoped tokens,
- real agent runtime behavior beyond smoke/report mode,
- artifact browsing/download APIs,
- approval and notification workflows,
- generated UI validation/rendering connected to live work state,
- deployed realtime integration through the web and Flutter clients,
- CI/CD gates that prove docs, infra, backend, and clients stay aligned.

The most important next work is to make the current durable run loop product
shaped: WorkItem -> Run -> Events -> Artifacts -> Realtime -> Client UI.

## Decisions Locked

These decisions are now accepted and should guide implementation:

- AWS is the durable source of truth.
- Cloudflare is realtime fanout/sync only.
- DynamoDB, S3, Step Functions, and ECS own execution truth.
- S3 remains the durable workspace, artifact, and snapshot store for now.
- EFS is deferred until the product proves it needs hot shared POSIX workspace
  semantics.
- The initial execution boundary is one resident runner container per user.
- Each user runner can host many logical agents for that user.
- The first runner class is balanced for everyone: 1 vCPU, 3 GiB memory, 8 GiB
  local disk budget, up to 10 logical agents, and up to 3 active agent actions.
- Local Docker and ECS are placement targets for the same runner contract.
- User runner containers must not receive the host Docker socket.
- Heavy or risky work should go through a supervised execution path.
- Generated UI must be validated server-side against allowed schemas and
  component catalogs.
- Agent credentials must be scoped to a user/workspace/runtime boundary.

## Documentation Status

Current, useful documentation:

- `README.md` gives the top-level orientation and next slice.
- `AGENTS.md` gives repository instructions, quality gates, and implementation
  rules for AI agents working in the repo.
- `docs/PROJECT_STRUCTURE.md` explains where code and docs belong.
- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md` defines self-audit and validation
  expectations.
- `docs/adr/` contains the accepted architecture decisions.
- `docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md` captures the local/ECS
  user-runner plan.
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md` and
  `docs/roadmap/PROJECT_STATUS.md` are intended to be the current status source
  of truth.

Documentation that needs cleanup:

- Some current-status sections disagree about whether realtime and product smoke
  paths are deployed or still pending.
- Some legacy roadmap/audit docs still describe exploratory reference material
  instead of the current internal product plan.
- Some old docs mention research tooling or reference-project context that
  should be removed or rewritten into internal product requirements.
- Package-level READMEs are uneven; several services need concrete runtime,
  testing, environment, and deployment notes.
- There is no single API reference for Control API routes, request/response
  shapes, authorization rules, and error contracts.
- There is no single state model reference for Runs, Events, Tasks, WorkItems,
  Artifacts, DataSources, Surfaces, HostNodes, UserRunners, AgentInstances, and
  RunnerSnapshots.
- There is no local host supervisor operations guide yet.
- There is no ECS user-runner operations guide yet.

## Current Code Setup

### Protocol

`packages/protocol` is the shared contract package. It validates canonical run,
event, artifact, and generated UI payload shapes. This is the right contract
source for backend, runtime, web, and Flutter clients.

Remaining work:

- add WorkItem, DataSource, Surface, HostNode, UserRunner, AgentInstance,
  RunnerHeartbeat, and RunnerSnapshot schemas,
- keep generated UI schemas strict enough that clients can render safely,
- publish examples for every public event and payload.

### Control API

`services/control-api` currently supports the first run lifecycle slice:

- create a run,
- query a run,
- query run events,
- list admin runs.

The infrastructure now also provisions WorkItem, Artifact, DataSourceRef, and
Surface routes, but those handlers intentionally return not-implemented
responses. The DynamoDB store still only loads and uses the run/task/event table
set.

Remaining work:

- implement WorkItem APIs,
- implement artifact list/download APIs,
- implement data-source reference APIs,
- implement generated surface APIs,
- add approval APIs,
- add notification preferences and delivery status APIs,
- add user-runner placement and heartbeat APIs,
- add workspace membership checks,
- return client-safe 400 errors for malformed JSON,
- keep route and Lambda environment tests aligned with CDK.

### Agent Runtime

`services/agent-runtime` is currently smoke/report shaped. It can emit status,
events, and artifacts, which proves the orchestration path, but it is not yet a
resident proactive runner.

Remaining work:

- split short job execution from resident user-runner execution,
- add logical agent registry/state inside a user runner,
- add wake timers, wait states, approvals, and delegation,
- add S3 snapshot/restore,
- add heartbeat and stale-runner handling,
- add scoped runtime tokens,
- add real model/tool/provider execution behind a credential boundary,
- make retry, resume, cancel, timeout, and duplicate event behavior explicit.

### Infrastructure

`infra/cdk` defines the AWS foundation for state, orchestration, runtime,
Control API, Auth, and preview hosting.

Completed hardening:

- the runtime Docker image asset has strict CDK excludes,
- the repo-level `.dockerignore` excludes local env files, research folders,
  generated outputs, caches, and unrelated source trees,
- regenerated `infra/cdk/cdk.out` no longer contains local env files, research
  folders, or private local folders,
- generated CDK output dropped from 5.9 GiB to 1.4 MiB.

Remaining work:

- implement the WorkItem/DataSource/Surface handlers behind the provisioned
  Control API routes,
- add user-runner tables and indexes,
- add local-host placement records,
- add ECS user-runner service/task definitions,
- add scoped task roles for user runners,
- add alarms for failed executions, stale runners, failed snapshots, and high
  runtime error rates.

### Realtime

`infra/cloudflare/realtime` contains the realtime Worker/Durable Object package.
It has useful tests and matches the desired split: durable truth stays in AWS,
realtime fanout stays in Cloudflare.

Remaining work:

- connect the AWS event stream to realtime fanout,
- enforce workspace membership for subscriptions,
- add replay behavior against the durable event ledger,
- connect the web and Flutter clients to deployed realtime endpoints,
- add operational metrics for connections, subscriptions, dropped events, and
  replay failures.

### Web

`apps/web` is a Next.js command center shell. It builds and has tests.

Remaining work:

- connect authenticated sessions to real Control API calls,
- show WorkItems as the primary user-facing work objects,
- show run ledger/events/artifacts under each WorkItem,
- add approval and notification surfaces,
- render validated generated UI from server payloads,
- connect realtime updates,
- add error, empty, loading, permission denied, and offline states.

### Flutter

`apps/desktop_mobile` is a Flutter desktop/mobile shell using the selected UI
system. Analyze and tests pass.

Remaining work:

- connect real auth,
- connect Control API and realtime,
- mirror the same WorkItem, Run, Event, Artifact, Approval, and Notification
  concepts as the web client,
- add platform-specific notification handling,
- add mobile-safe generated UI rendering rules.

## Validation Snapshot

Passing validation:

- `pnpm contracts:test`
- `pnpm control-api:test`
- `pnpm agent-runtime:test`
- `pnpm realtime-api:test`
- `pnpm web:test`
- `pnpm web:build`
- `pnpm web:typecheck` after regenerating the Next.js build output
- `pnpm infra:synth`
- `pnpm --filter @agents-cloud/infra-cdk test`
- `pnpm --filter @agents-cloud/infra-amplify run typecheck`
- `cd apps/desktop_mobile && flutter analyze`
- `cd apps/desktop_mobile && flutter test`

Failing validation:

- none in the latest local validation snapshot.

Known failure reasons:

- The Control API route/provisioning test now passes, but the product routes
  still return not-implemented responses until their handlers and store methods
  are built.

## Critical Fixes Before More Implementation

### 1. Finish WorkItem Infrastructure

The repo has begun adding WorkItem/Generated UI state, but it is incomplete.

Fix:

- keep Control API table env vars, IAM grants, and routes wired,
- replace not-implemented handlers with real WorkItem, Artifact, DataSourceRef,
  and Surface handlers,
- add DynamoDB store methods for the new tables,
- add WorkItem request validation,
- add WorkItem authorization,
- connect run creation to an optional or required WorkItem,
- keep infra tests green as handlers are implemented.

### 2. Add Workspace Authorization

The current product boundary is not strong enough for multi-tenant use.

Fix:

- add workspace membership model,
- enforce membership in Control API reads and writes,
- enforce membership before realtime subscription,
- ensure artifact access is signed and scoped,
- add denial tests.

### 3. Improve API Error Handling

Malformed JSON should return a client-safe 400, not a generic failure.

Fix:

- wrap JSON parsing in Control API handlers,
- return structured validation errors,
- add tests for invalid JSON and missing body cases.

### 4. Reconcile Docs

Docs need one current status story.

Fix:

- update status docs to agree on deployed vs pending paths,
- remove or rewrite old reference-heavy audit docs,
- add API and state model references,
- keep README, docs index, ADR index, and AGENTS in sync.

## Next Product Implementation Order

1. Finish the WorkItem layer in Control API and CDK until product routes return
   real responses.
2. Add workspace membership enforcement and denial tests.
3. Add artifact list/download APIs with signed access.
4. Add realtime subscription authorization and AWS-to-realtime relay.
5. Add the UserRunner/HostNode/Placement/Snapshot data model.
6. Build the local host supervisor MVP.
7. Add ECS Fargate user-runner service support.
8. Add runner heartbeat, stale detection, snapshot, and restore.
9. Connect web UI to WorkItems, runs, events, artifacts, approvals, and
    realtime.
10. Connect Flutter to the same product contracts.
11. Add notification workflow and delivery status.
12. Add generated UI validator/renderer for live WorkItem dashboards and tools.

## Work That Can Happen In Parallel

These workstreams can move independently if contracts are agreed first:

- WorkItem API implementation.
- Protocol schema expansion for WorkItems, user runners, artifacts, approvals,
  notifications, and generated UI.
- Web WorkItem/run/artifact UI against mock data.
- Flutter WorkItem/run/artifact UI against mock data.
- Realtime subscription auth and relay design.
- Local host supervisor scaffold.
- Documentation cleanup and API/state reference docs.
- CI workflow setup.

Do not parallelize changes that alter the same contract without first landing
the schema update in `packages/protocol`.

## Definition Of Ready For The Hackathon Demo

The demo is ready when a user can:

- sign in,
- create a WorkItem,
- see a run start,
- watch ordered events update live,
- inspect artifacts,
- approve or reject at least one gated action,
- receive at least one notification,
- see a generated UI surface validated and rendered by the client,
- resume state after a worker restart or runner restore.

The local machine can be the first resident-runner host. ECS remains the cloud
fallback once the same runner contract works locally.
