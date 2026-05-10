# Codebase Tree

[← reference](README.md) · [wiki index](../README.md)

> What's in each top-level directory and which wiki page documents it.

---

## Repo root

```
/Users/sebastian/Developer/agents-cloud/
├── apps/                  # Client applications
├── docs/                  # Documentation (this wiki + roadmaps + ADRs)
├── infra/                 # CDK + Amplify + Cloudflare infrastructure code
├── packages/              # Shared TypeScript packages
├── scripts/               # Repo-wide helper scripts
├── services/              # Backend services
├── tests/                 # End-to-end test directories (mostly empty)
├── tools/                 # Vendored tools (shadcn_flutter)
├── package.json           # pnpm root: scripts coordinate sub-packages
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── amplify.yml            # Amplify Hosting build config for web
├── AGENTS.md              # Onboarding for new agents/contributors
└── README.md
```

---

## `apps/`

Client applications.

| Path | Status | Wiki |
|---|---|---|
| `apps/web/` | ✅ real | [client web](../clients/web.md) |
| `apps/desktop_mobile/` | ⚠️ shell | [client flutter](../clients/flutter.md) |
| `apps/agent_console_flutter/` | 🗑️ orphan (only `build/`) | — |

### `apps/web/` (Next.js 16)
- `app/` — App Router pages: `page.tsx`, `admin/page.tsx`, `(console)/page.tsx`
- `components/` — `command-center.tsx`, `admin-console.tsx`, `work-dashboard.tsx`, `amplify-provider.tsx`, `app/host-redirect.tsx`, etc.
- `lib/` — `control-api.ts`, `realtime-client.ts`, `run-ledger.ts`, `admin-runners.ts`, `admin-lineage.ts`, `agent-workshop.ts`, `work-items.ts`, `fixtures.ts`, `auth-session-reset.ts`, `auth-storage.ts`, `amplify-config.ts`
- `test/` — vitest unit tests
- `.env.example` — public env vars

### `apps/desktop_mobile/` (Flutter)
- `lib/main.dart` — 2,574 LOC monolith
- `lib/backend_config.dart` — Amplify config + unused ControlApiClient
- `lib/src/data/` — `fixture_work_repository.dart`
- `lib/src/domain/` — `work_item_models.dart`
- `pubspec.yaml`
- `test/widget_test.dart`

---

## `services/`

Backend services. See [services overview](../services/README.md).

| Path | Status | Wiki |
|---|---|---|
| `services/control-api/` | ✅ real | [control-api](../services/control-api.md) |
| `services/agent-runtime/` | ⚠️ smoke | [agent-runtime](../services/agent-runtime.md) |
| `services/realtime-api/` | ✅ real | [realtime-api](../services/realtime-api.md) |
| `services/agent-creator/` | ⚠️ CLI only | [agent-creator](agent-creator.md) |
| `services/agent-manager/` | ❌ scaffold | [other-services](../services/other-services.md) |
| `services/builder-runtime/` | ❌ scaffold | [other-services](../services/other-services.md) |
| `services/event-relay/` | ❌ scaffold | 🗑️ skip |
| `services/miro-bridge/` | ❌ scaffold | 🗑️ skip |
| `services/preview-router/` | ❌ scaffold | 🗑️ skip |

### `services/control-api/src/`
- `handlers.ts` — all 11 Lambda entrypoints
- `create-run.ts`, `query-runs.ts`, `work-items.ts`, `user-runners.ts`, `agent-profiles.ts`
- `dynamo-store.ts` — all DDB access
- `step-functions.ts` — StartExecution wrapper
- `ports.ts` — interfaces
- `env.ts` — env validation

### `services/agent-runtime/src/`
- `index.ts` — stateless worker entrypoint
- `worker.ts` — orchestration
- `hermes-runner.ts` — smoke vs cli adapter
- `dynamo-event-sink.ts`, `aws-artifact-sink.ts` — storage
- `resident-runner.ts` — multi-agent in-process registry (NEW)
- `resident-runner-server.ts` — Bearer-token HTTP server (NEW)
- `local-harness.ts` — deterministic simulation
- `local-runner-cli.ts` — local CLI

### `services/realtime-api/src/`
- `auth.ts` — Lambda authorizer (Cognito JWT verify)
- `handlers.ts` — `$connect` / `$disconnect` / `$default`
- `relay.ts` — DDB Stream → postToConnection
- `subscriptions.ts` — RealtimeConnections store
- `env.ts`

---

## `packages/`

Shared TypeScript packages. See [packages overview](#packages-overview-1).

| Path | Wiki |
|---|---|
| `packages/protocol/` | [protocol-package](protocol-package.md) |
| `packages/agent-profile/` | [agent-profile-package](agent-profile-package.md) |

### `packages/protocol/`
- `schemas/event-envelope.schema.json`
- `schemas/events/{run-status,artifact,tool-approval,a2ui-delta}.schema.json`
- `src/events.ts` — TS types + builders
- `examples/*.json` — golden fixtures
- `scripts/validate-schemas.mjs` — Ajv validator

### `packages/agent-profile/`
- `src/types.ts`, `src/validators.ts`, `src/fixtures.ts`, `src/index.ts`
- `test/validators.test.ts`

---

## `infra/`

Infrastructure as code. See [infrastructure overview](../infrastructure/README.md).

| Path | Status | Wiki |
|---|---|---|
| `infra/cdk/` | ✅ active | [stacks](../infrastructure/stacks.md) |
| `infra/amplify/` | ✅ active | [secondary-infra](../infrastructure/secondary-infra.md) |
| `infra/cloudflare/realtime/` | 🗑️ deferred | [secondary-infra](../infrastructure/secondary-infra.md) |

### `infra/cdk/src/`
- `bin/agents-cloud-cdk.ts` — entrypoint, stack composition
- `config/environments.ts` — env-driven config loader
- `stacks/foundation-stack.ts`
- `stacks/network-stack.ts`
- `stacks/storage-stack.ts`
- `stacks/state-stack.ts`
- `stacks/cluster-stack.ts`
- `stacks/runtime-stack.ts`
- `stacks/orchestration-stack.ts`
- `stacks/control-api-stack.ts`
- `stacks/realtime-api-stack.ts`
- `stacks/preview-ingress-stack.ts`
- `stacks/agents-cloud-stack.ts` — base class with tags
- `test/*.test.ts` — CDK assertions

---

## `docs/`

Documentation tree.

| Path | Purpose |
|---|---|
| `docs/wiki/` | **This wiki** (you are here) |
| `docs/adr/` | Architecture Decision Records — see [adrs.md](../adrs.md) |
| `docs/roadmap/` | Plans, status reports, scope docs |
| `docs/audits/` | Historical audits |
| `docs/agent-workstreams/` | Per-workstream coordination |
| `docs/research/` | Research notes |
| `docs/plans/` | Specific plans |
| `docs/PROJECT_STRUCTURE.md` | Higher-level project structure doc |
| `docs/IMPLEMENTATION_READINESS_AUDIT.md` | Older readiness audit |
| `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md` | Quality gate spec |

---

## `tests/`

End-to-end test buckets. **Mostly empty.**

```
tests/
├── e2e/      # empty
├── load/     # empty
└── security/ # empty
```

🗑️ Skip for hackathon.

---

## `tools/`

Vendored tools.

- `tools/shadcn_flutter/` — Flutter widget kit (51 widget tests, smoke level only)

---

## Top-level scripts (`package.json`)

Workspace orchestration via pnpm filters:

```sh
pnpm contracts:build       # @agents-cloud/protocol
pnpm contracts:test
pnpm agent-profile:build
pnpm agent-profile:test
pnpm control-api:build
pnpm control-api:test
pnpm agent-runtime:build
pnpm agent-runtime:test
pnpm agent-runtime:local           # local harness CLI
pnpm agent-runtime:docker:build
pnpm agent-runtime:docker:harness
pnpm agent-runtime:resident:server # local resident runner
pnpm agent-runtime:resident:docker:build
pnpm agent-runtime:resident:docker
pnpm realtime-api:build
pnpm realtime-api:test
pnpm agent-creator:build
pnpm agent-creator:test
pnpm agent-creator:smoke
pnpm infra:build
pnpm infra:test
pnpm infra:synth
pnpm infra:diff
pnpm infra:deploy
pnpm infra:bootstrap
pnpm amplify:sandbox
pnpm amplify:sandbox:delete
pnpm amplify:deploy
pnpm web:dev
pnpm web:typecheck
pnpm web:test
pnpm web:build
pnpm cloudflare:build              # 🗑️ skip
pnpm cloudflare:test
pnpm cloudflare:dev
pnpm cloudflare:deploy
pnpm cloudflare:tail
```

---

## Packages overview

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "infra/cdk"
  - "infra/amplify"
  - "infra/cloudflare/realtime"
  - "packages/*"
  - "services/*"
```

Flutter apps use `pubspec.yaml` (not in workspace; built separately).

[← reference](README.md)
