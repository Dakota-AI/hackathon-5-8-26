# Testing

[← guides](README.md) · [wiki index](../README.md)

> What tests exist, how to run them, and what's missing.

---

## Quick reference — run all tests

```bash
pnpm contracts:test
pnpm agent-profile:test
pnpm control-api:test
pnpm agent-runtime:test
pnpm realtime-api:test
pnpm agent-creator:test
pnpm web:test
pnpm infra:test
pnpm cloudflare:test    # 🗑️ skip if Cloudflare deferred
```

Plus Flutter:
```bash
cd apps/desktop_mobile && flutter test
```

---

## Test inventory by area

| Area | Files | Framework | Depth |
|---|---|---|---|
| `packages/protocol` | 0 (validate script only) | Ajv2020 | smoke |
| `packages/agent-profile` | 1 | `node:test` | real |
| `services/control-api` | 9 | `node:test` | real |
| `services/agent-runtime` | 3 | `node:test` | real |
| `services/realtime-api` | 4 | `node:test` | real |
| `services/agent-creator` | 3 | `node:test` | smoke |
| `apps/web` | 6 | vitest | real reducers, no UI |
| `apps/desktop_mobile` | 3 (Dart) | flutter_test | scaffold |
| `infra/cdk` | 2 | `node:test` + Template | real (no IAM least-privilege) |
| `infra/cloudflare/realtime` | 3 | `node:test` | real |
| `tests/` (e2e/load/security) | empty | — | none |

**Total TS/JS tests: ~33. No CI runs them automatically.**

---

## What each suite covers

### `packages/protocol`
`scripts/validate-schemas.mjs`:
- Compiles all 5 schemas (Ajv2020 + ajv-formats).
- Validates 3 example envelopes against the envelope schema.
- Validates payloads against `run-status` or `tool-approval`.

⚠️ No unit tests on the TS builders. ⚠️ No producer/consumer fixture coverage (e.g., does an event written by `worker.ts` parse cleanly through `relay.ts`?).

### `packages/agent-profile`
`test/validators.test.ts` — 6 cases:
1. Marketing fixture passes.
2. High-risk tool without approval rejected.
3. Empty eval scenarios rejected.
4. `sk-...` secret rejected.
5. Unpinned untrusted MCP rejected.
6. `lifecycleState: promoted` without `approval` rejected.

### `services/control-api`
- `create-run.test.ts` — happy path + idempotency duplicate
- `query-runs.test.ts` — owner gates + admin
- `work-items.test.ts`
- `user-runners.test.ts`
- `agent-profiles.test.ts` — drafts, list, approve
- (handlers wiring, dynamo store, step-functions wrapper)

Plus tests for newly added artifact / data-source / surface / approval handlers if the codebase has progressed past 501 stubs.

### `services/agent-runtime`
- `worker.test.ts` — happy path + Hermes throw → `run.status:failed`
- `resident-runner.test.ts` — multi-agent wake, tenant rejection, hermes-cli env sandboxing, HTTP routes, fail-closed without `RUNNER_API_TOKEN`
- `local-harness.test.ts` — approved/pending/rejected scenarios + CLI smoke + interactive stdin

All against in-memory or local-FS sinks. **No real AWS / Bedrock / OpenAI / Anthropic call anywhere.**

### `services/realtime-api`
- `auth.test.ts` — JWT verification, userId extraction
- `handlers.test.ts` — connect/disconnect/subscribe lifecycle
- `relay.test.ts` — stream record validation, fanout, GoneException cleanup
- `worker.test.ts` (or similar) — protocol-level smoke

There's also a real wss:// e2e smoke (per `PROJECT_STATUS.md` 2026-05-10) using a temporary Cognito user.

### `services/agent-creator`
- `workshop.test.ts` — scenario validation, draft assembly, scorecard
- `interactive.test.ts` — interactive answer parsing
- `profile-bundle.test.ts` — bundle file structure, manifest hashing

Plus `pnpm agent-creator:smoke` — full deterministic CLI run against `marketing-workshop-scenario.json`.

### `apps/web`
6 vitest files:
- `run-ledger.test.ts` — event merging
- `realtime-client.test.ts` — parseRealtimeRunEvent
- `admin-runners.test.ts` — describeRunnerHealth, sortRunnerRows
- `admin-lineage.test.ts` — describeAdminLineageEvent, summarizePipelinePosition
- `agent-workshop.test.ts` — buildAgentWorkshopDraftProfile, summarizeLifecycleReadiness
- `auth-storage.test.ts` — clearAmplifyBrowserState

⚠️ **No UI integration tests** (no Playwright, no Storybook). Real user flows (sign-in → create run → live event stream) untested.

### `infra/cdk`
- `workitem-genui-infra.test.ts` — table/index assertions for WorkItems/Runs/DataSources/Surfaces
- `user-runner-state.test.ts` — HostNodes/UserRunners/RunnerSnapshots/AgentInstances assertions

⚠️ **No IAM least-privilege assertions.** Stack synth shape only.

### `infra/cloudflare/realtime`
- protocol, auth, worker routing — passes
- 🗑️ Skip if Cloudflare deferred.

### `apps/desktop_mobile`
3 Dart files (mostly widget rendering checks). 🗑️ scaffold-level only.

### `tests/` (e2e / load / security)
**Empty directories.** No e2e suite, no load tests, no security tests.

---

## CI status

❌ **No CI.** Repository has no `.github/workflows/`, no Husky hooks, no pre-commit framework, no automated test gates.

Tests run only when developers remember locally. Quality enforcement is manual.

🗑️ **Skip CI for hackathon** per scope.

---

## Quality gates: claimed vs actual

`docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md` mandates:

| Required | Actual |
|---|---|
| Protocol schema golden examples | ⚠️ examples exist, no producer/consumer fixture tests |
| Control API authorization tests | ✅ owner gates + admin tests |
| Runtime event sequences | ✅ worker + resident-runner |
| Idempotency tests | ✅ create-run duplicate test |
| CDK IAM least-privilege | ❌ no assertions |
| E2E/smoke tests | ⚠️ minimal |
| Flutter tests | ❌ widget-only |

**Verdict:** Core durability tests are solid; contract/security/e2e surface area is under-protected.

---

## Top risks (sorted by hackathon impact)

1. **No e2e suite** — `tests/e2e`, `tests/load`, `tests/security` directories declared but empty. No end-to-end runbook for run creation → execution → event stream. No multi-tenant isolation tests.
2. **Protocol schema drift** — `packages/protocol` validates JSON syntax but has no golden examples or consumer fixtures. Event shape changes can break producers/clients without test failure.
3. **Frontend coverage gap** — Web has reducer tests but no UI integration tests. Real user flows untested.
4. **No CI** — A feature can ship locally untested.
5. **No real AWS integration tests** — `worker.test.ts` doesn't actually call AWS. A real DynamoDB / S3 / Step Functions failure could ship and pass tests.

---

## How to add tests

### Unit test pattern (services)

```ts
// services/<svc>/test/<feature>.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("does the thing", async () => {
  // Construct in-memory store / fake clients
  // Exercise the function
  // Assert
});
```

Tests must be `.test.ts` and discovered via the package's `test` script (typically `node --test dist/test/**/*.test.js` after build).

### Web test pattern (vitest)

```ts
// apps/web/test/<feature>.test.ts
import { test, expect } from "vitest";

test("merges events", () => {
  expect(mergeRunEvents([], [event])).toEqual([event]);
});
```

### CDK test pattern

```ts
// infra/cdk/src/test/<stack>.test.ts
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

test("stack creates expected tables", () => {
  const app = new App();
  const stack = new MyStack(app, "MyStack", { ... });
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::DynamoDB::Table", { ... });
});
```

[← guides](README.md)
