# Foundation Next Steps

Date: 2026-05-09
Status: Current post-CDK implementation starter plan

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

Still missing:

- [ ] Control API.
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

Build the first app-callable durable run lifecycle.

The next concrete slice is:

```text
Amplify Auth user
  -> Control API
  -> DynamoDB run/event records
  -> Step Functions execution
  -> ECS worker
  -> durable status/events/artifacts
  -> queryable run detail
```

Do not begin with a large UI, Miro integration, Codex worker, Hermes worker, or
custom specialist system. Those layers need the Control API, run ledger, event
contract, and worker lifecycle underneath them.

## Implementation Order

1. Tighten protocol contracts where the current package is too loose.
2. Add `ControlApiStack` to `infra/cdk`.
3. Add Lambda handlers for:
   - `POST /runs`
   - `GET /runs/{runId}`
   - `GET /runs/{runId}/events`
4. Validate Cognito JWTs from the Amplify Auth user pool.
5. Write run and initial event rows to DynamoDB.
6. Start the existing Step Functions state machine.
7. Query ordered events with cursor support.
8. Replace the placeholder ECS task with a minimal real worker.
9. Have the worker write status events and one artifact to S3.
10. Add event relay and Cloudflare realtime after durable polling works.

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

- [ ] API Gateway.
- [ ] Cognito JWT authorizer.
- [ ] `CreateRunFunction`.
- [ ] `GetRunFunction`.
- [ ] `ListRunEventsFunction`.
- [ ] DynamoDB access helpers.
- [ ] Step Functions start helper.
- [ ] Request and response schemas.
- [ ] Idempotency key support for run creation.

Exit criteria:

- [ ] Authenticated user can create a run.
- [ ] Unauthorized requests fail.
- [ ] User cannot read another user's run.
- [ ] Run row is created.
- [ ] Initial status event is created.
- [ ] Step Functions execution starts.
- [ ] Ordered event query works.
- [ ] `pnpm contracts:test` passes.
- [ ] `pnpm infra:build` passes.
- [ ] `pnpm infra:synth` passes.

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

- [ ] API-created run launches worker.
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

The first deployed API smoke test should prove:

```text
POST /runs
  -> DynamoDB run row
  -> DynamoDB event row
  -> Step Functions execution
  -> ECS task
  -> terminal status visible through GET /runs/{runId}/events
```
