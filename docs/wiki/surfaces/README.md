# Product Surfaces

[← wiki index](../README.md) · [STATUS](../STATUS.md) · [ARCHITECTURE](../ARCHITECTURE.md)

User-facing concepts the platform produces. For each surface: schema, storage, API, worker output, realtime, web UI, Flutter UI.

## Pages

- [Work items](work-items.md)
- [Runs & tasks](runs-and-tasks.md)
- [Artifacts](artifacts.md)
- [Approvals & notifications](approvals-and-notifications.md)
- [Generated UI / GenUI](generated-ui.md)
- [Data sources](data-sources.md)

---

## Surface readiness matrix

Legend: ✅ done · ⚠️ partial · ❌ stub · 🔘 nothing

| Surface | Schema | DDB | API | Worker | Realtime | Web | Flutter |
|---|---|---|---|---|---|---|---|
| [Work items](work-items.md) | ⚠️ TS only | ✅ | ✅ | n/a | 🔘 (no event) | ⚠️ fixture | ⚠️ fixture |
| [Runs & tasks](runs-and-tasks.md) | ✅ | ✅ | ✅ (`GET /runs` live) | ✅ | ✅ | ✅ | ⚠️ fixture |
| [Artifacts](artifacts.md) | ✅ | ✅ | ✅ list/get/download | ✅ | ✅ | ⚠️ via run only | ⚠️ fixture |
| [Approvals](approvals-and-notifications.md) | ✅ | ✅ | ✅ create/list/decision | ⚠️ harness only | ✅ | 🔘 | ⚠️ fixture |
| [Notifications](approvals-and-notifications.md) | 🔘 | 🔘 | 🔘 | 🔘 | 🔘 | 🔘 | 🔘 |
| [Generated UI](generated-ui.md) | ⚠️ event only | ✅ | ✅ CRUD + publish | 🔘 (no producer) | 🔘 | 🔘 | ⚠️ local seed |
| [Data sources](data-sources.md) | 🔘 | ✅ | ✅ create/list/get | 🔘 | 🔘 | 🔘 | 🔘 |

---

## Headline read

- **Runs and Artifacts** are end-to-end (DDB + worker + realtime + web).
- **WorkItems** are wired in API and DDB but every client renders fixtures.
- **Approvals**, **GenUI Surfaces**, **DataSourceRefs** now have working API routes (no longer 501). **Producers (worker emissions) and renderers (web/Flutter) are still missing**.
- **Notifications** doesn't exist at any layer.
- **Tasks** are written but not exposed (`GET /runs/{runId}/tasks` still missing).

---

## Hackathon priorities for surfaces

(In rough order of importance — see [HACKATHON_CRITICAL_PATH.md](../HACKATHON_CRITICAL_PATH.md))

1. **Wire WorkItems** — backend exists, clients on fixtures (~2-3 hr).
2. **Add `GET /runs` user listing** (~1 hr).
3. **Implement Artifacts read endpoints** + signed S3 URLs (~2-3 hr).
4. **Approvals** — only if demo storyline needs a "agent asks user permission" beat.
5. **GenUI** — bigger lift; only if visible in demo.
6. **DataSources** — defer.
7. **Notifications** — defer (or fold into Approvals + run.status).
