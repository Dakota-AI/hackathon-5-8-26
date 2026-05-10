# Agents Cloud Web

Next.js web command center for Agents Cloud.

This app is intentionally named simply:

```text
apps/web
```

It pairs with:

```text
apps/desktop_mobile
```

## Current status

- Product shell exists.
- Desktop/mobile naming is mirrored by a simple web app path.
- Amplify Auth client configuration hook exists and is wired from public Cognito environment values.
- Control API helper calls the CDK-owned run lifecycle API when configured.
- The command panel now creates durable runs, polls `GET /runs/{runId}` and `GET /runs/{runId}/events?afterSeq=...`, renders an ordered event timeline, stops polling on terminal statuses, and surfaces artifact cards from canonical `artifact.created` events.
- A local browser self-test mode exists for dogfooding the run-ledger UI without needing a persistent test Cognito user.
- Run listing, artifact download URLs, realtime socket subscription, workspace selection, and GenUI rendering still need full backend data integration.

## Local development

```bash
pnpm --filter @agents-cloud/web dev
pnpm --filter @agents-cloud/web test
pnpm --filter @agents-cloud/web typecheck
pnpm --filter @agents-cloud/web build
```

Local browser self-test mode:

```bash
NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS=1 \
NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK=1 \
NEXT_PUBLIC_AMPLIFY_REGION=us-east-1 \
NEXT_PUBLIC_AMPLIFY_USER_POOL_ID=us-east-1_1UeU1hTME \
NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID=3kq79rodc3ofjkulh0b31sfpos \
NEXT_PUBLIC_AGENTS_CLOUD_API_URL=https://ajmonuqk61.execute-api.us-east-1.amazonaws.com \
pnpm --filter @agents-cloud/web dev
```

Backend HTTP e2e smoke with a temporary Cognito user:

```bash
scripts/smoke-web-http-e2e.sh
```

The smoke script creates a temporary Cognito user, signs in through Amplify's SRP flow, calls the deployed Control API over HTTP with a real ID token, waits for Step Functions/ECS completion, verifies ordered events plus `artifact.created`, and deletes the temporary user.

## Environment

Copy `.env.example` to `.env.local` and fill values from Amplify outputs when testing auth locally.

```bash
cp apps/web/.env.example apps/web/.env.local
```

Do not commit `.env.local`.

## Architecture boundary

The web app does not own durable run state. It renders product UX and calls backend APIs.

- Amplify/Cognito: auth and client configuration.
- CDK Control API: run creation, run reads, event reads, artifact reads.
- DynamoDB/S3/Step Functions/ECS: durable system of record and execution.
- Cloudflare Durable Objects: future realtime fanout/sync.
- Hermes/Codex/etc: runtime providers behind canonical event adapters.
