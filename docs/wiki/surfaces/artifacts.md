# Surface: Artifacts

[← surfaces](README.md) · [wiki index](../README.md) · related: [agent-runtime](../services/agent-runtime.md), [control-api](../services/control-api.md)

> Files and reports the agent produces. Worker writes are real; HTTP read routes are now implemented (artifactsHandler).

## Schema — ✅

- `packages/protocol/schemas/events/artifact.schema.json`
- `ArtifactCreatedPayload` in `packages/protocol/src/events.ts:97-107`
- Builder: `buildArtifactCreatedEvent` at `events.ts:168-184`
- Kinds: `document / website / dataset / report / diff / miro-board / log / trace / other`

## Storage — ✅

- `ArtifactsTable` (`state-stack.ts:87-99`): partition `runId`, sort `artifactId`. GSIs: `by-workspace-kind-created-at`, `by-workitem-created-at`.
- Backing object store: `WorkspaceLiveArtifactsBucket` (versioned, S3-managed encryption, lifecycle to IA@30d).

## Control API — ✅ implemented

`artifactsHandler` in `services/control-api/src/artifacts.ts` (replacing the earlier 501 stub). Routes:

| Method | Path | Notes |
|---|---|---|
| GET | `/work-items/{workItemId}/artifacts` | Owner-scoped list, GSI `by-workitem-created-at` |
| GET | `/runs/{runId}/artifacts` | Owner-scoped list by runId |
| GET | `/runs/{runId}/artifacts/{artifactId}` | Single artifact metadata, owner-scoped |
| GET | `/runs/{runId}/artifacts/{artifactId}/download` | Presigned S3 download URL |

⚠️ No POST route — artifacts are server-side only, written by workers.

## Worker output — ✅ end-to-end

`services/agent-runtime/src/worker.ts:25-65`:
1. Hermes runner produces output (smoke mode → canned Markdown).
2. `artifacts.putArtifact` writes to S3:
   - Key: `workspaces/{workspaceId}/runs/{runId}/artifacts/{artifactId}/hermes-report.md`
   - Content-Type: `text/markdown; charset=utf-8`
3. `artifacts.putArtifactRecord` writes ArtifactsTable (`AwsArtifactSink:37-43`).
4. `events.putEvent(buildArtifactCreatedEvent(...))` appends to EventsTable.

Local harness equivalent: `local-harness.ts:402-420`.

⚠️ `artifactIdForAttempt` hardcoded `-0001` (`worker.ts:110-113`) — exactly one artifact per run.

## Realtime — ✅

`artifact.created` envelope lands in EventsTable and rides the same DDB-stream path as run.status. No dedicated topic.

## Web UI — ✅ dedicated artifacts board (since commit `b515e14`)

- `apps/web/app/(console)/artifacts/page.tsx` — route mounting `<ArtifactsBoard/>`.
- `apps/web/components/app/artifacts-board.tsx` — work-item picker + artifact tiles + GenUI surface preview. Calls `listControlApiWorkItemArtifacts` + `listControlApiWorkItemSurfaces`. Each tile has a "Download" button that fetches a presigned URL via `getControlApiArtifactDownloadUrl({workspaceId, runId, artifactId, expiresIn})` and opens it.
- Also rendered inline in the `/` work dashboard via `WorkDashboard` per-item bundle.
- Falls back to demo markdown when signed out.

## Flutter UI — ⚠️ fixture

`_ArtifactGalleryPanel` (`main.dart:2026-2087`) renders hardcoded `_ArtifactTile` widgets. WorkItem detail card lists fixture artifacts at `main.dart:783-794`.

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ✅ |
| Storage | ✅ |
| API | ✅ implemented (list + get + presigned download) |
| Worker | ✅ |
| Realtime | ✅ |
| Web | ✅ dedicated `/artifacts` board with download |
| Flutter | ⚠️ fixture (`ControlApi.listArtifacts(workItemId)` exists but not consumed) |

## What needs to ship for hackathon

- [x] ~~Implement `artifactsHandler`~~ — done
- [x] ~~ArtifactStore interface + Dynamo impl~~ — done
- [x] ~~Sign S3 URI to presigned URL~~ — done via `/download` route (default 5 min, max 15 min, clamped)
- [x] ~~Add `ArtifactsPage` to web~~ — done at `app/(console)/artifacts/page.tsx`
- [ ] (Flutter) consume `controlApiProvider` and `ControlApi.listArtifacts(workItemId)` in agent detail / dedicated artifacts page

See [HACKATHON_CRITICAL_PATH.md#7](../HACKATHON_CRITICAL_PATH.md).

[→ runs-and-tasks](runs-and-tasks.md) · [→ work-items](work-items.md)
