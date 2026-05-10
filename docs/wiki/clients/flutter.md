# Flutter (desktop_mobile) — `apps/desktop_mobile`

[← clients](README.md) · [wiki index](../README.md)

> Flutter desktop + mobile console. After commit `b4d18fc`, the app now ships an
> **Amplify Cognito sign-in gate**, a typed **`ControlApi` HTTP client**, a
> **`RealtimeClient` WebSocket wrapper**, an **Agents workspace** with detail
> tabs, a **Kanban board**, and an **embedded browser**. The plumbing is real,
> but the page bodies still read from `FixtureWorkRepository` — none of the
> render paths consume `controlApiProvider` or `realtimeClientProvider` yet.

**Maturity:** 🟡 auth + transport wired, render paths still fixture-backed.
**Stack:** Flutter SDK ^3.11.4, Riverpod 3, shadcn_flutter, genui, amplify_flutter, web_socket_channel, fl_chart, webview_flutter.

---

## `pubspec.yaml` deps

Source: `apps/desktop_mobile/pubspec.yaml`.

| Dep | Version | Class |
|---|---|---|
| `flutter` | sdk | UI |
| `shadcn_flutter` | ^0.0.52 | UI (primary widget kit) |
| `flutter_riverpod` | ^3.3.1 | State |
| `genui` | ^0.9.0 | A2UI surface rendering |
| `amplify_flutter` | ^2.11.0 | Amplify core |
| `amplify_auth_cognito` | ^2.11.0 | Cognito auth plugin |
| `http` | ^1.6.0 | REST client |
| `web_socket_channel` | ^3.0.3 | Realtime transport (new) |
| `webview_flutter` | ^4.13.1 | Embedded browser |
| `webview_flutter_wkwebview` | ^3.25.1 | iOS/macOS WebKit backend |
| `fl_chart` | ^1.2.0 | GenUI Lab charts (new) |
| `markdown_widget` | ^2.3.2+8 | Artifact previews |
| `go_router` | ^17.2.3 | declared but **still unused** |
| `intl`, `uuid`, `url_launcher`, `share_plus`, `cupertino_icons` | — | utility |

Dev: `flutter_test`, `flutter_lints` ^6.0.0.

---

## `lib/main.dart` (3,707 LOC monolith)

Top-level wiring lives in one file. `main()` calls
`AgentsCloudBackend.configureAmplify()` (still loads the embedded JSON from
`backend_config.dart`) before `runApp(const AgentsCloudConsoleApp())`.

### Boot tree

`AgentsCloudConsoleApp` → `ProviderScope` → `ShadcnApp` (dark theme) → `_AuthGate`.

`_AuthGate` (`main.dart:65-96`) is the new gate:
- On first frame, calls `ref.read(authControllerProvider.notifier).bootstrap()`.
- If `authBypassProvider` is true OR `auth.status == signedIn` → `ConsoleShell`.
- If status is `unknown` → centered `SquaresLoader`.
- Otherwise → `SignInPage`.

`authBypassProvider` (defined in `lib/src/auth/sign_in_page.dart`) lets users
skip auth and run on local fixtures; the widget tests flip it on via
`overrides`.

### Riverpod providers (top-level)

- `selectedPageProvider` — `ConsolePage` (default `work`).
- `selectedAgentIdProvider` — `String?` for the agent detail view.
- `sidebarCollapsedProvider` — `bool`.
- `authBypassProvider` — `bool` (in `sign_in_page.dart`).
- `authControllerProvider` — `NotifierProvider<AuthController, AuthState>`
  (in `lib/src/auth/auth_controller.dart`).
- `controlApiProvider` — `Provider<ControlApi>` (in `lib/src/api/control_api.dart`)
  — **declared, never read**.
- `realtimeClientProvider` — `Provider<RealtimeClient>` (in
  `lib/src/realtime/realtime_client.dart`) — **declared, never read**.
- `kanbanWorkRepositoryProvider`, `kanbanWorkItemsProvider` — fixture-backed
  (in `lib/src/widgets/kanban_board.dart`).

### Navigation

Still no `go_router`. `ConsoleShell` (`main.dart:98-140`) splits into:
- Compact (`width < 760`): `_MobileTopBar` + `_PageBody` + `_MobileNavBar`.
- Wide: `_Sidebar` + `_TopBar` + `_PageBody`.

`_PageBody` (`main.dart:531-551`) is a `switch` on `ConsolePage`:

| Sidebar (wide) order | `ConsolePage` | Class | Live or fixture? |
|---|---|---|---|
| Agents (0) | `work` | `_AgentsWorkspacePage` → `_AgentDetailPage` | **Fixture** (`FixtureWorkRepository`, `_fixtureAgents` const list) |
| Kanban (1) | `kanban` | `_KanbanPage` → `KanbanBoard` | **Fixture** (`kanbanWorkItemsProvider` ⇒ `FixtureWorkRepository`) |
| Approvals (2) | `approvals` | `_ApprovalsPage` → `_ApprovalQueuePanel` | **Fixture / static literals**, buttons disabled |
| Browser (3) | `browser` | `_BrowserPage` | **Live web** via `webview_flutter`, default `https://example.com`, https-only allowlist |
| GenUI Lab (4) | `genuiLab` | `_GenUiLabPage` | **Fixture-seeded** real `genui.SurfaceController` + `fl_chart` widgets |
| UI Kit (5) | `uiKit` | `_UiKitPage` | **Static** showcase (Buttons / Indicators / Approval card) |
| (not in sidebar) | `agents`, `runs`, `artifacts`, `miro` | `_AgentsPage`, `_RunsPage`, `_ArtifactsPage`, `_MiroPage` | **Fixture / placeholder** (only reachable via mobile nav `agents` pill or legacy code paths) |

`_TopBar` (`main.dart:354-392`) renders the signed-in email and a "Sign out"
gesture that calls `authControllerProvider.signOut()` and clears
`authBypassProvider`.

### `_AgentsWorkspacePage` / `_AgentDetailPage`

`main.dart:553-932`. Renders a grid of six hardcoded `_AgentDescriptor`s
(Executive, Research, Builder, Reviewer, Comms, Ops). Tapping a tile sets
`selectedAgentIdProvider` and pushes `_AgentDetailPage`, which has four
shadcn-style underline tabs:
- **Overview** — `_OverviewTab` (Current focus card).
- **Activity** — `_ActivityTab` (events list).
- **Artifacts** — `_ArtifactsTab` (typed artifact list, with "Open" jumping to
  the Browser page for web/preview kinds).
- **Approvals** — `_ApprovalsTab` (list of pending approvals).

The detail body is loaded by `FixtureWorkRepository.getWorkItem(workItemId)`
keyed off the descriptor's `workItemId` — purely fixture data.

### `_GenUiLabPage`

`main.dart:2021-2052`. Sections:
- `_GeneratedSurfacePreview` — static "validated catalog" copy.
- `_AgentChatStatePanel` — fixture chat bubbles + tool call line.
- `_GenUiChartGallery` — three `fl_chart` widgets (`LineChart`, `BarChart`,
  `PieChart`) with hardcoded data.
- `_LiveGenUiSurfaceCard` — a real `genui.Surface` driven by an in-memory
  `genui.SurfaceController` seeded with `CreateSurface` + `UpdateComponents`
  messages. **Local seed only**, no Control API patches.
- `_LoadingStatesPanel` — `_StateChip`s.

### `_BrowserPage`

`main.dart:2536-…`. Real `webview_flutter` controller. Uses
`WebKitWebViewControllerCreationParams` on Apple platforms, JavaScript
**disabled by default**, `https://`-only URL allowlist via `_safeHttpsUri`.
Default URL is `https://example.com` (the previous hardcoded
`launch-demo.preview.solo-ceo.ai` is gone). Status text reflects load
lifecycle.

---

## `lib/src/`

### `api/control_api.dart`

Real HTTP client wired against `agentsCloudControlApiUrl`
(`https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`, from
`backend_config.dart`). Every request fetches a Cognito **ID token** via
`AuthController.idToken()` and sends it as `Authorization: Bearer <token>`.

| Method | HTTP | Path | Sends | Receives |
|---|---|---|---|---|
| `listWorkItems({workspaceId})` | GET | `/work-items` (optional `?workspaceId=`) | — | List of WorkItem maps (unwraps `items`/`workItems`) |
| `getWorkItem(id)` | GET | `/work-items/{id}` | — | WorkItem map |
| `createWorkItem({workspaceId, title, objective})` | POST | `/work-items` | `{workspaceId, title, objective?, idempotencyKey}` | WorkItem map |
| `updateWorkItemStatus(id, status)` | POST | `/work-items/{id}/status` | `{status}` | WorkItem map |
| `startRun({workItemId, workspaceId, objective})` | POST | `/work-items/{id}/runs` | `{workspaceId, objective, idempotencyKey}` | Run map |
| `listRuns(workItemId)` | GET | `/work-items/{id}/runs` | — | List of Run maps |
| `listEvents(workItemId)` | GET | `/work-items/{id}/events` | — | List of event maps |
| `listArtifacts(workItemId)` | GET | `/work-items/{id}/artifacts` | — | List of artifact maps |

The `controlApiProvider` is a Riverpod `Provider<ControlApi>` that owns its
`http.Client` and pulls `idToken` from the auth notifier. **Nothing in the app
currently calls these methods.** The legacy `ControlApiClient.createRun` in
`backend_config.dart` (POST `/runs`) is also dead.

### `auth/auth_controller.dart`

Real Cognito flow on top of `amplify_auth_cognito`:
- `AuthState { status, email, idToken, errorMessage }` with statuses
  `unknown | signedOut | signedIn | signingIn | error`.
- `bootstrap()` — `Amplify.Auth.fetchAuthSession()`; if signed in, casts to
  `CognitoAuthSession`, pulls `userPoolTokensResult.value.idToken.raw`, and
  fetches the `email` user attribute.
- `signIn(email, password)` — `Amplify.Auth.signIn`, then `bootstrap()`.
- `signUp(email, password)` — `Amplify.Auth.signUp` with `email` user
  attribute via `CognitoUserAttributeKey.email`.
- `confirmSignUp(email, code)` — `Amplify.Auth.confirmSignUp`.
- `signOut()` — `Amplify.Auth.signOut` (errors swallowed) → `signedOut`.
- `idToken()` — fetches a fresh raw ID token for the HTTP layer.

Real Cognito; not a fixture bypass. The bypass is opt-in via
`authBypassProvider` from the sign-in page.

### `auth/sign_in_page.dart`

`SignInPage` is a `ConsumerStatefulWidget` with three tabs (`shadcn_flutter`
`Tabs`):
- **Sign in** — email + password + "Sign in" button (placeholder "Forgot
  password?" link is disabled).
- **Sign up** — email + password + "Create account"; on success,
  auto-switches to the Confirm tab and pre-fills email.
- **Confirm** — email + confirmation code + "Confirm"; on success, returns to
  Sign in tab.

A ghost button at the bottom — "Continue without sign-in (local fixtures)" —
flips `authBypassProvider` to true. While `signingIn`, the primary button
shows the `SquaresLoader` next to it. Errors render as a small red message
below the form. Palette is the same near-black inside the file
(`_Palette.background = #050505`).

### `realtime/realtime_client.dart`

Real WebSocket client backed by `web_socket_channel`. Hardcoded endpoint:
`wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`.

- `connect()` — pulls the Cognito ID token, URL-encodes it, opens
  `wss://…/dev?token=<token>`, listens for messages, decodes JSON, broadcasts
  through a `StreamController<Map<String, dynamic>>`. On error or done it
  clears the channel; errors are surfaced as `{error: …}` events.
- `subscribeRun({workspaceId, runId})` — sends
  `{"action":"subscribeRun","workspaceId":…,"runId":…}` over the open socket.
- `close()` — closes the sink and the broadcast controller.

`realtimeClientProvider` constructs one per `ProviderScope` and disposes it.
**Nothing currently subscribes** — the page bodies do not consume this
provider.

### `widgets/kanban_board.dart`

Provides the `KanbanBoard` widget used by `_KanbanPage`. It defines its own
`kanbanWorkRepositoryProvider` returning a fresh `FixtureWorkRepository`, and
a `kanbanWorkItemsProvider` (`FutureProvider<List<WorkItem>>`).

Layout: four columns — **TODO**, **IN PROGRESS**, **REVIEW**, **DONE** — keyed
off `WorkItem.summary.statusLabel` substring matching (e.g. `needs review` →
review, `running` / `in progress` → inProgress, `blocked` → todo, `complete` /
`done` → done, else todo). Cards show title, `nextAction`, status pill, and
artifact / approval counts. Wide layouts use `Expanded` per column; narrow
layouts switch to a horizontal scroll with min column width 220.

### `widgets/squares_loader.dart`

Self-contained `StatefulWidget`. Six small squares arranged 60° apart on a
14px radius, with opacity rippling 0.18 → 1.0 in a triangle wave so the
brightest square appears to rotate around the ring once every 1200ms. Used by
`_AuthGate` (loading state) and `SignInPage` (busy indicator).

### `data/fixture_work_repository.dart`

`WorkRepository` interface (`listWorkItems`, `getWorkItem`) plus
`FixtureWorkRepository` with three hardcoded items:
`work_competitor_pricing` (urgent, needs review), `work_launch_preview`
(running), `work_miro_research` (blocked). `listWorkItems` sorts by priority
→ status rank → title.

**Still in use** as the data source for `_AgentsWorkspacePage`,
`_AgentDetailPage`, `_WorkDashboard` (legacy `_CommandCenterPage`), and
`KanbanBoard`. There is no `RemoteWorkRepository` that calls `ControlApi`
yet.

### `domain/work_item_models.dart`

Domain types: `WorkItemStatus`, `WorkItemPriority`, `WorkItemRunStatus`,
`WorkItemEventTone`, `WorkItemArtifactKind/State`,
`WorkItemApprovalDecision`, `WorkItemSurfaceKind/Validation`. Aggregate
types: `WorkItemRunSummary`, `WorkItemEventSummary`,
`WorkItemArtifactSummary`, `WorkItemApprovalSummary`, `WorkItemSurfaceSummary`,
`WorkItem` (with `summary` getter, `validatedSurfaces` filter, `copyWith`),
`WorkItemSummary` factory, and `WorkItemsViewState` enum (`loading | empty |
denied | offline | stale | ready`). Also includes
`WorkItem.fixturePricingTracker()` for tests.

---

## `lib/backend_config.dart`

Hardcoded constants (still in source):
- `agentsCloudRegion = 'us-east-1'`
- `agentsCloudUserPoolId = 'us-east-1_1UeU1hTME'`
- `agentsCloudUserPoolClientId = '3kq79rodc3ofjkulh0b31sfpos'`
- `agentsCloudIdentityPoolId = 'us-east-1:5562c7da-9181-4b1e-9a5c-5d93a00bb442'`
- `agentsCloudControlApiUrl = 'https://ajmonuqk61.execute-api.us-east-1.amazonaws.com'`

`AgentsCloudBackend.configureAmplify()` adds `AmplifyAuthCognito` and
`Amplify.configure(...)`. The legacy `ControlApiClient.createRun` (POST
`/runs`) lives here and is now superseded by `lib/src/api/control_api.dart` —
recommend deleting.

---

## Tests — `apps/desktop_mobile/test/`

- **`widget_test.dart`** (5 tests). Boots the app with
  `authBypassProvider.overrideWith((_) => true)` and asserts:
  1. The Agents workspace renders (`Workspace`, `Executive`, `Builder`) and no
     legacy clutter.
  2. Tapping `Executive` opens the agent detail with `Overview / Activity /
     Artifacts / Approvals` tabs and `Current focus`.
  3. Sidebar has exactly 6 `NavigationItem`s; tapping Kanban shows the four
     columns; Browser shows `Embedded browser` + `Load URL`; GenUI Lab
     mounts a `LineChart` + `BarChart` + `PieChart`; UI Kit shows `UI testing
     suite`.
  4. Every nav rail entry exposes a `Tooltip`; collapsing the rail hides text
     labels.
  5. Without bypass and no session, the app renders `SignInPage` ("Sign in to
     continue").
- **`data/fixture_work_repository_test.dart`** — deterministic ordering, full
  detail wiring, missing-id null, empty-seed support.
- **`domain/work_item_models_test.dart`** — status labels, summary
  aggregation, `validatedSurfaces` allowlist, `WorkItemsViewState` labels.

No tests cover `ControlApi`, `AuthController`, `RealtimeClient`, or
`SignInPage`.

---

## Checklist

### What's wired
- [x] Amplify Cognito plugin loads at boot (`backend_config.dart` →
      `main.dart:18-22`).
- [x] Real **sign-in / sign-up / confirm / sign-out** UI gated by
      `_AuthGate` (`auth_controller.dart`, `sign_in_page.dart`).
- [x] **`ControlApi`** typed client with `Bearer <id-token>` headers and 8
      endpoint methods (`api/control_api.dart`).
- [x] **`RealtimeClient`** WebSocket wrapper against
      `wss://…execute-api…/dev?token=<idToken>` with `subscribeRun`
      action (`realtime/realtime_client.dart`).
- [x] Agents workspace, agent detail with 4 shadcn tabs, Kanban with TODO /
      IN PROGRESS / REVIEW / DONE columns.
- [x] Real `genui.Surface` driven by `genui.SurfaceController` (still local
      seed) and three `fl_chart` charts in GenUI Lab.
- [x] Embedded `webview_flutter` browser with https-only allowlist and JS
      disabled by default.
- [x] Domain model + view-state enum + 13 unit/widget tests.

### Gaps
- [ ] `controlApiProvider` is **not consumed anywhere** — `_AgentsWorkspacePage`,
      `_AgentDetailPage`, `_WorkDashboard`, `KanbanBoard`, `_RunsPage`,
      `_ArtifactsPage`, `_ApprovalsPage` all still use
      `FixtureWorkRepository` or static literals.
- [ ] `realtimeClientProvider` is **not consumed anywhere** — no
      `connect()` / `subscribeRun()` call site exists.
- [ ] No `RemoteWorkRepository` implementation backed by `ControlApi`.
- [ ] Approvals page buttons are `enabled: false`; no `POST` for
      approve / deny / request-revision (no API endpoint either).
- [ ] `_RunsPage`, `_ArtifactsPage`, `_AgentsPage`, `_MiroPage` are
      placeholder / static cards.
- [ ] `_AgentsWorkspacePage` agent list is a `const _fixtureAgents` literal.
- [ ] `go_router` declared in `pubspec.yaml`, navigation is still a single
      `StateProvider<ConsolePage>` enum switch.
- [ ] Cognito user pool / client / identity pool / Control API URL hardcoded
      in `backend_config.dart` (no env / build flavor).
- [ ] Realtime URL hardcoded in `realtime_client.dart:9-10`.
- [ ] `backend_config.dart` still ships the legacy `ControlApiClient` next to
      the new `ControlApi`.
- [ ] `main.dart` is now 3,707 lines in a single file.
- [ ] No unit tests for `ControlApi`, `AuthController`, `RealtimeClient`, or
      `SignInPage`.

---

## Hackathon plan for Flutter

1. Replace `FixtureWorkRepository` with a `RemoteWorkRepository` that uses
   `controlApiProvider` and exposes `Future`s + Riverpod `AsyncNotifier`s
   keyed by workspace.
2. Wire the existing `realtimeClientProvider` into a Riverpod `StreamProvider`
   that calls `connect()` once after sign-in and merges `subscribeRun`
   messages into the work-item view models.
3. Replace `_HeroCommandPanel` / `_AgentDetailPage` "create run" affordances
   with `controlApi.startRun(...)` calls.
4. Wire the Approvals page to a real approve / deny endpoint once Control API
   exposes one.
5. Move Cognito + API URLs into `--dart-define` build args.
6. Split `main.dart` into per-page files under `lib/src/pages/`.

If skipped: keep demoing from the web client and document the Flutter app as
"auth + transport ready, render paths still fixture-backed".

---

## `apps/agent_console_flutter`

🗑️ **Orphan/dead.** Only a `build/macos/...` cache exists. No `pubspec.yaml`,
no `lib/`. Recommend deletion. Nothing imports it.

[→ web.md](web.md) · [→ HACKATHON_CRITICAL_PATH](../HACKATHON_CRITICAL_PATH.md#4)
