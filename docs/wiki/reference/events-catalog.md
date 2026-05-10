# Events Catalog

[← reference](README.md) · [wiki index](../README.md) · related: [protocol-package](protocol-package.md), [run-creation flow](../flows/run-creation.md)

> Every canonical event type defined in the system, who produces it, who consumes it, and current status.

---

## Quick reference

| `type` | Schema | Producer (today) | Consumer |
|---|---|---|---|
| `run.status` | `events/run-status.schema.json` | control-api `create-run.ts` (seq=1), agent-runtime `worker.ts` (seq=2,4) | realtime-api relay → web command-center |
| `artifact.created` | `events/artifact.schema.json` | agent-runtime `worker.ts` (seq=3) | realtime-api relay → web command-center → run ledger |
| `tool.approval` | `events/tool-approval.schema.json` | local-harness only | not consumed in production |
| `a2ui.delta` | `events/a2ui-delta.schema.json` | **no producer** | not consumed |

---

## `run.status`

**Producer:** Control API (initial `queued`) and agent-runtime worker (`running`, `succeeded`, `failed`, etc.).

**Payload (`RunStatusPayload`):**
- `runId` (required)
- `status` (required) — one of:
  - `queued` — Control API just wrote the run row
  - `planning` — agent is decomposing the objective (used by local harness)
  - `waiting_for_approval` — agent paused on a `tool.approval` request
  - `running` — worker actively executing
  - `testing` — eval/test phase (not used today)
  - `archiving` — finalizing artifacts (used by local harness)
  - `succeeded` — terminal success
  - `failed` — terminal failure
  - `cancelled` — user-initiated cancellation (no producer today)
- Optional: `taskId`, `message`, `progress` (0–1), `workerClass`, `startedAt`, `finishedAt`, `error: {code, message, retryable?}`

**Sequence in a successful smoke run:**
- seq=1 → `queued` (Control API)
- seq=2 → `running` (worker)
- seq=4 → `succeeded` (worker)

**Sequence in a failed smoke run:**
- seq=1 → `queued`
- seq=2 → `running`
- seq=3 → `failed` (with error)

---

## `artifact.created`

**Producer:** agent-runtime worker only.

**Payload (`ArtifactCreatedPayload`):**
- `artifactId` (required)
- `kind` (required) — one of:
  - `document` — text/markdown
  - `website` — html
  - `dataset` — csv/parquet/etc
  - `report` — agent-generated report (current default for hermes-report.md)
  - `diff` — code diff
  - `miro-board` — Miro board URL
  - `log` — log bundle
  - `trace` — trace bundle
  - `other`
- `name` (required)
- `uri` (required) — `s3://bucket/key` or `file://path` for local harness
- `contentType` (required)
- Optional: `previewUrl` (uri), `sha256` (64-hex), `bytes` (int≥0), `metadata` (object)

**Currently produced:** exactly one per run, kind=`report`, `name=hermes-report.md`, `uri=s3://workspace-live-artifacts/workspaces/{workspaceId}/runs/{runId}/artifacts/artifact-{taskId}-0001/hermes-report.md`.

⚠️ `artifactIdForAttempt` is hardcoded `-0001` (`worker.ts:110-113`) — exactly one artifact per run. Multi-artifact runs will need this fixed.

---

## `tool.approval`

**Producer:** local-harness only. ❌ No production producer.

**Payload (`ToolApprovalPayload`):** discriminated union on `kind`.

### Request branch
- `approvalId` (required)
- `kind: "request"` (required)
- `toolName` (required)
- `risk` — `low | medium | high | critical`
- `requestedAction`
- Optional: `argumentsPreview` (object), `expiresAt`

### Decision branch
- `approvalId` (required)
- `kind: "decision"` (required)
- `decision` — `approved | rejected`
- `decidedBy`
- `decidedAt`
- Optional: `reason`

**Local harness emits both branches** for the `preview.register_static_site` tool gate. See [local-harness reference](local-harness.md).

For hackathon: a real approval flow would have the worker emit a `request`, the user click Approve in the web UI, and a new `POST /approvals/{id}/decision` route emit a `decision`. **Neither route nor handler exists.** See [approvals-and-notifications surface](../surfaces/approvals-and-notifications.md).

---

## `a2ui.delta`

**Producer:** **none.** Schema exists, no producer.

**Payload:**
- `surfaceId` (required)
- `catalogId` (required)
- `message` (required) — `oneOf` discriminated by wrapper key:
  - `createSurface` — `{createSurface: {...}}`
  - `updateComponents` — `{updateComponents: {...}}`
  - `updateDataModel` — `{updateDataModel: {...}}`
  - `deleteSurface` — `{deleteSurface: {...}}`
- Optional `actionPolicy: none | auto | approval-required`

The schema deliberately leaves the inner A2UI message open. Consumers must validate against the selected A2UI catalog before client delivery.

⚠️ **Never emitted today.** Flutter `_GenUiPreviewPanel` constructs equivalent messages locally for fixture rendering, but they don't pass through any pipeline.

To wire: a worker would need to call something like `events.putEvent(buildCanonicalEvent({type: "a2ui.delta", payload: {surfaceId, catalogId, message: {createSurface: ...}}}))`. See [generated-ui surface](../surfaces/generated-ui.md).

---

## Reserved event types (defined in code, no schema, no producer)

None today. The protocol package is small and intentional.

---

## Lineage events (NOT canonical events)

`AgentProfileLineageEvent` (in `packages/agent-profile/src/types.ts`) defines an append-only lifecycle log:
- `agent.profile.draft.created`
- `agent.profile.draft.validated`
- `agent.profile.eval.completed`
- `agent.profile.approved`
- `agent.profile.promoted`
- `agent.profile.revision.requested`
- `agent.profile.retired`

These are **not currently emitted as canonical events** — they're a typed contract intended to be wired later. The control-api's `approveAgentProfileVersion` just stamps the row directly.

---

## Event flow paths

### Live path
```
worker.ts emits  →  EventsTable PutItem  →  DDB Stream NEW_IMAGE
   →  realtime-api/relay.ts  →  postToConnection (filter by userId)
   →  WebSocket  →  apps/web/lib/realtime-client.ts parseRealtimeRunEvent
   →  apps/web/lib/run-ledger.ts mergeRunEvents
   →  React state  →  command-center timeline render
```

### Backfill path
Web also calls `GET /runs/{runId}/events?afterSeq=...` every 7.5s as backfill. This serves the same canonical events from `DynamoControlApiStore.listEvents`.

### Local harness path
```
runLocalHarnessScenario emits  →  local NDJSON file
   →  local-runner-cli inspect renders summary
```
No DDB write. No realtime. No HTTP.

[→ protocol package](protocol-package.md) · [→ run-creation flow](../flows/run-creation.md)
