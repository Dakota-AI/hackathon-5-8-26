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
- The command panel now creates durable runs, subscribes to the AWS-native realtime WebSocket for live `run.status` / `artifact.created` events, uses `GET /runs/{runId}/events` as replay/backfill after reconnect, stops on terminal statuses, and surfaces artifact cards from canonical `artifact.created` events.
- A local browser self-test mode exists for dogfooding the run-ledger UI without needing a persistent test Cognito user; realtime is intentionally disabled in API mock mode because there is no deployed event stream to subscribe to.
- Run listing, artifact download URLs, workspace selection, and GenUI rendering still need full backend data integration.

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
NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL=wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev \
pnpm --filter @agents-cloud/web dev
```

Backend HTTP e2e smoke with a temporary Cognito user:

```bash
scripts/smoke-web-http-e2e.sh
```

The smoke script creates a temporary Cognito user, signs in through Amplify's SRP flow, calls the deployed Control API over HTTP with a real ID token, waits for Step Functions/ECS completion, verifies ordered events plus `artifact.created`, and deletes the temporary user.

## Runtime flow: live events plus durable replay

The command panel deliberately keeps AWS as the source of truth.

1. The user signs in with Amplify Auth.
2. `createControlApiRun` sends the Cognito ID token to the CDK Control API.
3. The Control API creates the run ledger in DynamoDB and starts Step Functions / ECS.
4. The browser opens `NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL?token=<id-token>` because browser WebSocket constructors cannot set an `Authorization` header.
5. On socket open, the browser sends `{"action":"subscribeRun","workspaceId":"...","runId":"..."}`.
6. DynamoDB Streams relay inserted run events to API Gateway WebSocket subscribers.
7. The UI merges live WebSocket event messages into the same ordered ledger model used by HTTP polling.
8. On socket open, close, reconnect, and a slow safety interval, the UI calls `GET /runs/{runId}` and `GET /runs/{runId}/events?afterSeq=<last-seq>` to backfill anything missed while disconnected.
9. Terminal statuses stop the live subscription loop; the artifact cards still come from canonical `artifact.created` payloads.

Realtime is presentation/fanout only. If the socket is unavailable, the durable HTTP ledger remains the repair path.

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
- AWS-native WebSocket realtime API: live fanout of run events from the DynamoDB stream.
- DynamoDB/S3/Step Functions/ECS: durable system of record and execution.
- Cloudflare Durable Objects: optional future edge fanout/sync if the AWS-native socket is not enough.
- Hermes/Codex/etc: runtime providers behind canonical event adapters.
