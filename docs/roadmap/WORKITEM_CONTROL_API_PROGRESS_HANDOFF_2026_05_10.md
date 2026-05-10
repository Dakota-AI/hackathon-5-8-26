# WorkItem / GenUI Infrastructure and Control API Progress Handoff

Date: 2026-05-10

## Purpose of this document

This is a handoff note for the current state of the WorkItem / GenUI product-spine work.

The user later redirected this agent to finish the WorkItem handler slice first, before moving on to the next infrastructure/audit slice. This document is now a progress handoff/status note rather than a pause-backend instruction.

This document explains what was done, what is deployed, what is only local/in-progress, why the current state exists, what is safe to rely on, and what should be skipped or handed off.

## Executive summary

The Agents Cloud product direction is now centered around a durable work object above runs:

```text
WorkItem -> Run -> Events -> Artifacts -> DataSourceRefs -> Surfaces -> Approvals -> Notifications
```

The infrastructure foundation for this model has been implemented and deployed:

- DynamoDB tables exist for WorkItems, DataSources, and Surfaces.
- Existing Runs and Artifacts tables have WorkItem lookup indexes.
- Product-shaped Control API routes exist behind Cognito auth.
- Step Functions and ECS runtime now have `workItemId` / `WORK_ITEM_ID` plumbing.
- The deployed route skeleton is intentionally honest: routes that do not have business logic return explicit `501 NotImplemented` instead of fake success.

The WorkItem Control API implementation slice has now been completed locally for the first product API set:

- `POST /work-items`
- `GET /work-items`
- `GET /work-items/{workItemId}?workspaceId=...`
- `PATCH /work-items/{workItemId}`
- `POST /work-items/{workItemId}/status`
- `POST /work-items/{workItemId}/runs`
- `GET /work-items/{workItemId}/runs`
- `GET /work-items/{workItemId}/events`

The remaining WorkItem artifact query plus Artifact/DataSourceRef/Surface APIs still intentionally return explicit `501 NotImplemented` until their own TDD slices land.

## Current repo state at handoff

Latest observed local commit:

```text
0681049 docs: add user runner architecture and asset hardening
```

There are many uncommitted changes in the working tree. Some are from this WorkItem Control API slice; others appear to be unrelated product/documentation work already present in the tree.

Important: do not blindly commit the whole working tree as one change. A future agent should inspect and stage selectively.

WorkItem Control API related uncommitted files include:

```text
infra/cdk/src/stacks/control-api-stack.ts
services/control-api/src/dynamo-store.ts
services/control-api/src/handlers.ts
services/control-api/src/ports.ts
services/control-api/test/create-run.test.ts
services/control-api/test/dynamo-store.test.ts
services/control-api/test/idempotency.test.ts
services/control-api/test/query-runs.test.ts
services/control-api/test/admin-runs.test.ts
services/control-api/src/work-items.ts
services/control-api/test/work-items.test.ts
docs/roadmap/WORKITEM_CONTROL_API_IMPLEMENTATION.md
docs/roadmap/WORKITEM_CONTROL_API_PROGRESS_HANDOFF_2026_05_10.md
```

Other uncommitted files visible at handoff include broader docs/workstream/proactive communication changes, for example:

```text
AGENTS.md
docs/README.md
docs/adr/README.md
docs/roadmap/BEST_NEXT_STEPS_EXECUTION_PLAN.md
docs/roadmap/README.md
docs/adr/0009-proactive-communication-plane.md
docs/agent-workstreams/
docs/plans/2026-05-10-agent-creator-hermes-profiles-apify.md
docs/roadmap/AICALLER_IOS_FOUNDATION_AUDIT_2026_05_10.md
docs/roadmap/COMMUNICATION_EVENT_CONTRACTS_2026_05_10.md
docs/roadmap/PROACTIVE_COMMUNICATION_ARCHITECTURE_AUDIT_2026_05_10.md
docs/roadmap/PROACTIVE_COMMUNICATION_REMAINING_WORK_2026_05_10.md
docs/roadmap/VOICE_CALL_AUDIO_MESSAGE_ARCHITECTURE_2026_05_10.md
```

Those broader changes should not be assumed to belong to the WorkItem Control API slice.

## What was committed and deployed before this handoff

A prior infra slice was committed and deployed. It added the infrastructure foundation for WorkItems, DataSourceRefs, Surfaces, WorkItem-linked run/artifact lookup, and runtime WorkItem passthrough.

The deployed AWS environment is the dev environment in:

```text
AWS account: 625250616301
Region: us-east-1
AWS profile used: agents-cloud-source
Control API URL: https://ajmonuqk61.execute-api.us-east-1.amazonaws.com
```

Deployment checks already performed after the infra deployment included:

- CloudFormation stacks reported `UPDATE_COMPLETE`.
- API Gateway exposed WorkItem/DataSourceRef/Surface routes.
- WorkItems DynamoDB table was active and had the expected indexes.
- Step Functions definition included `WORK_ITEM_ID` and `$.workItemId`.
- Web HTTP e2e smoke still passed after infra deployment.

The infra deployment did not mean product API business logic was complete. It only meant the AWS shape was real and ready for the Control API implementation phase.

## What the deployed infra currently gives the client team

The client team can assume these route shapes are the intended API surface, but should also assume several are not implemented yet.

WorkItem route skeletons:

```text
POST /work-items
GET /work-items
GET /work-items/{workItemId}
PATCH /work-items/{workItemId}
POST /work-items/{workItemId}/status
POST /work-items/{workItemId}/runs
GET /work-items/{workItemId}/runs
GET /work-items/{workItemId}/events
GET /work-items/{workItemId}/artifacts
```

Artifact route skeletons:

```text
GET /runs/{runId}/artifacts
GET /runs/{runId}/artifacts/{artifactId}
```

DataSourceRef route skeletons:

```text
POST /data-source-refs
GET /data-source-refs/{dataSourceId}
GET /work-items/{workItemId}/data-source-refs
GET /runs/{runId}/data-source-refs
```

Surface route skeletons:

```text
POST /surfaces
GET /surfaces/{surfaceId}
PATCH /surfaces/{surfaceId}
GET /work-items/{workItemId}/surfaces
GET /runs/{runId}/surfaces
POST /surfaces/{surfaceId}/publish
```

For client-facing work right now, these should be treated as the target contract direction, not as all-ready production APIs.

## What was started locally after deployment

A first real WorkItem Control API implementation was started with TDD.

New local source file:

```text
services/control-api/src/work-items.ts
```

It currently implements:

- `createWorkItem`
- `listWorkItems`
- `getWorkItem`

Behavior covered by local tests:

1. Create a durable WorkItem owned by the authenticated user.
2. Reuse an idempotency key without duplicate writes.
3. Reject missing objective before writing.
4. List only WorkItems owned by the authenticated user.
5. Do not return another user's WorkItem by id.

New local test file:

```text
services/control-api/test/work-items.test.ts
```

Observed local validation after finishing the handler slice:

```text
pnpm contracts:test                                      -> PASS
pnpm control-api:test                                    -> PASS, 20/20 tests
pnpm infra:build                                        -> PASS
pnpm infra:synth                                        -> PASS, with existing CDK deprecation warnings
pnpm --filter @agents-cloud/infra-cdk test              -> PASS, 5/5 CDK tests
pnpm --filter @agents-cloud/infra-amplify run typecheck -> PASS
CDK asset hygiene find                                  -> PASS, no output
du -sh infra/cdk/cdk.out                                -> 1.5M
```

This implementation is now the completed WorkItem handler slice for create/list/get/status/run/event behavior. Next backend/API work should be artifact query APIs, DataSourceRef v0, or Surface v0; next pure infrastructure work should be the user-runner state model.

## Why the current split exists

The platform needs a durable product object above transient runs. Without WorkItems, the app stays a run dashboard or chat log. With WorkItems, client surfaces can become product-grade:

- Work board / inbox
- Work detail page
- Run ledger attached to a business objective
- Artifact review panel
- Generated dashboards and reports
- Approvals
- Notifications
- Mobile handoff

The infra came first because client surfaces need stable route shapes and durable IDs. The Control API implementation started next because client UI eventually needs real data. The user then prioritized finishing the WorkItem handler work so frontend work can proceed in parallel against a more realistic API surface.

## Important technical notes for the next backend/infra agent

If another agent continues backend/infra, they should know:

1. Do not fake success for unimplemented routes.
   Keep `501 NotImplemented` until each route has tests, validation, authorization, and persistence.

2. Do not commit all current uncommitted files together.
   Stage only the files relevant to the backend slice.

3. Preserve tenant/user boundaries.
   WorkItems must be scoped to authenticated `userId` from Cognito JWT claims.

4. Avoid scans for product list pages where deployed indexes exist.
   Use WorkItems `by-user-created-at`, `by-idempotency-scope`, and status/workspace indexes as intended.

5. Continue in small TDD slices.
   The next backend slice should probably be one of:
   - WorkItem artifact query.
   - Run artifact list/detail APIs.
   - DataSourceRef v0.
   - Surface v0 plus GenUI validator.

6. Re-run the deployment smoke matrix before claiming backend is live.

Minimum backend validation matrix:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm infra:test
pnpm infra:build
pnpm infra:synth
```

Deployment should then include AWS smoke checks, not just local tests.

## Client-facing direction from here

The next work for this agent should be client-facing and should not require completed backend APIs.

Recommended next client slice:

```text
Build a polished Work page shell using fixture data first.
```

The client surface should make the product vision visible even before backend APIs are complete.

Suggested web scope:

- Add a static-export-compatible `/work` experience in `apps/web`.
- Create WorkItem fixture data in a small client-side module.
- Show a professional, minimal WorkBoard / WorkList layout.
- Add a WorkItem detail panel with:
  - objective summary
  - status and priority
  - latest activity
  - run ledger preview
  - artifact/report preview cards
  - generated surface preview placeholder
- Keep normal user UI clean and product-focused.
- Do not expose raw JSON, raw DynamoDB IDs, sequence numbers, or infra details in the default UI.
- Leave API wiring behind a small adapter so real Control API methods can replace fixtures later.

Suggested Flutter/desktop-mobile scope after web:

- Add a matching fixture-backed WorkBoard / Work detail surface.
- Keep the UI shadcn-first, dense, professional, and CFO/CEO-grade.
- Avoid introducing raw backend internals into the main user surface.

## Client implementation principles

Use these principles for the next agent pass:

1. Build the user-facing product shape now; do not wait for every backend route.
2. Use fixtures/adapters, not fake backend claims.
3. Make it obvious in code which data is fixture-backed.
4. Keep UI minimal and premium, not dashboard toy UI.
5. Separate normal user UX from admin/debug UX.
6. Show WorkItems as durable business work, not just runs.
7. Use schema/fixture Surface previews for GenUI placeholders; do not allow arbitrary generated code.

## What not to do in the next client pass

Do not:

- Continue infra deployment work in this agent unless the user reverses direction.
- Depend on unimplemented API routes for the first client UX slice.
- Show `501` backend errors to normal users as product UI.
- Show raw DynamoDB table names, route names, event sequence numbers, or S3 URIs in the normal UI.
- Add advanced Kanban drag/drop before the basic WorkItem board/detail information architecture is strong.
- Add arbitrary agent-generated React/Dart/HTML execution.

## Best next concrete task

The best immediate client-facing task is:

```text
Create a fixture-backed web Work page that demonstrates the WorkItem product spine.
```

Definition of done:

- `apps/web` has a polished Work page/surface reachable from the product UI.
- It renders WorkItems from fixtures through an adapter boundary.
- It includes a board/list and detail view.
- It shows run ledger, artifacts, and generated surface placeholders as user-friendly cards.
- It does not require the unfinished backend WorkItem API.
- It passes:

```bash
pnpm web:typecheck
pnpm web:build
pnpm amplify:hosting:build
```

Optional local browser verification:

```bash
pnpm --filter @agents-cloud/web dev
```

Open the local app and inspect the browser console for errors.

## Current status in one sentence

The WorkItem/GenUI AWS foundation is deployed, the base WorkItem Control API handler is partially implemented and locally tested but should be handed off, and this agent should now move to fixture-backed client-facing WorkItem UX rather than continuing infra/backend work.
