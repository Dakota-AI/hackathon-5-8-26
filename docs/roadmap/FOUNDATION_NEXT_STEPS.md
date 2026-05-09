# Foundation Next Steps

Date: 2026-05-09
Status: Active implementation starter plan

## 1. What We Can Start Now

We can start laying the foundation now. The highest-value next part is not the full CDK stack yet. The right next part is the contract and control-plane skeleton that every later stack, service, and client depends on.

The next implementation order should be:

1. Protocol contracts.
2. AWS CDK foundation.
3. Cloudflare realtime skeleton.
4. Control API skeleton.
5. AgentManager ECS scheduling skeleton.
6. One simple Fargate worker.
7. Event relay from AWS to Cloudflare.
8. Next.js status console.
9. Flutter protocol client.
10. Codex MCP worker.
11. Hermes worker.
12. A2UI renderer.
13. Miro bridge.
14. Self-improvement quarantine.

## 2. What Is Needed From The User

These are the only inputs that materially affect the next build steps.

### Required Soon

- AWS account/region to target first.
- Base domain for Route 53 wildcard previews.
- Whether Route 53 currently owns the domain or DNS needs migration.
- Preferred app name and environment names, for example `dev`, `staging`, `prod`.
- Whether this will start as single-user/private or multi-user SaaS from day one.
- GitHub App name or whether GitHub integration can wait.
- Miro app/client credentials or whether Miro can stay stubbed.
- OpenAI production auth mode:
  - platform API key/service account first, recommended;
  - optional linked Codex/ChatGPT auth later.
- Cloudflare account id and zone/domain for Workers and Durable Objects.

### Can Wait

- Final billing model.
- Full enterprise/org permission model.
- Mobile app store packaging.
- Advanced marketplace for specialist agents.
- Full self-improvement promotion workflow.

## 3. Phase 0 Implementation Scope

Phase 0 should produce a repo that is ready for real implementation:

- ADRs for core decisions.
- Protocol schemas.
- Contract validation.
- Monorepo layout.
- CDK stack plan.
- Cloudflare realtime plan.
- Service ownership boundaries.
- App ownership boundaries.

Current status:

- ADRs: started.
- Protocol schemas: started.
- Repo skeleton: started.
- CDK code: not started.
- Cloudflare code: not started.
- App code: not started.
- Service code: not started.

## 4. Phase 1 Build Scope

Phase 1 should create a deployable backend foundation.

Build:

- `infra/cdk` TypeScript CDK app.
- `FoundationStack`.
- `NetworkStack`.
- `StorageStack`.
- `StateStack`.
- DynamoDB run/task/event tables.
- S3 bucket split:
  - live workspace artifacts;
  - immutable audit log;
  - preview static;
  - research datasets.
- KMS keys.
- IAM role boundaries.
- Basic outputs file consumed by later Cloudflare/Amplify setup.

Exit criteria:

- `cdk synth` works.
- The stack can deploy to a dev AWS account.
- Buckets, tables, KMS keys, queues, and event bus exist.
- No ECS workers yet.

## 5. Phase 2 Build Scope

Phase 2 should add the first durable run path.

Build:

- `services/control-api` skeleton.
- `services/agent-manager` skeleton.
- One Step Functions state machine.
- One simple Fargate task definition.
- One worker image that receives `RUN_ID`, emits status, writes an artifact to S3, and exits.
- DynamoDB event writes.

Exit criteria:

- User can create a run through the Control API.
- AgentManager starts a Fargate task.
- Worker writes a test artifact to S3.
- Run status reaches `succeeded` or `failed`.
- Event records can be queried from DynamoDB.

## 6. Phase 3 Build Scope

Phase 3 should connect clients through realtime.

Build:

- `infra/cloudflare` Worker.
- `SessionDO` or Cloudflare Agents SDK equivalent.
- WebSocket endpoint.
- Event relay from AWS to Cloudflare.
- Replay cursor and gap repair stub.
- Tiny Next.js run-status console.

Exit criteria:

- Web client sees run status changes live.
- Disconnect/reconnect resumes from last sequence.
- Large payloads are referenced through S3 pointers.

## 7. Decisions Still Open

These should be resolved with small ADR updates before implementation gets too deep:

- Raw Durable Objects vs Cloudflare Agents SDK.
- Exact CDK stack names and environment naming.
- DynamoDB single-table vs focused tables for MVP.
- Whether `control-api` starts as Lambda/API Gateway, ECS service, or Amplify function.
- Whether `event-relay` starts as Lambda, Worker pull, or API callback.
- Whether the first Next.js app should be Amplify-hosted, Vercel-hosted, or ECS-hosted.
- Whether Flutter starts as one app package or separate packages for mobile/desktop.

Recommended defaults:

- Raw Durable Objects first unless Cloudflare Agents SDK materially speeds up implementation.
- Focused DynamoDB tables for MVP.
- Control API as Lambda/API Gateway first.
- Event relay as Lambda pushing to Cloudflare first.
- Next.js local app first, then deploy after realtime contract is stable.
- Flutter one shared app package.

## 8. Immediate Next Command Path

The next concrete build step is:

1. Install workspace dependencies.
2. Validate protocol schemas.
3. Scaffold `infra/cdk` as a TypeScript CDK app.
4. Add `FoundationStack`, `StorageStack`, and `StateStack`.
5. Add environment config for `dev`.
6. Run `cdk synth`.

After that, implement the first simple run path before adding Hermes, Codex, Miro, or A2UI rendering.
