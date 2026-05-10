# Surface: Runs & Tasks

[← surfaces](README.md) · [wiki index](../README.md) · related: [run-creation flow](../flows/run-creation.md), [control-api](../services/control-api.md), [agent-runtime](../services/agent-runtime.md), [realtime-api](../services/realtime-api.md)

> The execution unit. The only end-to-end-real surface (DDB + worker + realtime + web).

## Schema — ✅

- `packages/protocol/schemas/events/run-status.schema.json`
- Runtime type: `RunStatusPayload` in `packages/protocol/src/events.ts:81-95`
- Builder: `buildRunStatusEvent` at `events.ts:142-166`
- Status enum: `queued / planning / waiting_for_approval / running / testing / archiving / succeeded / failed / cancelled` (`events.ts:3-12`)
- Examples: `packages/protocol/examples/run-status-event.json`

Tasks: no standalone schema. `TaskRecord` in `services/control-api/src/ports.ts:85-95`. `taskId` is an optional discriminator on every canonical event.

## Storage — ✅

- `RunsTable` (`state-stack.ts:47-69`): partition `workspaceId`, sort `runId`. GSIs: `by-user-created-at`, `by-run-id`, `by-idempotency-scope`, `by-workitem-created-at`.
- `TasksTable` (`state-stack.ts:71-77`): partition `runId`, sort `taskId`. GSI `by-worker-class-created-at`.
- `EventsTable` (`state-stack.ts:79-85`): partition `runId`, sort `seq`. **Stream NEW_IMAGE enabled.** GSI `by-workspace-created-at`.

## Control API — ✅ real (one minor gap)

| Method | Path | Status |
|---|---|---|
| GET | `/runs` | ✅ user listing via `by-user-created-at` GSI |
| POST | `/runs` | ✅ real, transactional, idempotent. See [run-creation flow](../flows/run-creation.md) |
| GET | `/runs/{runId}` | ✅ real, owner-scoped |
| GET | `/runs/{runId}/events` | ✅ real, owner-scoped |
| GET | `/admin/runs` | ✅ admin-only Scan |
| GET | `/admin/runs/{runId}/events` | ✅ admin-only |
| GET | `/runs/{runId}/tasks` | ❌ still missing |

## Worker output — ✅

`services/agent-runtime/src/worker.ts:20-22, 66-68`:
- `events.updateRunStatus("running" | "succeeded" | "failed")` writes the Run row.
- `buildRunStatusEvent(...)` envelopes appended to EventsTable.
- Tasks: `updateTaskStatus(...)` rows.

⚠️ **Smoke worker doesn't actually do work** — `HERMES_RUNNER_MODE=smoke` returns canned text without calling a model. See [agent-runtime.md](../services/agent-runtime.md).

⚠️ Worker hardcodes `seq=2,3,4`. Retries crash on conditional-check failures.

## Realtime — ✅

- EventsTable Stream NEW_IMAGE → relay Lambda (`services/realtime-api/src/relay.ts`) → WebSocket fanout.
- Web subscribes via `apps/web/lib/realtime-client.ts` with userId-filtered fanout.
- ⚠️ `subscribeRun` does not verify ownership (mitigated by relay-side userId filter).

## Web UI — ✅ real

`apps/web/components/command-center.tsx`:
- Calls `createControlApiRun`, polls `getControlApiRun` + `listControlApiRunEvents`.
- WebSocket realtime when configured; falls back to mock mode.
- `apps/web/lib/run-ledger.ts` derives a ledger view from canonical events.

## Flutter UI — ⚠️ fixture

`_LiveRunTimeline` (`main.dart:1174-1228`) and `_RunLedgerCard` (`main.dart:1985-2024`) are static markdown placeholders.

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ✅ run-status |
| Storage | ✅ |
| API | ✅ (no `GET /runs` listing) |
| Worker | ⚠️ smoke only; hardcoded seq |
| Realtime | ✅ |
| Web | ✅ |
| Flutter | ⚠️ fixture |

## What needs to ship for hackathon

- [x] ~~Add `GET /runs` user listing~~ — done; queries `by-user-created-at` GSI.
- [ ] **Add `GET /runs/{runId}/tasks`** route + handler reading TasksTable.
- [ ] **Replace smoke worker with real model call** — see [agent-runtime.md](../services/agent-runtime.md).
- [ ] **Stop hardcoding seq numbers** in worker.
- [ ] **Render task chips** inside run-detail view (web command-center and Flutter run page).
- [ ] (Flutter) replace `_LiveRunTimeline` static text with real `/events` fetch + WebSocket subscribe.
- [ ] (Optional) `subscribeRun` ownership check.

[→ artifacts](artifacts.md) · [→ work-items](work-items.md) · [→ run-creation flow](../flows/run-creation.md)
