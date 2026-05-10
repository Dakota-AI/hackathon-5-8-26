# Frontend Wiring And Backend Readiness Audit

Date: 2026-05-10
Status: backend foundation is strong enough to wire broader frontend product surfaces, but several backend slices are still required before the app can honestly behave like a full autonomous agent product.

## Short Answer

Yes, we can start wiring the frontend more broadly now.

The reason is that the app no longer has only a disconnected mock backend. The deployed system already has enough real surfaces to wire useful product UI against:

- Cognito-backed sign-in through Amplify Auth.
- Amplify Hosting for the web app.
- Control API authenticated routes.
- Durable Run ledger in DynamoDB.
- WorkItem creation/list/detail/run/event routes.
- Admin run listing and lineage routes.
- Runner state routes for HostNode/UserRunner registration and heartbeat.
- AWS-native realtime WebSocket run-event stream.
- ECS one-shot worker path that writes canonical status and artifact events.

But the normal user frontend must stay honest about what is real. It can show durable WorkItems, runs, events, artifacts, approvals, generated-surface placeholders, runner status, and admin lineage. It should not yet claim that the worker can build arbitrary apps or deploy real previews end-to-end, because the production resident runner, token broker, artifact APIs, surface validator, and real model/provider runtime are not fully deployed.

## Current Deployed Backend Surfaces The Frontend Can Wire To

### Auth

Current state:

- Amplify Auth sandbox is still the active Cognito source for the app.
- Web sign-in works through the Amplify Authenticator.
- Control API routes use the Cognito JWT authorizer.

Frontend implications:

- Web and Flutter can use Cognito ID tokens to call Control API.
- Normal user UI should be built around authenticated user state, not local fixtures only.
- The current auth sandbox should not be deleted until Cognito is moved into the main CDK app and clients are switched.

Remaining backend work:

- Move Cognito/Auth ownership into the main production-shaped CDK app.
- Add workspace membership and access-code admission gates.
- Replace email-only admin allowlists with Cognito groups or server-side role records.

### Runs

Current state:

- `POST /runs`
- `GET /runs/{runId}`
- `GET /runs/{runId}/events`
- Run creation writes run/task/initial-event state before starting Step Functions.
- Idempotency is supported.
- Worker-authored canonical events can be queried and streamed.

Frontend implications:

- The chat/composer can create real durable runs.
- A run timeline can render ordered status and artifact events.
- UI can use HTTP polling/backfill plus realtime stream.

Remaining backend work:

- Real agent task output beyond smoke/Hermes report.
- Better run cancellation/retry/resume endpoints.
- Explicit run failure categories and user-facing recovery guidance.
- Workspace authorization on every route, not only user ownership.

### WorkItems

Current state:

- `POST /work-items`
- `GET /work-items`
- `GET /work-items/{workItemId}`
- `PATCH /work-items/{workItemId}`
- `POST /work-items/{workItemId}/runs`
- `GET /work-items/{workItemId}/runs`
- `GET /work-items/{workItemId}/events`

Frontend implications:

- This is the best product spine for the normal user UI.
- The frontend can move from pure chat to a minimal chat + work object flow:
  - user asks for objective,
  - backend creates WorkItem,
  - linked run executes,
  - WorkItem page shows status, events, artifacts, approvals, generated surfaces.

Remaining backend work:

- `GET /work-items/{workItemId}/artifacts`.
- WorkItem-level approvals API.
- WorkItem-level generated surfaces API.
- WorkItem timeline summarization endpoint.
- Workspace membership authorization.

### Admin / Operations

Current state:

- `GET /admin/runs?limit=...`
- `GET /admin/runs/{runId}/events?limit=...`
- `GET /admin/runners?limit=...`
- `/admin` web UI shows run metrics, recent requests, lineage, and runner fleet.

Frontend implications:

- Admin can inspect what happened, what got called, where it failed, and runner fleet status.
- This should stay separate from normal user UI.

Remaining backend work:

- Better filters by user/workspace/status/date/failure type.
- CloudWatch/Step Functions deep links.
- Live admin refresh through realtime or polling.
- Admin runner action endpoints only after scoped permissions and audit logging exist.

### Runner State

Current state:

- HostNodes table.
- UserRunners table.
- RunnerSnapshots table.
- AgentInstances table.
- Runner state Control API routes are implemented and deployed.
- Admin runner fleet visibility is wired.

Frontend implications:

- Admin UI can show whether any runner hosts/user runners have checked in.
- Normal user UI can eventually show a friendly "workspace runner is ready / starting / needs attention" state, but should not expose raw host/runner details.

Remaining backend work:

- Runner token broker.
- Trusted supervisor credentials.
- Local Docker supervisor that registers/heartbeats HostNodes and UserRunners.
- ECS resident runner service launch path.
- Runner snapshot persistence and restore.
- Placement scheduler.

### Realtime

Current state:

- AWS-native WebSocket API exists.
- Browser clients can use query-string Cognito token connection.
- Run-event subscription and backfill pattern are established.

Frontend implications:

- Web can show live run state now.
- Flutter can adopt the same canonical event stream later.

Remaining backend work:

- Product-grade reconnect/gap repair UI.
- Subscription authorization by workspace membership.
- Admin live stream subscriptions.
- Runner heartbeat status fanout.

### Artifacts / Generated Surfaces

Current state:

- Worker can write deterministic smoke report artifacts to S3 and DynamoDB events.
- WorkItem/GenUI infrastructure tables exist for DataSources and Surfaces.
- Product-shaped routes for data sources/surfaces exist as infrastructure, but handler depth remains incomplete.

Frontend implications:

- UI can render artifact cards from canonical events.
- UI can render fixture-backed or explicitly validated generated surfaces.
- UI should not render arbitrary generated React/Dart/HTML.

Remaining backend work:

- Artifact list/get/download APIs.
- Surface create/update/publish APIs.
- Server-side GenUI/A2UI allowlist validator.
- DataSourceRef APIs and safe query layer.
- Preview registry integration for generated static sites.

## What The Frontend Should Do Next

### Web Normal User UI

Recommended next web slice:

1. Replace the remaining fixture-backed work dashboard with live WorkItem API calls where backend routes already exist.
2. Keep a graceful fixture/mock fallback only for local development, clearly separated in code.
3. Default flow:
   - user enters objective,
   - app creates WorkItem,
   - app starts linked run,
   - app subscribes to run events,
   - app shows a compact assistant thread plus work status and generated artifacts.
4. Do not show raw run IDs, raw payload JSON, S3 URIs, source objects, or host/runner internals in normal UI.
5. Keep `/admin` as the only raw lineage/debug surface.

### Web Admin UI

Recommended next admin slice:

1. Add filters for failed/running/succeeded, user email, workspace, and date range.
2. Add runner fleet polling and stale-runner highlighting.
3. Add explicit "backend is smoke-only" marker in admin details for current worker reports.
4. Add direct links or copyable ARNs for Step Functions execution only in admin.

### Flutter Desktop/Mobile

Recommended next Flutter slice:

1. Keep the shadcn_flutter UI shell, but move domain repositories from fixture-only toward Control API adapters.
2. Add Cognito/Auth client wiring parity.
3. Add WorkItem list/detail API adapter with fixture fallback.
4. Add event timeline rendering from ordered canonical events.
5. Add generated-surface renderer only after server-side validation exists.

## What Backend Should Be Finished Before Claiming Product Completion

### Must-have before user-facing launch

1. Workspace membership authorization.
2. Access-code admitted onboarding path.
3. Real WorkItem artifact APIs. Read endpoints AND presigned-download are deployed and verified end-to-end. See `docs/roadmap/ARTIFACT_API_DEPLOYMENT_2026_05_10.md`.
4. Real Surface/DataSourceRef APIs. CRUD + ownership + minimal catalog validator (allowed surfaceType + status + definition size cap) deployed. Component-level catalog validation and real preview hosting still pending. See `docs/roadmap/DATASOURCE_SURFACE_API_DEPLOYMENT_2026_05_10.md`.
5. Runner token broker and trusted supervisor/runner auth. The current resident runner ECS task has a generated Secrets Manager bearer token so it is not open by default, but that token still needs production brokering, rotation, and supervisor-scoped issuance before launch.
6. Resident runner launch path: local Docker first, ECS second.
7. Real model/provider execution boundary with scoped secrets.
8. Failure/retry/cancellation semantics.
9. Admin audit/log links and stale runner alerts.

### Nice-to-have after first real dogfood

1. Voice/call mode.
2. Browser preview publishing and wildcard preview domains.
3. Miro/OAuth/MCP integrations.
4. Specialist self-improvement promotion gates.
5. Multi-run dependency graphs and higher-level manager/executive delegation UI.

## Why Frontend Can Start Now Anyway

Frontend work no longer has to wait for every backend feature because the product can be layered:

- Use live Auth and Control API for identity and core WorkItems.
- Use live Runs and Events for traceability.
- Use live Admin/Runners for operations.
- Use fixture-backed generated surfaces only behind a clearly marked adapter until the Surface API is complete.
- Keep normal UI minimal and user-friendly while putting raw details in `/admin`.

The key is not to fake final agent capability. The frontend can make the current product usable and testable while clearly showing which backend outputs are real and which are still placeholder/smoke.

## Commit / Deployment Readiness Notes

Current validation for the in-progress backend/runtime/frontend-adjacent slice:

- `pnpm control-api:test` passed with 28 tests.
- `pnpm agent-runtime:test` passed with 10 tests.
- `pnpm infra:build` passed.
- `pnpm infra:synth` passed with existing CDK IAM deprecation warnings only.
- `pnpm --filter @agents-cloud/infra-cdk test` passed with 9 tests.
- `flutter analyze` passed.
- `flutter test` passed with 13 tests.
- CDK asset hygiene check found no `.env`, `.env.*`, `.research`, or `.vibecode` inside `infra/cdk/cdk.out`.
- `infra/cdk/cdk.out` size after synth: 7.3M.

## Recommended Next Implementation Order

1. Commit the currently validated local slices:
   - agent profile registry first slice,
   - resident runner local/ECS-shaped container first slice,
   - Flutter/desktop WorkItem/product UI fixture shell updates,
   - deep status/workstream docs.
2. Deploy CDK changes for AgentProfilesTable/profile routes/resident task definition after review.
3. Direct-Lambda smoke new profile routes.
4. Add live web WorkItem adapter and replace fixture-only normal UI path.
5. Add WorkItem artifact APIs.
6. Add Surface/DataSourceRef API handlers and validator.
7. Add local Docker supervisor that registers/heartbeats against runner state routes.
8. Launch first ECS resident runner task manually/safely.
9. Wire frontend to show friendly runner readiness and real generated artifact/surface updates.

## Bottom Line

Start frontend wiring now, but wire it around WorkItems/Runs/Events/Admin/Runners that are already real. In parallel, finish the backend slices that turn smoke output into product output: artifacts, surfaces, data sources, runner token broker, resident runner launch, and scoped model/provider execution.
