# Cloudflare Realtime Worker

Serverless realtime fanout package for Agents Cloud.

## Files

```text
src/index.ts              Worker routes: /health, /ws, /internal/events
src/auth.ts               Cognito JWT and internal relay secret helpers
src/protocol.ts           Canonical realtime event validation/serialization
src/session-hub-do.ts     Run-scoped Durable Object fanout
src/user-hub-do.ts        User/device hot socket Durable Object
src/workspace-hub-do.ts   Workspace hot-state Durable Object shell
test/*.test.ts            node:test coverage
wrangler.toml             Cloudflare Worker, route, DO bindings, migrations
```

## First production route

```text
https://realtime.solo-ceo.ai/health
wss://realtime.solo-ceo.ai/ws
```

## Commands

```bash
pnpm --filter @agents-cloud/cloudflare-realtime run build
pnpm --filter @agents-cloud/cloudflare-realtime run test
pnpm --filter @agents-cloud/cloudflare-realtime run dev
pnpm --filter @agents-cloud/cloudflare-realtime run deploy
```

## Deploy prerequisites

```bash
pnpm --filter @agents-cloud/cloudflare-realtime exec wrangler login
pnpm --filter @agents-cloud/cloudflare-realtime exec wrangler secret put RELAY_SHARED_SECRET
pnpm --filter @agents-cloud/cloudflare-realtime run deploy
```

The relay secret must later be shared with the AWS event relay service. Do not
commit it.
