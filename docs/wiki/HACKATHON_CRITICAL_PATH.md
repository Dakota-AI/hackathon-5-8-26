# Hackathon Critical Path

> What to ship to demo "multiple users running agents concurrently". Ordered by leverage, not nice-to-haves.

[← back to wiki index](README.md)

Goal recap (per user spec):
- Multiple users running agents concurrently.
- One ECS resident container per user, with multiple logical agents inside that container.
- Access control = `userId` filtering on DynamoDB queries. **No** AccessCodes, Cognito groups, Workspaces, deep IAM.
- Stay on AWS. **No** Cloudflare.

---

## What works already (no work needed)

- ✅ Cognito JWT propagates from web → Control API → DynamoDB rows → Step Functions → ECS env vars → events. See [run-creation.md](flows/run-creation.md).
- ✅ DDB tables PAY_PER_REQUEST; no per-user quota tuning needed. See [stacks.md](infrastructure/stacks.md#statestack).
- ✅ WebSocket relay filters fan-out by `userId` — cross-user leak prevented. See [realtime-api.md](services/realtime-api.md).
- ✅ ECS Fargate concurrency: one task per run, no manual cap; safe at hackathon scale.
- ✅ Web app real run loop with admin console.

---

## Critical path (in order)

### 1. Make the worker actually call a model — see [agent-runtime.md](services/agent-runtime.md)

Today `HERMES_RUNNER_MODE=smoke` returns canned text. Two cheap options:

**Option A (fastest):** drop `CliHermesRunner` and inline an Anthropic / OpenAI / Bedrock SDK call in `services/agent-runtime/src/worker.ts` that consumes `OBJECTIVE` and produces a real text artifact. Bake the API key into the ECS task role via Secrets Manager (or just inject as ECS env at synth time for hackathon).

**Option B:** rebuild the Dockerfile with the `hermes` binary baked in, set `AGENTS_CLOUD_HERMES_RUNNER_MODE=cli`. Same risk profile, more moving parts.

Recommended: **Option A**. Single PR. ~1 day of work.

- [ ] Add `@anthropic-ai/sdk` (or chosen) to `services/agent-runtime/package.json`
- [ ] Replace `CliHermesRunner` call in `services/agent-runtime/src/worker.ts:25` with real model call
- [ ] Pass API key via ECS secret/env in `infra/cdk/src/stacks/runtime-stack.ts`
- [ ] Stop hardcoding `seq=2,3,4` in the worker — use a counter so retries don't crash on conditional writes

### 2. Per-user resident runner dispatch — see [multi-user-routing.md](flows/multi-user-routing.md)

This is the biggest architectural delta vs. what's deployed. Implement the missing piece in `services/control-api/src/create-run.ts`:

```
on POST /runs:
  1. lookup UserRunner by userId  (already real)
  2. if missing or status != "running":
       a. ecs:RunTask  ResidentRunnerTaskDefinition
          with env USER_ID, RUNNER_ID, RUNNER_API_TOKEN, table names
       b. write UserRunner row { status: starting, taskArn, runnerEndpoint }
       c. wait for /health to return ok (poll up to 30s)
  3. POST  http://<runnerEndpoint>:8787/wake
       Authorization: Bearer <RUNNER_API_TOKEN>
       body: { agentId, runId, taskId, objective }
  4. respond 202 with runId
```

- [ ] Add ECS RunTask client + reachability layer to `services/control-api/src/`
- [ ] Mint `RUNNER_API_TOKEN` per user (random uuid, store on UserRunner row)
- [ ] Make resident container reachable from Lambda (Cloud Map or internal ALB; see below)
- [ ] Replace `simple-run` Step Function path with this dispatch (or keep as fallback)

**Reachability gotcha:** Lambda → resident container needs a network address. Cheapest hackathon path: internal ALB targeting the resident task family with a `userId`/`runnerId` header rule. Or skip ALB and have the resident task self-register its private IP in the `UserRunner` row on boot.

### 3. Resident runner: durable persistence + concurrent agents — see [agent-runtime.md](services/agent-runtime.md)

Today `services/agent-runtime/src/resident-runner.ts` writes events only to local NDJSON. If the task dies, the work is lost.

- [ ] Mirror every event from resident NDJSON to `EventsTable` (so realtime relay still works)
- [ ] Mirror artifacts to S3 + `ArtifactsTable`
- [ ] Replace serial `for (agent of agents)` loop in `wake()` with `Promise.all` (or worker pool) so concurrent agents per user actually run concurrently
- [ ] Optional: snapshot to S3 every N minutes using `RunnerSnapshotsTable` (already provisioned)

### 4. Wire Flutter to live API — see [flutter.md](clients/flutter.md)

Currently `apps/desktop_mobile` configures Amplify but never calls anything. Get Flutter to parity for the demo:

- [ ] Add sign-in screen (Amplify `Authenticator` Flutter widget or manual)
- [ ] Implement `fetchAuthSession()` to retrieve ID token
- [ ] Wire `ControlApiClient.createRun(...)` (already coded in `lib/backend_config.dart`) into a Riverpod provider used by the command-center
- [ ] Add `web_socket_channel` and replicate the web's subscribe/parse/merge loop
- [ ] Replace `FixtureWorkRepository` with `RemoteWorkRepository` against `/work-items`

If time-boxed, pick **just** sign-in + create-run + WebSocket — Work, Approvals, Artifacts can stay fixture for the demo.

### 5. WorkItems live data on web — see [work-items.md](surfaces/work-items.md)

The API works; only the client is fixture. Easy win.

- [ ] Add `listControlApiWorkItems()` / `createControlApiWorkItem()` to `apps/web/lib/control-api.ts`
- [ ] Replace `listFixtureWorkItems()` in `apps/web/components/work-dashboard.tsx`
- [ ] Wire CommandCenter "submit objective" to optionally create a WorkItem first, then a child Run

### 6. `GET /runs` user-listing — see [runs-and-tasks.md](surfaces/runs-and-tasks.md)

GSI exists, handler doesn't. ~30 lines of code.

- [ ] Add `listRunsForUser(userId, limit, cursor)` to `services/control-api/src/dynamo-store.ts` using `by-user-created-at`
- [ ] Add handler dispatch in `handlers.ts` and route in `control-api-stack.ts`
- [ ] Web fetcher and a "Recent runs" section on home page

### 7. Artifacts read endpoints — see [artifacts.md](surfaces/artifacts.md)

Worker already produces them; only reads are 501.

- [ ] Replace `notImplementedArtifactsHandler` in `services/control-api/src/handlers.ts:379`
- [ ] Add `ArtifactStore` interface + Dynamo impl
- [ ] Sign S3 URLs (presigned GET) for `previewUrl`
- [ ] Web: ArtifactCard already exists in `apps/web/lib/run-ledger.ts:11`; just wire to `/artifacts` on the run detail

### 8. Approvals (only if a demo flow needs it)

If the hackathon storyline includes "agent asks user for permission to do X":

- [ ] Worker emits `tool.approval` request envelope (`buildToolApprovalEvent`)
- [ ] New `POST /approvals/{approvalId}/decision` route writes a decision envelope back into `EventsTable`
- [ ] Web subscribes via existing realtime, renders Approve/Reject buttons

If not in demo storyline, skip — see [gaps.md](gaps.md).

---

## Explicit non-goals (skip for hackathon)

See [gaps.md](gaps.md) for the full skip list.

- 🗑️ AccessCodes / WorkspaceMemberships / Cognito groups (table-routing by userId is enough)
- 🗑️ Cloudflare realtime (stay on AWS WebSocket)
- 🗑️ Preview ingress / wildcard preview hosting
- 🗑️ Miro, GitHub, self-improvement
- 🗑️ Builder runtime, agent-manager, event-relay (services with README only — keep the READMEs as design docs, don't implement)
- 🗑️ EFS / hot POSIX workspace
- 🗑️ Production observability (CloudWatch logs are enough)
- 🗑️ CI/CD (run tests locally before commit)
- 🗑️ Deep IAM least-privilege

---

## Suggested time budget

| # | Task | Rough size |
|---|---|---|
| 1 | Real model call in worker | 4–6 hr |
| 2 | Resident runner dispatch | 1–2 days |
| 3 | Resident runner durable persistence | 4–6 hr |
| 4 | Flutter live integration | 1 day |
| 5 | WorkItems live web | 2–3 hr |
| 6 | `GET /runs` listing | 1 hr |
| 7 | Artifacts read endpoints | 2–3 hr |
| 8 | Approvals (optional) | half day |

If you have **2 days**, ship 1, 2, 5, 6, 7. Skip Flutter live (use web), skip approvals.
If you have **4 days**, add 3 + 4.
