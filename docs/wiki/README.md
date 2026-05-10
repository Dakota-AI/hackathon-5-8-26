# Agents Cloud — System Wiki

> **Last audit:** 2026-05-10
> **Stage:** Foundation deployed, first vertical slice live, ~30–35% of full vision.
> **Hackathon goal:** multiple users running agents concurrently. One ECS resident container per user, multiple logical agents inside, **table-routing-by-userId** for access control. Skip deep IAM, AccessCodes, Workspaces ACLs, Cloudflare.

This wiki is the single source of truth for what is currently built, what is partially built, and what is missing. Each page has a status checklist and links to related pages.

---

## Top-level pages

- 📋 [**STATUS** — master checklist](STATUS.md)
- 🏗️ [**ARCHITECTURE** — diagrams + flows](ARCHITECTURE.md)
- 🚀 [**HACKATHON CRITICAL PATH** — what to ship to demo](HACKATHON_CRITICAL_PATH.md)
- 🗑️ [**GAPS / SKIP LIST** — what we're cutting](gaps.md)
- 🗺️ [**ROADMAP** — phases beyond hackathon](roadmap.md)
- 📜 [**ADRs** — architecture decisions summary](adrs.md)
- 📖 [**GLOSSARY** — every domain term defined](glossary.md)

---

## Layers

### 🏛️ Infrastructure

| Page | What it covers |
|---|---|
| [Infrastructure overview](infrastructure/README.md) | High-level stack composition |
| [CDK stacks](infrastructure/stacks.md) | All 10 stacks, every resource, env var, output |
| [Deployment guide](infrastructure/deployment.md) | Bring-up checklist (cdk deploy order) |
| [Secondary infra](infrastructure/secondary-infra.md) | Amplify Auth (active), Cloudflare (deferred) |

### ⚙️ Services

| Page | Status |
|---|---|
| [Services overview](services/README.md) | — |
| [control-api](services/control-api.md) | ✅ real |
| [agent-runtime](services/agent-runtime.md) | ⚠️ smoke worker; resident runner unwired |
| [realtime-api](services/realtime-api.md) | ✅ real |
| [Other services (creator + scaffolds)](services/other-services.md) | 1 real + 5 README-only |

### 💻 Clients

| Page | Status |
|---|---|
| [Clients overview](clients/README.md) | — |
| [Web (Next.js)](clients/web.md) | ✅ real run loop + admin |
| [Flutter (desktop_mobile)](clients/flutter.md) | ⚠️ shell only, no live API calls |

### 🔁 End-to-end flows

| Page | What it covers |
|---|---|
| [Run creation flow](flows/run-creation.md) | UI → Control API → Step Functions → ECS → Dynamo → WS → web |
| [Multi-user routing](flows/multi-user-routing.md) | userId propagation, per-user runner placement (gap) |

### 🎨 Product surfaces

Status legend: ✅ done · ⚠️ partial · ❌ stub · 🔘 nothing

| Surface | Schema | Storage | API | Worker | Realtime | Web | Flutter |
|---|---|---|---|---|---|---|---|
| [Work items](surfaces/work-items.md) | ⚠️ TS only | ✅ | ✅ | n/a | ❌ | ⚠️ fixture | ⚠️ fixture |
| [Runs & tasks](surfaces/runs-and-tasks.md) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ fixture |
| [Artifacts](surfaces/artifacts.md) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ via run | ⚠️ fixture |
| [Approvals & notifications](surfaces/approvals-and-notifications.md) | ✅ approvals only | ✅ | ✅ | ⚠️ harness only | ✅ | 🔘 | ⚠️ fixture |
| [Generated UI / GenUI](surfaces/generated-ui.md) | ⚠️ event only | ✅ | ✅ | 🔘 | 🔘 | 🔘 | ⚠️ local seed |
| [Data sources](surfaces/data-sources.md) | 🔘 | ✅ | ✅ | 🔘 | 🔘 | 🔘 | 🔘 |

### 📚 Reference

| Page | Notes |
|---|---|
| [Reference index](reference/README.md) | All reference pages |
| [Protocol package](reference/protocol-package.md) | JSON Schemas + TS builders |
| [Agent profile package](reference/agent-profile-package.md) | AgentProfileVersion + validators |
| [Events catalog](reference/events-catalog.md) | Every event type, producer/consumer |
| [DynamoDB tables](reference/dynamodb-tables.md) | All 14 tables in detail |
| [Environment variables](reference/env-vars.md) | Every env var across stack |
| [Codebase tree](reference/codebase-tree.md) | What's in each top-level dir |
| [Idempotency](reference/idempotency.md) | Run/work-item dedup model |
| [Cognito auth](reference/cognito-auth.md) | userId propagation |
| [Local harness](reference/local-harness.md) | Simulated multi-agent flow |
| [Admin console](reference/admin-console.md) | Deep audit of admin UI |
| [Agent creator](reference/agent-creator.md) | Workshop CLI |
| [Tools catalog](reference/tools-catalog.md) | Inventory of tool names |

### 🛠️ Guides

| Page | Notes |
|---|---|
| [Guides index](guides/README.md) | All guides |
| [Local development](guides/local-development.md) | Setup + iteration |
| [Testing](guides/testing.md) | What tests exist + how to run |

---

## Headline status

✅ **Working today (multi-user safe at hackathon scale):**
- 10 CDK stacks deployed, `CREATE_COMPLETE` in `agents-cloud-dev` (account 625250616301, us-east-1)
- 14 DynamoDB tables (PAY_PER_REQUEST, no concurrency cap)
- Cognito JWT propagated through every layer (HTTP + WebSocket)
- `POST /runs` → Step Functions → ECS Fargate → DynamoDB → DDB streams → WebSocket → web command center
- Web admin console: runner fleet, lineage timeline, agent workshop, failures
- AWS-native realtime, no Cloudflare dependency

⚠️ **Partial / fragile:**
- Worker is `HERMES_RUNNER_MODE=smoke` — no real model invocation. Image has no `hermes` binary.
- Resident runner image and TaskDefinition exist; **no scheduler ever calls `ecs:RunTask`** for them.
- Worker hardcodes `seq=2,3,4` — any retry crashes on conditional-check failures.
- Web `WorkDashboard` is fixture-only (real data not fetched).
- Web hardcodes `workspaceId: "workspace-web"` — all users share one workspace key.
- Flutter has Amplify configured but **never calls Control API or WebSocket**. UI is static literals.
- `subscribeRun` doesn't verify run ownership (mitigated only by event userId filter on relay).

❌ **Missing / stub:**
- Per-user runner placement (the "one ECS per user with N agents inside" model)
- ~~`Artifacts`, `DataSourceRefs`, `Surfaces` HTTP routes return 501~~ — **now implemented**
- ~~`Approvals` no route~~ — **now implemented**
- `Notifications` doesn't exist at any layer
- ~~No `GET /runs` user listing endpoint~~ — **now implemented**
- Worker producers for `tool.approval` and `a2ui.delta` events still missing
- No CI, no e2e tests, no production observability dashboards
- `ADMIN_EMAILS` hardcoded to `seb4594@gmail.com` in CDK source

---

## How to navigate

- Start at [STATUS.md](STATUS.md) for the complete checklist.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for the system shape.
- For "what do we build first to demo", read [HACKATHON_CRITICAL_PATH.md](HACKATHON_CRITICAL_PATH.md).
- For deep on any component, follow the layer links above.
