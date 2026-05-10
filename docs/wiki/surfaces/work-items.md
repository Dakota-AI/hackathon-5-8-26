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

## Web UI — ✅ live (since commit `b515e14`)

`apps/web/components/work-dashboard.tsx` uses `useWorkItems({ isAuthed, workspaceId })` from `apps/web/lib/use-work-items.ts`. When signed-in, fetches `/work-items?workspaceId=...` and per-item `useWorkItemDetail` (runs / events / artifacts / surfaces) in parallel. Creates new items via `POST /work-items` from a quick form. **Fixture mode only when signed-out.**

Also wired in `apps/web/components/app/runs-chat.tsx` — the conversation sidebar lists work items as conversations, and "New conversation…" creates a WorkItem via `createControlApiWorkItem`.

## Flutter UI — ⚠️ fixture (`ControlApi.listWorkItems` exists but not consumed)

`apps/desktop_mobile/lib/main.dart` page bodies still read from `FixtureWorkRepository` (`apps/desktop_mobile/lib/src/data/fixture_work_repository.dart`). Commit `b4d18fc` added `apps/desktop_mobile/lib/src/api/control_api.dart` with real `listWorkItems({workspaceId})` / `getWorkItem(id)` / `createWorkItem` / `updateWorkItemStatus` methods, but **the `controlApiProvider` is never read** by any rendering widget. Migration is just rewiring the providers.

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ⚠️ TS only |
| Storage | ✅ |
| API | ✅ |
| Worker | n/a |
| Realtime | 🔘 (no canonical event type) |
| Web | ✅ live |
| Flutter | ⚠️ fixture (real client coded, provider not consumed) |

## What needs to ship for hackathon

- [x] ~~Add `listControlApiWorkItems` etc. to web~~ — done in `lib/control-api.ts`
- [x] ~~Replace fixture in web work-dashboard~~ — done; signed-out fallback retained
- [x] ~~Wire "submit objective" form to create WorkItem~~ — done via `HeroCommandPanel` and `RunsChat`
- [ ] (Flutter) swap `FixtureWorkRepository` → real `ControlApi`-backed repository (provider already exists, just consume it)
- [ ] Decide on a `workitem.status.changed` canonical event so client refreshes can avoid polling

[→ runs-and-tasks](runs-and-tasks.md) · [→ control-api](../services/control-api.md)
