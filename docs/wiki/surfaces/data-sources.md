# Surface: Data Sources / DataSourceRefs

[← surfaces](README.md) · [wiki index](../README.md)

> External-data references (artifact pointers, inline data, third-party tables). Table + control-api routes are now wired. No worker producer or client renderer yet.

## Schema — 🔘

❌ No JSON schema, no TS type, no zod definition. Surface fixtures reference `dataSources: ["artifact-ref", "inline-data"]` as bare strings (`apps/web/lib/work-items.ts:160-162`).

## Storage — ✅

`DataSourcesTable` (`state-stack.ts:101-118`): partition `workspaceId`, sort `dataSourceId`. GSIs: `by-workitem-created-at`, `by-run-created-at`, `by-artifact-id`.

## Control API — ✅ implemented

`dataSourceRefsHandler` in `services/control-api/src/data-source-refs.ts` (replacing the earlier 501 stub). Routes at `control-api-stack.ts:295-307`:

| Method | Path | Notes |
|---|---|---|
| POST | `/data-source-refs` | Create reference |
| GET | `/data-source-refs/{dataSourceId}` | Single reference, owner-scoped |
| GET | `/work-items/{workItemId}/data-source-refs` | List by work item |
| GET | `/runs/{runId}/data-source-refs` | List by run |

Backed by `DataSourceRefStore` against `DataSourcesTable` (GSIs: `by-workitem-created-at`, `by-run-created-at`, `by-artifact-id`).

## Worker / Realtime / Web / Flutter

🔘 None at any layer.

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | 🔘 (TS-only, no JSON schema) |
| Storage | ✅ |
| API | ✅ implemented |
| Worker | 🔘 (no producer) |
| Realtime | 🔘 |
| Web | 🔘 |
| Flutter | 🔘 |

## What needs to ship for hackathon

- [x] ~~Implement `dataSourceRefsHandler`~~ — done; four routes live
- [ ] Define `DataSourceRefRecord` JSON schema in `packages/protocol/` for stable client typing
- [ ] Worker emits `data-source.linked` event when an artifact is referenced by a Surface, populating the `by-artifact-id` GSI
- [ ] Render data-source chips inside Surface cards on web and Flutter

🗑️ **Recommended skip for hackathon demo** unless an integration storyline benefits from it.

[→ generated-ui](generated-ui.md) · [→ artifacts](artifacts.md)
