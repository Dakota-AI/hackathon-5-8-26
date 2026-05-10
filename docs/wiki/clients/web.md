# Web (Next.js) — `apps/web`

[← clients](README.md) · [wiki index](../README.md)

> Next.js 16 + React 19 command center. Real Amplify Cognito auth, real Control API integration, real WebSocket realtime, working admin console.

**Maturity:** ✅ real run loop + admin. ⚠️ WorkItems and GenUI still fixture-backed.
**Stack:** Next.js 16, React 19, AWS Amplify, TypeScript.
**Hosting:** Amplify Hosting at `https://main.dkqxgsrxe1fih.amplifyapp.com/`.

---

## Routes

App Router only (no `pages/` directory, no API routes).

| Path | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Renders `<HostRoutedHome/>` — hostname routing |
| `/admin` | `app/admin/page.tsx` | Renders `<AdminConsole/>` |
| Layout | `app/layout.tsx` | Wraps tree in `<AmplifyProvider>` |

`HostRoutedHome` (`components/host-routed-home.tsx`) reads `window.location.hostname`; if `admin.solo-ceo.ai` → `<AdminConsole/>`, else `<CommandCenter/>`.

---

## Page components

| Component | File | Notes |
|---|---|---|
| `CommandCenter` | `components/command-center.tsx` | Authenticator → WorkDashboard + CreateRunPanel |
| `AdminConsole` | `components/admin-console.tsx` | Authenticator → runner-fleet + workshop + lineage |
| `WorkDashboard` | `components/work-dashboard.tsx` | ⚠️ Fixture-only |
| `AmplifyProvider` | `components/amplify-provider.tsx` | One-time Amplify configure |

---

## API integration

All HTTP calls in `apps/web/lib/control-api.ts` against `${NEXT_PUBLIC_AGENTS_CLOUD_API_URL}` with `Authorization: Bearer <ID token>`:

| Function | Method/Path | Caller |
|---|---|---|
| `createControlApiRun` | POST /runs | CommandCenter form submit |
| `getControlApiRun` | GET /runs/{runId} | CommandCenter polling/backfill |
| `listControlApiRunEvents` | GET /runs/{runId}/events?afterSeq | CommandCenter |
| `listControlApiAdminRuns` | GET /admin/runs?limit | AdminConsole |
| `listControlApiAdminRunners` | GET /admin/runners?limit | AdminConsole runner fleet |
| `listControlApiAdminRunEvents` | GET /admin/runs/{runId}/events | AdminConsole lineage |
| `createControlApiAgentProfileDraft` | POST /agent-profiles/drafts | Agent Workshop |
| `listControlApiAgentProfiles` | GET /agent-profiles?workspaceId | Agent Workshop |
| `getControlApiAgentProfile` | GET /agent-profiles/{id}/versions/{v} | Agent Workshop |
| `approveControlApiAgentProfile` | POST /agent-profiles/{id}/versions/{v}/approve | Agent Workshop |

Realtime: `apps/web/lib/realtime-client.ts` builds `wss://…?token=<idToken>` and serializes `subscribeRun`/`unsubscribeRun` actions. WebSocket constructed inside `CreateRunPanel.useEffect`.

---

## Auth flow

- Config: `apps/web/lib/amplify-config.ts` reads `NEXT_PUBLIC_AMPLIFY_REGION/USER_POOL_ID/USER_POOL_CLIENT_ID/IDENTITY_POOL_ID`.
- Configure: `Amplify.configure(config, { ssr: true })` in `AmplifyProvider`.
- Sign-in UI: `<Authenticator variation="modal">` from `@aws-amplify/ui-react` wraps both apps.
- Sign-out: `lib/auth-session-reset.ts` — `signOut({global:true})` then `signOut()` fallback, then `clearAmplifyBrowserState` wipes all Cognito storage, then redirect.
- JWT attach: `requireIdToken()` calls `fetchAuthSession()` → `tokens.idToken.toString()` → `Bearer` header on all Control API calls.
- Dev bypass: `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1` skips Authenticator.

---

## Realtime wiring

`CreateRunPanel` (`components/command-center.tsx:153-231`):
1. Once a run exists, opens `new WebSocket(buildRealtimeWebSocketUrl(NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL, idToken))`.
2. Sends `{action: "subscribeRun", workspaceId, runId}`.
3. Merges incoming events via `parseRealtimeRunEvent` → `mergeRunEvents`.
4. Polls `GET /events?afterSeq=…` every 7.5s as backfill (also on open/close/reconnect).
5. Tears down on terminal status (succeeded/failed/cancelled).

Mock mode: `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1` short-circuits realtime, falls back to 550ms polling.

---

## Admin console

`components/admin-console.tsx` panels:
- **Metric strip** — total/running/succeeded/failed runs + runners
- **Runner fleet** — host nodes + user runners (commits dc68cce, b69e55b)
- **Agent Workshop** — playground form → POST profile draft → list/inspect/approve
- **Recent requests** + **Run detail with lineage timeline** (`lib/admin-lineage.ts`)
- **Failure watch** — last 5 runs with failures

---

## Fixtures / placeholders

- `WorkDashboard` is fixture-only. `apps/web/lib/work-items.ts:239` `listFixtureWorkItems()`. Banner: "Fixture-backed until the WorkItem Control API slice is finalized." No real-data fetcher exists yet.
- `lib/fixtures.ts` — orphan fixture export (metrics/teams/etc) not consumed by current components.
- `mockRuns` and `mockAgentProfiles` in `lib/control-api.ts` synthesize a fake run lifecycle when `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1`.
- Voice call button (`☎`) — placeholder, no handler (`command-center.tsx:306`).
- Workspace ID hardcoded `"workspace-web"` (`command-center.tsx:251`).

---

## Checklist

### What's wired
- [x] Amplify Cognito sign-in/out, JWT extraction, storage cleanup
- [x] Control API run create/get/events with bearer ID token
- [x] WebSocket realtime with reconnect + HTTP backfill
- [x] Admin runs/runners/lineage/failures + Agent Workshop CRUD
- [x] Mock + dev-auth-bypass modes for offline self-test

### Gaps for hackathon multi-user
- [ ] WorkDashboard fixture-only; not bound to backend WorkItems
- [ ] Workspace selection hardcoded to `workspace-web`
- [ ] Generated UI/A2UI rendering is placeholder cards, not validated GenUI
- [ ] Approvals UI is read-only (`disabled` button)
- [ ] No `GET /runs` user-listing page (depends on backend route)
- [ ] Voice/call button non-functional

---

## Hackathon priorities for web

See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#5):
- Replace `listFixtureWorkItems()` with real fetcher (~2–3 hr).
- After backend `GET /runs` lands, add a "Recent runs" section to home.
- After backend artifacts handler lands, add an Artifacts tab to run detail.

[→ flutter.md](flutter.md) · [→ run-creation flow](../flows/run-creation.md)
