# Next System Audit And Execution Plan

_Last updated: 2026-05-10_

## Purpose

This document consolidates the current audit findings into a practical execution
plan. It exists so future agents know what to do next and what not to do next.

The next phase is about making the existing smoke-capable platform safe,
tenant-aware, better organized, and ready for parallel work.

## Current Reality

The system is past planning:

- AWS CDK foundation is deployed.
- Control API exists.
- AWS-native WebSocket realtime exists.
- ECS runtime smoke/Hermes boundary exists.
- Web command center has live run-loop wiring.
- Flutter desktop/mobile app exists but is mostly shell/fixture behavior.
- WorkItems, DataSources, Surfaces, user-runner state tables, and agent
  instance state are being introduced.
- Cloudflare Durable Object realtime package exists but is not the primary
  production path yet.

The platform is not yet production-safe:

- no complete workspace membership authorization,
- no access-code signup gate,
- artifact/DataSource/Surface APIs are incomplete,
- runtime is one-shot smoke/Hermes mode, not resident user-runner mode,
- Cloudflare and AWS realtime protocols are not aligned,
- WorkItem web UI is fixture-backed,
- docs still conflict in places,
- dirty worktree contains multiple unrelated lanes.

## Deep Audit Findings 2026-05-10

Subagent audits confirmed these P0/P1 findings:

- `POST /runs` can accept a client-supplied `workspaceId` before a durable
  membership model exists.
- Cognito authentication is present, but Cognito groups and access-code signup
  gates are not wired.
- There are no durable `Users`, `Organizations`, `Workspaces`,
  `WorkspaceMemberships`, `AccessCodes`, or `AccessCodeRedemptions` tables yet.
- AWS-native realtime validates a token on connect, but `subscribeRun` must load
  the stored run and authorize membership before saving a subscription.
- Realtime currently passes an ID token in the WebSocket query string; short-lived
  scoped realtime tickets should replace that after membership checks land.
- Web has real run-loop wiring but still hardcodes `workspace-web` and has
  fixture-backed WorkItems.
- Flutter is a polished shell with config/helpers, but not a real signed-in
  Control API/realtime client yet.
- Cloudflare Durable Objects are not a client fallback yet because auth/session
  shape and message envelope do not match the AWS-native path.
- Preview hosting is the closest future integration, but still lacks preview
  routes, router implementation, runtime publisher, TTL cleanup, and live DNS.
- Miro, GitHub/source-control, specialist creation, and self-improvement all
  require credential brokering, protocol contracts, approval gates, and audit
  evidence before real side effects are enabled.

## Top Priority

Implement tenant-aware access control and access-code gating before expanding
agent capabilities.

Reason:

```text
Without access control:
  clients can overstate product readiness,
  realtime subscriptions can leak state,
  workspace IDs are too easy to spoof,
  autonomous workers can write under the wrong boundary,
  invite-only cost control is impossible.
```

## AWS Realtime Decision

Use AWS-native realtime as the primary path for now:

```text
DynamoDB EventsTable stream
  -> Realtime relay Lambda
  -> API Gateway WebSocket API
  -> web client live run events
```

Keep Cloudflare Durable Objects as an alternate/fallback path:

```text
AWS event relay
  -> Cloudflare Worker
  -> Durable Object fanout
  -> web/native clients
```

Cloudflare should not be deleted. It should be documented as a future/alternate
edge realtime plane until its protocol, auth, replay, and client integration
match the AWS-native path.

## Worktree Commit Plan

The current dirty tree should be committed in separate logical commits, not one
large mixed commit.

Recommended grouping:

1. **Docs: access control and system execution plan**
   - tenant authorization/access-code plan,
   - workstream docs,
   - `.agent.md` / `AGENTS.md` updates.

2. **Web: WorkItem fixture dashboard**
   - `apps/web/components/work-dashboard.tsx`
   - `apps/web/lib/work-items.ts`
   - `apps/web/test/work-items.test.ts`
   - related CSS and `command-center.tsx`

3. **Agent creator package**
   - `services/agent-creator/`
   - root `package.json` and lockfile script changes if they belong to that
     package.

4. **Proactive communication docs**
   - `docs/adr/0009-proactive-communication-plane.md`
   - proactive communication roadmap/audit docs.

5. **Workstream handoffs/plans**
   - agent harness current plan,
   - infrastructure proposal docs,
   - handoff notes.

Before committing implementation code, verify generated outputs are ignored and
not staged:

- `apps/web/.next/`
- `apps/web/out/`
- `apps/web/tsconfig.tsbuildinfo`
- `infra/cdk/cdk.out/`
- `dist/`
- `node_modules/`
- Flutter build outputs.

## Immediate Implementation Tasks

### Task 1: Tenant Access Control

Owner: Access Control + Infrastructure + Control API.

Implement:

- Cognito groups.
- Access code tables and redemption audit.
- Users/Organizations/Workspaces/WorkspaceMemberships.
- Pre-sign-up/redeem flow.
- `resolveAuthContext`.
- Membership checks for Control API routes.
- Realtime subscription authorization.

See:

- `docs/roadmap/TENANT_AUTHORIZATION_AND_ACCESS_CODES_PLAN_2026_05_10.md`
- `docs/agent-workstreams/access-control/README.md`

### Task 2: Docs Truth Reconciliation

Owner: Product Coordination.

Fix docs that still describe already-built pieces as missing.

Update:

- `docs/roadmap/PROJECT_STATUS.md`
- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
- `docs/roadmap/CODEBASE_ORIENTATION.md`
- `.agent.md`
- `AGENTS.md`

### Task 3: Product Resource APIs

Owner: Control API + Agent Harness + Clients.

Finish routes that are wired but still incomplete:

- artifact list/detail/download,
- DataSourceRef create/list/read,
- Surface create/update/list/read,
- approval request/decision flows,
- validated GenUI/A2UI surface packets.

### Task 4: Realtime Contract Alignment

Owner: Realtime Streaming.

Define one event/subscription contract that AWS-native realtime, Cloudflare,
web, and Flutter all share.

Must include:

- `subscribeRun`,
- future `subscribeWorkspace`,
- cursor/replay,
- gap detection,
- membership authorization,
- malformed message behavior,
- stale connection cleanup,
- fanout event format.

### Task 5: Resident User Runner V0

Owner: Agent Harness + Infrastructure.

Move from one-shot smoke worker toward resident user-runner control.

Implement/design:

- runner heartbeat,
- desired state,
- inbox,
- wake timers,
- snapshots,
- scoped runner token,
- logical agents inside user boundary,
- cancellation/resume/retry states.

### Task 6: Client Integration

Owner: Clients.

Web:

- replace WorkItem fixtures with real API calls,
- add workspace picker,
- add access-code flow,
- add artifact download/list UI,
- improve replay/gap repair UX.

Flutter:

- split monolithic `main.dart`,
- add real auth/session state,
- call Control API,
- poll first,
- attach standardized realtime client later.

## Critical Future Workstreams

These are important, but should not outrank tenant authorization and product
resource APIs.

1. Miro integration.
2. GitHub commit/PR workflow.
3. Wildcard preview hosting and preview-router.
4. Specialist agent creation.
5. Self-testing/self-improvement.
6. Cross-agent audit/quality phases.

Each has a workstream README under `docs/agent-workstreams/`.

Recommended future order after access control and product APIs:

1. Preview hosting V1, because the infrastructure is closest.
2. Specialist creation V0, deterministic and artifact/review-only.
3. GitHub/source-control V1, gated by credential broker and review policy.
4. Miro V1, gated by integration credential broker and board approval policy.
5. Self-improvement, after profile lifecycle and eval evidence exist.

## Cross-Agent Audit Rule

Every significant implementation lane must include an audit phase:

```text
Worker agent implements
  -> lane self-audit
  -> adjacent workstream audit
  -> product coordination audit
  -> validation matrix
  -> docs/status update
```

Examples:

- Access Control changes must be audited by Realtime and Clients.
- Runtime changes must be audited by Infrastructure and Protocol.
- Client GenUI changes must be audited by Protocol and Security/Access Control.
- Preview hosting changes must be audited by Infrastructure and Clients.

## Validation Matrix For Next Phase

Run after docs cleanup and before deployment:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
pnpm cloudflare:test
pnpm web:typecheck
pnpm web:test
pnpm web:build
pnpm agent-creator:test
pnpm infra:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

Run before deploy:

```bash
pnpm infra:diff
```

Only deploy after reviewing runtime Docker asset drift.
