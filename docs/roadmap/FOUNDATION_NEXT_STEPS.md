# Foundation Next Steps

Date: 2026-05-09
Status: Current post-Control API first-slice deployment plan

## Current Foundation State

The project is no longer at "CDK not started." A real CDK foundation exists,
has been synthesized, deployed, and smoke-tested.

Completed:

- [x] Protocol package exists with canonical event schemas.
- [x] AWS CDK app exists under `infra/cdk`.
- [x] Foundation, network, storage, state, cluster, runtime, and orchestration
  stacks exist.
- [x] Step Functions to ECS Fargate smoke path succeeded.
- [x] Amplify Auth sandbox exists.
- [x] Amplify Hosting placeholder is green.
- [x] Preview deployment registry table exists.
- [x] Optional preview ingress stack is scaffolded.
- [x] Control API first slice is deployed and smoke-tested.

Still missing:

- [ ] Real worker runtime.
- [ ] Worker event/artifact writes.
- [ ] Event relay.
- [ ] Cloudflare realtime plane.
- [ ] Next.js command center.
- [ ] Production desktop/mobile client integration.
- [ ] Miro bridge.
- [ ] Codex/Hermes worker integrations.
- [ ] Specialist-agent creation and self-improvement workflow.

Use `MASTER_SCOPE_AND_PROGRESS.md` for the full scope and detailed checklists.

## Highest-Value Next Step

Build the minimal real worker behind the app-callable durable run lifecycle.

The next concrete slice is:

```text
Control API-created run
  -> Step Functions execution
  -> ECS worker receives run/task/workspace context
  -> worker writes running status event
  -> worker writes one S3 artifact + artifact event
  -> worker writes terminal status event
  -> clients can poll durable run detail/events
```

Do not begin with a large UI, Miro integration, Codex worker, Hermes worker, or
custom specialist system. Those layers need the Control API, run ledger, event
contract, and worker lifecycle underneath them.

## Implementation Order

1. Replace the placeholder ECS task with a minimal real worker.
2. Define the worker context contract: run id, task id, workspace id, user id, objective, event sink, artifact sink.
3. Have the worker write `running`, artifact-created, and terminal status events.
4. Have the worker write one small S3 artifact and corresponding artifact metadata.
5. Add true idempotency behavior for repeated `POST /runs`.
6. Exercise Control API with a real Cognito token from the first client.
7. Add event relay and Cloudflare realtime after durable polling works.

## User Inputs Needed Soon

Required soon:

- [ ] Preview base domain for wildcard website previews.
- [ ] Confirmation that Route53 owns DNS for the chosen domain or that DNS can
  be migrated.
- [ ] Whether to keep the current single environment named `dev` or deliberately
  rename/redeploy as `prod`.
- [ ] First GitHub integration mode: GitHub App is preferred for multi-user;
  OAuth/PAT can work only for early private usage.
- [ ] Whether Miro can stay stubbed until the run lifecycle and clients exist.
- [ ] Whether linked Codex/ChatGPT auth is private/trusted-runner only for the
  first release.
- [ ] Cloudflare account id and zone/domain when realtime work begins.

Can wait:

- [ ] Final billing model.
- [ ] Full organization/team permission model.
- [ ] App store packaging.
- [ ] Advanced specialist marketplace.
- [ ] Full self-improvement promotion workflow.

## Phase 1: Control API V1

Build:

- [x] API Gateway.
- [x] Cognito JWT authorizer.
- [x] `CreateRunFunction`.
- [x] `GetRunFunction`.
- [x] `ListRunEventsFunction`.
- [x] DynamoDB access helpers.
- [x] Step Functions start helper.
- [ ] Request and response schemas.
- [ ] Full idempotency key support for repeated run creation.

Exit criteria:

- [x] JWT-shaped authenticated Lambda smoke event can create a run.
- [x] Unauthorized HTTP requests fail.
- [x] User cannot read another user's run in unit tests.
- [x] Run row is created in the handler implementation.
- [x] Initial status event is created in the handler implementation.
- [x] Step Functions execution starts in the handler implementation.
- [x] Ordered event query works in unit tests.
- [x] `pnpm contracts:test` passes.
- [x] `pnpm infra:build` passes.
- [x] `pnpm infra:synth` passes.

## Phase 2: Minimal Real Worker

Build:

- [ ] Worker package or service entrypoint.
- [ ] Dockerfile.
- [ ] Runtime context contract.
- [ ] DynamoDB event writer.
- [ ] S3 artifact writer.
- [ ] Terminal status handling.
- [ ] Structured CloudWatch logs.
- [ ] Container image build/push path.

Exit criteria:

- [x] API-created run launches the current placeholder ECS worker via Step Functions.
- [ ] Worker writes `running`.
- [ ] Worker writes a test artifact.
- [ ] Worker writes `succeeded` or `failed`.
- [ ] Artifact metadata can be queried.
- [ ] Logs include run id and task id.

## Phase 3: Realtime Skeleton

Build only after durable polling works:

- [ ] EventBridge/SQS event path.
- [ ] Event relay publisher.
- [ ] Cloudflare Wrangler project.
- [ ] Durable Object WebSocket endpoint.
- [ ] Client cursor/replay protocol.
- [ ] Gap repair through Control API.

Exit criteria:

- [ ] Two clients receive the same status event.
- [ ] Reconnect resumes from cursor.
- [ ] Cloudflare does not own the only copy of any event.

## Phase 4: First Product Surface

Build:

- [ ] Next.js app shell.
- [ ] Amplify Auth login.
- [ ] Create-run UI.
- [ ] Run list.
- [ ] Run detail timeline.
- [ ] Artifact list.
- [ ] WebSocket connection after realtime exists.

Exit criteria:

- [ ] User signs in.
- [ ] User creates a run.
- [ ] User sees status and artifacts.

## Commands To Keep Green

From repository root:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
```

The deployed API smoke test on 2026-05-09 proved:

```text
POST /runs
  -> DynamoDB run row
  -> DynamoDB event row
  -> Step Functions execution
  -> ECS task
  -> placeholder ECS task succeeds

Still to add: worker-authored running/artifact/terminal events visible through
`GET /runs/{runId}/events`.
```
