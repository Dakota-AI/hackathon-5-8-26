# Agents Cloud Project Status

_Last updated: 2026-05-09_

## Executive Summary

The project has moved from architecture/planning into a real deployed AWS foundation.

Current state:

- CDK platform infrastructure is deployed in AWS account `625250616301`, region `us-east-1`.
- A Step Functions -> ECS Fargate -> CloudWatch smoke test succeeded.
- Amplify Gen 2 Auth sandbox is deployed and healthy.
- Amplify Hosting app exists, is connected to the private GitHub repo, and now deploys successfully with an explicit `amplify.yml` build spec.
- The main missing product/backend piece is still the Control API that creates/query runs and bridges Amplify Auth to the CDK platform backend.

Approximate progress:

- Infrastructure foundation: 55-65% of the first foundation layer.
- Backend application/runtime: 15-25%.
- Product/API/UI layer: 5-10%.
- Overall MVP: 20-30%.

## AWS Environment

Primary environment:

- Account: `625250616301`
- Region: `us-east-1`
- Local AWS profile: `agents-cloud-source`
- Environment name: `dev`

Existing/remotes:

- Original repo remote: `https://github.com/Dakota-AI/hackathon-5-8-26.git`
- Private repo remote: `https://github.com/SebRincon/agents-cloud.git`

## Completed and Deployed: CDK Platform Foundation

The following CDK stacks are deployed and verified as `CREATE_COMPLETE`:

| Stack | Status | Purpose |
| --- | --- | --- |
| `agents-cloud-dev-foundation` | Complete | Environment metadata, tags, base SSM parameters. |
| `agents-cloud-dev-network` | Complete | VPC, subnets, NAT, S3/DynamoDB endpoints, worker security group. |
| `agents-cloud-dev-storage` | Complete | S3 buckets for live artifacts, audit logs, previews, and research datasets. |
| `agents-cloud-dev-state` | Complete | DynamoDB run/task/event/artifact/approval tables plus preview deployment registry. |
| `agents-cloud-dev-cluster` | Complete | ECS cluster and CloudWatch log group. |
| `agents-cloud-dev-runtime` | Complete | Placeholder Fargate task definition and IAM grants, including preview deployment registry access. |
| `agents-cloud-dev-orchestration` | Complete | Step Functions state machine that launches the Fargate task. |

Smoke test result:

- State machine: `arn:aws:states:us-east-1:625250616301:stateMachine:agents-cloud-dev-simple-run`
- Test execution: `smoke-20260509160645`
- Result: `SUCCEEDED`
- Verified path: Step Functions -> ECS Fargate -> CloudWatch Logs.

Important deployed resources:

- VPC: `vpc-07645bdef6612558d`
- Worker security group: `sg-0ac59e4aaed3d4cce`
- Live artifacts bucket: `agents-cloud-dev-storage-workspaceliveartifactsbuc-8br4g70cte0m`
- Preview static bucket: `agents-cloud-dev-storage-previewstaticbucket42b307-oyrfiakvhnf8`
- Preview deployments table: `agents-cloud-dev-state-PreviewDeploymentsTable37B54DE6-WEG6QR56NMCX`
- Runtime task definition: `arn:aws:ecs:us-east-1:625250616301:task-definition/agents-cloud-dev-agent-runtime:1`

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
- Repository: `https://github.com/SebRincon/agents-cloud`
- Branch: `main`

Deployment status:

- Initial job `1` failed because the Amplify build image did not have `pnpm` installed.
- Fixed by adding `amplify.yml` with Corepack + `pnpm@10.0.0` setup and a placeholder static build.
- Job `2` succeeded for commit `2606ccf`.
- Job `3` succeeded for commit `9b084b2`.
- Live placeholder URL: `https://main.dkqxgsrxe1fih.amplifyapp.com/`
- Health/status endpoint: `https://main.dkqxgsrxe1fih.amplifyapp.com/status.json`

## Completed in Git

Commits already pushed:

- `61f14a6 feat: add AWS CDK foundation infrastructure`
- `73e3877 feat: add Amplify Auth sandbox backend`
- `2606ccf fix: make Amplify Hosting build deployable`
- `9b084b2 feat: document and scaffold preview hosting`
- `531978b docs: update Amplify deployment status`

These are pushed to:

- `origin/main`
- `personal/main`

## Not Complete Yet

### Control API

Not built yet.

Needed endpoints:

- `POST /runs`
- `GET /runs/{runId}`
- `GET /runs/{runId}/events`

Responsibilities:

- Validate Cognito JWTs from Amplify Auth.
- Create run/task/event records in DynamoDB.
- Start Step Functions executions.
- Return durable run status to clients.

This is the highest-priority missing backend component.

### Real Agent Runtime

Not built yet.

Current runtime is a placeholder Fargate task. It proves orchestration works, but it does not yet:

- call models or providers,
- manage workspaces,
- write DynamoDB status/events,
- write S3 artifacts,
- support cancellation/resume/retry,
- stream progress to clients.

### Frontend Product UI

Not built yet.

Research/planning exists at `docs/roadmap/AMPLIFY_NEXT_FRONTEND_PLAN.md` after reviewing `aws-samples/amplify-next-template` and current Amplify Gen 2/Next.js guidance.

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
- Optional `PreviewIngressStack` is scaffolded and gated by environment variables.
- Preview ingress synth has been validated with dummy domain values.

Not complete:

- No preview base domain has been selected.
- No wildcard DNS/ACM certificate/ALB preview ingress is deployed yet.
- The preview-router container is still a placeholder nginx image.
- No Control API or agent workflow writes preview deployment records yet.

See `docs/roadmap/WILDCARD_PREVIEW_HOSTING_STATUS.md` for the detailed checklist.

### Amplify Hosting Production Build

Complete for placeholder hosting.

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
3. Replace the placeholder runtime with a minimal real worker that writes status/events/artifacts.
4. Choose a preview base domain if wildcard preview hosting should go live.
5. Build the first authenticated frontend dashboard against Amplify Auth + Control API.
