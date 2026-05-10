# Flutter (desktop_mobile) — `apps/desktop_mobile`

[← clients](README.md) · [wiki index](../README.md)

> Flutter desktop + mobile console. Polished UI shell with Amplify configured, but **no live API or WebSocket calls reach the backend**. Most pages are static literals.

**Maturity:** ⚠️ shell only.
**Stack:** Flutter 3.11+, Riverpod, shadcn_flutter, genui, amplify_flutter.

---

## `pubspec.yaml` deps

| Dep | Version | Class |
|---|---|---|
| flutter | sdk | UI |
| shadcn_flutter | ^0.0.52 | UI (primary widget kit) |
| flutter_riverpod | ^3.3.1 | State |
| genui | ^0.9.0 | GenUI rendering |
| amplify_flutter | ^2.11.0 | Auth |
| amplify_auth_cognito | ^2.11.0 | Auth |
| http | ^1.6.0 | HTTP |
| webview_flutter | ^4.13.1 | UI |
| markdown_widget | ^2.3.2+8 | UI |
| go_router | ^17.2.3 | declared but **unused** |
| intl, uuid, url_launcher, share_plus, cupertino_icons | — | utility |

---

## `lib/main.dart` (2,574 LOC monolith)

**Riverpod providers** (only two, both `StateProvider`):
- `selectedPageProvider` — `ConsolePage` enum
- `sidebarCollapsedProvider` — `bool`

**Navigation:** No `go_router` despite the dep. A single in-memory enum switch in `_PageBody` maps `ConsolePage` → page widget.

### Pages (enum `ConsolePage`)

| Page | Class | Status |
|---|---|---|
| `work` | `_CommandCenterPage` | WorkDashboard (fixture) + Hero composer (mock) + Metrics + LiveRunTimeline + GenUiPreviewPanel |
| `genuiLab` | `_GenUiLabPage` | GeneratedSurfacePreview + AgentChatStatePanel + LoadingStatesPanel |
| `browser` | `_BrowserPage` | webview_flutter loading hardcoded `https://launch-demo.preview.solo-ceo.ai` |
| `uiKit` | `_UiKitPage` | Buttons, Indicators, Approval examples (showcase only) |
| `agents` | `_AgentsPage` | `_PlaceholderPage` |
| `approvals` | `_ApprovalsPage` | `_ApprovalQueuePanel` (static cards, disabled buttons) |
| `runs` | `_RunsPage` | `_RunLedgerCard` + `_ChatSurfacePanel` (static) |
| `artifacts` | `_ArtifactsPage` | Gallery + Markdown + BrowserPreview (static) |
| `miro` | `_MiroPage` | `_PlaceholderPage` |

60+ stateless/stateful widgets in one file. Should be split for maintainability (see [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#4)).

---

## Other `lib/` files

- **`lib/backend_config.dart`** — Hardcoded Amplify JSON (region, user pool, identity pool, Control API URL `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`). `AgentsCloudBackend.configureAmplify()` called from `main()`. Includes `ControlApiClient` class with `createRun(...)` doing `Bearer`-token POST `/runs` — **but `ControlApiClient` is never instantiated**.
- **`lib/src/data/fixture_work_repository.dart`** — `WorkRepository` interface + `FixtureWorkRepository` with hardcoded WorkItems mirroring web fixtures.
- **`lib/src/domain/work_item_models.dart`** — Domain enums + `WorkItem`, `WorkItemSummary`, `WorkItemsViewState`. Includes `WorkItem.fixturePricingTracker()`.

---

## Auth integration

- `AgentsCloudBackend.configureAmplify()` adds `AmplifyAuthCognito` and configures from embedded JSON. Called from `main()` before `runApp`.
- ❌ **No sign-in UI.** No `signIn`/`signOut`/`fetchAuthSession`/`getIdToken` is invoked anywhere in `main.dart`.
- The Amplify config is loaded but never used to gate anything.

## Control API integration

- `ControlApiClient` exists in `backend_config.dart` (`POST /runs` with Bearer ID token).
- ❌ **Never instantiated or referenced** in `main.dart`. No Control API call paths are reachable from the running app.

## Realtime

- ❌ No `WebSocket`, no `web_socket_channel`, no realtime subscription anywhere.
- The doc copy in `_GenUiPreviewPanel` calls this out: "Next: Control API event schema and Cloudflare websocket transport" (`main.dart:1282-1283`).

## GenUI

- `_GenUiPreviewPanel` (`main.dart:1221-1332`) creates a local `genui.SurfaceController` with `BasicCatalogItems` and seeds it with **hardcoded** `CreateSurface`/`UpdateComponents` messages.
- ❌ No Control API patches, no event ingestion. Local fixture rendering on a real GenUI runtime.

---

## Fixtures / placeholders

- `_AgentsPage`, `_MiroPage` → `_PlaceholderPage` instances.
- `_BrowserPage` → hardcoded `launch-demo.preview.solo-ceo.ai` URL.
- All chat bubbles, artifact tiles, approval cards, run ledger entries, metrics, timeline items in `main.dart` are inline-literal text.
- `_HeroCommandPanel` shows `_StatusPill(label: 'fixture UI only')` (line 1083).
- `_WorkDashboard.repository` is a `FixtureWorkRepository` regardless of backend signal.
- "Streaming progress indicator + audit trail placeholder" comment at line 1445.

---

## Checklist

### What's wired
- [x] Amplify plugin loads at boot
- [x] Local GenUI renderer with `BasicCatalogItems` and seeded surface
- [x] Fixture WorkRepository + domain models + tests
- [x] In-app webview for preview URLs

### Gaps for hackathon multi-user
- [ ] No sign-in/sign-out UI (Authenticator equivalent missing)
- [ ] `ControlApiClient` exists but is never invoked — no real run create
- [ ] No `fetchAuthSession`/ID token retrieval at call sites
- [ ] No WebSocket realtime
- [ ] GenUI surface uses local seed, not Control API event-driven patches
- [ ] `go_router` declared but unused; navigation is a single `StateProvider`
- [ ] Most pages are static literals (Runs, Agents, Approvals, Artifacts, Miro)
- [ ] Cognito secrets/IDs hardcoded in source (`backend_config.dart:8-13`)

---

## Hackathon plan for Flutter

Time-boxed (1 day):
1. Add Amplify Authenticator widget for sign-in.
2. Implement `fetchAuthSession()` to retrieve ID token.
3. Wire `ControlApiClient.createRun(...)` into a Riverpod provider used by the command center.
4. Add `web_socket_channel` and replicate the web's subscribe/parse/merge loop.
5. Replace `FixtureWorkRepository` with `RemoteWorkRepository` against `/work-items` (after web does the same).

If skipped: demo from web only and document Flutter as roadmap.

---

## `apps/agent_console_flutter`

🗑️ **Orphan/dead.** Only a `build/macos/...` cache exists. No `pubspec.yaml`, no `lib/`. Recommend deletion. Nothing imports it.

[→ web.md](web.md) · [→ HACKATHON_CRITICAL_PATH](../HACKATHON_CRITICAL_PATH.md#4)
