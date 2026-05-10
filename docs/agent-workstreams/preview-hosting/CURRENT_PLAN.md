# Preview Hosting Current Plan

Workstream: Preview Hosting
Owner: Preview Hosting Workstream
Updated: 2026-05-10
Status: dynamic preview tunnel V0 implemented and deployed; production hardening remains

## Current Scope

Own the first live preview path for agent-created dynamic websites/apps:

- Cloudflare Worker/Durable Object preview tunnel control plane,
- outbound runner-to-Worker tunnel transport,
- wildcard public preview URLs under `solo-ceo.ai`,
- agent-facing `agents-cloud-preview` tool,
- durable `artifact.created` event contract for preview links,
- Agent Builder tool-policy exposure for custom site-building agents,
- follow-on workspace authorization, quotas, retire/TTL, and client management.

## Current State

Implemented/deployed V0:

- Cloudflare Worker package `infra/cloudflare/preview-tunnels` is deployed as `agents-cloud-preview-tunnels`.
- Preview API/control host is `https://preview-api.solo-ceo.ai`.
- Generated viewer URLs use direct wildcard hosts like `https://preview-<id>.solo-ceo.ai/`.
- Cloudflare proxied wildcard DNS for `*.solo-ceo.ai` is in place.
- Local end-to-end tunnel smoke passed earlier: public URL -> Cloudflare wildcard route -> Durable Object -> outbound tunnel -> local HTTP server.
- ECS resident runner task definition is deployed with:
  - `AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL=https://preview-api.solo-ceo.ai`
  - `AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN` from AWS Secrets Manager.
- Resident runner image includes `/usr/local/bin/agents-cloud-preview` and the `agents-cloud-preview-tunnels` Hermes skill.
- `agents-cloud-preview expose --port <port> --label <name>` now emits:
  - redacted JSON including `previewUrl`,
  - a fenced `agents-cloud-event` `artifact.created` block with `kind=website`, `previewUrl`, and `metadata.toolId=preview.expose_dynamic_site`.
- Resident runner parsing now accepts `artifact.created` from agent stdout and writes a durable artifact record when an artifact sink is configured.
- Agent Builder now auto-offers `preview.expose_dynamic_site` for frontend/site/app/preview-capable custom agents, but keeps it approval-required (`requiresApproval: true`).
- ECS CLI smoke passed on task `2cb0508e3fc449ab98df4536ad20b22c` using resident-runner image revision 20:
  - generated `https://preview-ecs-cli-smoke-live-6ff852a906.solo-ceo.ai/`,
  - emitted the fenced `artifact.created` preview block,
  - connected to `wss://preview-api.solo-ceo.ai/connect` with token redacted in logs,
  - public curl through the preview URL returned `ECS Resident Preview Smoke OK`,
  - container exited `0`.

Partially verified / caveats:

- A real resident-runner model-driven run successfully launched and wrote normal run/artifact events, and the model started `agents-cloud-preview`, but it did not wait long enough for the preview URL before max-turn summary. This proves the runner/image/tool is reachable, but model instruction discipline needs a tighter smoke harness or higher-turn preview workflow prompt.
- Web UI already has preview artifact rendering paths (`Open preview`) for artifacts with `previewUrl`; this slice focused on runtime/tool/artifact production, not visual redesign.

## Remaining Gaps

Production/security gaps:

- Preview read access is public-by-URL for V0; no workspace-scoped read authorization yet.
- No preview quota/rate limit per user/workspace/runner.
- No explicit retire button/API or cleanup scheduler beyond Worker-side TTL metadata.
- No WebSocket/HMR forwarding for Vite/Next dev-server hot reload.
- Broad `*.solo-ceo.ai/*` Worker route can catch undefined root subdomains; keep explicit domains like `relay.solo-ceo.ai` and `runner.solo-ceo.ai` monitored.
- Preview tool is currently a CLI/skill, not a first-class structured tool registry entry enforced by runner policy.
- Model-driven preview workflows need a deterministic smoke agent/profile or a dedicated runner command so they do not stop before reading the preview URL.

## Risks

- Public previews can leak workspace output if agents expose sensitive local servers.
- Long-lived preview tunnel processes consume runner resources until stopped.
- Broad wildcard DNS/route can shadow future subdomain products if route precedence is not reviewed.
- Agent instructions that background the preview command without polling output will produce no clickable artifact, even though the tunnel process may be running.
- The preview API token is shared for V0; production should move to scoped, short-lived runner tokens.

## Files Changed In Current Slice

- `services/agent-runtime/bin/agents-cloud-preview.mjs`
- `services/agent-runtime/src/resident-runner.ts`
- `services/agent-runtime/test/resident-runner.test.ts`
- `services/agent-runtime/skills/agents-cloud-preview-tunnels/SKILL.md`
- `services/agent-creator/src/workshop.ts`
- `services/agent-creator/test/workshop.test.ts`
- `packages/protocol/src/events.ts`
- `infra/cdk/src/stacks/runtime-stack.ts`
- `infra/cloudflare/preview-tunnels/src/tunnel-api.ts`
- `infra/cloudflare/preview-tunnels/wrangler.toml`

## Cross-Workstream Dependencies

- Agent Harness: keep `agents-cloud-preview` installed in resident runner images and add deterministic workflow smoke coverage.
- Clients: keep rendering `artifact.created` website artifacts with `previewUrl` as an `Open preview` action in run chat and artifacts board.
- Agent Builder: expose `preview.expose_dynamic_site` as an approval-required capability for custom frontend/site agents.
- Access Control: add preview read auth, workspace capability checks, and scoped runner credentials.
- Infrastructure: monitor Cloudflare wildcard route precedence, DNS, Worker health, and Secrets Manager token rotation.

## Next Implementation Plan

1. Add a deterministic resident-runner smoke path that starts a local server, runs `agents-cloud-preview`, waits for the fenced artifact event, and asserts it reaches DynamoDB/Control API. Avoid relying on LLM behavior for this smoke.
2. Add Control API preview management routes: list active previews, retire preview, and query by run/workspace.
3. Add preview capability checks before a custom agent can use `preview.expose_dynamic_site` outside demo/admin workspaces.
4. Add client management affordances: active preview card, open, copy link, retire, expiration status.
5. Add quotas/rate limits and Cloudflare Worker cleanup for expired/stale tunnels.
6. Add optional WebSocket/HMR forwarding if dev-server previews need hot reload during demos.

## Validation Commands

Already passing in this slice:

```bash
pnpm --filter @agents-cloud/protocol test
pnpm --filter @agents-cloud/agent-runtime test
pnpm --filter @agents-cloud/agent-creator test
pnpm --filter @agents-cloud/infra-cdk test
AWS_PROFILE=agents-cloud-source AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 pnpm --filter @agents-cloud/infra-cdk exec cdk deploy agents-cloud-dev-runtime --app 'node dist/bin/agents-cloud-cdk.js' --require-approval never --concurrency 1
```

Known unrelated/blocking validation:

- `pnpm web:typecheck` still fails in `apps/web/test/chat-events.test.ts` because test fixtures use stale `RunEvent.taskId` shape and an unchecked array access.

## Completion Criteria For V0

Met:

- Dynamic public preview URL can be created from ECS resident runner image.
- Public URL reaches a localhost server through the outbound tunnel.
- Preview tool emits redacted JSON and a parseable `artifact.created` event.
- Resident runner can persist agent-emitted preview artifact records in tests.
- Agent Builder offers the preview capability for custom site-building agents behind approval.

Remaining before production/broad users:

- Workspace-scoped preview read auth or signed preview links.
- Retire/cleanup UI/API.
- Quotas/rate limits.
- Deterministic deployed resident-runner artifact-to-Control-API smoke.
- WebSocket/HMR support only if needed for the demo UX.
