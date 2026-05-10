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
- Amplify Auth client configuration hook exists but is optional until real outputs are wired.
- Control API helper calls the CDK-owned run lifecycle API when configured.
- Run, agent, artifact, approval, and GenUI panels still need full backend data integration.

## Local development

```bash
pnpm --filter @agents-cloud/web dev
pnpm --filter @agents-cloud/web typecheck
pnpm --filter @agents-cloud/web build
```

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
