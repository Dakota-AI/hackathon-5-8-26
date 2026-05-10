# Protocol Package — `@agents-cloud/protocol`

[← reference](README.md) · [wiki index](../README.md) · related: [events-catalog](events-catalog.md), [agent-profile-package](agent-profile-package.md)

> The canonical, language-agnostic source of truth for events flowing between Control API, agent-runtime, Cloudflare workers, and clients. Owns wire-format JSON Schemas and TypeScript builders.

**Path:** `packages/protocol/`
**Status:** ✅ active

---

## Package metadata

```json
{
  "name": "@agents-cloud/protocol",
  "private": true,
  "type": "module",
  "main": "./dist/src/events.js",
  "types": "./dist/src/events.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "validate": "node ./scripts/validate-schemas.mjs",
    "test": "build then validate"
  }
}
```

Dev deps: `ajv@^8.17.1`, `ajv-formats@^3.0.1`, `typescript@^5.7.2`, `@types/node@^22.10.7`. No runtime deps.

---

## JSON Schemas

All schemas use Draft 2020-12, registered with Ajv2020 in `scripts/validate-schemas.mjs`.

### `event-envelope.schema.json`

The canonical envelope for every cross-service event.

- `$id`: `https://agents-cloud.local/schemas/event-envelope.schema.json`
- `additionalProperties: false`

**Required fields:**
- `id` — unique event id
- `type` — `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$` (regex enforced)
- `seq` — integer ≥ 1 (monotonic per run)
- `createdAt` — RFC 3339 date-time
- `orgId`, `userId`, `workspaceId`, `runId`
- `source` — `{kind, name}`
- `payload`

**Optional fields:** `projectId`, `taskId`, `correlationId`, `idempotencyKey`, `payloadRef`.

**`source.kind` enum:** `["control-api", "agent-manager", "worker", "cloudflare", "client", "system"]`.

**`payloadRef`:** `{uri, contentType, sha256?: 64-hex, bytes?: int≥0}` — for offloading large payloads to S3.

### `events/run-status.schema.json`

Run/task status payload.

- **Required:** `runId`, `status`
- **Optional:** `taskId`, `message`, `progress` (0–1), `workerClass`, `startedAt`, `finishedAt`, `error: {code, message, retryable?}`
- **`status` enum:** `["queued", "planning", "waiting_for_approval", "running", "testing", "archiving", "succeeded", "failed", "cancelled"]`
- **`workerClass` enum:** `["agent-light", "agent-code", "agent-builder-heavy", "agent-eval", "preview-app"]`

### `events/artifact.schema.json`

Artifact-created payload.

- **Required:** `artifactId`, `kind`, `name`, `uri`, `contentType`
- **Optional:** `previewUrl` (uri), `sha256` (64-hex), `bytes` (int≥0), `metadata` (object)
- **`kind` enum:** `["document", "website", "dataset", "report", "diff", "miro-board", "log", "trace", "other"]`

### `events/tool-approval.schema.json`

Discriminated `oneOf` on `kind`.

**Request branch — required:** `approvalId`, `kind: "request"`, `toolName`, `risk`, `requestedAction`. Optional: `argumentsPreview`, `expiresAt`. `risk` enum: `["low","medium","high","critical"]`.

**Decision branch — required:** `approvalId`, `kind: "decision"`, `decision`, `decidedBy`, `decidedAt`. Optional: `reason`. `decision` enum: `["approved","rejected"]`.

### `events/a2ui-delta.schema.json`

A2UI v0.8 wrapper.

- **Required:** `surfaceId`, `catalogId`, `message`
- `message` is a `oneOf` discriminated by wrapper key — exactly one of `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`
- **Optional `actionPolicy` enum:** `["none", "auto", "approval-required"]`
- The schema deliberately leaves the inner A2UI message open; consumers must validate against the selected A2UI catalog before client delivery.

---

## TypeScript surface

`packages/protocol/src/events.ts`.

### Exported types

- `EventSourceKind` — string union mirroring `source.kind`
- `RunStatus` — mirrors `status` enum
- `ArtifactKind` — mirrors artifact `kind` enum
- `ToolApprovalRisk` — `"low" | "medium" | "high" | "critical"`
- `ToolApprovalRequestPayload`, `ToolApprovalDecisionPayload`, `ToolApprovalPayload` (union)
- `CanonicalEventEnvelope<TPayload>` — generic envelope
- `CanonicalEventBaseInput` — input shape for builders; `orgId` optional, defaults to `org:${userId}`
- `RunStatusPayload`, `ArtifactCreatedPayload`

### Exported builders

| Builder | Type | Notes |
|---|---|---|
| `buildCanonicalEvent<T>(input)` | base | Asserts `id`, `type` regex, positive int `seq`, `createdAt`, `userId`, `workspaceId`, `runId`, `source.name`. Defaults `orgId`. Strips `undefined`. |
| `buildRunStatusEvent(input)` | `type: "run.status"` | accepts status, message, progress, workerClass, timestamps, error |
| `buildArtifactCreatedEvent(input)` | `type: "artifact.created"` | full ArtifactCreatedPayload |
| `buildToolApprovalEvent(input)` | `type: "tool.approval"` | branches on `input.kind` |

### Internal helpers (not exported)

`assertEventType`, `assertPositiveInteger`, `assertNonEmpty`, `withoutUndefined`.

---

## Examples

`packages/protocol/examples/`:

- `run-status-event.json` — `agent-manager` source, `running` status, `agent-code` workerClass
- `tool-approval-request-event.json` — request from `agent-runtime.local-harness` for `preview.register_static_site`, medium risk, 15-minute `expiresAt`
- `tool-approval-decision-event.json` — paired `approved` decision from `client/web` with reason

These are golden fixtures used by `scripts/validate-schemas.mjs`.

---

## Validation script

`packages/protocol/scripts/validate-schemas.mjs`:
1. Compiles all 5 schemas with strict Ajv2020 + ajv-formats
2. Validates 3 example envelopes against envelope schema
3. Validates payloads against `run-status` or `tool-approval`

Run via `pnpm test` (builds first) or `pnpm validate`. Prints `Protocol schemas validated.` on success.

⚠️ No additional unit tests exist. No producer/consumer fixture coverage.

---

## Producers and consumers

### Producers
- `services/control-api/src/create-run.ts` — emits `run.status: queued` (seq=1)
- `services/agent-runtime/src/worker.ts` — emits `run.status` (running/succeeded/failed) + `artifact.created`
- `services/agent-runtime/src/local-harness.ts` — emits all three event types in deterministic sequence
- ❌ No producer for `a2ui.delta` exists

### Consumers
- `services/realtime-api/src/relay.ts` — `isRealtimeEventRecord` validates rows from DDB stream
- `apps/web/lib/run-ledger.ts` — parses canonical events into run timeline view
- `apps/web/lib/realtime-client.ts` — `parseRealtimeRunEvent`

---

## Schema gotchas

- **`orgId` is required but rarely populated.** `create-run.ts:89-105` does NOT set it. The protocol builder defaults to `org:${userId}` if missing in input. Net: events have `orgId: org:<userId>` rather than a real organization id. Inert today.
- **`type` regex is strict.** Any handler-emitted type must match `[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+` or builder throws.
- **`seq` is positive integer.** Hardcoded `2,3,4` in worker is fragile under retry — see [agent-runtime](../services/agent-runtime.md).

[→ events catalog](events-catalog.md) · [→ agent-profile package](agent-profile-package.md)
