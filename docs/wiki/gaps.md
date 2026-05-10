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

1. **No real model invocation in worker.** `HERMES_RUNNER_MODE=smoke` returns canned text. Image has no `hermes` binary. Without this, agents don't actually do anything.
   - Fix: half a day. See [agent-runtime.md](services/agent-runtime.md), [HACKATHON_CRITICAL_PATH.md#1](HACKATHON_CRITICAL_PATH.md).

2. **No userId → resident runner dispatch.** The "one ECS per user" architecture is unwired. `createRun` always spawns a fresh stateless ECS task via Step Functions; nothing reads `UserRunnersTable` or starts a resident container.
   - Fix: 1–2 days. See [multi-user-routing.md](flows/multi-user-routing.md), [HACKATHON_CRITICAL_PATH.md#2](HACKATHON_CRITICAL_PATH.md).

3. **No scheduler that calls `ecs:RunTask` for ResidentRunner.** Image is built and pushed, TaskDef exists, IAM is granted, but no caller exists. Required for #2.
   - Fix: included in #2.

#### Severity 2 — degrades the demo

4. **Resident-runner persists to local FS only.** No DDB/S3 mirror. Task death = lost state.
   - Fix: a few hours. See [agent-runtime.md](services/agent-runtime.md).

5. **`RUNNER_API_TOKEN` provisioning undefined.** Server requires it in ECS mode but no stack mints/injects it.
   - Fix: ~1 hour, included in #2.

6. **Resident `wake()` is a serial loop.** Multiple agents in one runner can't run concurrently.
   - Fix: ~30 minutes — change `for` to `Promise.all`.

7. **Worker hardcodes `seq=2,3,4`.** Any retry crashes on conditional-check failures. ECS Spot interruption breaks runs.
   - Fix: ~1 hour.

#### Severity 3 — UX papercuts

8. ~~**No `GET /runs` user listing.**~~ ✅ **Resolved** — endpoint exists.

9. **WorkDashboard fixture-only on both clients.** API exists, only client is unwired.
   - Fix: ~2–3 hours web; ~1 day Flutter.

10. ~~**Artifacts read endpoints return 501.**~~ ✅ **Resolved** — `/runs/{id}/artifacts`, `/work-items/{id}/artifacts`, `/runs/{id}/artifacts/{artifactId}`, and `/runs/{id}/artifacts/{artifactId}/download` are live. Web/Flutter still need to render them.

11. **Web hardcodes `workspaceId: "workspace-web"`.** All users land in one workspace partition. Cross-tenant rows aren't leaked thanks to userId filters, but admin views show everyone's stuff.
    - Fix: ~30 minutes.

12. **`ADMIN_EMAILS` hardcoded in CDK source** — only `seb4594@gmail.com`. To add admins requires source edit + redeploy.
    - Fix: ~5 minutes for the demo (edit + redeploy) or properly env-driven.

13. **Flutter has Amplify configured but no live API/WebSocket calls.** Sign-in UI missing, ID token never retrieved, ControlApiClient never instantiated.
    - Fix: ~1 day. Or skip and demo from web only.

14. **`subscribeRun` doesn't verify ownership.** Topic-squatting possible. Mitigated by relay userId filter.
    - Fix: ~30 minutes.

#### Severity 4 — nice to have

15. **`GET /runs/{runId}/tasks` route missing.**
16. **`EventRecord.orgId` is dead/unset.**
17. **No `subscribeWorkspace` for cross-run dashboards.**
18. **Realtime relay batchSize=25 has no error isolation per record** — one bad postToConnection blocks the batch.
19. **Approvals/Notifications/Surfaces/DataSources** — see surface pages for full details. All optional for hackathon.

---

## Recommended trim — what NOT to build for hackathon

Even within the critical path, these can be deferred:

- ❌ Don't build a separate `services/agent-manager/`. Add the dispatcher inside `create-run.ts`.
- ❌ Don't enable the PreviewIngressStack. Skip preview hosting entirely.
- ❌ Don't implement Approvals routes unless the demo storyline includes them.
- ❌ Don't ship validated GenUI rendering. The Flutter local seed demonstrates the capability if needed.
- ❌ Don't build DataSourceRefs.
- ❌ Don't build Notifications.
- ❌ Don't wire Flutter live integration — demo from web only. Flutter remains in the wiki as roadmap.

This narrows the critical path to ~3 days of work:
1. Real model in worker (½ day)
2. Resident-runner dispatcher in control-api (1–2 days)
3. Resident-runner durable persistence + concurrent agents (½ day)
4. WorkDashboard live data on web (½ day)
5. `GET /runs` user listing + Artifacts handler (½ day)

Plus 1–2 hours of polish for hardcoded `ADMIN_EMAILS` / `workspaceId` / etc.

[→ HACKATHON_CRITICAL_PATH](HACKATHON_CRITICAL_PATH.md) · [→ STATUS](STATUS.md) · [← wiki index](README.md)
