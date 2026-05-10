# Surface: Generated UI / GenUI / A2UI

[← surfaces](README.md) · [wiki index](../README.md)

> Dynamic UI patches the agent ships to clients. Event schema reserved, table + control-api routes wired, but **no worker producer** and **no web renderer** yet. Flutter has only a local seed.

## Schema — ⚠️ event only

- `packages/protocol/schemas/events/a2ui-delta.schema.json` defines an A2UI delta payload `{surfaceId, catalogId, message}` where `message` is one of `createSurface`, `updateComponents`, etc.
- ❌ No `Surface` (the durable object) JSON schema.
- ❌ No TS type for SurfaceRecord.

## Storage — ✅

`SurfacesTable` (`state-stack.ts:120-138`): partition `workspaceId`, sort `surfaceId`. GSIs: `by-workitem-updated-at`, `by-run-updated-at`, `by-status-updated-at`.

## Control API — ✅ implemented + validated

`surfacesHandler` in `services/control-api/src/surfaces.ts` (commit `ba54101` added server-side validation):

- **`surfaceType` allowlist:** `dashboard | report | preview | table | form | markdown`
- **`status` allowlist:** `draft | review | published | archived`
- **`definition` size cap:** 64 KiB max (`MAX_DEFINITION_BYTES = 64 * 1024`)
- Validation runs on create + on update when fields are supplied
- 11 dedicated tests in `services/control-api/test/surfaces.test.ts`

Routes at `control-api-stack.ts:309-322`:

| Method | Path | Notes |
|---|---|---|
| POST | `/surfaces` | Create surface |
| GET | `/surfaces/{surfaceId}` | Single surface, owner-scoped |
| PATCH | `/surfaces/{surfaceId}` | Update fields |
| GET | `/work-items/{workItemId}/surfaces` | List by work item |
| GET | `/runs/{runId}/surfaces` | List by run |
| POST | `/surfaces/{surfaceId}/publish` | Publish updates |

Backed by `SurfaceStore` against `SurfacesTable` (GSIs: `by-workitem-updated-at`, `by-run-updated-at`, `by-status-updated-at`).

## Worker output — 🔘

❌ No code path in `services/agent-runtime/src/` emits `a2ui.delta` or writes `SurfacesTable`. No producer.

## Realtime — 🔘

The event type is reserved (schema exists) but no producer fires it, so the relay never carries one.

## Web UI — ✅ allowlist renderer (since commit `b515e14`)

`apps/web/components/app/genui-renderer.tsx` renders server-validated A2UI component trees through a strict allowlist:

```
container, row, column, stack, heading, text, muted, code, markdown,
card, panel, list, table, stat, stat-grid, pill, bar-chart, divider
```

- Anything outside the allowlist renders as `unsupported component: <type>`.
- Recursion depth capped at 6.
- `markdown` rendered through `react-markdown` + `remark-gfm` (no raw HTML allowed).
- Surfaces with `validation !== "server-validated"` render at `opacity-70` with an "unvalidated" pill.
- Embedded into:
  - `WorkDashboard` (work item detail) via `<GenUiSurface/>`
  - `ArtifactsBoard` (artifacts page surface preview)

⚠️ Web fetches surfaces via `listControlApiWorkItemSurfaces({workspaceId, workItemId})`. There's no realtime patch path — `a2ui.delta` events from EventsTable aren't consumed by the renderer.

## Flutter UI — ⚠️ local seed only

`_GenUiLabPage` (`main.dart:1229+`) creates a `genui.SurfaceController` and `_seedSurface()` calls `genui.CreateSurface(...)` with a hand-coded message. There is no transport hooked to the controller.

The doc copy at `main.dart:1282-1283` admits: *"Current scaffold: local SurfaceController + BasicCatalog. Next: Control API event schema and Cloudflare websocket transport."*

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ⚠️ event only, no Surface record |
| Storage | ✅ |
| API | ✅ implemented + server-side validation (surfaceType / status / 64KiB cap) |
| Worker | 🔘 (no a2ui.delta producer) |
| Realtime | 🔘 (no producer to relay) |
| Web | ✅ allowlist renderer (`<GenUiSurface/>`) |
| Flutter | ⚠️ local seed only (`genui.SurfaceController` + `fl_chart`) |

## What needs to ship for hackathon (only if demo features GenUI prominently)

- [x] ~~Implement `surfacesHandler`~~ — done; six routes live (CRUD + publish)
- [ ] Define a Surface record schema (`packages/protocol/schemas/surface.schema.json`) and a TS `SurfaceRecord` type for stable client typing
- [ ] Have a worker emit at least one `a2ui.delta` event per run (start with a static `createSurface` like the Flutter seed)
- [ ] Wire the relay to forward `a2ui.delta` envelopes; subscribe Flutter `genui.SurfaceController` to that stream instead of `_seedSurface()`
- [ ] Add a web renderer (Flutter has `package:genui`; web has no equivalent yet)

🗑️ **Skip recommendation:** if GenUI isn't core to the demo, defer this entire surface. The Flutter local seed shows the rendering capability already.

[→ approvals-and-notifications](approvals-and-notifications.md) · [→ data-sources](data-sources.md)
