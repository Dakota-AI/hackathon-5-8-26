# DataSourceRef + Surface API — Deployment Notes (2026-05-10)

Scope: Control API DataSourceRef and Surface endpoints. First slice. CRUD + publish.

## Why this slice now

These were the last two NotImplemented stubs in the deployed Control API stack.
Without them no client could persist generated UI surfaces or external-data
references, even though both DynamoDB tables and Lambda functions had been
provisioned in earlier infra slices. Combined with the Artifact API + presigned
download already shipped, this finishes the WorkItem product spine on the
backend so frontend can wire against real data.

## What was added

DataSourceRef (already authored by sibling agent — verified, deployed, smoke-tested)

- `services/control-api/src/data-source-refs.ts`
  - `createDataSourceRef` — bound to either runId or workItemId; checks
    ownership of whichever scope it's bound to.
  - `getDataSourceRef` — owner-only.
  - `listDataSourceRefsForWorkItem`, `listDataSourceRefsForRun` — owner-only,
    post-filtered.
- `services/control-api/test/data-source-refs.test.ts` — tests already present.
- Routes (already in `agents-cloud-dev-control-api`, just newly active because
  Lambda handler was redeployed):
  - `POST /data-source-refs`
  - `GET /data-source-refs/{dataSourceId}?workspaceId=...`
  - `GET /work-items/{workItemId}/data-source-refs?workspaceId=...`
  - `GET /runs/{runId}/data-source-refs`

Surface API + minimal catalog validator

- `services/control-api/src/surfaces.ts`
  - CRUD (create / get / update / publish) + list-by-WorkItem and list-by-run.
  - **New**: `validateSurfaceDefinition` and `validateSurfaceStatus` enforce a
    server-side allowlist:
    - `surfaceType` must be one of: `dashboard`, `report`, `preview`, `table`,
      `form`, `markdown`. Anything else is `400 UNSUPPORTED_SURFACE_TYPE`.
    - `status` must be one of: `draft`, `review`, `published`, `archived`.
      Anything else is `400 INVALID_STATUS`.
    - `definition` must be a JSON object and serialize to ≤ 64 KiB. Larger
      payloads are `400 DEFINITION_TOO_LARGE`.
  - Validation runs on `create`, on `update` (only when those fields are
    supplied), and is enforced before any DynamoDB write.
- `services/control-api/test/surfaces.test.ts` — 11 new tests covering
  validator + CRUD + ownership.

CDK

- `infra/cdk/src/stacks/control-api-stack.ts` already pointed
  `DataSourceRefsFunction` and `SurfacesFunction` at the real handlers
  (`dataSourceRefsHandler`, `surfacesHandler`). The deployed Lambdas were
  still bundled with the older `notImplemented*` handler symbols, so a
  re-deploy of `agents-cloud-dev-control-api` was the action that activated
  the new behavior.

## Auth & ownership model

Same convention as Artifacts/WorkItems:

- Cognito JWT required.
- Every read/write checks ownership of the parent (`run.userId === user.userId`
  or `workItem.userId === user.userId`) and returns `404` on mismatch (no
  existence leak).
- List endpoints additionally post-filter rows to `userId === user.userId &&
  workspaceId === ...`.

## What's deliberately NOT in this slice

- Workspace membership (cross-cutting refactor; tracked in tenant authorization
  doc).
- Component-level catalog validation. Right now the validator allows any
  JSON-serializable definition under 64 KiB once the surfaceType is allowed.
  Validating each component shape against a registered schema is a future
  slice — should land alongside the GenUI renderer.
- Surface publishing actually serving content. `POST /surfaces/{id}/publish`
  flips status + records `publishedUrl` + stamps `publishedAt`, but does not
  write to S3 or wire wildcard preview hosting. That's a separate slice.

## Validation evidence

- `pnpm control-api:test` — 57/57 (added 11 surface tests; data-source-refs
  tests pre-existed).
- `pnpm --filter @agents-cloud/infra-cdk test` — 9/9.
- `pnpm infra:synth` — clean (only the existing IAM scope deprecation
  warning).
- `find infra/cdk/cdk.out \( -name '.env' -o -name '.env.*' -o -name
  '.research' -o -name '.vibecode' \) -print` — empty.
- `du -sh infra/cdk/cdk.out` — 18M.

Deploy: `agents-cloud-dev-control-api` — UPDATE_COMPLETE, 65.83s.

End-to-end smoke against real durable run
`run-idem-c995dacd2098a205b697e235`:

- POST `/data-source-refs` with sourceKind=web, source=Yahoo Finance URL
  bound to that run → `201` with `dataSourceId =
  data-2be7dc8d-9e6f-47b3-9f87-56fa83c41484`.
- GET `/runs/{runId}/data-source-refs` → `200` with the just-created ref.
- POST `/surfaces` with surfaceType=dashboard, name="Stock Watchlist",
  definition containing one chart component → `201` with `surfaceId =
  surface-065f63ca-30da-47fb-9841-49c974dfdeeb`, status=`draft`.
- POST `/surfaces` with `surfaceType=rocket` → `400 UNSUPPORTED_SURFACE_TYPE`
  with helpful list of allowed types in the message.
- Unauthenticated `POST /surfaces` and `POST /data-source-refs` over public
  HTTP → `401 Unauthorized`.

## Frontend wiring guidance

Web/Flutter clients can now:

```http
POST /data-source-refs
{
  "workspaceId": "...",
  "runId": "...",         // or workItemId
  "sourceKind": "web",     // free-form for now
  "source": "https://...",
  "displayName": "..."
}

POST /surfaces
{
  "workspaceId": "...",
  "runId": "...",         // optional
  "workItemId": "...",    // optional
  "surfaceType": "dashboard",  // dashboard|report|preview|table|form|markdown
  "name": "...",
  "definition": { ... }   // ≤ 64 KiB JSON
}

POST /surfaces/{surfaceId}/publish
{
  "workspaceId": "...",
  "publishedUrl": "https://..."   // optional
}
```

## Backend completion summary

With this slice the WorkItem product spine on the backend is functionally
complete for first-real-dogfood:

- WorkItems: CRUD + run linkage ✅
- Runs + events ledger ✅
- Artifact metadata + listing + presigned download ✅
- DataSourceRefs: CRUD + run/WorkItem-scoped lookup ✅
- Surfaces: CRUD + publish + catalog-validated definition ✅
- Admin run/event/runner observability ✅

What still blocks calling the product "real" (per the readiness doc):

1. Workspace membership authorization.
2. Access-code admitted onboarding.
3. Real model/provider execution boundary inside the resident runner.
4. Real GenUI renderer + component-level catalog validation.
5. Voice/call mode.
6. Wildcard preview publishing.
