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

## Web UI — ⚠️ via run only

`apps/web/components/command-center.tsx:106-108, 276-291` derives `visibleArtifacts` from `deriveRunLedgerView(...).artifacts`. `run-ledger.ts:73-90` extracts `kind / name / uri / previewUrl` from canonical event payloads.

❌ There is no dedicated `/artifacts` page yet — even though backend routes now exist. Artifacts only render in the live run view.

## Flutter UI — ⚠️ fixture

`_ArtifactGalleryPanel` (`main.dart:2026-2087`) renders hardcoded `_ArtifactTile` widgets. WorkItem detail card lists fixture artifacts at `main.dart:783-794`.

---

## Status checklist

| Layer | Status |
|---|---|
| Schema | ✅ |
| Storage | ✅ |
| API | ✅ implemented (list + get + download) |
| Worker | ✅ |
| Realtime | ✅ |
| Web | ⚠️ no dedicated list page yet (only via run events) |
| Flutter | ⚠️ fixture |

## What needs to ship for hackathon

- [x] ~~Implement `artifactsHandler`~~ — done; routes `/work-items/{id}/artifacts`, `/runs/{id}/artifacts`, `/runs/{id}/artifacts/{artifactId}`, `/runs/{id}/artifacts/{artifactId}/download` are live
- [x] ~~ArtifactStore interface + Dynamo impl~~ — done
- [x] ~~Sign S3 URI to presigned URL~~ — done via `/download` route
- [ ] Add an `ArtifactsPage` to web at `apps/web/app/` rendering by WorkItem; reuse `ArtifactCard` shape from `apps/web/lib/run-ledger.ts:11-16`
- [ ] (Flutter) replace fixture in `_ArtifactGalleryPanel` with fetch against `/work-items/{id}/artifacts`

See [HACKATHON_CRITICAL_PATH.md#7](../HACKATHON_CRITICAL_PATH.md).

[→ runs-and-tasks](runs-and-tasks.md) · [→ work-items](work-items.md)
