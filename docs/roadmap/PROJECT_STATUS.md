# Agents Cloud Project Status

_Last updated: 2026-05-10_

Read with:

- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/IMPLEMENTATION_READINESS_AUDIT.md`
- `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`
- `docs/roadmap/FOUNDATION_NEXT_STEPS.md`
- `docs/roadmap/CODEBASE_ORIENTATION.md`

## Executive Summary

The project has moved from architecture/planning into a real deployed AWS foundation.

Current state:

- CDK platform infrastructure is deployed in AWS account `625250616301`, region `us-east-1`.
- A Step Functions -> ECS Fargate -> CloudWatch smoke test succeeded.
- Amplify Gen 2 Auth sandbox is deployed and healthy.
- Amplify Hosting app exists and deploys successfully with an explicit `amplify.yml` build spec.
- The first Control API slice is deployed: create/query run endpoints, Cognito JWT authorizer, DynamoDB run/event writes, and Step Functions start. The latest transactional ledger/idempotency hardening is committed but still needs redeployment after the runtime Docker build-context fix below.
- The first real worker slice is deployed: a Hermes-boundary ECS runtime writes `running`, `artifact.created`, and terminal status events plus one S3 report artifact. It currently defaults to `HERMES_RUNNER_MODE=smoke`; real CLI/model execution needs scoped provider secret brokering before enabling in ECS.
- An AWS-native realtime WebSocket first slice is implemented, tested, and synth-validates. The required `agents-cloud-dev-state` update has been deployed, including the EventsTable stream, RunsTable idempotency GSI, and RealtimeConnectionsTable. The `agents-cloud-dev-realtime-api` stack itself is still WIP/not deployed because the combined CDK deploy stopped while building the runtime Docker asset.

Approximate progress:

- Infrastructure foundation: 65-75% of the first foundation layer.
- Backend application/runtime: 25-35%.
- Product/API/UI layer: 10-15%.
- Overall MVP: 25-35%.

## AWS Environment

Primary environment:

- Account: `625250616301`
- Region: `us-east-1`
- Local AWS profile: `agents-cloud-source`
- Environment name: `dev`

## Completed and Deployed: CDK Platform Foundation

The following CDK stacks are deployed and verified as `CREATE_COMPLETE`:

| Stack | Status | Purpose |
| --- | --- | --- |
| `agents-cloud-dev-foundation` | Complete | Environment metadata, tags, base SSM parameters. |
| `agents-cloud-dev-network` | Complete | VPC, subnets, NAT, S3/DynamoDB endpoints, worker security group. |
| `agents-cloud-dev-storage` | Complete | S3 buckets for live artifacts, audit logs, previews, and research datasets. |
| `agents-cloud-dev-state` | Complete, updated 2026-05-10 | DynamoDB run/task/event/artifact/approval tables plus preview deployment registry, EventsTable stream, RunsTable idempotency GSI, and RealtimeConnectionsTable. |
| `agents-cloud-dev-cluster` | Complete | ECS cluster and CloudWatch log group. |
| `agents-cloud-dev-runtime` | Complete | Agent runtime Fargate task definition and IAM grants for the current smoke/Hermes worker path. |
| `agents-cloud-dev-orchestration` | Complete | Step Functions state machine that launches the Fargate task. |
| `agents-cloud-dev-control-api` | Complete | API Gateway HTTP API, Cognito JWT authorizer, and Lambda handlers for create/query run lifecycle. |

Smoke test result:

- State machine: `arn:aws:states:us-east-1:625250616301:stateMachine:agents-cloud-dev-simple-run`
- Initial smoke execution: `smoke-20260509160645` -> `SUCCEEDED`
- Real worker execution: `run-hermes-ecs-smoke-1778376731` -> `SUCCEEDED`
- Verified path: Step Functions -> ECS Fargate -> Hermes/smoke worker -> DynamoDB events/artifact metadata -> S3 artifact -> CloudWatch structured log.

Important deployed resources:

- VPC: `vpc-07645bdef6612558d`
- Worker security group: `sg-0ac59e4aaed3d4cce`
- Live artifacts bucket: `agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m`
- Preview static bucket: `agents-cloud-dev-storage-previewstaticbucket42b307-oyrfiakvhnf8`
- Preview deployments table: `agents-cloud-dev-state-PreviewDeploymentsTable37B54DE6-WEG6QR56NMCX`
- Realtime connections table: `agents-cloud-dev-state-RealtimeConnectionsTableD1B843C7-1NHZWIIGT5G91`
- Events table stream: enabled on `agents-cloud-dev-state-EventsTableD24865E5-N2IHC3AJ25VW`
- Runtime task definition: `arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-agent-runtime:6`
- Control API URL: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`

## WIP: 2026-05-10 Realtime Deployment Attempt

The realtime implementation and supporting hardening have been committed and pushed to `origin/main`.

Latest relevant commits:

- `f782f2c feat: add event contracts and realtime API`
- `74e5059 fix(control-api): make run ledger creation transactional`
- `dc42d1c docs: capture realtime readiness hardening`
- `8464da3 docs: clarify transactional run ledger`

Validation before deployment attempt passed:

- `pnpm install --frozen-lockfile`
- `pnpm contracts:test`
- `pnpm control-api:test`
- `pnpm agent-runtime:test`
- `pnpm realtime-api:test`
- `pnpm cloudflare:test`
- `pnpm web:typecheck`
- `pnpm web:build`
- `pnpm amplify:hosting:build`
- `pnpm infra:build`
- `pnpm infra:synth`

Deploy command attempted from `infra/cdk` with profile `agents-cloud-source`:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
pnpm exec cdk deploy \
  --app 'node dist/bin/agents-cloud-cdk.js' \
  agents-cloud-dev-state \
  agents-cloud-dev-runtime \
  agents-cloud-dev-control-api \
  agents-cloud-dev-realtime-api \
  --require-approval never
```

Deployment result:

- `agents-cloud-dev-state` updated successfully and is now `UPDATE_COMPLETE`.
- The deploy then stopped at `agents-cloud-dev-runtime` while building the `AgentRuntimeImage` Docker asset.
- `agents-cloud-dev-control-api` and `agents-cloud-dev-realtime-api` were not redeployed in that run.
- No live WebSocket URL has been created yet.

Docker asset failure:

```text
src/ports.ts: Cannot find module '@agents-cloud/protocol'
src/worker.ts: Cannot find module '@agents-cloud/protocol'
Failed to build asset AgentRuntimeImage
```

Cause:

- `services/agent-runtime` now imports `@agents-cloud/protocol`.
- `services/agent-runtime/Dockerfile` and `.dockerignore` still need a clean committed build-context update so the Docker image can copy/build the `packages/protocol` workspace package.

Current local WIP files for that fix:

- `.dockerignore`
- `services/agent-runtime/Dockerfile`

Next resume point:

1. Finish and verify the Docker build-context fix.
2. Run `docker build --platform linux/amd64 -f services/agent-runtime/Dockerfile -t agents-cloud-agent-runtime:verify .`.
3. Re-run `pnpm agent-runtime:test`, `pnpm infra:build`, and `pnpm infra:synth`.
4. Commit/push the Docker fix.
5. Redeploy `agents-cloud-dev-runtime`, `agents-cloud-dev-control-api`, and `agents-cloud-dev-realtime-api`.
6. Capture the WebSocket stack output and smoke-test with a real Cognito ID token.

## Completed and Deployed: Amplify Auth Sandbox

Amplify Gen 2 backend package:

- Path: `infra/amplify`
- Auth definition: `infra/amplify/amplify/auth/resource.ts`
- Backend entrypoint: `infra/amplify/amplify/backend.ts`

Deployed sandbox:

- Stack: `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec`
- Nested auth stack: `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec-auth179371D7-ZGJMM8TVRK8`
- Status: `CREATE_COMPLETE`

Auth resources created:

- Cognito User Pool
- Cognito User Pool Client
- Cognito Identity Pool
- Authenticated and unauthenticated IAM roles
- Email login enabled

Generated local client config:

- `infra/amplify/amplify_outputs.json`
- This file is ignored because it is sandbox/environment-specific.

## Created: Amplify Hosting App

Amplify Hosting app:

- Name: `agents-cloud`
- App ID: `dkqxgsrxe1fih`
- Region: `us-east-1`
- Default domain: `dkqxgsrxe1fih.amplifyapp.com`
- Branch: `main`

Deployment status:

- Initial job `1` failed because the Amplify build image did not have `pnpm` installed.
- Fixed by adding `amplify.yml` with Corepack + `pnpm@10.0.0` setup and the web build path.
- Job `2` succeeded for commit `2606ccf`.
- Job `3` succeeded for commit `9b084b2`.
- Live URL: `https://main.dkqxgsrxe1fih.amplifyapp.com/`
- Health/status endpoint: `https://main.dkqxgsrxe1fih.amplifyapp.com/status.json`

## Completed in Git

Commits already pushed:

- `61f14a6 feat: add AWS CDK foundation infrastructure`
- `73e3877 feat: add Amplify Auth sandbox backend`
- `2606ccf fix: make Amplify Hosting build deployable`
- `9b084b2 feat: document preview hosting`
- `531978b docs: update Amplify deployment status`
- `7cc6822 docs: plan Amplify Next.js frontend`
- `4f0a84c fix: keep Amplify pnpm cache small`

These are pushed to:

- `origin/main`
- `personal/main`

## Not Complete Yet

### Control API

Deployed foundation slice; authenticated product smoke still pending.

Implemented in this repo:

- CDK `ControlApiStack` with an API Gateway HTTP API.
- Cognito JWT authorizer wired to the current Amplify Auth user pool/client.
- Lambda handlers for:
  - `POST /runs`
  - `GET /runs/{runId}`
  - `GET /runs/{runId}/events`
- DynamoDB write/query helpers for run, task, and event records.
- Step Functions start helper for the existing simple-run state machine.
- Unit tests for create-run durability, idempotent duplicate requests, durable-write-before-execution ordering, request validation, owned-run reads,
  cross-user denial, and ordered event cursor queries.
- Canonical initial `run.status` event creation through `@agents-cloud/protocol` helpers.

Still needed before calling this product-complete:

- Smoke-test an authenticated Cognito request end-to-end.
- Exercise idempotent `POST /runs` through real authenticated HTTP traffic and add recovery for execution-ARN persistence failure.
- Query worker-authored events through the HTTP API using a real Cognito token.

Responsibilities:

- Validate Cognito JWTs from Amplify Auth.
- Create run/task/event records in DynamoDB.
- Start Step Functions executions.
- Return durable run status to clients.

This is now the highest-priority backend hardening area, not a greenfield
missing component.

### Real Agent Runtime

Package exists, but it is not production-ready.

Current runtime code under `services/agent-runtime` can write smoke/Hermes
status events and an S3-backed report artifact. It proves orchestration and
artifact mechanics. After the readiness-audit hardening pass, runtime events are
canonical envelopes, artifact metadata uses protocol `kind`/`name` fields, and
DynamoDB event/artifact writes are conditional. It still does not yet:

- call models or providers in production mode with scoped secrets,
- manage workspaces,
- allocate general-purpose retry-safe event sequence numbers for multi-step workers,
- provide fully idempotent duplicate-worker retries rather than safe conditional failure,
- support cancellation/resume/retry,
- stream progress to clients.

### AWS-Native Realtime WebSocket Plane

Implemented locally and synth-validated. The supporting StateStack update is deployed; the WebSocket API stack is not deployed yet.

Implemented under `services/realtime-api` plus `infra/cdk/src/stacks/realtime-api-stack.ts`:

- API Gateway WebSocket API with `$connect`, `$disconnect`, and `$default` routes.
- Lambda REQUEST authorizer for Cognito JWT validation on `$connect`.
- DynamoDB `RealtimeConnectionsTable` for connection metadata and run subscriptions.
- WebSocket actions:
  - `subscribeRun`
  - `unsubscribeRun`
  - `ping`
- DynamoDB Streams relay from authoritative run events to subscribed WebSocket clients.
- Stale connection cleanup when API Gateway Management API returns gone/410.
- Root scripts: `pnpm realtime-api:build`, `pnpm realtime-api:test`.

Verified locally:

- `pnpm realtime-api:test` passed: 10/10 tests.
- `pnpm infra:build` passed.
- `pnpm infra:synth` passed and produced stack `agents-cloud-dev-realtime-api`.

Deployed so far:

- `agents-cloud-dev-state` update succeeded.
- `RealtimeConnectionsTable` exists.
- EventsTable DynamoDB stream is enabled.

Still missing:

- AWS deployment of `agents-cloud-dev-realtime-api` stack.
- Real Cognito-token WebSocket smoke test with `wscat` or app client.
- Workspace membership authorization beyond current authenticated user context.
- Client replay/gap repair using `GET /runs/{runId}/events?afterSeq=`.
- Web/desktop/mobile integration.
- Custom realtime domain decision, likely `realtime.solo-ceo.ai`, if the AWS-native path is kept.

### Cloudflare Realtime Plane

Package exists locally, but is now deferred behind AWS-native realtime unless edge fanout becomes necessary.

Implemented under `infra/cloudflare/realtime`:

- Wrangler package `@agents-cloud/cloudflare-realtime`.
- `GET /health`.
- `GET /ws` WebSocket entrypoint with Cognito JWT validation.
- `POST /internal/events` for future AWS event relay pushes, protected by `RELAY_SHARED_SECRET`.
- `SessionHubDO` for run-scoped fanout keyed by `<workspaceId>:<runId>`.
- `UserHubDO` for user/device hot sockets.
- `WorkspaceHubDO` shell.
- Canonical realtime event validation for `eventId`, `runId`, `workspaceId`, positive `seq`, `type`, `payload`, and `createdAt`.
- Root scripts: `pnpm cloudflare:build`, `pnpm cloudflare:test`, `pnpm cloudflare:dev`, `pnpm cloudflare:deploy`, `pnpm cloudflare:tail`.

Verified locally:

- `pnpm cloudflare:test` passed.
- `pnpm --filter @agents-cloud/cloudflare-realtime exec wrangler deploy --dry-run --env=""` passed.

Still missing:

- Cloudflare Worker deployment.
- Cloudflare DNS route for `realtime.solo-ceo.ai`.
- AWS event relay Lambda/SQS/EventBridge bridge.
- Web/desktop/mobile clients connecting to the realtime endpoint.
- DynamoDB-backed reconnect/replay cursors.

### Frontend Product UI

Partially built locally, not connected to the backend yet.

Research/planning exists at `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md` after reviewing current Amplify Gen 2/Next.js guidance.

A Flutter command-center app exists under `apps/desktop_mobile`
with planning pages and a local GenUI/A2UI preview surface. It currently passes
`flutter analyze` and `flutter test`, but it is not wired to Amplify Auth, the
Control API, Cloudflare realtime, push notifications, Miro, or real agent event
streams.

Needed first screens:

- sign in/sign up,
- create run,
- runs list,
- run detail,
- events/progress stream,
- artifacts list/viewer.

### Wildcard Preview Ingress

Partially built.

Completed:

- `PreviewDeploymentsTable` is defined and deployed.
- Agent runtime role has read/write access to the preview deployment registry.
- Optional `PreviewIngressStack` exists and is gated by environment variables.
- Preview ingress synth has been validated with dummy domain values.

Not complete:

- No preview base domain has been selected.
- No wildcard DNS/ACM certificate/ALB preview ingress is deployed yet.
- The preview-router container currently uses a temporary nginx image.
- No Control API or agent workflow writes preview deployment records yet.

See `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md` for the detailed checklist.

### Amplify Hosting Production Build

Complete for the current hosting path.

The Amplify app now has an explicit `amplify.yml` build spec that enables Corepack, activates `pnpm@10.0.0`, sets a local pnpm store, installs with the frozen lockfile, and generates a temporary static hosting page. This keeps the branch deploy green while the real frontend is built.

### CI/CD

Not complete yet.

Needed:

- GitHub Actions validation workflow,
- CDK synth/diff/deploy workflow,
- Amplify deploy workflow,
- future container image build/push workflow.

### Production Hardening

Not complete yet.

Needed later:

- production env config,
- backup/restore validation,
- IAM least-privilege review,
- API auth hardening,
- monitoring/alarms,
- cost controls,
- tenant isolation,
- custom domains/WAF.

## Architecture Boundary

CDK owns durable platform resources:

- VPC/networking,
- DynamoDB state ledger,
- S3 artifacts/audit/previews,
- ECS/Fargate runtime,
- Step Functions orchestration,
- IAM permissions.

Amplify owns product-facing resources:

- Cognito/Auth,
- frontend hosting,
- client config,
- optional lightweight app-facing resources.

Recommended flow:

```text
Frontend hosted by Amplify
  -> Amplify Auth / Cognito JWT
  -> CDK Control API
  -> DynamoDB + Step Functions + ECS + S3
```

Avoid connecting the frontend directly to all core platform tables/resources.

## Next Best Step

1. Build `ControlApiStack` in CDK.
2. Smoke test `POST /runs` through API Gateway/Lambda into Step Functions/ECS.
3. Harden the agent-runtime worker path so status/events/artifacts are canonical and retry-safe.
4. Choose a preview base domain if wildcard preview hosting should go live.
5. Build the first authenticated frontend dashboard against Amplify Auth + Control API.
