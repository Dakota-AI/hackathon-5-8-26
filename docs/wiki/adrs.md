# Architecture Decision Records (Summary)

[← wiki index](README.md)

> Index and summary of every ADR under `docs/adr/`. ADRs are the historical decision log; this page maps each to its current implementation reality.

---

## ADRs at a glance

| # | Title | Status | Date | Implemented? |
|---|---|---|---|---|
| 0001 | [Platform Control Plane](#adr-0001-platform-control-plane) | Accepted | 2026-05-09 | ✅ yes |
| 0002 | [Agent Harness](#adr-0002-agent-harness) | Accepted | 2026-05-09 | ⚠️ partial |
| 0003 | [Realtime Plane](#adr-0003-realtime-plane) | Accepted | 2026-05-09 | ⚠️ AWS-side; Cloudflare deferred |
| 0004 | [Workspace Storage](#adr-0004-workspace-storage) | Accepted | 2026-05-09 | ⚠️ S3 yes; EFS deferred |
| 0005 | [GenUI Protocol](#adr-0005-genui-protocol) | Accepted | 2026-05-09 | ⚠️ schema yes; renderers no |
| 0006 | [External Assistant Auth](#adr-0006-external-assistant-auth) | Accepted | 2026-05-09 | ⚠️ partial |
| 0007 | [Preview Hosting](#adr-0007-preview-hosting) | Accepted | 2026-05-09 | ⚠️ stack yes; router no |
| 0008 | [User Runner Placement](#adr-0008-user-runner-placement) | Accepted | 2026-05-10 | ⚠️ tables yes; scheduler no |
| 0009 | [Proactive Communication Plane](#adr-0009-proactive-communication-plane) | Accepted | 2026-05-10 | ❌ not implemented |
| 0010 | [Tenant Access Control & Access Codes](#adr-0010-tenant-access-control--access-codes) | Accepted | 2026-05-10 | ❌ not implemented (🗑️ skip for hackathon) |

---

## ADR-0001: Platform Control Plane
**Status:** Accepted · 2026-05-09 · ✅ implemented

AWS DynamoDB + Step Functions + EventBridge + SQS as the durable control plane for autonomous runs that survive client disconnects and worker failures.

**Tradeoffs:** in-memory frameworks inadequate for durability; Cloudflare owns realtime only, not run truth.

**Reality:** All 14 DynamoDB tables exist in [StateStack](infrastructure/stacks.md#statestack). Step Functions `simple-run` exists in [OrchestrationStack](infrastructure/stacks.md#orchestrationstack). EventBridge/SQS not yet used by any code path.

---

## ADR-0002: Agent Harness
**Status:** Accepted · 2026-05-09 · ⚠️ partial

Primary orchestration harness manages manager/specialist agents, handoffs, guardrails, human review, and tool wiring; isolated ECS workers for specialist execution.

**Tradeoffs:** specialist runtimes add value but must not own multi-tenant SaaS concerns; coding tools scoped to workspace containers.

**Reality:** Stateless worker exists and runs on ECS. Resident runner image + TaskDef exist but **nothing calls `ecs:RunTask` for them**. Harness manager/specialist coordination only exists in the `local-harness.ts` simulation. See [agent-runtime](services/agent-runtime.md), [local-harness reference](reference/local-harness.md).

---

## ADR-0003: Realtime Plane
**Status:** Accepted · 2026-05-09 · ⚠️ AWS-side implemented; Cloudflare deferred

Cloudflare Workers + Durable Objects for low-latency WebSocket sync (UserHub, Workspace, Session, Notification, RateLimiter DOs); AWS DynamoDB as authoritative event ledger.

**Tradeoffs:** single-threaded Durable Objects unsuitable for permanent storage; large payloads via S3 pointers.

**Reality:** AWS-native realtime ([RealtimeApiStack](infrastructure/stacks.md#realtimeapistack)) is the live primary path. Cloudflare scaffold exists at `infra/cloudflare/realtime/` but is not deployed. 🗑️ Cloudflare skipped for hackathon.

---

## ADR-0004: Workspace Storage
**Status:** Accepted · 2026-05-09 · ⚠️ S3 yes; EFS deferred

S3 as durable workspace ledger split by mutability: live-artifacts (mutable versioned), audit-log (Object Lock append-only), preview-static, research-datasets. EFS only for hot POSIX workspaces.

**Tradeoffs:** S3 not POSIX but durable; EFS cost/throughput; prefix/ABAC before Access Points.

**Reality:** All four S3 buckets exist in [StorageStack](infrastructure/stacks.md#storagestack). EFS not provisioned. Audit log Object Lock + RETAIN policy in place.

---

## ADR-0005: GenUI Protocol
**Status:** Accepted · 2026-05-09 · ⚠️ schema yes; renderers no

A2UI v0.8 as GenUI baseline wrapped in canonical event envelope; agents emit only approved catalogs; server-side validators reject unknown components and invalid actions.

**Tradeoffs:** agents cannot ship arbitrary React/JavaScript/Flutter; custom components must be registered.

**Reality:** `a2ui.delta` event schema exists in `packages/protocol/`. Validator does not exist. Web has no renderer. Flutter has local seed only. See [generated-ui surface](surfaces/generated-ui.md).

---

## ADR-0006: External Assistant Auth
**Status:** Accepted · 2026-05-09 · ⚠️ partial

API-key/service-account auth as production default; user-linked auth deferred until trusted-runner model in place; track usage regardless of mode.

**Tradeoffs:** user-linked auth adds risk without trustworthy runner isolation; billing model must precede.

**Reality:** Cognito JWT works for human users. API-key/service-account auth not implemented in any service. Usage tracking does not exist. ResidentRunner provider-key sandboxing is the closest current implementation (`buildAdapterEnvironment` strips provider keys before subprocess, gated by `AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT`).

---

## ADR-0007: Preview Hosting
**Status:** Accepted · 2026-05-09 · ⚠️ stack yes; router no

Wildcard ingress (`*.domain.com`) routed to a preview-router software registry serving static S3, long-lived ECS services, short-lived tasks, archived responses.

**Tradeoffs:** software registry replaces per-project ALB scaling; strong tenant checks critical.

**Reality:** [PreviewIngressStack](infrastructure/stacks.md#previewingressstack-optional) is buildable but disabled. Container is upstream nginx — no real routing logic. `services/preview-router/` is README only. 🗑️ Skip for hackathon.

---

## ADR-0008: User Runner Placement
**Status:** Accepted · 2026-05-10 · ⚠️ tables yes; scheduler no

One resident user runner per user hosting many logical agents; local Docker + ECS placement with S3 durable workspace; 1 vCPU/3 GiB balanced class; no premium tiers yet.

**Tradeoffs:** one container per agent too expensive; resident runners essential for proactive UX; local capacity must fall back to ECS.

**Reality:** `HostNodesTable`, `UserRunnersTable`, `RunnerSnapshotsTable`, `AgentInstancesTable` provisioned. CRUD endpoints exist. ResidentRunner image + Fargate TaskDef built. **No placement scheduler — nothing calls `ecs:RunTask` against the resident family.** See [multi-user-routing](flows/multi-user-routing.md), [agent-runtime](services/agent-runtime.md). This is the #1 hackathon blocker.

---

## ADR-0009: Proactive Communication Plane
**Status:** Accepted · 2026-05-10 · ❌ not implemented

First-class communication objects (`CommunicationThread`, `CommunicationItem`, `AgentMessage`, `CallRequest`, `CallSession`, `AudioMessage`, `Notification`) in AWS; agents emit semantic tools, broker decides delivery.

**Tradeoffs:** push/call platforms are delivery only, not truth; PushKit/CallKit/FCM/APNs managed by broker; PSTN deferred; agents never call APIs directly.

**Reality:** **None of these tables exist in StateStack.** No broker service. Notifications surface is empty across the stack. See [approvals-and-notifications surface](surfaces/approvals-and-notifications.md). 🗑️ Defer for hackathon.

---

## ADR-0010: Tenant Access Control & Access Codes
**Status:** Accepted · 2026-05-10 · ❌ not implemented (🗑️ skip)

Cognito tokens + groups gate access; platform user profiles + workspace membership; access codes for private onboarding; durable access entities (`Users`, `Organizations`, `Workspaces`, `WorkspaceMemberships`, `AccessCodes`, `AccessCodeRedemptions`).

**Tradeoffs:** signup becomes product flow not raw Cognito; more table reads needed; tests must cover denial/concurrency.

**Reality:** **None of these tables or Lambda triggers exist.** No Cognito group claims read anywhere. The hackathon model is simpler: `userId` from JWT → table-routing on DynamoDB queries. Owner-scoped reads are already in every handler. 🗑️ **Skip entirely** per hackathon scope. See [gaps](gaps.md), [multi-user-routing](flows/multi-user-routing.md).

---

## Themes

### Infrastructure & compute
ADRs 0001, 0003, 0007, 0008 — AWS owns durable state, Cloudflare owns realtime fanout, previews use a software registry, runners are per-user.

### Security & multi-tenancy
ADRs 0002, 0006, 0010 — Cognito groups + workspace membership + API keys. **Most of this is design-only for hackathon.**

### Execution & communication
ADRs 0002, 0008, 0009 — Manager/specialist harness, resident runners, proactive communication broker. Resident runner unwired; communication plane unimplemented.

### Storage & artifacts
ADRs 0004, 0005 — S3-split-by-mutability + A2UI GenUI protocol.

---

## Implementation mismatches (most important)

1. **ADR-0008 vs reality:** State tables provisioned, but no actuator. The single biggest delta. See [HACKATHON_CRITICAL_PATH#2](HACKATHON_CRITICAL_PATH.md#2).
2. **ADR-0009 vs reality:** Communication plane tables don't exist. Notifications surface empty. See [approvals-and-notifications](surfaces/approvals-and-notifications.md).
3. **ADR-0010 vs reality:** Access codes / Workspaces / Memberships don't exist. **Hackathon explicitly skips this** in favor of userId table-routing.
4. **ADR-0005 vs reality:** A2UI event schema exists, no producer or renderer.
5. **ADR-0007 vs reality:** Stack builds, container is placeholder nginx.

[← wiki index](README.md) · [→ HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md)
