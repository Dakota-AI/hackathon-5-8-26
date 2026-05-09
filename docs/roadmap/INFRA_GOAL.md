# Infrastructure Goal

Date: 2026-05-09
Status: Active implementation goal

## Goal

Set up the first production-shaped infrastructure foundation for `agents-cloud` so the project is ready to synthesize and later deploy AWS resources for durable autonomous-agent runs.

## Scope For This Infra Pass

Build a real AWS CDK TypeScript workspace under `infra/cdk` with:

1. A typed environment/app configuration model.
2. A CDK app entrypoint.
3. A foundation stack for naming, tagging, and shared environment metadata.
4. A network stack suitable for later ECS/Fargate workers.
5. A storage stack with S3 buckets for live artifacts, immutable audit logs, preview static assets, and research datasets.
6. A state stack with DynamoDB tables for runs, tasks, events, artifacts, and approvals.
7. An ECS cluster and placeholder agent-runtime Fargate task definition.
8. A first Step Functions state machine that can run the placeholder task.
9. Root pnpm scripts for infra build/synth.
10. Documentation showing how to synthesize and what inputs are still needed before deployment.

## Explicit Non-Scope For This Pass

Do not build these yet:

- Real worker application code/images.
- Lambda/API Gateway Control API.
- Cloudflare Worker/Durable Objects.
- Amplify auth/app backend.
- Hermes/Codex/Miro worker integrations.

Those should come after the deployable infra skeleton is reviewed and the first AWS account/region is confirmed.

## Acceptance Criteria

- `pnpm install --frozen-lockfile` succeeds.
- `pnpm contracts:test` still succeeds.
- `pnpm infra:build` succeeds.
- `pnpm infra:synth` succeeds without AWS deployment credentials.
- `infra/cdk/README.md` explains the stack layout, commands, and deployment prerequisites.
