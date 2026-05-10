# Local Development

[← guides](README.md) · [wiki index](../README.md) · related: [codebase tree](../reference/codebase-tree.md), [env vars](../reference/env-vars.md)

> Set up your machine, run services locally, iterate.

---

## Prerequisites

- **Node 22+** — see `.nvmrc`. Use `nvm use` if available.
- **pnpm 10+** — `npm install -g pnpm@10` (or `corepack enable`).
- **Docker** — for building agent-runtime images and running resident-runner locally.
- **AWS CLI v2** — for SSO/profile setup if deploying.
- **Flutter SDK 3.11+** — only if working on `apps/desktop_mobile`.

## First clone

```bash
git clone <repo>
cd agents-cloud
nvm use
pnpm install
```

This installs every workspace package per `pnpm-workspace.yaml`. Flutter apps are not part of pnpm; their deps are pulled with `flutter pub get` separately.

## AWS profile

Default AWS profile is `agents-cloud-source` (account 625250616301, us-east-1). Configure via SSO or static credentials:

```bash
aws configure sso --profile agents-cloud-source
# or
aws configure --profile agents-cloud-source
```

Then export:

```bash
export AWS_PROFILE=agents-cloud-source
export AWS_REGION=us-east-1
```

Most pnpm scripts default to this profile (see root `package.json`).

## Build everything

```bash
pnpm contracts:build         # @agents-cloud/protocol → JSON Schema validation
pnpm agent-profile:build     # @agents-cloud/agent-profile
pnpm control-api:build       # services/control-api
pnpm agent-runtime:build     # services/agent-runtime
pnpm realtime-api:build      # services/realtime-api
pnpm agent-creator:build     # services/agent-creator
pnpm web:build               # apps/web (Next.js production build)
pnpm infra:build             # CDK + dependencies
```

Or build only what you're touching — pnpm handles dependency order via `workspace:*` refs.

---

## Running services locally

### Control API
No standalone local server today — the Lambdas run on AWS. To exercise the handlers locally, you can:
1. Run unit tests: `pnpm control-api:test`
2. Use the deployed dev API: `https://ajmonuqk61.execute-api.us-east-1.amazonaws.com`

### Agent runtime — local harness
Deterministic scripted multi-agent flow. No model, no AWS.

```bash
pnpm agent-runtime:local
# or with options:
node services/agent-runtime/dist/src/local-runner-cli.js \
  run \
  --root .agents/local-runs/test1 \
  --objective "Build a launch page for our new product" \
  --approve-preview approved
```

Inspect results:

```bash
node services/agent-runtime/dist/src/local-runner-cli.js inspect --root .agents/local-runs/test1
```

See [local-harness reference](../reference/local-harness.md).

### Agent runtime — Docker smoke worker

```bash
pnpm agent-runtime:docker:build
pnpm agent-runtime:docker:harness   # runs the local harness inside the container
```

This **does not** invoke the cloud — it runs the same `node dist/src/local-runner-cli.js` from inside the container.

### Resident runner — local

```bash
pnpm agent-runtime:resident:server
```

Starts the resident HTTP server on `http://127.0.0.1:8787`. Defaults: `RUNNER_ID=runner-local-001`, `USER_ID=user-local-001`, `ORG_ID=org-local-001`. Adapter defaults to `smoke`.

⚠️ In `ecs-resident` mode you need `RUNNER_API_TOKEN`. Use `AGENTS_RUNTIME_MODE=resident-dev` to skip auth for local development:

```bash
AGENTS_RUNTIME_MODE=resident-dev pnpm agent-runtime:resident:server
```

Test the API:
```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/state
curl -X POST http://127.0.0.1:8787/wake \
  -H "Content-Type: application/json" \
  -d '{"objective": "Plan a launch."}'
```

### Resident runner — Docker

```bash
pnpm agent-runtime:resident:docker:build
pnpm agent-runtime:resident:docker
```

Container exposes port 8787 on `127.0.0.1`.

### Realtime API
Runs only on AWS Lambda. Test via deployed endpoint:
```
wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev
```

Append `?token=<idToken>` from a Cognito-authenticated session.

### Agent creator workshop

```bash
pnpm agent-creator:smoke   # runs the marketing scenario
```

For the interactive mode:
```bash
pnpm agent-creator:build
node services/agent-creator/dist/src/cli.js --interactive --bundle-dir .agents/bundles/marketing
```

See [agent-creator reference](../reference/agent-creator.md).

### Web app (Next.js)

```bash
pnpm web:dev
# → http://localhost:3000
```

Required env vars in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_AMPLIFY_REGION=us-east-1
NEXT_PUBLIC_AMPLIFY_USER_POOL_ID=us-east-1_1UeU1hTME
NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID=3kq79rodc3ofjkulh0b31sfpos
NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID=us-east-1:5562c7da-9181-4b1e-9a5c-5d93a00bb442
NEXT_PUBLIC_AGENTS_CLOUD_API_URL=https://ajmonuqk61.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL=wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev
```

Or for offline iteration:

```bash
NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1 pnpm web:dev
NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1 pnpm web:dev   # skip Cognito modal
```

See [web client](../clients/web.md).

### Flutter app

```bash
cd apps/desktop_mobile
flutter pub get
flutter run -d macos    # or -d chrome / -d ios
flutter test
```

⚠️ Flutter has Amplify configured but **doesn't actually call** Control API or WebSocket today. See [flutter client](../clients/flutter.md).

---

## Iterating on the protocol

If you change a JSON Schema or the TypeScript builders:

```bash
pnpm contracts:test   # builds + validates against examples
```

If you change `@agents-cloud/agent-profile`:

```bash
pnpm agent-profile:test
```

Both are pure (no AWS).

---

## Iterating on infrastructure

```bash
pnpm infra:test       # CDK assertions
pnpm infra:synth      # produces CloudFormation in cdk.out/
pnpm infra:diff       # diffs against deployed stacks
pnpm infra:deploy     # cdk deploy --all (uses default profile)
```

Single-stack deploy:

```bash
pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-control-api
```

CDK builds Docker images on every deploy of `RuntimeStack`. First deploy can take ~5 min for image push. Subsequent deploys are layer-cached.

---

## Common tasks

### Add a route to Control API

1. Add handler in `services/control-api/src/handlers.ts` (or new file).
2. Add store method in `dynamo-store.ts` (interface in `ports.ts`).
3. Add route + Lambda in `infra/cdk/src/stacks/control-api-stack.ts`.
4. Add IAM grants on relevant tables.
5. Add unit test in `services/control-api/test/`.
6. `pnpm control-api:test && pnpm infra:synth`.
7. `pnpm infra:deploy` (or single stack).

### Add a new event type

1. Add JSON Schema in `packages/protocol/schemas/events/`.
2. Register in `scripts/validate-schemas.mjs`.
3. Add TS type + builder in `packages/protocol/src/events.ts`.
4. Add example in `packages/protocol/examples/`.
5. `pnpm contracts:test`.
6. Add producer logic in worker / Control API.
7. Add consumer in `services/realtime-api/src/relay.ts` if needed.
8. Re-test.

### Change a CDK stack

1. Edit `infra/cdk/src/stacks/<stack>.ts`.
2. `pnpm infra:test` — assertions might break.
3. `pnpm infra:diff` — sanity check what changes.
4. `pnpm infra:deploy` — apply.

### Run web build locally for production parity

```bash
pnpm web:build
pnpm --filter @agents-cloud/web start
```

---

## Hot tips

- **`.env.local` at repo root** is not loaded automatically by all scripts. Check the script you're running.
- **Step Functions traces** are visible in the AWS console; lookup by execution ARN from `runs.executionArn`.
- **CloudWatch log groups:**
  - `/aws/lambda/agents-cloud-dev-*` — Lambda logs
  - `/aws/agents-cloud/dev/ecs/agent-runtime` — ECS worker logs
- **Realtime smoke test:** open browser devtools → Network → WS panel; you should see `subscribeRun` then a stream of `run.status` and `artifact.created` payloads.
- **Cleanup local-runs:** `rm -rf .agents/local-runs/` (gitignored).

[← guides](README.md)
