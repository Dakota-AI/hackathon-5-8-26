# Admin Console — Reference

[← reference](README.md) · [wiki index](../README.md) · related: [web client](../clients/web.md), [control-api](../services/control-api.md), [agent-creator](agent-creator.md)

> Deep audit of the web admin console. The most evolved UI surface in the system: panel-by-panel breakdown, lineage algorithm, runner health classification.

**Path:** `apps/web/components/admin-console.tsx` + helpers in `apps/web/lib/`
**Live URL:** `https://main.dkqxgsrxe1fih.amplifyapp.com/admin` (or `https://admin.solo-ceo.ai/`)

---

## Hostname routing

There is no `host-routed-home.tsx` (despite an earlier draft of this wiki). The hostname dispatch lives in `apps/web/components/app/host-redirect.tsx`:

```tsx
export function HostRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hostname === "admin.solo-ceo.ai" &&
        window.location.pathname === "/") {
      window.location.replace("/admin");
    }
  }, []);
  return null;
}
```

`HostRedirect` mounts from `apps/web/app/(console)/page.tsx` (the user console root). When a visitor lands on `https://admin.solo-ceo.ai/`, they're bounced to `/admin`, which renders `<AdminConsole/>` from `apps/web/app/admin/page.tsx`.

⚠️ **Hostname is hardcoded** in `host-redirect.tsx`. No env override, no server-side detection (site is statically exported).

Any other hostname (e.g. `solo-ceo.ai`) renders the user UI: `WorkDashboard`, `HeroCommandPanel`, `MetricsStrip`, `LiveRunTimeline`, `GenUiPreviewPanel`.

---

## AdminConsole component structure

`AdminConsole` is a single React client component (`"use client"`) wired through `useAuth()` from `components/auth-context.tsx` (Cognito via Amplify). On mount, when `isAuthed` is true, it triggers `refresh()` and `refreshWorkshopProfiles()`.

Control API base URL comes from `getControlApiHealth()` (`lib/control-api.ts`). When not configured, shows a warning bar and disables data load.

---

## Panel 1: Metric strip

5-card grid. Each card built from inline `MetricCard` calls (not the user-facing `metrics-strip.tsx`).

| Card | Source |
|---|---|
| Total runs | `data.totals.total` from `listControlApiAdminRuns({ limit: 75 })` → `GET /admin/runs?limit=75` |
| Running | `data.totals.running` |
| Succeeded | `data.totals.succeeded` |
| Failed | `data.totals.failed` |
| Runners | count + hint `"<failed> failed · <stale> stale"` (or `"Healthy"`) from `listControlApiAdminRunners({ limit: 75 })` → `GET /admin/runners?limit=75` |

---

## Panel 2: Runner fleet

Wrapped in a `Panel` with subtitle from `describeRunnerHealth(runnerData.totals)`.

Two columns:
- **Hosts** — first 8 entries from `runnerData.hosts`. Each shows `StatusDot`, `hostId`, `placementTarget`, `status`, formatted `lastHeartbeatAt`.
- **User runners** — first 8 entries from `sortRunnerRows(runnerData.runners)` rendered through inline `RunnerRow`: `runnerId`, `userId`, `workspaceId`, `status / desiredState`, assigned `hostId` (`"unassigned"` if absent), heartbeat.

If `listControlApiAdminRunners` rejects, panel falls back to a danger `AlertBar`; runs ledger remains visible.

---

## Panel 3: Recent requests + run detail

Two-column grid (`grid-cols-[0.85fr_1.15fr]` on lg).

### Recent requests
Scrollable list of all `data.runs`. Each is a button. Selecting sets `selectedRunId`, triggering effect that calls `listControlApiAdminRunEvents(runId, { limit: 100 })` → `GET /admin/runs/{runId}/events?limit=100`. Items show:
- objective
- owner email/userId
- status
- updated/created timestamp
- eventCount

### Run detail
Rendered by inline `RunDetail`. Header has `objective`, `ownerEmail`, `StatusPill(run.status)`. A `KeyValueGrid` exposes:
- `runId`
- `workspaceId`
- `userId`
- `createdAt`
- `updatedAt`
- `latestEventType`
- `latestEventAt`
- `eventCount`
- `artifactCount`
- `failureCount`
- `executionArn` (when present)

Below: lineage timeline (next section) and a `CollapsibleJson` with raw admin summary.

---

## Panel 4: Lineage timeline (`lib/admin-lineage.ts`)

Inside `RunDetail`. Headed by `summarizePipelinePosition(events)`. Each loaded event becomes a `TimelineItem`:
- `status = "#<seq>"`
- `title = step.summary` from `describeAdminLineageEvent`
- `body = "<type> · <source> · <createdAt>"`

A collapsed `<details>` reveals each event's full payload (`#<seq> <type>`).

### `describeAdminLineageEvent(event)` algorithm

Extracts `status`, `error`, `name`/`artifactId`, `kind` from `event.payload`. Produces step with:
- `seq`, `type`, `createdAt`
- `source` from `formatEventSource`:
  - String sources passthrough
  - Otherwise: `"<name> (<kind>)"` or whichever of name/kind is present
  - Default: `"durable ledger"`
- `hasError` if `payload.error` exists or `status === "failed"`
- `summary` from `summarizeEvent`:
  - **Failure:** `"Run failed: <error message or 'see event payload'>"`
  - **`run.status`:**
    - `queued` → `"Request accepted by Control API and queued."`
    - `running` → `"Worker execution started or reported running."`
    - `succeeded` → `"Run completed successfully."`
    - other → `"Run status changed to <status>."`
  - **`artifact.created`:** `"Artifact created: <name> (<kind>)."` (fallback `"unnamed artifact"`)
  - **else:** `"<type> event recorded."`

### `summarizePipelinePosition(events)` algorithm

Sort by seq, then:

1. Any failed event or `error` → `"Failed at <type>: <error message or 'see event payload'>"`
2. Most recent `run.status`:
   - `queued` → **"Currently queued after Control API acceptance. If it stalls here, inspect Step Functions start/execution creation."**
   - `running | planning | testing | archiving` → **"Currently in worker execution. If it stalls here, inspect Step Functions/ECS worker logs."**
   - `succeeded` → **"Pipeline reached terminal success. If output is wrong, inspect artifact and worker payload events."**
3. Any `artifact.created` → `"Artifact was produced. Inspect following status events to confirm archive/completion."`
4. Default: `"No pipeline events loaded yet."`

`extractErrorMessage` accepts strings directly or an object with a `message` string.

---

## Panel 5: Failure watch

Below run detail. Filters `data.runs` to those with `failureCount > 0` or `status === "failed"`, takes first 5. Renders a 3-column row per failure: owner, objective, `formatFailure(run)` (JSON of `run.lastFailure`, else `"failed status"` or `"<n> failure events"`). Clicking re-selects the run.

---

## Panel 6: Agent Workshop (`lib/agent-workshop.ts`)

Subtitle from `summarizeLifecycleReadiness(stages)`. Four cards in 2×2 grid:

### Playground input
Form fields: role / project context / goals / constraints. `Create live draft` button calls `buildAgentWorkshopDraftProfile` then `createControlApiAgentProfileDraft` → `POST /agent-profiles/drafts`. Workspace hardcoded to `workspace-admin-playground`, userId `browser-user`.

### Lifecycle map
7 stages from `agentWorkshopLifecycle()` (live / partial / next):

1. **Intake and role design** — `partial`. Admin form input → governed profile.
2. **Draft profile assembly** — `live`. POST drafts, DDB row, S3 `profile.json`.
3. **Policy and tool audit** — `live`. Validator fails closed on missing evals, ungated risky tools, unpinned MCP, secret-like content.
4. **Artifact registry** — `live`. Profile artifact key, hash, schema version.
5. **Human review and approval** — `live`. POST approve, lifecycle becomes `approved`.
6. **Quarantine eval run** — `next`. Eval pack exists; automated runner doesn't.
7. **Promotion to runtime** — `next`. Approved profiles aren't yet auto-injected into resident runners.

### Profile registry
`listControlApiAgentProfiles({ limit: 25 })` → `GET /agent-profiles?limit=25`. Each profile rendered via `summarizeAgentProfileRecord`.

### Selected version
Shows `summarizeAgentProfileRecord` output, key/value grid for workspace + S3 artifact URI + review/promotion readiness:
- `Inspect from API` button → `getControlApiAgentProfile` → `GET /agent-profiles/{profileId}/versions/{version}?workspaceId=...`
- `Approve version` button → `approveControlApiAgentProfile` → `POST /agent-profiles/{profileId}/versions/{version}/approve`. Disabled when lifecycle is already `approved` or `promoted`.
- `CollapsibleJson` shows policy snapshot (`mission`, `toolPolicy`, `mcpPolicy`, `evalPack`, `approval`).

### `summarizeAgentProfileRecord` output

- `id = "<profileId>@<version>"`
- `lifecycleState`
- `subtitle = "<n> eval scenarios · <state>"`
- `reviewReady` (`scorecard.readyForUserReview` or any eval scenarios)
- `promotionReady` (`approved`/`promoted` or `scorecard.readyForPromotion`)
- 3-line `toolPosture`:
  - `"<n> read-only/low-risk tools"`
  - `"<n> approval-gated risky tools"`
  - `"<n> pinned MCP surfaces"`

---

## Runner health classification (`lib/admin-runners.ts`)

### `describeRunnerHealth(totals)`

Takes `AdminRunnerTotals` (`hosts`, `runners`, `failedHosts`, `failedRunners`, `staleRunners`). Builds concern list. Stale and failed runners reported separately, then failed hosts.

- With concerns: `"<a>, <b> and <c> need attention."`
- Without: `"<n> runner(s) online/known across <m> host(s)."`

Pluralization via `plural` helper.

### `sortRunnerRows(runners)`

Ranks unhealthy first using `unhealthyStatuses = { "failed", "stale", "offline" }`. Within each priority group, orders by `lastHeartbeatAt` descending (newest first). So admins see most-recently-noisy bad actors at top.

"Unhealthy" = `failed | stale | offline`. `online` and `healthy` = healthy. Other values sort as healthy by default.

---

## ADMIN_EMAILS gating

The web client does **not** gate by email. Admin button and refresh button visible to anyone with a Cognito session. The gate lives entirely server-side at the Control API.

`services/control-api/src/handlers.ts`:
- Each admin handler reads `process.env.ADMIN_EMAILS` and feeds through `parseAdminEmails` (split on comma, trim).
- `query-runs.ts::isAdminUser` and `user-runners.ts::isAdmin` check `user.email.trim().toLowerCase()` against lowercased allowlist; non-members get 403.
- Authenticated email comes from Cognito JWT claims via `userFromEvent`.

⚠️ Infra hardcodes `ADMIN_EMAILS: "seb4594@gmail.com"` in `infra/cdk/src/stacks/control-api-stack.ts:63`. Single admin until parameterized.

A non-admin Cognito user opening `/admin` sees page chrome, panels, and refresh button, but every admin endpoint returns 403, surfaced as the red error bar.

---

## What's hardcoded

- Admin host: `admin.solo-ceo.ai` in `host-redirect.tsx`
- Workshop draft: `workspaceId = "workspace-admin-playground"`, `userId = "browser-user"`
- Default role / context / goals / constraints copy in AdminConsole
- Allowlist of unhealthy runner statuses in `admin-runners.ts`
- Default page sizes: `limit: 75` for admin runs/runners, `100` for run events, `25` for agent profiles
- Color map for status dots and `AlertBar` tones
- Single admin email in CDK (`seb4594@gmail.com`)

## What's dynamic

- Control API base URL (`getControlApiHealth()` reads Amplify env)
- Cognito session through `useAuth()` (`isAuthed`, `userLabel`, `signOut`); dev bypass via `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1`
- All runs/runners/profiles/events from durable ledger over the wire
- Lifecycle stages, lineage step descriptions, runner health text computed each render

[← reference](README.md) · [→ web client](../clients/web.md) · [→ agent-creator](agent-creator.md)
