# Web (Next.js) — `apps/web`

[← clients](README.md) · [wiki index](../README.md)

> Next.js 16 / React 19 console. After commit `b515e14` ("redesign console to match Flutter, wire real backend"), the legacy `command-center.tsx`, `host-routed-home.tsx`, `work-dashboard.tsx`, and `create-run-panel.tsx` were deleted and replaced with a Tailwind + Geist + Radix shell mirroring Flutter. **Real Cognito auth, real Control API for work-items / runs / artifacts / surfaces / approvals / agent-profiles, real GenUI renderer, real WorkspaceProvider context (no more hardcoded `workspace-web` at call sites).**

**Maturity:** ✅ real run loop + real product surfaces.
**Stack:** Next.js `^16.0.7`, React `^19.2.1`, AWS Amplify `^6.17.0`, `@aws-amplify/ui-react ^6.15.3`, `react-markdown ^10.1.0`, `remark-gfm ^4.0.1`, Tailwind 3, Geist fonts, Radix Icons.
**Hosting:** Amplify Hosting at `https://main.dkqxgsrxe1fih.amplifyapp.com/`. Admin shortcut `admin.solo-ceo.ai/`.

---

## Routing — App Router only

Two route groups: `(console)` (member surfaces) and a flat `/admin` route. No `pages/`, no API routes.

| Path | File | Renders | Data |
|---|---|---|---|
| `/` | `app/(console)/page.tsx` | `<HostRedirect/>` + `<WorkDashboard/>` + `<HeroCommandPanel/>` + `<MetricsStrip/>` + `<LiveRunTimeline/>` + `<GenUiPreviewPanel/>` | WorkDashboard fetches `/work-items` (+ runs/events/artifacts/surfaces per item); HeroCommandPanel calls `POST /runs` and polls `/runs/:id/events`; rest are static |
| `/runs` | `app/(console)/runs/page.tsx` | `<RunsChat/>` (Open-WebUI-style) | real |
| `/agents` | `app/(console)/agents/page.tsx` | `<PlaceholderPage/>` | none — roadmap copy |
| `/artifacts` | `app/(console)/artifacts/page.tsx` | `<ArtifactsBoard/>` | real (with presigned download URLs) |
| `/miro` | `app/(console)/miro/page.tsx` | `<PlaceholderPage/>` | none |
| `/approvals` | `app/(console)/approvals/page.tsx` | `<ApprovalsBoard/>` | real (decisions hit `POST /approvals/:id/decision`) |
| `/admin` | `app/admin/page.tsx` | `<AdminConsole/>` | real |

Layouts: `app/layout.tsx` mounts `<AmplifyProvider>` (which wraps `<AuthProvider>` and `<WorkspaceProvider>`); `app/(console)/layout.tsx` mounts `<ConsoleShell>` (sidebar + topbar + mobile nav).

`<HostRedirect>` (`components/app/host-redirect.tsx`) replaces the legacy `HostRoutedHome` flash: when on `admin.solo-ceo.ai/`, hard-redirects to `/admin`.

---

## Components — `apps/web/components/`

### Top-level providers/contexts
- `amplify-provider.tsx` — `Amplify.configure(getAmplifyConfig(), { ssr: true })`, then renders `<AuthProvider><WorkspaceProvider>`.
- `auth-context.tsx` — Cognito auth via `@aws-amplify/ui-react` `<Authenticator.Provider>` + `useAuthenticator`. Exposes `useAuth()` returning `{ isAuthed, userLabel, bypass, openSignIn, closeSignIn, signOut }`. Probes `getCurrentUser`/`fetchAuthSession` in effects. `SignInModal` is colocated and renders `<Authenticator hideSignUp={false}/>` inside an overlay. Honors `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1` to fake a session.
- `workspace-context.tsx` — `useWorkspace()` returning `{ workspaceId, workspaces, setWorkspaceId, addWorkspace }`. Default `workspace-web`; persists to `localStorage["agents-cloud:workspace"]`. Three known IDs (`workspace-web`, `workspace-admin-playground`, `workspace-personal`) plus user-added. **Replaces hardcoded workspace-web at every call site.**

### Console shell + chrome (`components/app/`)
- `console-shell.tsx` — desktop sticky sidebar + topbar; mobile top + bottom nav.
- `app-sidebar.tsx` — desktop nav (Command Center, Runs, Agents, Artifacts, Miro, Approvals).
- `app-topbar.tsx` — page title, `<WorkspaceSwitcher/>`, status pills, sign-in/out.
- `mobile-topbar.tsx`, `mobile-navbar.tsx`, `mobile-nav-item.tsx` — phone navigation.
- `workspace-switcher.tsx` — dropdown selector backed by `useWorkspace()`.
- `brand-header.tsx`, `logo-mark.tsx`, `connection-card.tsx`, `nav-button.tsx` — branding/nav atoms.

### Page-level boards
- `work-dashboard.tsx` — `/` work board. Fixture mode when signed-out; real mode calls `useWorkItems` + `useWorkItemDetail`, creates work items via `POST /work-items`, renders runs/events/artifacts and embeds `<GenUiSurface/>`.
- `runs-chat.tsx` — Open-WebUI-style chat (see [§Runs chat](#runs-chat)).
- `approvals-board.tsx` — fan-out approval queue with real decide POST.
- `artifacts-board.tsx` — work-item picker + artifact tiles + download links + GenUI surface preview; falls back to demo markdown when signed out.
- `genui-preview-panel.tsx` — static placeholder ("Waiting for GenUI surface…").
- `live-run-timeline.tsx` — static "Planned" pipeline copy.
- `metrics-strip.tsx` — static top-row metric cards.
- `hero-command-panel.tsx` — chat-style "create run" textarea calling `POST /runs` + polling `GET /runs/:id/events`; uses `mergeRunEvents`/`deriveRunLedgerView`.

### Generic UI atoms
`panel.tsx`, `button.tsx`, `textarea.tsx`, `status-pill.tsx`, `metric-card.tsx`, `tiny-stat.tsx`, `section-header.tsx`, `chat-bubble.tsx`, `tool-call-card.tsx`, `timeline-item.tsx`, `small-surface-line.tsx`, `work-mini-section.tsx`, `artifact-tile.tsx`, `approval-card.tsx`, `browser-frame.tsx`, `placeholder-page.tsx`.

### Top-level
- `admin-console.tsx` — full admin SPA: sign-in gate, runner-fleet panel (hosts + user runners), Agent Workshop panel, recent-requests + run-detail with lineage timeline, failure watch.

---

## `apps/web/lib/`

| File | Purpose |
|---|---|
| `amplify-config.ts` | Reads `NEXT_PUBLIC_AMPLIFY_*` env, returns `ResourcesConfig` for Amplify Cognito (with optional Identity Pool guest access). |
| `auth-storage.ts` | Pure helpers to enumerate and clear `CognitoIdentityServiceProvider.<clientId>.*`, `aws-amplify-*`, `amplify-*` keys + cookies. |
| `auth-session-reset.ts` | `resetAmplifyAuthSession` — `signOut({ global: true })` + storage/cookie cleanup + optional reload. |
| `control-api.ts` | Single Control API client (HTTP only, Bearer ID-token). Optional in-memory mock mode. |
| `realtime-client.ts` | Pure helpers — `getRealtimeApiHealth`, `buildRealtimeWebSocketUrl`, `serializeSubscribeRunMessage`, `parseRealtimeRunEvent`. **Not currently consumed** — `runs-chat.tsx` polls instead. |
| `run-ledger.ts` | `mergeRunEvents`, `deriveRunLedgerView`, `extractArtifactCards`, `isTerminalRunStatus`, `formatRunEventSource`, `isSmokeWorkerArtifact`. |
| `work-items.ts` | Local `WorkItem*` types + fixture board (signed-out fallback) + `deriveWorkItemSummary`/`buildWorkItemDetailView`. |
| `use-work-items.ts` | `useWorkItems({ isAuthed, workspaceId })` and `useWorkItemDetail(...)` — fetches list and parallel detail bundle (runs, events, artifacts, surfaces). |
| `agent-workshop.ts` | Lifecycle stage descriptors + `buildAgentWorkshopDraftProfile` + `summarizeAgentProfileRecord`. |
| `admin-lineage.ts` | `describeAdminLineageEvent` and `summarizePipelinePosition`. |
| `admin-runners.ts` | `describeRunnerHealth` + `sortRunnerRows`. |
| `utils.ts` | `cn()` (clsx + tailwind-merge). |

---

## Control API surface — `lib/control-api.ts`

All calls send `Authorization: Bearer <Cognito ID token>` to `${NEXT_PUBLIC_AGENTS_CLOUD_API_URL}` and parse JSON via `parseJsonResponse`. `NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1` swaps the runs/agent-profile paths to in-memory mocks.

### Runs
- [x] `POST /runs` — `createControlApiRun` (with idempotencyKey)
- [x] `GET /runs/:runId` — `getControlApiRun`
- [x] `GET /runs/:runId/events?afterSeq&limit` — `listControlApiRunEvents`
- [x] `GET /runs/:runId/artifacts` — `listControlApiRunArtifacts`
- [x] `GET /runs/:runId/artifacts/:artifactId/download` — `getControlApiArtifactDownloadUrl`
- [x] `GET /runs/:runId/approvals` — `listControlApiRunApprovals`

### Work-items
- [x] `GET /work-items` — `listControlApiWorkItems`
- [x] `POST /work-items` — `createControlApiWorkItem`
- [x] `GET /work-items/:id` — `getControlApiWorkItem`
- [x] `POST /work-items/:id/status` — `updateControlApiWorkItemStatus` *(typed but not called yet)*
- [x] `POST /work-items/:id/runs` — `startControlApiWorkItemRun`
- [x] `GET /work-items/:id/runs` — `listControlApiWorkItemRuns`
- [x] `GET /work-items/:id/events?limit` — `listControlApiWorkItemEvents`
- [x] `GET /work-items/:id/artifacts` — `listControlApiWorkItemArtifacts`
- [x] `GET /work-items/:id/surfaces` — `listControlApiWorkItemSurfaces`

### Approvals
- [x] `POST /approvals/:approvalId/decision?workspaceId` — `decideControlApiApproval`

### Agent profiles
- [x] `POST /agent-profiles/drafts` — `createControlApiAgentProfileDraft`
- [x] `GET /agent-profiles?workspaceId&limit` — `listControlApiAgentProfiles`
- [x] `GET /agent-profiles/:id/versions/:version?workspaceId` — `getControlApiAgentProfile`
- [x] `POST /agent-profiles/:id/versions/:version/approve?workspaceId` — `approveControlApiAgentProfile`

### Admin
- [x] `GET /admin/runs?limit` — `listControlApiAdminRuns`
- [x] `GET /admin/runs/:id/events?limit` — `listControlApiAdminRunEvents`
- [x] `GET /admin/runners?limit` — `listControlApiAdminRunners`

⚠️ **WebSocket realtime helpers exist but no React component subscribes.** The polled `listControlApiRunEvents` (every 2.5 s in `runs-chat.tsx` and 4 s in `hero-command-panel.tsx`) is the only "live" path today.

---

## Auth — Amplify / Cognito

Wiring lives in `components/auth-context.tsx`:

- `<AuthProvider>` wraps `<Authenticator.Provider>` (from `@aws-amplify/ui-react`) and an internal `<InnerAuthProvider>`.
- `useAuth()` exposes `isAuthed, userLabel, bypass, openSignIn, closeSignIn, signOut`.
- `<SignInModal>` is opened by `openSignIn()`; renders the Amplify `<Authenticator/>` inside a backdrop overlay.
- `requireIdToken()` in `control-api.ts` calls `fetchAuthSession()` and reads `tokens.idToken.toString()`.
- Sign-out goes through `lib/auth-session-reset.ts` (global signout + local-storage/cookie scrub).
- Dev bypass: `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1` forces `isAuthed=true` and labels the session "Local session".

---

## Workspace context

- `WorkspaceProvider` (`components/workspace-context.tsx`) — `useWorkspace()` returns `{ workspaceId, workspaces, setWorkspaceId, addWorkspace }`.
- Default still falls back to `workspace-web`, but the value is persisted in `localStorage["agents-cloud:workspace"]` and switchable via `<WorkspaceSwitcher>` (also surfaces an "Add workspace ID" form storing extras in `localStorage["agents-cloud:workspace:extra"]`).
- Known seed list: `workspace-web`, `workspace-admin-playground`, `workspace-personal`.
- ⚠️ **No `/workspaces` discovery API** — workspace IDs are seeded client-side. Backend doesn't validate that a userId actually belongs to a workspace.

---

## GenUI renderer — `components/app/genui-renderer.tsx`

**Component allowlist** (set):
`container, row, column, stack, heading, text, muted, code, markdown, card, panel, list, table, stat, stat-grid, pill, bar-chart, divider`.

Anything else renders as `unsupported component: <type>`. Recursion depth is capped at 6.

- `markdown` is rendered through `react-markdown` + `remark-gfm` (no raw HTML allowed).
- `<GenUiSurface>` reads `surface.componentTree` (preferred) or wraps `surface.components[]` in a `stack`.
- **Server-validated gate:** when `surface.validation !== "server-validated"` the panel renders at `opacity-70` with an "unvalidated" pill. The renderer still draws unvalidated surfaces but visually de-emphasizes them. Validation is performed server-side; the client trusts the `validation` field returned by `/work-items/:id/surfaces`.

[x] Allowlist enforced. [x] No raw HTML. [ ] Client does not re-validate the schema; relies entirely on server signal.

---

## `/runs` chat — Open-WebUI-style {#runs-chat}

Layout (`components/app/runs-chat.tsx`):
- Left **Sidebar** (280px, hidden on mobile): "New conversation…" input → `createControlApiWorkItem`; refresh button reloads `listControlApiWorkItems`; conversation list keyed by `workItemId`, showing title/objective/status/relative-time.
- Right **Conversation** pane: header (title + run/event count pills + refresh), scrollable turn list, footer composer (Textarea + Send) where Enter sends and Shift+Enter newlines.

Event flow:
1. On mount + when conversation changes: `Promise.all([listControlApiWorkItemRuns, listControlApiWorkItemEvents({limit:200})])`.
2. **Polling:** a 2.5 s interval polls `listControlApiRunEvents(activeRun.runId, {limit:50})` whenever any run is non-terminal; new events are merged via id/seq.
3. Send: `startControlApiWorkItemRun({ workItemId, objective })`, then `refresh()`.
4. `buildTurns()` projects events into chat turns via `friendlyEvent()`:
   - `run.status` → assistant turn with friendly copy ("Got it…", "Working on it.", "Done…").
   - `run.message` / `agent.message` → assistant text from `payload.text|message|content`.
   - `tool.*` → tool turn (mono font) with `tool/name` + `argsPreview`.
   - `artifact.created` → assistant turn `Created <kind>: <name>`.
   - `approval.requested` → system turn (red).

Avatars: user (initials), agent (logo mark), tool (gear), system (chat-bubble + red).

[x] Real backend conversations. [x] Real send. [ ] No WebSocket (polling-only). [ ] No artifact preview inside chat.

---

## `/approvals` UI

`approvals-board.tsx` (auth-gated):

1. Loads `listControlApiWorkItems({ workspaceId, limit: 25 })`.
2. For each item: `listControlApiWorkItemRuns` → flat unique runIds (capped 50).
3. For each runId: `listControlApiRunApprovals` → flat list, sorted requested → approved → rejected, then by `updatedAt`.
4. Each pending approval renders risk pill, tool name, status pill, last-8 of runId, requested action, JSON `argumentsPreview`, optional reason.
5. **Approve / Deny buttons POST `decideControlApiApproval({ workspaceId, approvalId, decision: "approved" | "rejected" })`.** Returned record replaces the row in state.

[x] Decisions are real and persisted. [ ] "Request revision" button hard-disabled (no backend route). [ ] No reason input field. [ ] Demo cards (`<DemoApprovals/>`) render for signed-out visitors.

---

## `/artifacts` UI

`artifacts-board.tsx`:

1. Work-item picker (auth-aware; falls back to fixture for signed-out visitors).
2. `listControlApiWorkItemArtifacts({ workspaceId, workItemId })` for tiles.
3. `listControlApiWorkItemSurfaces({ workspaceId, workItemId })` for GenUI surface preview via `<GenUiSurface/>`.
4. Each artifact tile has a "Download" button that calls `getControlApiArtifactDownloadUrl({ workspaceId, runId, artifactId, expiresIn })` to get a presigned URL and opens it.

[x] Real artifact list + download. [x] GenUI surface preview wired.

---

## Tests — `apps/web/test/`

Run with `node --test test/*.test.ts` (`pnpm --filter @agents-cloud/web test`).

| File | Coverage |
|---|---|
| `admin-lineage.test.ts` | `describeAdminLineageEvent` summaries; `summarizePipelinePosition`. |
| `admin-runners.test.ts` | `describeRunnerHealth` + `sortRunnerRows`. |
| `agent-workshop.test.ts` | `buildAgentWorkshopDraftProfile` + `summarizeAgentProfileRecord` + `summarizeLifecycleReadiness`. |
| `auth-storage.test.ts` | `getAmplifyAuthStorageKeys` + `clearAmplifyBrowserState`. |
| `control-api-work-items.test.ts` | Module-mock test (skips without `--experimental-test-module-mocks`): `listControlApiWorkItems` hits `/work-items?workspaceId=…` with Bearer. |
| `realtime-client.test.ts` | `getRealtimeApiHealth`, `buildRealtimeWebSocketUrl`, subscribe/unsubscribe message serialization, `parseRealtimeRunEvent`. |
| `run-ledger.test.ts` | `mergeRunEvents`, `deriveRunLedgerView`, `extractArtifactCards`, etc. |
| `work-items.test.ts` | Fixture ordering, `deriveWorkItemSummary`, `buildWorkItemDetailView`, `filterWorkItemsByState`, `rejectUnsafeSurfacePayload`. |

28/28 tests pass per commit message. **No component / DOM / Playwright tests** — coverage is on pure-function helpers + the Control API HTTP shape.

---

## Status snapshot

### What's wired
- [x] Cognito auth via Amplify (AuthProvider + Authenticator modal)
- [x] Workspace context with `localStorage` persistence and switcher
- [x] Real Control API: work-items, runs, events, artifacts (with presigned download), surfaces, approvals (decide), admin runs/runners, agent profiles
- [x] Real-data work board, artifacts board, runs chat, approvals queue, admin console
- [x] GenUI renderer with strict 19-component allowlist + markdown sanitization
- [x] `HostRedirect` for `admin.solo-ceo.ai`
- [x] Mock + dev-auth-bypass modes for offline self-test

### Gaps for hackathon multi-user
- [ ] WebSocket realtime not consumed (chat polls every 2.5 s instead) — `realtime-client.ts` exists but unused
- [ ] `MetricsStrip`, `LiveRunTimeline`, `GenUiPreviewPanel` on `/` are still static
- [ ] `/agents` and `/miro` are placeholder pages
- [ ] No `/workspaces` discovery API; workspace IDs seeded client-side
- [ ] Approvals UI cannot capture a decision reason or request revision
- [ ] No component-level tests

---

## Hackathon plan for web

The web client is in good shape. Remaining items:
1. Switch `runs-chat.tsx` and `hero-command-panel.tsx` from polling to WebSocket via existing `realtime-client.ts` helpers.
2. Replace `MetricsStrip`/`LiveRunTimeline` static copy with real aggregates from admin endpoints (or new `/metrics` route).
3. Add a reason input on `<ApprovalsBoard/>` decision buttons.

[→ flutter.md](flutter.md) · [→ admin-console reference](../reference/admin-console.md) · [→ run-creation flow](../flows/run-creation.md)
