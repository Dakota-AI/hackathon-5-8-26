# Surface: Work Items

[← surfaces](README.md) · [wiki index](../README.md) · related: [control-api](../services/control-api.md), [run-creation](../flows/run-creation.md)

> Objectives — the layer above Runs. Multiple Runs can attach to one WorkItem.

## Schema

❌ No JSON Schema. TypeScript-only.

- `WorkItemRecord` in `services/control-api/src/ports.ts:15-29`
- Web client type at `apps/web/lib/work-items.ts:48-63`
- Flutter mirror at `apps/desktop_mobile/lib/src/domain/work_item_models.dart`

## Storage

`WorkItemsTable` in `infra/cdk/src/stacks/state-stack.ts:28-45`:
- Partition: `workspaceId`
- Sort: `workItemId`
- GSIs:
  - `by-user-created-at` (userId / createdAt)
  - `by-status-updated-at` (workspaceStatus / updatedAt)
  - `by-idempotency-scope` (idempotencyScope)

## Control API — ✅ real

Routes in `services/control-api/src/work-items.ts`, dispatched via `workItemsHandler` (`handlers.ts:214-313`):

| Method | Path | Function |
|---|---|---|
| POST | `/work-items` | `createWorkItem` (with idempotency hash) |
| GET | `/work-items` | list by user, optional `workspaceId` filter |
| GET | `/work-items/{workItemId}` | by-owner check |
| PATCH | `/work-items/{workItemId}` | update fields |
| POST | `/work-items/{workItemId}/status` | `updateWorkItemStatus`, whitelist `open / in_progress / blocked / completed / cancelled` |
| POST | `/work-items/{workItemId}/runs` | create child run via `createWorkItemRun` |
| GET | `/work-items/{workItemId}/runs` | owner-scoped run list |
| GET | `/work-items/{workItemId}/events` | owner-scoped event list |

CDK provisioning at `control-api-stack.ts:237-250`.

## Worker output

🔘 None. Workers don't write WorkItems; the API creates them and only links runs. There is no `workitem.*` event type.

## Realtime

🔘 Not directly streamed. Clients refresh via the listed endpoints. Run events that link a `workItemId` flow through the run channel.

## Web UI — ⚠️ fixture

`apps/web/components/work-dashboard.tsx` calls `listFixtureWorkItems()` from `apps/web/lib/work-items.ts:239`. Banner at line 50-55: "Fixture-backed until the WorkItem Control API slice is finalized."

❌ No real-data fetcher in `apps/web/lib/control-api.ts` for `/work-items`.

## Flutter UI — ⚠️ fixture

`apps/desktop_mobile/lib/main.dart:532-577` reads `_repository.listWorkItems()` where the repository is `FixtureWorkRepository` (`apps/desktop_mobile/lib/src/data/fixture_work_repository.dart`).

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ⚠️ TS only |
| Storage | ✅ |
| API | ✅ |
| Worker | n/a |
| Realtime | 🔘 (no canonical event type) |
| Web | ⚠️ fixture |
| Flutter | ⚠️ fixture |

## What needs to ship for hackathon

- [ ] Add `listControlApiWorkItems` / `createControlApiWorkItem` / `getControlApiWorkItem` to `apps/web/lib/control-api.ts`
- [ ] Replace `listFixtureWorkItems()` in `apps/web/components/work-dashboard.tsx:15` with real fetcher; fall back to fixture only when `getControlApiHealth().configured === false`
- [ ] Wire CommandCenter "submit objective" form to optionally create a WorkItem first, then a child Run
- [ ] (Flutter, if pursued) swap `FixtureWorkRepository` → `RemoteWorkRepository` driven by `backend_config.dart`
- [ ] Decide and document a `workitem.status.changed` canonical event so client refreshes can avoid polling

[→ runs-and-tasks](runs-and-tasks.md) · [→ control-api](../services/control-api.md)
