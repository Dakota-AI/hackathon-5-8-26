# Amplify Gen 2

This package is the product-facing Amplify Gen 2 backend shell for `agents-cloud`.

The AWS source account/profile is configured locally as:

```bash
AWS_PROFILE=agents-cloud-source
AWS_REGION=us-east-1
AWS_DEFAULT_REGION=us-east-1
```

Verified account:

```text
625250616301
arn:aws:iam::625250616301:user/Sebsatian
```

## Boundary

Use Amplify for product-facing app backend resources:

- Cognito/Auth integration.
- App-facing data models.
- Lightweight functions and callbacks.
- Client configuration / outputs.

Keep heavy durable infrastructure in `infra/cdk`:

- VPC/networking.
- S3 artifact/audit buckets.
- DynamoDB durable run ledger.
- ECS workers.
- Step Functions orchestration.
- EventBridge/SQS event movement.

## Current Status

Implemented now:

- Amplify Gen 2 backend at `amplify/backend.ts`.
- Cognito/Auth resource at `amplify/auth/resource.ts` with email sign-in enabled.
- Local sandbox/deploy scripts wired to the `agents-cloud-source` AWS profile by default.

No app-facing Data/API resources are defined here yet. The next durable backend connection should be the CDK-owned Control API, which will validate Cognito JWTs from this Amplify Auth layer before creating/querying runs.

## Commands

From the repo root:

```bash
pnpm amplify:sandbox
pnpm amplify:sandbox:delete
```

For a one-shot sandbox deployment from the Amplify package directory:

```bash
AWS_PROFILE=agents-cloud-source AWS_REGION=us-east-1 pnpm exec ampx sandbox --profile agents-cloud-source --once
```

The current dev sandbox was deployed with identifier `sebastian` and stack name:

```text
amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec
```

The sandbox writes `amplify_outputs.json` locally for client development. That file is ignored because it is environment/sandbox-specific; generate it locally when wiring a frontend.

The production/branch deploy command requires an existing Amplify Hosting app id:

```bash
AWS_AMPLIFY_APP_ID=your_app_id AWS_BRANCH=main pnpm amplify:deploy
```

If you want Amplify Hosting managed branch deploys, create/connect the Amplify app in AWS Amplify first, then set `AWS_AMPLIFY_APP_ID`.

## Notes

`ampx sandbox` creates cloud resources in the selected AWS account. Use it only when you are ready to create the first Amplify sandbox backend.
