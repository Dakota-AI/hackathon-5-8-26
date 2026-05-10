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
- The first Control API slice is deployed: create/query run endpoints, Cognito JWT authorizer, DynamoDB transactional run/task/initial-event ledger writes, scoped idempotency lookup, and Step Functions start.
- The first real worker slice is deployed: a Hermes-boundary ECS runtime writes canonical `run.status`, `artifact.created`, and terminal status events plus one deterministic S3 report artifact. It currently defaults to `HERMES_RUNNER_MODE=smoke`; real CLI/model execution needs scoped provider secret brokering before enabling in ECS.
- An AWS-native realtime WebSocket first slice is deployed: API Gateway WebSocket API, Lambda `$connect` authorizer, connection/subscription handlers, DynamoDB stream relay, and stale-connection cleanup. A real WebSocket e2e smoke with temporary Cognito credentials now verifies live run-event delivery; product clients are not wired yet.
- The Next.js command center now has the first product run loop: create a run from the objective panel, poll the deployed Control API event ledger, render ordered `run.status`/`artifact.created` events, stop on terminal status, and show artifact cards. It has unit coverage for ledger merging/view-model behavior and was browser-dogfooded in local self-test mode.
- A real authenticated HTTP e2e smoke now exists and passed with a temporary Cognito user: `scripts/smoke-web-http-e2e.sh` created run `run-idem-40e5c2eeae1183234f86c187`, Step Functions returned `SUCCEEDED`, Control API returned run status `succeeded`, four canonical events, and an artifact event.
- A real WebSocket e2e smoke now exists and passed with a temporary Cognito user: `scripts/smoke-websocket-e2e.sh` created run `run-idem-32b971ea09ad7c024e8cd6ee` and received live `run.status/running`, `artifact.created`, and `run.status/succeeded` messages from the deployed WebSocket API.

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
| `agents-cloud-dev-runtime` | Complete, updated 2026-05-10 | Agent runtime Fargate task definition and IAM grants for the current smoke/Hermes worker path. |
| `agents-cloud-dev-orchestration` | Complete | Step Functions state machine that launches the Fargate task. |
| `agents-cloud-dev-control-api` | Complete, updated 2026-05-10 | API Gateway HTTP API, Cognito JWT authorizer, and Lambda handlers for create/query run lifecycle. |
| `agents-cloud-dev-realtime-api` | Complete, deployed 2026-05-10 | API Gateway WebSocket API, Cognito-token Lambda authorizer, connection handlers, and DynamoDB stream relay. |

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
- Runtime task definition: `arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-agent-runtime:7`
- Control API URL: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`
- Realtime WebSocket URL: `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`
- Realtime callback URL: `https://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`

## Completed: 2026-05-10 Audit-Hardened Runtime/Realtime Deploy

The realtime implementation, transactional Control API hardening, canonical event builders, and runtime Docker build-context fix have been committed, pushed, deployed, and smoke-tested in `625250616301/us-east-1`.

Latest relevant commits:

- `f782f2c feat: add event contracts and realtime API`
- `74e5059 fix(control-api): make run ledger creation transactional`
- `dc42d1c docs: capture realtime readiness hardening`
- `8464da3 docs: clarify transactional run ledger`
- `03862c0 fix(runtime): build protocol in worker image`
- `b553a91 fix(infra): include protocol package in runtime asset`

Validation and deployment evidence:

- `pnpm contracts:test`, `pnpm control-api:test`, `pnpm agent-runtime:test`, `pnpm realtime-api:test`, `pnpm infra:build`, and `pnpm infra:synth` passed before deploy.
- Runtime Docker image built locally and inside CDK asset publishing after `packages/protocol` was included in the runtime asset context.
- Deployed stacks: `agents-cloud-dev-state`, `agents-cloud-dev-runtime`, `agents-cloud-dev-orchestration`, `agents-cloud-dev-control-api`, and `agents-cloud-dev-realtime-api`.
- Runtime task definition advanced to `agents-cloud-dev-agent-runtime:7`.
- Realtime stack output: `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`.

Audit smoke run:

- Control API Lambda create-run smoke returned `202` for `run-idem-191fa7003b2441188aa1ebbc`.
- Step Functions execution `arn:aws:states:us-east-1:625250616301:execution:agents-cloud-dev-simple-run:run-idem-191fa7003b2441188aa1ebbc` reached `SUCCEEDED`.
- ECS used task definition `arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-agent-runtime:7`.
- DynamoDB EventsTable contains four canonical events: `run.status/queued`, `run.status/running`, `artifact.created`, `run.status/succeeded`.
- Duplicate create-run invocation with the same idempotency key returned the existing succeeded run and the event count stayed at `4`.
- Artifact metadata uses deterministic id `artifact-task-idem-191fa7003b2441188aa1ebbc-0001` and `kind: report` / `name: Hermes worker report`.
- S3 artifact verified at `s3://agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m/workspaces/workspace-audit-smoke/runs/run-idem-191fa7003b2441188aa1ebbc/artifacts/artifact-task-idem-191fa7003b2441188aa1ebbc-0001/hermes-report.md`.

Realtime smoke:

- Deployed authorizer denies missing-token `$connect` requests.
- Deployed connect/default/disconnect Lambdas save a connection, subscribe to a run, answer `ping` with `pong`, and delete the connection.
- Direct relay smoke initially exposed that API Gateway can return `BadRequestException: Invalid connectionId` for malformed stored connection ids; the relay now treats that as stale connection state and deletes it, covered by regression test.
- Deployed relay Lambda was re-updated and direct relay smoke returned success while deleting the malformed fake connection.

Remaining before product-grade realtime:

1. Exercise the WebSocket endpoint from a real browser/native client with a real Cognito ID token.
2. Wire clients to subscribe after the polling event ledger path works.
3. Add replay/gap repair UX that falls back to `GET /runs/{runId}/events` after reconnect.
4. Add workspace membership authorization; current smoke uses user-scoped event delivery but not full workspace ACLs.

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
