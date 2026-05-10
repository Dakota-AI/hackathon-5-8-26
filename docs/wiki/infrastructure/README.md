# Infrastructure Overview

[← back to wiki index](../README.md) · [STATUS](../STATUS.md) · [ARCHITECTURE](../ARCHITECTURE.md)

This is the AWS-native foundation. CDK is the source of truth for everything except Cognito (Amplify-owned). All deployed in `agents-cloud-dev` (account 625250616301, us-east-1).

## Pages

- [CDK stacks (deep)](stacks.md) — every stack, every resource, every env var, every output
- [Deployment guide](deployment.md) — bring-up checklist
- [Secondary infra](secondary-infra.md) — Amplify Auth (active) and Cloudflare Realtime (deferred)

## Stack composition

```
FoundationStack
    │
    ├── NetworkStack
    │       └── ClusterStack
    │               ├── RuntimeStack ─────────────┐
    │               └── OrchestrationStack        │
    │                       │                     │
    ├── StorageStack ───────┼──────────────────────┤
    │                       │                     │
    ├── StateStack ─────────┴── ControlApiStack ──┘
    │       │                       │
    │       └── RealtimeApiStack ───┘
    │
    └── (optional) PreviewIngressStack — disabled by default
```

## Status by stack

| Stack | Deployed | Notes |
|---|---|---|
| Foundation | ✅ | SSM parameters |
| Network | ✅ | VPC `10.40.0.0/16`, S3+DDB gateway endpoints |
| Storage | ✅ | 4 S3 buckets; audit log has Object Lock |
| State | ✅ | 14 DynamoDB tables PAY_PER_REQUEST |
| Cluster | ✅ | ECS cluster + log group |
| Runtime | ✅ | agent-runtime + resident-runner Fargate task defs |
| Orchestration | ✅ | `simple-run` SFN, single state, 2hr timeout |
| ControlApi | ✅ | HttpApi + 11 Lambdas + Cognito JWT authorizer |
| RealtimeApi | ✅ | WebSocket API + DDB Stream relay |
| PreviewIngress | ⚠️ optional | Placeholder nginx; not real preview routing — disabled |

## Headline gotchas

- **Cognito user pool is Amplify-owned, not CDK-owned.** ID `us-east-1_1UeU1hTME` is hardcoded as default in `infra/cdk/src/config/environments.ts`. Override via `AGENTS_CLOUD_COGNITO_USER_POOL_ID`.
- **`ADMIN_EMAILS=seb4594@gmail.com` baked into ControlApiStack source** (`control-api-stack.ts:63`). Adding admins requires source edit + redeploy.
- **`HERMES_RUNNER_MODE=smoke`** is the synth default — worker won't call a real model until this is overridden AND the image has `hermes` baked in (or the worker is rewritten to call an SDK directly).
- **Resident-runner image is built and granted IAM, but no code calls `ecs:RunTask` for it.** See [agent-runtime.md](../services/agent-runtime.md) and [multi-user-routing.md](../flows/multi-user-routing.md).

[→ continue to stacks.md](stacks.md)
