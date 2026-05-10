# Secondary Infrastructure

[← infrastructure](README.md) · [stacks](stacks.md) · [wiki index](../README.md)

These are deployment surfaces outside the main CDK app: Amplify (active) and Cloudflare (deferred).

---

## Amplify Auth (active)

**Status:** ✅ deployed sandbox.

Location: `infra/amplify/`. Gen 2 backend at `infra/amplify/amplify/backend.ts` with `auth/resource.ts` configuring email-only Cognito.

**Deployed identifiers:**
- User Pool ID: `us-east-1_1UeU1hTME`
- User Pool Client ID: `3kq79rodc3ofjkulh0b31sfpos`
- Sandbox stack name: `amplify-agentscloudinfraamplify-sebastian-sandbox-9f28c677ec`
- AWS profile: `agents-cloud-source`

**Why Amplify owns Cognito (and not CDK):**

The CDK ControlApiStack and RealtimeApiStack both **import** the existing user pool via `UserPool.fromUserPoolId(...)`. Defaults are hardcoded in `infra/cdk/src/config/environments.ts`. To use a different pool, override:

```sh
export AGENTS_CLOUD_COGNITO_USER_POOL_ID=us-east-1_xxxxx
export AGENTS_CLOUD_COGNITO_USER_POOL_CLIENT_ID=xxxxx
```

**Not in CDK:** AccessCodes, Cognito groups, pre-sign-up Lambdas, post-confirmation triggers, Workspaces tables. ADR-0010 documents these but **none of them are deployed**. See [gaps.md](../gaps.md).

**Hackathon usage:**
- Web app: `apps/web/lib/amplify-config.ts` reads `NEXT_PUBLIC_AMPLIFY_*` env vars.
- Flutter app: `apps/desktop_mobile/lib/backend_config.dart` has the user pool ID **hardcoded in source** (lines 8–13).

**Sandbox commands:**
```sh
pnpm amplify:sandbox          # create / refresh
pnpm amplify:sandbox:delete   # tear down
pnpm amplify:deploy           # deploy non-sandbox (not used for hackathon)
```

---

## Amplify Hosting (active)

**Status:** ✅ deployed.

- App ID: `dkqxgsrxe1fih`
- Branch: `main`
- URL: `https://main.dkqxgsrxe1fih.amplifyapp.com/`
- Build config: `amplify.yml` at repo root
- Source: `apps/web/`

`git push` to `main` triggers an Amplify build that runs `pnpm web:build`.

For the hackathon, **this is sufficient as the web hosting layer**. No CDN customization, no custom domain, no preview environments needed beyond what Amplify provides.

---

## Cloudflare Realtime (deferred)

**Status:** 🗑️ skip for hackathon.

Location: `infra/cloudflare/realtime/`. Wrangler-based Cloudflare Worker + Durable Objects.

**What's built (but not deployed):**
- Worker entry: `/health`, `/ws` (WebSocket), `POST /internal/events` (relay endpoint).
- Durable Objects: `UserHubDO`, `SessionHubDO`, `WorkspaceHubDO`.
- Cognito JWT validation against Amplify user pool.
- Tests (3 files) pass: protocol, auth, worker routing.

**Why deferred:**
- Per user instruction: stay on AWS for hackathon.
- AWS-native realtime ([RealtimeApiStack](stacks.md#realtimeapistack)) is the live primary path.
- Cloudflare would only add a fallback fanout layer; not needed for the demo.

**To deploy (if reactivated later):**
```sh
pnpm cloudflare:test
pnpm cloudflare:dev    # local
pnpm cloudflare:deploy
pnpm cloudflare:tail   # streaming logs
```

Plus DNS for `realtime.solo-ceo.ai` and an AWS event-relay Lambda (not built; would live in `services/event-relay/`).

---

## What's NOT here

For completeness, these are explicit non-deployments:

- **`services/event-relay/`** — README only. Would bridge AWS DDB streams → Cloudflare Worker. Not built; not needed if Cloudflare is deferred.
- **`services/preview-router/`** — README only. PreviewIngressStack uses upstream nginx as a placeholder.
- **`services/miro-bridge/`**, **`services/builder-runtime/`**, **`services/agent-manager/`** — README-only scaffolds, not part of any deploy. See [other-services.md](../services/other-services.md).

[← infrastructure](README.md)
