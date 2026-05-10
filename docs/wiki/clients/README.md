# Clients Overview

[← wiki index](../README.md) · [STATUS](../STATUS.md) · [ARCHITECTURE](../ARCHITECTURE.md)

Three client packages exist; only two are alive.

| App | Status | Page |
|---|---|---|
| `apps/web` (Next.js) | ✅ real run loop + product surfaces (work-items / runs / artifacts / approvals / GenUI) + admin | [web.md](web.md) |
| `apps/desktop_mobile` (Flutter) | 🟡 auth + transport real, render paths still fixture | [flutter.md](flutter.md) |
| `apps/agent_console_flutter` | 🗑️ orphan (delete) | — |

## Cross-client parity

| Capability | web | desktop_mobile |
|---|---|---|
| Amplify Cognito configure | ✅ | ✅ |
| Cognito sign-in UI | ✅ Authenticator modal | ✅ SignInPage with sign-in/sign-up/confirm tabs |
| Cognito sign-out + storage cleanup | ✅ | ✅ via `authControllerProvider.signOut` |
| ID token attach to Control API | ✅ `requireIdToken()` | ✅ `AuthController.idToken()` (real Bearer) |
| Typed Control API client | ✅ `lib/control-api.ts` | ✅ `lib/src/api/control_api.dart` (8 endpoints) — **provider declared but never read** |
| WebSocket realtime client | ✅ `lib/realtime-client.ts` (helpers exist, **not consumed** — polls instead) | ✅ `lib/src/realtime/realtime_client.dart` — **provider declared but never read** |
| `POST /runs` create | ✅ via HeroCommandPanel | ❌ (page bodies still use FixtureWorkRepository) |
| `GET /runs/{id}/events` polling | ✅ (2.5 s in chat, 4 s in hero panel) | ❌ |
| Admin (`/admin/runs`, `/admin/runners`) | ✅ full admin SPA | ❌ |
| Agent Workshop CRUD | ✅ | ❌ |
| WorkItem dashboard | ✅ live | ⚠️ fixture |
| Kanban board | ❌ no kanban view | ⚠️ fixture-backed real Kanban widget |
| Agents workspace | ⚠️ placeholder | ⚠️ fixture grid + detail tabs (Overview/Activity/Artifacts/Approvals) |
| Runs (chat) | ✅ Open-WebUI-style chat | ⚠️ placeholder |
| Artifacts board | ✅ tiles + presigned download | ⚠️ via agent detail tabs (fixture) |
| Approvals UI interactive | ✅ Approve/Deny POST decision | ❌ buttons disabled |
| GenUI rendering | ✅ allowlist renderer (server-validated) | ⚠️ local `genui.SurfaceController` seed only + `fl_chart` |
| Embedded browser | ❌ | ✅ webview_flutter (https-only, JS off by default) |
| Workspace switcher | ✅ persisted to localStorage | ❌ |
| Dev/mock bypass mode | ✅ `NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS` | ✅ `authBypassProvider` |
| Backend IDs | env-driven (`NEXT_PUBLIC_*`) | **hardcoded in `backend_config.dart`** |

## Hackathon priorities

1. **Web is demo-ready.** Run-loop, admin console, all product surfaces wired. The only outstanding gaps are static dashboard widgets (`MetricsStrip`, `LiveRunTimeline`) and switching from polling to WebSocket.
2. **Flutter has the auth + transport layer real but pages still consume `FixtureWorkRepository`.** The fastest demo path: keep Flutter on fixtures and present web. The "right" fix is to swap each page from fixture provider to `controlApiProvider`/`realtimeClientProvider` (already declared, just unused). See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#4).
3. **Web → WebSocket** — `realtime-client.ts` is implemented but no component subscribes. Migrating `runs-chat.tsx` from 2.5 s polling to WebSocket is a small win.

[→ web.md](web.md) · [→ flutter.md](flutter.md)
