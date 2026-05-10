# Maintainability Audit: Backend, Amplify, AppSync, Realtime

Date: 2026-05-10
Scope: Decide the simplest maintainable direction for Agents Cloud backend/realtime work based on current docs, code, and deployed resources.

## Executive conclusion

The simplest maintainable path is to keep AWS as the only durable backend path and not add another realtime/data system yet.

Recommended immediate path:

1. Keep Amplify for Auth + Hosting only.
2. Keep CDK Control API as the app-facing durable command/query API.
3. Use durable polling through `GET /runs/{runId}` and `GET /runs/{runId}/events` for the first product workflow.
4. Harden the Control API and worker event ledger before deploying any realtime layer.
5. Do not add Amplify Data/AppSync yet.
6. Do not deploy Cloudflare realtime yet unless realtime UX becomes the current bottleneck.
7. When realtime is truly needed, pick one path deliberately:
   - AWS-native API Gateway WebSocket if maintenance simplicity is the priority.
   - Cloudflare Durable Objects only if global low-latency fanout/hot presence becomes important enough to justify a second platform.

## Why this is the simplest path

The current system already has AWS durable primitives deployed:

- Cognito from Amplify Auth.
- CDK-owned API Gateway Control API.
- DynamoDB run/task/event/artifact/approval tables.
- Step Functions orchestration.
- ECS runtime task.
- S3 artifacts.

Adding AppSync now would create a second app-facing data API before the existing Control API event model is hardened.

Deploying Cloudflare now would create a second runtime platform before AWS event sequencing, idempotency, replay, and workspace authorization are ready.

The low-risk product path is therefore: make one AWS durable run loop boring, correct, testable, and queryable first.

## Evidence read from docs

| Fact | Evidence |
| --- | --- |
| AWS is the durable source of truth. | `docs/adr/0001-platform-control-plane.md` says DynamoDB/Step Functions/EventBridge/SQS/ECS/S3 own durable state and Cloudflare must not own durable truth. |
| Cloudflare was accepted as realtime fanout, not truth. | `docs/adr/0003-realtime-plane.md` says Cloudflare Workers/Durable Objects handle realtime sync while DynamoDB/S3 remain authoritative. |
| Current readiness blockers are durable-contract problems, not realtime-provider problems. | `docs/IMPLEMENTATION_READINESS_AUDIT.md` lists P0 blockers: canonical events not enforced, run creation not idempotent enough, runtime sequencing/artifacts retry-unsafe. |
| Realtime is explicitly supposed to come after durable polling works. | `docs/roadmap/FOUNDATION_NEXT_STEPS.md` line-level section says event relay and Cloudflare realtime come after durable polling works. |
| Amplify currently does not define app-facing Data/API resources. | `infra/amplify/README.md` says no app-facing Data/API resources are defined yet and the next durable backend connection should be the CDK-owned Control API. |
| Web app is expected to call Control API and render backend state; it should not own durable state. | `apps/web/README.md` architecture boundary. |
| Event relay is only a package boundary. | `services/event-relay/README.md` lists the event relay responsibilities. |

## Evidence from code/config/runtime checks

| Check | Result |
| --- | --- |
| `infra/amplify/amplify_outputs.json` | Contains only `auth`; no `api`, `data`, or AppSync endpoint fields. |
| `aws appsync list-graphql-apis --region us-east-1 --profile agents-cloud-source` | Returned `graphqlApis: []`. There is no AppSync API deployed in the account/region. |
| TypeScript search for AppSync/Data definitions | No `defineData`, AppSync, GraphQL API, or GraphQL endpoint definitions in source `.ts` files. |
| CloudFormation stack check | Core `agents-cloud-dev-*` stacks and Amplify sandbox stacks are deployed/complete; no AppSync stack surfaced. |
| Wrangler deployment check | `agents-cloud-realtime` Worker does not exist on the Cloudflare account yet. |
| Amplify domain check | `solo-ceo.ai` domain association is `AVAILABLE`, but current HTTPS checks return 404 from the hosted app. This is hosting artifact/app output, not a reason to add AppSync/Cloudflare. |
| Git state | Worktree is dirty with many unrelated and new files. Any future implementation must preserve user changes and avoid broad commits/reverts. |

## Current system reality

### Implemented enough to build on

- Monorepo and scripts.
- Protocol schema package.
- CDK foundation stacks.
- Control API first slice.
- ECS agent-runtime smoke/Hermes boundary.
- Amplify Auth and Hosting path.
- Web and Flutter shells.
- Cloudflare realtime package.

### Not production-ready yet

- Canonical event producer validation across services.
- Idempotent run creation.
- Retry-safe worker event sequence allocation.
- Retry-safe artifact ids/writes.
- Workspace/org membership and authorization model.
- Authenticated browser/native Control API smoke.
- Event relay.
- Realtime replay/gap repair.
- Client connection to backend state.

## Objective comparison of options

### Option A: CDK Control API + polling first

Use current endpoints:

- `POST /runs`
- `GET /runs/{runId}`
- `GET /runs/{runId}/events?afterSeq=...`

Pros:

- Uses resources already deployed.
- Lowest operational complexity.
- Keeps one source of truth.
- Easy to debug with DynamoDB and CloudWatch.
- Forces canonical events/idempotency/retry safety before realtime hides problems.

Cons:

- UI is not instantly live; it polls every few seconds.

Verdict: best immediate path.

### Option B: Amplify Data/AppSync subscriptions

Pros:

- AWS-native realtime subscriptions.
- Integrates with Amplify frontend patterns.
- Good if the app becomes GraphQL-first.

Cons:

- Not deployed today.
- Adds a second app-facing data model/API beside the Control API.
- Requires mapping existing DynamoDB run ledger/events into GraphQL resolvers/subscriptions.
- Can blur the boundary between Amplify app data and CDK durable execution state.

Verdict: do not add now. Reconsider only if we intentionally choose GraphQL/AppSync as the main product API layer.

### Option C: AWS API Gateway WebSocket

Pros:

- AWS-native realtime.
- Uses Cognito/IAM/Lambda/DynamoDB patterns close to the current system.
- Easier to reason about than Cloudflare if the team wants one cloud provider.

Cons:

- Still requires connection table, relay Lambda, retry handling, and reconnect replay.
- Less edge-native than Cloudflare.

Verdict: best future realtime option if maintenance simplicity is more important than global edge fanout.

### Option D: Cloudflare Worker + Durable Objects

Pros:

- Very good for global WebSocket fanout/hot rooms/presence.
- Existing local package exists and tests/dry-run pass.
- Matches current ADR 0003.

Cons:

- Adds another platform and deployment/runtime model.
- Requires Cloudflare DNS/routes/secrets plus AWS relay bridge.
- Does not solve canonical AWS event/idempotency/replay problems by itself.
- Current package is not deployed and not integrated.

Verdict: keep the package, but defer deployment until durable AWS loop is correct or until live UX truly needs it.

## Recommended next build sequence

1. Canonical event library/package slice.
   - One builder/validator used by Control API and agent runtime.
   - Events validate against `packages/protocol`.
   - Fix artifact payload naming/kind drift.

2. Control API idempotency slice.
   - Repeated `POST /runs` with same idempotency key returns same run.
   - Avoid starting orphan Step Functions executions.
   - Add conditional/transactional DynamoDB writes or an outbox/idempotency record.

3. Worker sequencing/artifact safety slice.
   - No fixed sequence collisions.
   - No fixed artifact id collisions.
   - Terminal status cannot regress.
   - Partial failures leave recoverable state.

4. First real client loop using polling.
   - User signs in.
   - Client calls Control API.
   - Client polls events with `afterSeq`.
   - User sees status/artifact output.

5. Decide realtime after the first durable client flow works.
   - If polling feels acceptable for MVP, keep it.
   - If live UX is important and we want one-cloud simplicity, build API Gateway WebSocket.
   - If global edge presence/fanout becomes important, deploy Cloudflare.

## Documentation alignment recommendation

Current docs already strongly mention Cloudflare as the accepted realtime plane. That is okay if it is treated as the future realtime layer, not the next required implementation step.

If the priority is now maximum simplicity and maintainability, add a small ADR amendment or status note saying:

- Cloudflare realtime remains an accepted optional/future fanout path.
- The first product workflow will use Control API polling against AWS durable events.
- AWS API Gateway WebSocket will be reconsidered as the simpler AWS-native realtime option before deploying Cloudflare.

This avoids fighting old docs while making the implementation path simpler.

## Final recommendation

Do not add AppSync right now.
Do not deploy Cloudflare right now.
Do not build advanced UI or Miro/Codex integrations right now.

Build the boring AWS run loop first:

Cognito login -> Control API create run -> DynamoDB event ledger -> Step Functions/ECS worker -> S3 artifact -> Control API event polling -> web/native display.

That is the simplest maintainable backbone. Realtime should be a thin enhancement on top of that, not the next source of complexity.
