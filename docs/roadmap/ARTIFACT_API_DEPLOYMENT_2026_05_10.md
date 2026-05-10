# Artifact Read API — Deployment Notes (2026-05-10)

Scope: Control API Artifact read endpoints. First slice. Read-only.

## Why this slice now

The Artifact API was the first NotImplemented stub still wired into the deployed
Control API stack. Without it, no client (web admin, Flutter, or operations)
could enumerate run/WorkItem artifacts even though the durable Artifacts table
already exists and the ECS smoke worker already writes Hermes worker reports
into it.

This slice unblocks:

- Showing real produced artifacts in the admin lineage view per run.
- Listing all artifacts across a WorkItem in normal user UI when wired.
- Future signed-download flow (return `uri`/`bucket`/`key`; presigning is
  future work).

## What was added

Use case module:

- `services/control-api/src/artifacts.ts`
  - `listRunArtifacts({ store, user, runId, limit })`
  - `getRunArtifact({ store, user, runId, artifactId })`
  - `listWorkItemArtifacts({ store, user, workspaceId, workItemId, limit })`

Ports:

- `ArtifactRecord` interface (mirrors what the runtime worker already writes
  via `aws-artifact-sink.ts`).
- `ArtifactStore` interface separate from `ControlApiStore` so test fakes can
  opt in without bloating unrelated suites.

Dynamo store:

- `DynamoControlApiStore` now also implements `ArtifactStore`.
- New table env var: `ARTIFACTS_TABLE_NAME` (already injected via CDK common
  environment, just newly required by `fromEnvironment()`).
- Queries:
  - by-run: `Query` on PK runId, `ScanIndexForward: false` for newest-first.
  - by-WorkItem: `Query` on `by-workitem-created-at` GSI.
  - get: `GetCommand` on `(runId, artifactId)` composite key.
- Result rows are filtered with `isCompleteArtifactRecord` so partial/legacy
  rows do not crash the Lambda.

Handler:

- `services/control-api/src/handlers.ts`
  - Replaced `notImplementedArtifactsHandler` with `artifactsHandler` that
    routes:
    - `GET /work-items/{workItemId}/artifacts?workspaceId=...&limit=...`
    - `GET /runs/{runId}/artifacts?limit=...`
    - `GET /runs/{runId}/artifacts/{artifactId}`

CDK:

- `infra/cdk/src/stacks/control-api-stack.ts`
  - `ArtifactsFunction` handler updated from `notImplementedArtifactsHandler`
    to `artifactsHandler`.
  - No new env vars, IAM grants, or routes — those were already provisioned
    when the WorkItem/GenUI infra slice landed.

Tests (TDD):

- `services/control-api/test/artifacts.test.ts`
  - 9 tests covering: ownership, cross-user denial, 404 for unknown, 400 for
    missing path params, newest-first ordering, WorkItem-scoped listing
    filters foreign user records.

## Auth & ownership model

- All routes require Cognito JWT (HTTP API auth is unchanged).
- Per-route ownership rules:
  - `GET /runs/{runId}/artifacts`: `getRunById(runId)` must exist AND
    `run.userId === user.userId`. Otherwise 404 (does not leak existence).
  - `GET /runs/{runId}/artifacts/{artifactId}`: same run ownership check, then
    artifact must also satisfy `userId === user.userId` and `workspaceId ===
    run.workspaceId`. Otherwise 404.
  - `GET /work-items/{workItemId}/artifacts`: `getWorkItem(workspaceId,
    workItemId)` must exist AND `item.userId === user.userId`. Then list
    is post-filtered to `userId === user.userId && workspaceId === workspaceId`.

This matches the same ownership conventions already used by the WorkItem and
Run query handlers.

## What's deliberately NOT in this slice

- Pre-signed S3 URLs for artifact download. Clients receive `bucket`, `key`,
  and `s3://` URI; future slice can add `GET /runs/{runId}/artifacts/{artifactId}/download`
  that returns a short-lived presigned URL.
- Workspace membership checks. We still use single-user-as-workspace-owner.
  When workspace membership lands, the ownership predicate becomes
  `isMemberOfWorkspace(user, workspaceId) && hasArtifactAccess(...)`; the
  handler shape stays the same.
- Pagination cursor tokens. `limit` is clamped 1..100; if bigger result sets
  are needed, add `LastEvaluatedKey` / cursor encoding.

## Validation evidence

All passed locally before deploy:

- `pnpm control-api:test` — 38/38 (9 new artifact tests, 29 prior).
- `pnpm --filter @agents-cloud/infra-cdk test` — 9/9.
- `pnpm infra:synth` — clean, only the existing
  `aws_iam.GrantOnPrincipalOptions#scope` deprecation warning.
- `find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name '.research'
  -o -name '.vibecode' \) -print` — empty.
- `du -sh infra/cdk/cdk.out` — 15M.

Deploy: `agents-cloud-dev-control-api` — UPDATE_COMPLETE.

Lambda smoke (direct invoke + HTTP):

- `GET /runs/{runId}/artifacts` for unknown run → `404 Run not found.`
- `GET /runs/{runId}/artifacts` with empty runId → `400 BadRequest`.
- `GET /runs/anything/artifacts` over public HTTP → `401 Unauthorized`.

Function: `agents-cloud-dev-control--ArtifactsFunctionCF53A1C-AOs52kxfTDyh`.

## Frontend wiring guidance

Web/Flutter clients can now fetch:

```http
GET /work-items/{workItemId}/artifacts?workspaceId=...
Authorization: Bearer <Cognito ID token>
```

Response shape:

```json
{
  "artifacts": [
    {
      "runId": "run-...",
      "artifactId": "artifact-...",
      "workspaceId": "...",
      "workItemId": "...",
      "userId": "...",
      "taskId": "...",
      "kind": "report",
      "name": "Hermes worker report",
      "bucket": "...",
      "key": "...",
      "uri": "s3://.../...md",
      "contentType": "text/markdown; charset=utf-8",
      "createdAt": "ISO-8601"
    }
  ]
}
```

Until presigned-download is implemented, clients should treat `uri` as a
descriptor only (do not try to fetch S3 directly from the browser; users
without S3 IAM access would be denied).

## Next slices to consider

1. Presigned-download handler.
2. DataSourceRef API (similar shape; same not-implemented stub remains in
   the deployed stack).
3. Surface API (read + publish; needs server-side validation against the
   GenUI catalog; bigger scope).
4. Workspace membership authorization (cross-cutting; alters every owner
   check; tracked in tenant-authorization roadmap doc).
