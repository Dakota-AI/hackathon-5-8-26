# Clients Overview

[← wiki index](../README.md) · [STATUS](../STATUS.md) · [ARCHITECTURE](../ARCHITECTURE.md)

Three client packages exist; only two are alive.

| App | Status | Page |
|---|---|---|
| `apps/web` (Next.js) | ✅ real run loop + admin console | [web.md](web.md) |
| `apps/desktop_mobile` (Flutter) | ⚠️ shell only — no live API/WebSocket | [flutter.md](flutter.md) |
| `apps/agent_console_flutter` | 🗑️ orphan (delete) | — |

## Cross-client parity

| Capability | web | desktop_mobile |
|---|---|---|
| Amplify Cognito configure | ✅ | ✅ |
| Cognito sign-in UI | ✅ | ❌ |
| Cognito sign-out + storage cleanup | ✅ | ❌ |
| ID token attach to Control API | ✅ | code exists, **never called** |
| `POST /runs` create | ✅ | ❌ (coded, unused) |
| `GET /runs/{id}/events` polling | ✅ | ❌ |
| WebSocket realtime | ✅ (with backfill) | ❌ |
| Admin (`/admin/runs`, `/admin/runners`) | ✅ | ❌ |
| Agent Workshop CRUD | ✅ | ❌ |
| WorkItem dashboard | ⚠️ fixture | ⚠️ fixture |
| GenUI rendering | ❌ placeholder | ⚠️ local `genui` SurfaceController, seeded |
| Approvals interactive | ❌ disabled | ❌ disabled |
| Dev/mock bypass mode | ✅ | ❌ |
| Hardcoded backend IDs | env-driven | **in source** |
| In-app preview browser | ❌ | ✅ webview_flutter |

## Hackathon priorities

1. **Web is the demo client.** The admin console, run-loop, and realtime are real.
2. **Flutter is shell-deep but unwired.** Choose: (a) demo from web only and treat Flutter as roadmap, or (b) wire minimum-viable Flutter live integration (sign-in + create-run + WebSocket). See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#4).
3. **Replace web fixtures** for WorkDashboard with real `/work-items` calls. ~2–3 hr work. See [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md#5).

[→ web.md](web.md) · [→ flutter.md](flutter.md)
