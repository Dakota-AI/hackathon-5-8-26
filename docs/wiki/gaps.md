# Gaps & Skip List

[← wiki index](README.md) · [HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md) · [STATUS](STATUS.md)

> What we're cutting for the hackathon, and what's still genuinely blocking.

---

## 🗑️ Skip list (per user instruction)

These are documented in plans/ADRs but **explicitly out of scope for hackathon**.

### Deep tenant authorization (ADR-0010)

**Skip.** ADR-0010 (`docs/adr/0010-tenant-access-control-and-access-codes.md`) describes:
- `Users / Organizations / Workspaces / WorkspaceMemberships / AccessCodes / AccessCodeRedemptions` tables
- Cognito groups (`agents-cloud-user`, `-admin`, `-suspended`, `-internal`)
- Pre-sign-up Lambda triggers, post-confirmation hooks
- Workspace pickers, capability checks

**None of this is implemented in code or CDK.** The hackathon model is simpler: `userId` from JWT → table-routing on DynamoDB queries. Owner-scoped reads (`record.userId !== user.userId → 404`) are already in every handler.

### Cloudflare realtime

**Skip.** `infra/cloudflare/realtime/` is a working Wrangler scaffold with Durable Objects, but:
- Not deployed to DNS
- No AWS event-relay Lambda
- AWS-native realtime (`RealtimeApiStack`) is the live primary path

Stay on AWS.

### Preview ingress / wildcard preview hosting

**Skip.** `PreviewIngressStack` is gated by `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true` and the container is upstream nginx (no real preview routing). Don't enable for hackathon.

### EFS / hot POSIX workspace

**Skip.** Deferred per ADR. S3 is the artifact store; resident-runner uses container-local FS for working state.

### Service scaffolds (README only)

**Skip implementing as separate services.** These are README-only and the responsibilities can be folded into existing services:

- 🗑️ `services/agent-manager/` — replace with dispatcher logic inside `services/control-api/src/create-run.ts`
- 🗑️ `services/builder-runtime/` — not needed for demo
- 🗑️ `services/event-relay/` — not needed without Cloudflare
- 🗑️ `services/miro-bridge/` — out of scope
- 🗑️ `services/preview-router/` — out of scope

### Integrations

**Skip:**
- 🗑️ Miro OAuth/MCP/REST bridge
- 🗑️ GitHub App/OAuth integration
- 🗑️ Specialist agent self-improvement / quarantine / promotion

These all require credential brokering and approval gates. Out of hackathon scope.

### Production hardening

**Skip:**
- 🗑️ Deep IAM least-privilege auditing
- 🗑️ CI/CD pipelines (run tests locally)
- 🗑️ CloudWatch dashboards/alarms beyond default logs
- 🗑️ Cost budgets / quotas
- 🗑️ Production observability (X-Ray, custom metric filters)
- 🗑️ Security review of token handling, log redaction

### Documentation reconciliation

**Skip.** Multiple docs claim things are deployed/done that match reality, plus a few stale references. Not worth fixing during hackathon — the wiki itself is now the source of truth.

---

## ❌ Genuine blockers (must fix or accept)

These are different from the skip list — they're missing features that affect the hackathon goal of **multiple users running agents concurrently with one ECS instance per user**.

### Sorted by severity

#### Severity 1 — blocks the headline demo

1. ~~**No real model invocation in worker.**~~ ✅ **Resolved for resident runner** in commit `d8c2a22`. Image bakes Hermes; `runAdapter` defaults to `hermes-cli`; live ECS task reached OpenAI Codex. ⚠️ Stateless SFN-driven worker still uses smoke. ⚠️ Provider quota hit `429` — needs billing.

2. ~~**No userId → resident runner dispatch.**~~ ✅ **Resolved.** `services/control-api/src/runner-dispatcher.ts` + `runner-dispatcher-aws.ts` (auto-creates `UserRunner` rows, calls `ecs:RunTask`, posts to `/wake`). Wired in `handlers.ts`; CDK grants IAM and injects env. 65 control-api tests pass.

3. ~~**Resident runner reachability layer.**~~ ✅ **Resolved** with `EcsTaskObserver` — polls `ecs:DescribeTasks` for `privateIp` from container network interfaces. No Cloud Map, no ALB.

#### Severity 2 — degrades the demo

4. **Resident runner persists to local FS only.** No DDB/S3 mirror. Task death = lost state. Realtime relay never sees resident events because nothing puts them in `EventsTable`.
   - Fix: half a day to wire `EventSink → EventsTable`, `ArtifactSink → S3 + ArtifactsTable`, `RunnerStateStore → UserRunnersTable`, `SnapshotStore → S3 + RunnerSnapshotsTable`. See [agent-runtime.md](services/agent-runtime.md).

5. ~~**`RUNNER_API_TOKEN` provisioning.**~~ ✅ Resolved in `1deaf57` — `ResidentRunnerApiToken` Secrets Manager secret is provisioned in CDK. Dispatcher (#2) needs to inject it.

6. **Resident `wake()` is a serial loop.** Multiple agents in one runner can't run concurrently.
   - Fix: ~30 minutes — change `for` to `Promise.all`.

7. **Worker hardcodes `seq=2,3,4`.** Any retry crashes on conditional-check failures. ECS Spot interruption breaks runs.
   - Fix: ~1 hour.

8. **Worker producers for `tool.approval` and `a2ui.delta` events missing.** Web/Flutter both render them; nothing fires them in production. Local harness already shows the pattern (`local-harness.ts:365`). Resident runner needs the same.
   - Fix: half day.

#### Severity 3 — UX papercuts

8. ~~**No `GET /runs` user listing.**~~ ✅ **Resolved** — endpoint exists.

9. ~~**WorkDashboard fixture-only on web.**~~ ✅ **Resolved on web** in commit `b515e14`. Flutter pages still consume `FixtureWorkRepository` even though `controlApiProvider` is wired — see [flutter.md](clients/flutter.md).

10. ~~**Artifacts read endpoints return 501.**~~ ✅ **Resolved** — list, get, presigned download all live. ✅ Web `<ArtifactsBoard/>` renders with download buttons. ⚠️ Flutter still fixture.

11. ~~**Web hardcodes `workspaceId: "workspace-web"`.**~~ ✅ **Resolved** — `<WorkspaceProvider>` + `<WorkspaceSwitcher>` in commit `b515e14`. Default still `workspace-web`, but switchable and persisted. ⚠️ Backend doesn't validate userId-to-workspace membership.

12. **`ADMIN_EMAILS` hardcoded in CDK source** — only `seb4594@gmail.com`. To add admins requires source edit + redeploy.
    - Fix: ~5 minutes for the demo (edit + redeploy) or properly env-driven.

13. ~~**Flutter has Amplify configured but no live API/WebSocket calls.**~~ ⚠️ **Partially resolved** in commit `b4d18fc`. Sign-in UI added, ID token retrieved, `ControlApi` and `RealtimeClient` providers declared — but **page bodies still call `FixtureWorkRepository`**. Render paths haven't been migrated to consume the providers.
    - Fix: ~half day per page (Agents → Kanban → Approvals → Artifacts).

14. **`subscribeRun` doesn't verify ownership.** Topic-squatting possible. Mitigated by relay userId filter.
    - Fix: ~30 minutes.

15. **Web realtime helpers exist but no consumer.** `lib/realtime-client.ts` is implemented; chat polls every 2.5 s instead. Cheap migration win.
    - Fix: ~1 hour.

#### Severity 4 — nice to have

15. **`GET /runs/{runId}/tasks` route missing.**
16. **`EventRecord.orgId` is dead/unset.**
17. **No `subscribeWorkspace` for cross-run dashboards.**
18. **Realtime relay batchSize=25 has no error isolation per record** — one bad postToConnection blocks the batch.
19. **Approvals/Notifications/Surfaces/DataSources** — see surface pages for full details. All optional for hackathon.

---

## Recommended trim — what NOT to build for hackathon

Most of what I previously called "skippable" has already shipped (artifacts handler, surfaces handler, approvals routes, GenUI renderer, web redesign, real Hermes resident image). What's still genuinely deferrable:

- ❌ Don't enable the PreviewIngressStack. Skip preview hosting entirely.
- ❌ Don't build Notifications.
- ❌ Don't wire Flutter live integration — demo from web only. Flutter has the auth + transport layer; pages can stay fixture for the demo.
- ❌ Don't implement local Docker host supervisor (Phase 3 from `USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md`). Use `ecs-fargate` only.
- ❌ Don't build a separate `services/agent-manager/` — the dispatcher belongs inside `services/control-api/src/`.

This narrows the critical path to ~2 days of work:
1. Resident-runner dispatcher in control-api (1–2 days) — **the only severity-1 blocker**
2. Resident-runner durable adapters (½ day) so multi-user actually persists
3. (Optional, if demo uses approvals) worker producer for `tool.approval` (½ day)
4. (Optional polish) flip web from polling to WebSocket (~1 hour), env-driven `ADMIN_EMAILS` (~5 minutes)

[→ HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md) · [→ STATUS](STATUS.md) · [← wiki index](README.md)
