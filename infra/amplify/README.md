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

- Minimal Amplify Gen 2 backend shell at `amplify/backend.ts`.
- Local sandbox/deploy scripts wired to the `agents-cloud-source` AWS profile by default.

No Auth/Data resources are defined yet. Add them when the first app client/control API flow is ready.

## Commands

From the repo root:

```bash
pnpm amplify:sandbox
pnpm amplify:sandbox:delete
```

The production/branch deploy command requires an existing Amplify Hosting app id:

```bash
AWS_AMPLIFY_APP_ID=your_app_id AWS_BRANCH=main pnpm amplify:deploy
```

If you want Amplify Hosting managed branch deploys, create/connect the Amplify app in AWS Amplify first, then set `AWS_AMPLIFY_APP_ID`.

## Notes

`ampx sandbox` creates cloud resources in the selected AWS account. Use it only when you are ready to create the first Amplify sandbox backend.
