# Roadmap

[← wiki index](README.md) · related: [HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md), [adrs](adrs.md), [gaps](gaps.md)

> Post-hackathon plan. What comes after the demo, organized by phase.

---

## Phase 0 — Hackathon scope (current focus)

See [HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md) for the active critical path. Goal: multiple users running agents concurrently, one ECS resident container per user.

Key items:
1. Real model invocation in worker
2. Per-user resident runner dispatch
3. Resident runner durable persistence
4. WorkDashboard live data on web
5. Artifacts/Approvals/GenUI worker producers (now that backend routes exist)

---

## Phase 1 — Post-hackathon hardening

Once the demo runs:

### Auth & multi-tenancy
- [ ] Implement [ADR-0010](adrs.md#adr-0010-tenant-access-control--access-codes): Users / Organizations / Workspaces / WorkspaceMemberships tables
- [ ] AccessCodes + AccessCodeRedemptions for private onboarding
- [ ] Cognito groups (`agents-cloud-user`, `-admin`, `-suspended`, `-internal`)
- [ ] Pre-sign-up Lambda triggers
- [ ] Workspace-scoped permission checks on every route (replace single-workspace `"workspace-web"` hack)
- [ ] Move `ADMIN_EMAILS` from CDK source to a Cognito group claim

### Observability
- [ ] CloudWatch dashboards (run throughput, error rate, p99 latency)
- [ ] Metric filters → alarms on failed runs, stalled queues
- [ ] Distributed tracing (X-Ray) across HTTP → SFN → ECS → DDB
- [ ] Structured logging with correlation ids (already in worker; extend to handlers)

### Reliability
- [ ] Replace hardcoded seq numbers in `worker.ts` with monotonic counter
- [ ] CAS on run/task status updates
- [ ] Step Functions Catch/Retry policy with exponential backoff
- [ ] Dead-letter queue for permanently failed runs
- [ ] `runTask.sync` retry handling
- [ ] Runner snapshot/restore via `RunnerSnapshotsTable`

### Quality gates
- [ ] CI/CD pipeline (GitHub Actions) running test + synth + diff on every PR
- [ ] Protocol schema golden examples (producer/consumer fixtures)
- [ ] CDK IAM least-privilege assertions
- [ ] e2e suite under `tests/` covering create→execute→subscribe→render
- [ ] Load tests covering 100+ concurrent users
- [ ] Frontend integration tests (Playwright)

---

## Phase 2 — Capability expansion

### Real agent runtime
- [ ] Provider secret broker (Secrets Manager + IAM session policy per task)
- [ ] Tool execution sandbox: cgroups, network egress policy, FS scoping
- [ ] Tool catalog service (replace ad-hoc tool name strings)
- [ ] `tool.call` / `tool.completed` event types in `packages/protocol/`
- [ ] Per-tool rate limit + budget enforcement
- [ ] MCP discovery + dynamic-server validation

### Resident runner v2
- [ ] Concurrent agents per runner (Promise.all instead of serial loop)
- [ ] Inbox / wake timer / event-driven wake (not just HTTP-on-demand)
- [ ] Cancellation / heartbeat-based stuck detection
- [ ] Snapshot/restore at runner boot
- [ ] AgentInstancesTable populated and queried
- [ ] Local Docker placement (Phase 3 from `USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`)

### Product surfaces
- [ ] WorkItems live in Flutter (parity with web)
- [ ] Artifacts dedicated page + WorkItem-scoped browsing
- [ ] Approvals UI in command-center with subscribe + Approve/Reject
- [ ] Generated UI: web renderer + worker producer of `a2ui.delta`
- [ ] DataSourceRefs schema + worker emits `data-source.linked` events
- [ ] Tasks endpoint + UI chips

### Communication plane ([ADR-0009](adrs.md#adr-0009-proactive-communication-plane))
- [ ] `CommunicationThread`, `CommunicationItem`, `AgentMessage` tables
- [ ] `CallRequest`, `CallSession`, `AudioMessage` tables
- [ ] `Notification` table + delivery broker
- [ ] APNs/FCM integration
- [ ] PushKit/CallKit (deferred)

---

## Phase 3 — Integrations

(All deferred per hackathon scope.)

### Source control
- [ ] GitHub App / OAuth integration
- [ ] Branch / commit / PR primitives via `services/source-control/` (new)
- [ ] Code review agent capability

### Miro
- [ ] OAuth + webhook handlers in `services/miro-bridge/`
- [ ] Board operations as a tool capability
- [ ] Artifact kind `miro-board` already in schema; needs producer

### Preview hosting
- [ ] Replace nginx placeholder in `services/preview-router/` with real router
- [ ] Wildcard preview domain registration flow
- [ ] Long-lived preview ECS service support
- [ ] PreviewDeploymentsTable wired

### Cloudflare realtime fanout
- [ ] Deploy worker to `realtime.solo-ceo.ai`
- [ ] `services/event-relay/` Lambda bridging AWS DDB → Cloudflare DOs
- [ ] Cross-region failover to AWS-native if Cloudflare down

---

## Phase 4 — Specialist creation lifecycle

Per [ADR-0008](adrs.md#adr-0008-user-runner-placement), [agent-profile-package](reference/agent-profile-package.md), [agent-creator](reference/agent-creator.md).

- [ ] Quarantine eval runner (executes `evalPack.scenarios` against a draft profile in isolation)
- [ ] Eval verdict gate before promotion
- [ ] Promotion: inject approved profile into target ResidentRunner via `/agents` API
- [ ] AgentProfileLineageEvent emission (currently typed but unwired)
- [ ] Self-improvement loop with regression evidence

---

## Phase 5 — External assistant auth ([ADR-0006](adrs.md#adr-0006-external-assistant-auth))

- [ ] User-linked auth model (after trusted-runner isolation proven)
- [ ] Per-user provider keys via Secrets Manager
- [ ] Usage tracking (DynamoDB Streams → metering events)
- [ ] Billing model

---

## Phase 6 — Production GA

- [ ] Migrate Cognito user pool from Amplify sandbox → CDK-owned
- [ ] Custom domain (replace `*.amplifyapp.com` with `solo-ceo.ai`)
- [ ] EFS for hot POSIX workspaces (if needed for code-execution agents)
- [ ] Cost budgets / spend alarms per workspace
- [ ] SLO definitions + error budgets
- [ ] Security review + pen testing
- [ ] Compliance posture (SOC 2, etc.)

---

## What we're explicitly NOT building

(Per scope decisions captured in ADRs and `gaps.md`.)

- 🗑️ Multiple worker classes (one container per agent — too expensive per [ADR-0008](adrs.md#adr-0008-user-runner-placement))
- 🗑️ Premium runner tiers (resource limits before flexible tiers)
- 🗑️ PSTN telephony (deferred indefinitely per [ADR-0009](adrs.md#adr-0009-proactive-communication-plane))
- 🗑️ Arbitrary React/Flutter from agents (only approved A2UI catalogs per [ADR-0005](adrs.md#adr-0005-genui-protocol))

---

[← wiki index](README.md) · [→ HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md) · [→ adrs](adrs.md)
