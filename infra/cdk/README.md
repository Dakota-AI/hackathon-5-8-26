# AWS CDK Infrastructure

This package contains the first deployable AWS CDK foundation for `agents-cloud`.

## Current Status

Implemented, deployed, and synthesizing:

- `FoundationStack`
  - Shared app/environment SSM parameters.
  - Stack outputs for app and environment identity.

- `NetworkStack`
  - VPC using `10.40.0.0/16`.
  - Public, private-egress, and isolated subnet groups.
  - S3 and DynamoDB gateway endpoints.
  - Default worker security group for later ECS tasks.

- `StorageStack`
  - `workspace-live-artifacts` bucket.
  - `workspace-audit-log` bucket with versioning and S3 Object Lock enabled from creation.
  - `preview-static` bucket.
  - `research-datasets` bucket.
  - Public access blocked, SSL enforced, bucket-owner-enforced object ownership.

- `StateStack`
  - WorkItems table with user, status, and idempotency lookup indexes.
  - Runs table.
  - Tasks table.
  - Events table.
  - Artifacts table.
  - DataSources table for durable DataSourceRef records.
  - Surfaces table for validated GenUI/A2UI surface records.
  - Approvals table.
  - PAY_PER_REQUEST billing.
  - PITR enabled outside `dev`.
  - Deletion protection enabled in `prod`.

- `ClusterStack`
  - ECS cluster for future agent workers.
  - Agent runtime CloudWatch log group.

- `RuntimeStack`
  - Fargate `agent-runtime` task definition built from `services/agent-runtime/Dockerfile` as a CDK ECR asset.
  - Hermes-boundary worker container that accepts `RUN_ID`, `TASK_ID`, `WORKSPACE_ID`, optional `WORK_ITEM_ID`, `USER_ID`, and `OBJECTIVE`.
  - Runtime environment includes WorkItems, DataSources, and Surfaces table names for the next WorkItem/GenUI worker phase.
  - Task role grants for the current S3 buckets and DynamoDB tables.

- `OrchestrationStack`
  - First Step Functions state machine.
  - Runs the Hermes/smoke Fargate task with the optimized ECS `runTask.sync` integration and per-run environment overrides.
  - Passes optional `workItemId` through to the ECS task as `WORK_ITEM_ID`.

- `ControlApiStack`
  - API Gateway HTTP API for durable run lifecycle endpoints.
  - Cognito JWT authorizer wired to the Amplify Auth user pool/client.
  - Lambda handlers for `POST /runs`, `GET /runs/{runId}`, and
    `GET /runs/{runId}/events`.
  - Product-shaped WorkItem, Artifact, DataSourceRef, and Surface routes are provisioned behind the same authorizer with explicit `501 NotImplemented` handlers for the next Control API implementation phase.
  - IAM grants for DynamoDB run/task/event access and Step Functions execution
    start.

- `RealtimeApiStack`
  - API Gateway WebSocket API for AWS-native realtime streaming.
  - Lambda REQUEST authorizer validating Cognito JWTs on `$connect`.
  - `$connect`, `$disconnect`, and `$default` handlers from `services/realtime-api`.
  - DynamoDB Streams relay from authoritative run events to subscribed connections.
  - Outputs WebSocket URL and callback URL.

- Optional `PreviewIngressStack`
  - Gated by `AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true`.
  - Creates the public HTTPS ALB and temporary ECS `preview-router` service.
  - Supports Route 53-owned domains by creating the ACM certificate and alias
    records in CDK.
  - Supports Cloudflare/external-DNS domains by importing an already-issued ACM
    certificate with `AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN` and leaving DNS
    record creation outside CDK.

Not complete yet:

- Real Hermes CLI/model execution with scoped provider secrets.
- EventBridge/SQS event relay.
- Cloudflare realtime stack.
- The Cognito user pool/client defaults point at the current Amplify sandbox and
  can be overridden with `AGENTS_CLOUD_COGNITO_USER_POOL_ID` and
  `AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID`.

Related implementation that lives outside this package:

- `infra/amplify` has a deployed Amplify Gen 2 Auth sandbox with Cognito email
  login.
- The repo root has an `amplify.yml` web Hosting build that currently deploys
  successfully.

## Commands

From the repository root:

```bash
pnpm install
pnpm infra:test
pnpm infra:build
pnpm infra:synth
```

Package-local equivalents:

```bash
pnpm --filter @agents-cloud/infra-cdk build
pnpm --filter @agents-cloud/infra-cdk test
pnpm --filter @agents-cloud/infra-cdk synth
pnpm --filter @agents-cloud/infra-cdk diff
pnpm --filter @agents-cloud/infra-cdk deploy
```

## WorkItem / GenUI Infrastructure Slice

The current CDK app includes the infrastructure foundation for the product spine documented in `docs/roadmap/WORKITEM_GENUI_INFRA_IMPLEMENTATION.md`:

```text
WorkItem -> Run -> Events -> Artifacts -> DataSources -> Surfaces
```

This slice creates the AWS state and route shape only. The WorkItem, DataSourceRef, and Surface product handlers intentionally return `501 NotImplemented` until the Control API phase adds validation, tenant authorization, and DynamoDB use cases.

New state resources:

- `WorkItemsTable` keyed by `workspaceId + workItemId`.
- `DataSourcesTable` keyed by `workspaceId + dataSourceId`.
- `SurfacesTable` keyed by `workspaceId + surfaceId`.
- WorkItem lookup GSIs on `RunsTable` and `ArtifactsTable`.

New product routes:

- `/work-items` and `/work-items/{workItemId}`.
- `/work-items/{workItemId}/runs`, `/events`, `/artifacts`, `/data-source-refs`, and `/surfaces`.
- `/runs/{runId}/artifacts`, `/runs/{runId}/data-source-refs`, and `/runs/{runId}/surfaces`.
- `/data-source-refs` and `/surfaces` creation/detail/update/publish paths.

Regression coverage lives in `infra/cdk/src/test/workitem-genui-infra.test.ts` and should be run with `pnpm infra:test` before every infra deploy.

## Configuration

The CDK app reads these environment variables:

```bash
AGENTS_CLOUD_ENV=dev                 # dev, staging, or prod; default dev
AGENTS_CLOUD_APP_NAME=agents-cloud    # default agents-cloud
AGENTS_CLOUD_AWS_REGION=us-east-1     # default CDK_DEFAULT_REGION or us-east-1
AGENTS_CLOUD_MAX_AZS=2                # default 2
AGENTS_CLOUD_NAT_GATEWAYS=1           # default 1 for dev/staging, 2 for prod

# Optional wildcard preview ingress.
AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true
AGENTS_CLOUD_PREVIEW_BASE_DOMAIN=preview.solo-ceo.ai

# Route 53 mode: provide both hosted-zone vars and omit certificate ARN.
AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID=Z1234567890EXAMPLE
AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME=example.com

# External DNS / Cloudflare mode: provide an issued ACM cert ARN and omit the
# hosted-zone vars. DNS CNAMEs are then managed in Cloudflare or another DNS
# provider, not by CDK.
AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/...
```

Example:

```bash
AGENTS_CLOUD_ENV=dev \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
pnpm infra:synth
```

## Deployment Prerequisites

Before deploying, confirm:

1. AWS account and region are selected.
2. AWS credentials are available in the shell.
3. CDK bootstrap has been run for the target account/region:

```bash
pnpm --filter @agents-cloud/infra-cdk exec cdk bootstrap aws://ACCOUNT_ID/REGION
```

4. The deployment environment name is correct (`dev`, `staging`, or `prod`).
5. The audit bucket retention/Object Lock behavior is acceptable. Object Lock must be enabled at bucket creation time and cannot be disabled later.

## Cloudflare Preview Domain Runbook

The selected preview base domain for the current dev environment is:

```text
preview.solo-ceo.ai
*.preview.solo-ceo.ai
```

`solo-ceo.ai` is managed in Cloudflare, so the preview ingress uses external-DNS
mode instead of Route 53 mode.

1. Request an ACM certificate in `us-east-1` with both names:

```bash
AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws acm request-certificate \
  --domain-name preview.solo-ceo.ai \
  --subject-alternative-names '*.preview.solo-ceo.ai' \
  --validation-method DNS \
  --idempotency-token soloceopreviewdev \
  --query CertificateArn \
  --output text
```

The current requested certificate is:

```text
arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c
```

2. In Cloudflare DNS for `solo-ceo.ai`, add the ACM validation CNAME exactly as
   AWS reports it. For the current certificate:

```text
Type: CNAME
Name: _0afc44d369ad2327e61fde6b37cda3ec.preview
Target: _66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws
Proxy status: DNS only
TTL: Auto
```

Do not orange-cloud/proxy this validation record. The `preview` label belongs in
the Name, not the Target. The resulting public FQDN must be:

```text
_0afc44d369ad2327e61fde6b37cda3ec.preview.solo-ceo.ai
```

3. Verify DNS and ACM issuance:

```bash
dig +short CNAME _0afc44d369ad2327e61fde6b37cda3ec.preview.solo-ceo.ai @1.1.1.1

AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c \
  --query 'Certificate.Status' \
  --output text
```

4. After ACM status is `ISSUED`, deploy the preview ingress stack:

```bash
cd infra/cdk

AWS_PROFILE=agents-cloud-source \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
AGENTS_CLOUD_AWS_REGION=us-east-1 \
AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED=true \
AGENTS_CLOUD_PREVIEW_BASE_DOMAIN=preview.solo-ceo.ai \
AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN=arn:aws:acm:us-east-1:625250616301:certificate/3a26e529-124f-4513-a95a-8d11edab953c \
pnpm exec cdk deploy --app 'node dist/bin/agents-cloud-cdk.js' agents-cloud-dev-preview-ingress --require-approval never
```

5. After deploy, create the final Cloudflare CNAME records pointing at the ALB
   DNS output:

```text
preview.solo-ceo.ai      CNAME  <preview-router-alb-dns-name>  DNS only initially
*.preview.solo-ceo.ai    CNAME  <preview-router-alb-dns-name>  DNS only initially
```

## Synthesized Stacks

Default `dev` synth creates these stack ids:

- `agents-cloud-dev-foundation`
- `agents-cloud-dev-network`
- `agents-cloud-dev-storage`
- `agents-cloud-dev-state`
- `agents-cloud-dev-cluster`
- `agents-cloud-dev-runtime`
- `agents-cloud-dev-orchestration`
- `agents-cloud-dev-control-api`

To inspect one synthesized template:

```bash
pnpm --filter @agents-cloud/infra-cdk synth -- agents-cloud-dev-state
```

## Next Infra Work

The next infra/application layer should add:

1. A real `agent-runtime` image/script that receives `RUN_ID`, writes a test artifact, emits canonical status events, and exits.
2. EventBridge/SQS resources for durable event movement between workers, Control API, and realtime relay.
3. Real-client Control API calls using Cognito tokens from the web/native shells.
4. `ClusterStack` expansion for separate worker classes (`agent-light`, `agent-code`, `agent-builder-heavy`, `agent-eval`, `preview-app`).
5. Cloudflare Worker/Durable Object realtime skeleton for run status fanout.
