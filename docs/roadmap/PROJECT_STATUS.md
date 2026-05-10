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
- The first Control API slice is deployed: create/query run endpoints, Cognito JWT authorizer, DynamoDB run/event writes, and Step Functions start.
- The first real worker slice is deployed: a Hermes-boundary ECS runtime writes `running`, `artifact.created`, and terminal status events plus one S3 report artifact. It currently defaults to `HERMES_RUNNER_MODE=smoke`; real CLI/model execution needs scoped provider secret brokering before enabling in ECS.

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
| `agents-cloud-dev-state` | Complete | DynamoDB run/task/event/artifact/approval tables plus preview deployment registry. |
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
- Runtime task definition: `arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-agent-runtime:6`
- Control API URL: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`

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
- Unit tests for create-run durability, request validation, owned-run reads,
  cross-user denial, and ordered event cursor queries.

Still needed before calling this product-complete:

- Smoke-test an authenticated Cognito request end-to-end.
- Add true idempotency handling for repeated `POST /runs` requests.
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
artifact mechanics, but it does not yet:

- call models or providers in production mode with scoped secrets,
- manage workspaces,
- emit fully canonical protocol event envelopes,
- allocate retry-safe event sequence numbers,
- write retry-safe artifact ids,
- support cancellation/resume/retry,
- stream progress to clients.

### Cloudflare Realtime Plane

Package exists locally, not deployed yet.

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
