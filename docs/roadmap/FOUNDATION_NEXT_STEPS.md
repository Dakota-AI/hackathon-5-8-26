# Foundation Next Steps

Date: 2026-05-09
Status: Current post-Control API + minimal worker + AWS-native realtime first-slice deployment plan

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
- [x] Amplify Hosting web build is green.
- [x] Preview deployment registry table exists.
- [x] Optional preview ingress stack is created.
- [x] Control API first slice is deployed and smoke-tested.

Still missing:

- [x] Minimal real worker runtime first slice.
- [x] Worker event/artifact writes first slice.
- [x] Event relay first slice: AWS-native DynamoDB Streams relay is deployed and direct-smoke-tested.
- [x] AWS-native realtime WebSocket first slice implemented, deployed, and Lambda-smoke-tested.
- [x] Deploy AWS realtime WebSocket stack foundation: live URL is `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`; client wiring and real-token browser smoke remain pending.
- [x] Next.js command center first product run loop: authenticated create-run helper, durable event polling, terminal-state detection, event timeline, artifact cards, local browser self-test mode, and real HTTP e2e smoke with a temporary Cognito user.
- [x] Real WebSocket e2e smoke with temporary Cognito user: create run, subscribe to run channel, receive live worker events from deployed API Gateway WebSocket relay.
- [ ] Deployed Cloudflare realtime plane and AWS relay integration, deferred unless edge fanout is needed.
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

1. Harden the ECS worker path. The first deployed smoke/Hermes-runtime slice is in place.
2. Define the worker context contract: run id, task id, workspace id, user id, objective, event sink, artifact sink. Done in `services/agent-runtime`.
3. Have the worker write `running`, artifact-created, and terminal status events. Done in deployed smoke.
4. Have the worker write one small S3 artifact and corresponding artifact metadata. Done in deployed smoke.
5. Add true idempotency behavior for repeated `POST /runs`. First deployed slice is done and smoke-tested; full concurrent idempotency/outbox recovery remains pending.
6. Exercise Control API with a real Cognito token from the first client.
7. Enable real Hermes CLI/model execution with scoped provider secrets after the smoke path is stable.
8. Use the deployed AWS-native realtime WebSocket stack after the event ledger polling path is wired; Cloudflare remains deferred unless edge fanout is needed.

## Completed: Realtime Deploy Resume Point

The 2026-05-10 deploy has been resumed and completed:

- Runtime Docker build context now includes `packages/protocol`.
- `agents-cloud-dev-runtime` deployed task definition revision `7`.
- `agents-cloud-dev-control-api` redeployed the transactional/idempotent create-run handler.
- `agents-cloud-dev-realtime-api` deployed successfully with WebSocket URL `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`.
- Audit smoke run `run-idem-191fa7003b2441188aa1ebbc` verified Control API -> Step Functions -> ECS task definition `:7` -> DynamoDB canonical events -> S3 deterministic artifact.
- Direct realtime Lambda smoke verified missing-token authorizer deny, connect/subscribe/ping/disconnect, and relay cleanup of malformed stored connection ids.

Remaining realtime work is client-facing: use a real Cognito ID token from web/native, connect to the deployed WebSocket URL, subscribe to a real run, and rely on Control API event queries for reconnect replay/gap repair.

## User Inputs Needed Soon

Required soon:

- [ ] Preview base domain for wildcard website previews.
- [ ] Confirmation that Route53 owns DNS for the chosen domain or that DNS can
  be migrated.
- [ ] Whether to keep the current single environment named `dev` or deliberately
  rename/redeploy as `prod`.
- [ ] First GitHub integration mode: GitHub App is preferred for multi-user;
  OAuth/PAT can work only for private trusted-runner usage.
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
- [x] Full idempotency key support first slice for repeated run creation: scoped lookup plus duplicate-request unit tests.

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

- [x] Worker package or service entrypoint.
- [x] Dockerfile.
- [x] Runtime context contract.
- [x] DynamoDB event writer.
- [x] S3 artifact writer.
- [x] Terminal status handling.
- [x] Structured CloudWatch logs.
- [x] Container image build/push path.

Exit criteria:

- [x] API-created run launches the current Hermes/smoke ECS worker via Step Functions.
- [x] Worker writes `running`.
- [x] Worker writes a test artifact.
- [x] Worker writes `succeeded` or `failed`.
- [x] Artifact metadata can be queried.
- [x] Logs include run id and task id.

## Phase 3: AWS-Native Realtime Skeleton

Build after durable event writes exist:

- [x] API Gateway WebSocket API CDK stack.
- [x] WebSocket Cognito Lambda REQUEST authorizer.
- [x] Connection/subscription DynamoDB table.
- [x] `$connect`, `$disconnect`, and `$default` handlers.
- [x] `subscribeRun`, `unsubscribeRun`, and `ping` actions.
- [x] DynamoDB Streams relay publisher from run events to subscribed connections.
- [~] Deploy stack update: StateStack support deployed; WebSocket API stack still pending.
- [ ] Real Cognito-token WebSocket smoke.
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

The deployed worker smoke test on 2026-05-10 proved:

```text
Step Functions execution
  -> ECS Fargate task definition agents-cloud-dev-agent-runtime:6
  -> worker receives run/task/workspace/user/objective context
  -> DynamoDB event: running
  -> S3 artifact: hermes-report.md
  -> DynamoDB artifact metadata + artifact.created event
  -> DynamoDB terminal event: succeeded
  -> CloudWatch structured log containing run id and task id
```

Smoke execution: `run-hermes-ecs-smoke-1778376731`.

Still to add: real Cognito-token HTTP create-run smoke, idempotent create-run
semantics, and real Hermes CLI/model execution with scoped provider secrets.
