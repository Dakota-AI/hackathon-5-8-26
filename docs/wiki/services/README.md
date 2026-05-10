# Services Overview

[← wiki index](../README.md) · [STATUS](../STATUS.md) · [ARCHITECTURE](../ARCHITECTURE.md)

Backend services live under `services/`. Three are real, one is a functional CLI, five are README-only.

## Pages

| Service | Maturity | Page |
|---|---|---|
| control-api | ✅ production-shaped | [control-api.md](control-api.md) |
| agent-runtime | ⚠️ smoke worker | [agent-runtime.md](agent-runtime.md) |
| realtime-api | ✅ production-shaped | [realtime-api.md](realtime-api.md) |
| agent-creator | ⚠️ functional CLI, not wired to HTTP | [other-services.md](other-services.md#agent-creator) |
| agent-manager | ❌ scaffold | [other-services.md](other-services.md#scaffolds) |
| builder-runtime | ❌ scaffold | [other-services.md](other-services.md#scaffolds) |
| event-relay | ❌ scaffold (skip — Cloudflare deferred) | [other-services.md](other-services.md#scaffolds) |
| miro-bridge | ❌ scaffold | [other-services.md](other-services.md#scaffolds) |
| preview-router | ❌ scaffold | [other-services.md](other-services.md#scaffolds) |

## Counts

- 30 source files across all services
- 19 unit test files
- 4 services with code, 5 README-only

## Critical service-level gaps for hackathon

- **agent-runtime** worker doesn't call a real model (smoke mode). See [agent-runtime.md#real-model-invocation](agent-runtime.md).
- **agent-runtime** resident-runner image and TaskDef exist but **nothing schedules them** — no caller of `ecs:RunTask` for the resident family.
- **control-api** has 501 stubs for Artifacts / DataSourceRefs / Surfaces. Approvals routes don't exist at all.
- **realtime-api** doesn't verify `subscribeRun` ownership (mitigated only by event userId filter on relay).

[→ control-api](control-api.md) · [→ agent-runtime](agent-runtime.md) · [→ realtime-api](realtime-api.md) · [→ other-services](other-services.md)
