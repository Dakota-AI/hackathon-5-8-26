# Agents Cloud Project Status

_Last updated: 2026-05-09_

## Executive Summary

The project has moved from architecture/planning into a real deployed AWS foundation.

Current state:

- CDK platform infrastructure is deployed in AWS account `625250616301`, region `us-east-1`.
- A Step Functions -> ECS Fargate -> CloudWatch smoke test succeeded.
- Amplify Gen 2 Auth sandbox is deployed and healthy.
- Amplify Hosting app exists and is connected to the private GitHub repo, but its first branch deploy failed because the build image did not have `pnpm` installed. This is being fixed with an explicit Amplify build spec.
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
| `agents-cloud-dev-state` | Complete | DynamoDB run/task/event/artifact/approval tables. |
| `agents-cloud-dev-cluster` | Complete | ECS cluster and CloudWatch log group. |
| `agents-cloud-dev-runtime` | Complete | Placeholder Fargate task definition and IAM grants. |
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

Current known issue:

- First branch deployment failed during BUILD because the Amplify build image did not have `pnpm` installed.
- Error: `pnpm: command not found`
- Fix: commit an explicit `amplify.yml` that enables Corepack and prepares `pnpm@10.0.0` before install/build.

## Completed in Git

Commits already pushed:

- `61f14a6 feat: add AWS CDK foundation infrastructure`
- `73e3877 feat: add Amplify Auth sandbox backend`

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

Needed first screens:

- sign in/sign up,
- create run,
- runs list,
- run detail,
- events/progress stream,
- artifacts list/viewer.

### Amplify Hosting Production Build

In progress.

A placeholder hosting build is acceptable for now so the Amplify app can deploy successfully while the real frontend is built.

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

1. Fix Amplify Hosting build so the `agents-cloud` Amplify app deploys cleanly.
2. Build `ControlApiStack` in CDK.
3. Smoke test `POST /runs` through API Gateway/Lambda into Step Functions/ECS.
4. Replace the placeholder runtime with a minimal real worker that writes status/events/artifacts.
5. Build the first authenticated frontend dashboard against Amplify Auth + Control API.
