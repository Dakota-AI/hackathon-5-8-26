# Deployment Guide

[← infrastructure](README.md) · [stacks](stacks.md) · [wiki index](../README.md)

> One-shot bring-up of all stacks. For details on what each stack does, see [stacks.md](stacks.md).

## Prerequisites

- [ ] AWS account + region selected. Repo default profile: `agents-cloud-source` (account `625250616301`, region `us-east-1`).
- [ ] CDK bootstrap done in target account/region:
  ```sh
  pnpm --filter @agents-cloud/infra-cdk exec cdk bootstrap aws://<ACCOUNT>/<REGION>
  ```
- [ ] Amplify Auth sandbox deployed (or override Cognito IDs via env). `pnpm amplify:sandbox`. See [secondary-infra.md](secondary-infra.md).
- [ ] Docker daemon running locally (CDK builds two images on each `cdk deploy`).
- [ ] Node 22, pnpm 10.

## Environment variables to set

```sh
export AWS_PROFILE=agents-cloud-source
export AWS_REGION=us-east-1
export AGENTS_CLOUD_AWS_REGION=us-east-1
export AGENTS_CLOUD_ENV=dev

# only override if NOT using the source-account Amplify sandbox:
# export AGENTS_CLOUD_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
# export AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxx

# DO override if you want a real model worker (today defaults to smoke):
# export AGENTS_CLOUD_HERMES_RUNNER_MODE=cli
# (only useful if image has hermes baked in — see services/agent-runtime/Dockerfile)
```

## Build and deploy

```sh
pnpm infra:test
pnpm infra:build
pnpm infra:synth   # sanity check
pnpm infra:deploy  # deploys all stacks in dependency order
```

Or stack-by-stack:

```sh
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-foundation
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-network
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-storage
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-state
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-cluster
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-runtime         # builds + pushes 2 images
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-orchestration
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-control-api
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-realtime-api
# (optional) pnpm ... cdk deploy agents-cloud-dev-preview-ingress
```

## Outputs you'll need

After deploy, grab from CFN exports or stack outputs:

| Output | Used by |
|---|---|
| `ControlApiUrl` (`agents-cloud-dev-control-api-url`) | web `NEXT_PUBLIC_AGENTS_CLOUD_API_URL`, Flutter `backend_config.dart` |
| `RealtimeWebSocketUrl` | web `NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL` |
| `WorkspaceLiveArtifactsBucketName` | runs that produce artifacts |
| `SimpleRunStateMachineArn` | already wired into Lambda env |

Currently deployed (per `docs/roadmap/PROJECT_STATUS.md`):
- Control API: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`
- Realtime: `wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev`

## Smoke verification

```sh
# build everything else
pnpm contracts:build
pnpm control-api:build
pnpm agent-runtime:build
pnpm realtime-api:build

# run service unit tests
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
pnpm infra:test
```

Then HTTP/WebSocket end-to-end smoke (see `docs/agent-workstreams/agent-harness/LOCAL_RUNTIME_TESTING_PLAYBOOK.md`).

## Frontend deploy

Web is on Amplify Hosting. App ID `dkqxgsrxe1fih`, branch `main`, hostname `https://main.dkqxgsrxe1fih.amplifyapp.com/`. Build via `pnpm web:build`. Push to `main` triggers Amplify build pipeline (see `amplify.yml`).

## Tear-down

```sh
pnpm --filter @agents-cloud/infra-cdk exec cdk destroy agents-cloud-dev-realtime-api
pnpm --filter @agents-cloud/infra-cdk exec cdk destroy agents-cloud-dev-control-api
# ... reverse dependency order
```

**Cannot tear down:** `WorkspaceAuditLogBucket` — Object Lock + RETAIN policy. Manually empty + remove Object Lock first if needed.

## Hackathon multi-user concurrency notes

- DDB PAY_PER_REQUEST — no provisioned-capacity bottleneck.
- HTTP API + Lambda scale per request.
- Step Functions + ECS launch one Fargate task per `POST /runs` — concurrent runs work, with cold-start latency.
- Default Fargate concurrent task quota: ~50–500 per region. Plenty for hackathon.
- WebSocket: per-connection records in `RealtimeConnectionsTable`. No connection cap.
- **`ADMIN_EMAILS` is single-user (hardcoded `seb4594@gmail.com`)** — change `infra/cdk/src/stacks/control-api-stack.ts:63` to add more admins.
- **Worker is smoke-mode by default** — agents won't actually do anything intelligent. See [agent-runtime.md](../services/agent-runtime.md).
- **Resident runner image exists but no scheduler** — per-user runners not actually placed today. See [multi-user-routing.md](../flows/multi-user-routing.md).
