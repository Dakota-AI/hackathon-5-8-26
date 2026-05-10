# Web App Status

_Last updated: 2026-05-10_

## Summary

The Agents Cloud web app now lives at:

```text
apps/web
```

This documents the current Amplify Hosting output and client naming convention:

```text
apps/desktop_mobile  -> Flutter desktop/mobile app
apps/web             -> Next.js web app
```

## Status Checklist

- [x] Confirmed there was no existing real Next.js app in `apps/web`.
- [x] Confirmed Amplify Hosting build configuration.
- [x] Created a real Next.js App Router package at `apps/web`.
- [x] Added a professional Agents Cloud command-center shell.
- [x] Added fixture-backed panels for runs, teams, artifacts, approvals, and GenUI preview.
- [x] Added optional Amplify client configuration from public environment variables.
- [x] Added a Control API helper for the backend URL.
- [x] Configured the web app for static export so the current Amplify Hosting `WEB` app serves `/` instead of uploading raw `.next` internals.
- [x] Added `public/status.json` so the documented hosting health endpoint is emitted into the static artifact.
- [x] Added root web scripts.
- [x] Updated `amplify.yml` to build `apps/web`.
- [ ] Auth UI is not production-wired yet.
- [ ] Control API calls are not real yet because `ControlApiStack` is not built.
- [ ] Cloudflare realtime is not implemented yet.
- [ ] Server-validated GenUI catalog rendering is not implemented yet.

## Files Created

```text
apps/web/package.json
apps/web/next.config.mjs
apps/web/tsconfig.json
apps/web/next-env.d.ts
apps/web/.env.example
apps/web/README.md
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/globals.css
apps/web/components/amplify-provider.tsx
apps/web/components/command-center.tsx
apps/web/lib/amplify-config.ts
apps/web/lib/control-api.ts
apps/web/lib/fixtures.ts
```

## Root Scripts

```bash
pnpm web:dev
pnpm web:typecheck
pnpm web:build
pnpm amplify:hosting:build
```

`pnpm amplify:hosting:build` now runs the real web build via `pnpm web:build`.

## Amplify Hosting

The current Amplify app is a static `WEB` hosting app, so `apps/web/next.config.mjs`
uses `output: "export"` and `amplify.yml` points to the exported site directory:

```text
apps/web/out
```

The pre-build phase still uses Corepack and pnpm 10.0.0 so Amplify Hosting can build the monorepo reliably.

## Auth Configuration

The web app can be configured from public env vars:

```text
NEXT_PUBLIC_AMPLIFY_REGION
NEXT_PUBLIC_AMPLIFY_USER_POOL_ID
NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID
NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID
```

Local setup:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Do not commit `.env.local`.

Current behavior:

- If these env vars are missing, the app runs in product-shell mode.
- If they are present, `Amplify.configure(config, { ssr: true })` runs client-side.

## Product/Architecture Alignment

The web app is intentionally not a Hermes-only UI. It is the Agents Cloud product surface.

The runtime model should stay:

```text
User objective
  -> Control API
  -> durable run/task/event records
  -> Step Functions/ECS worker
  -> runtime adapter: Hermes / Codex / Claude / OpenCode / custom
  -> canonical events
  -> web + desktop/mobile render the same product state
```

Canonical client concepts:

- runs,
- agents and teams,
- tasks,
- artifacts,
- approvals,
- previews,
- generated UI patches,
- realtime event streams.

Hermes belongs behind the runtime adapter boundary, not hardcoded into client data models.

## Verification Commands

From repo root:

```bash
pnpm install
pnpm web:typecheck
pnpm web:build
pnpm amplify:hosting:build
```

Broader validation after infra/docs updates:

```bash
pnpm contracts:test
pnpm infra:build
pnpm infra:synth
pnpm --filter @agents-cloud/infra-amplify run typecheck
pnpm amplify:hosting:build
```

## Next Steps

1. Replace fixture data with a typed client repository layer.
2. Add authenticated shell using Amplify Authenticator or custom Cognito UI.
3. Build `ControlApiStack` and expose `NEXT_PUBLIC_AGENTS_CLOUD_API_URL`.
4. Add run creation and run detail views.
5. Add Cloudflare Durable Objects realtime client.
6. Add a safe web GenUI renderer that accepts validated `genui.patch` events.
