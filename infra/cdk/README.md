# AWS CDK Infrastructure

This package contains the first deployable AWS CDK foundation for `agents-cloud`.

## Current Status

Implemented and synthesizing:

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
  - Runs table.
  - Tasks table.
  - Events table.
  - Artifacts table.
  - Approvals table.
  - PAY_PER_REQUEST billing.
  - PITR enabled outside `dev`.
  - Deletion protection enabled in `prod`.

- `ClusterStack`
  - ECS cluster for future agent workers.
  - Agent runtime CloudWatch log group.

- `RuntimeStack`
  - Placeholder Fargate `agent-runtime` task definition.
  - Placeholder Alpine container that accepts `RUN_ID`, `TASK_ID`, and `WORKSPACE_ID`.
  - Task role grants for the current S3 buckets and DynamoDB tables.

- `OrchestrationStack`
  - First Step Functions state machine.
  - Runs the placeholder Fargate task with Step Functions `RUN_JOB` integration.

Not implemented yet:

- Real worker application image.
- Lambda/API Gateway Control API.
- EventBridge/SQS event relay.
- Cloudflare realtime stack.
- Amplify auth/app backend.

## Commands

From the repository root:

```bash
pnpm install
pnpm infra:build
pnpm infra:synth
```

Package-local equivalents:

```bash
pnpm --filter @agents-cloud/infra-cdk build
pnpm --filter @agents-cloud/infra-cdk synth
pnpm --filter @agents-cloud/infra-cdk diff
pnpm --filter @agents-cloud/infra-cdk deploy
```

## Configuration

The CDK app reads these environment variables:

```bash
AGENTS_CLOUD_ENV=dev                 # dev, staging, or prod; default dev
AGENTS_CLOUD_APP_NAME=agents-cloud    # default agents-cloud
AGENTS_CLOUD_AWS_REGION=us-east-1     # default CDK_DEFAULT_REGION or us-east-1
AGENTS_CLOUD_MAX_AZS=2                # default 2
AGENTS_CLOUD_NAT_GATEWAYS=1           # default 1 for dev/staging, 2 for prod
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

## Synthesized Stacks

Default `dev` synth creates these stack ids:

- `agents-cloud-dev-foundation`
- `agents-cloud-dev-network`
- `agents-cloud-dev-storage`
- `agents-cloud-dev-state`
- `agents-cloud-dev-cluster`
- `agents-cloud-dev-runtime`
- `agents-cloud-dev-orchestration`

To inspect one synthesized template:

```bash
pnpm --filter @agents-cloud/infra-cdk synth -- agents-cloud-dev-state
```

## Next Infra Work

The next infra/application layer should add:

1. `control-api` Lambda/API Gateway skeleton to create and query runs.
2. EventBridge/SQS resources for durable event movement between workers, Control API, and realtime relay.
3. A real `agent-runtime` image/script that receives `RUN_ID`, writes a test artifact, emits canonical status events, and exits.
4. `ClusterStack` expansion for separate worker classes (`agent-light`, `agent-code`, `agent-builder-heavy`, `agent-eval`, `preview-app`).
5. Cloudflare Worker/Durable Object realtime skeleton for run status fanout.
