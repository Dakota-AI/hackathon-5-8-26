# Exa MCP Audit Addendum

Date: 2026-05-09
Status: Second-pass audit using Exa MCP against current primary docs and official repos

Related roadmap: `docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md`

## 1. Bottom Line

The original roadmap is directionally right, but the second-pass research changes the recommended implementation sequence and sharpens several boundaries.

The best plan is now:

1. Use **OpenAI Agents SDK** as the primary agent orchestration harness for manager/specialist handoffs, MCP wiring, guardrails, human approvals, tracing, and eval hooks.
2. Use **AWS Step Functions + DynamoDB + EventBridge/SQS** as the durable control plane for long-running cloud jobs, not an in-memory agent framework.
3. Use **Hermes Agent** as an isolated ECS worker runtime and self-evolution candidate generator, not as the SaaS control plane.
4. Use **Codex CLI as an MCP-backed coding tool** inside dedicated ECS workers for coding tasks.
5. Use **API-key/service-account OpenAI auth** for production automation. Keep ChatGPT/Codex account auth only as an optional linked-user mode on trusted private runners.
6. Use **Cloudflare Durable Objects or Cloudflare Agents SDK** for realtime state, WebSocket fanout, and client sync, but not for heavy or long-running agent execution.
7. Use **A2UI v0.8 stable** as the GenUI protocol baseline, wrapped inside the platform event envelope, instead of inventing a fully custom GenUI schema first.
8. Keep **S3 as the durable workspace/artifact ledger** and **EFS as hot POSIX workspace storage**, but split mutable workspace storage from immutable audit storage.

## 2. Major Audit Findings

### Finding 1: OpenAI Agents SDK Should Be The Primary Harness

The roadmap was cautious about the harness decision. After current research, the primary harness should be OpenAI Agents SDK for the orchestration layer.

Why:

- It directly targets agent apps that plan, call tools, collaborate across specialists, and keep enough state for multi-step work.
- It supports hosted MCP, local/private MCP over stdio or streamable HTTP, handoffs, guardrails, human review, tracing, and eval workflows.
- It has explicit guidance for using Codex CLI as an MCP server inside multi-agent workflows.
- It cleanly separates SDK-level orchestration from the container runtime, which fits this platform.

Architecture decision:

```text
OpenAI Agents SDK
  owns: manager agents, specialists, handoffs, tool policy, guardrails, trace spans

AWS Step Functions
  owns: durable run lifecycle, wait-for-callback, retries, timeouts, fanout, run cancellation

ECS workers
  own: file system work, coding, testing, builds, browser work, research tools

Hermes
  owns: specialist execution loop inside selected ECS worker types
```

Do not make LangGraph, Mastra, Hermes, or Cloudflare Agents the single overall control plane.

LangGraph remains useful if the team wants graph-native checkpointing, interrupts, and deterministic replay inside a specific service. Mastra remains useful if the team wants a TypeScript-first agent app surface. Neither should displace AWS Step Functions and DynamoDB as the durable cloud control plane in this architecture.

### Finding 2: Codex OAuth Credits Are Not A Safe Platform Billing Foundation

The original plan correctly warned about Codex OAuth assumptions. The audit makes this stronger.

Current OpenAI docs distinguish:

- ChatGPT sign-in for subscription/workspace access.
- API key sign-in for usage-based OpenAI Platform access.
- Codex cloud requiring ChatGPT sign-in.
- Codex CLI and IDE supporting both sign-in methods.
- API keys being the recommended default for programmatic/CI automation.
- ChatGPT-managed Codex auth in CI/CD being an advanced trusted-runner workflow, not a general public automation pattern.

Implementation correction:

- Build production around OpenAI API projects, API keys, org/project headers, service accounts, rate limits, and usage limits.
- Add optional "linked Codex account" support only for private trusted runners.
- Never promise that arbitrary 24/7 hosted autonomous workloads can safely or contractually burn a user's ChatGPT/Codex subscription credits.
- Treat `auth.json` like a password. If user-linked Codex auth is supported, isolate it per user and per serialized runner stream. Do not share one auth file across concurrent jobs.

Recommended product model:

```text
Default:
  platform OpenAI project API key/service account
  per-user quotas in platform DB
  project-level OpenAI limits

Optional personal mode:
  user links Codex/ChatGPT auth
  only trusted private ECS worker pool
  one auth vault item per user
  one runner stream per auth item
  no public repo/public runner usage
```

### Finding 3: Cloudflare DOs Are Correct, But Need Tighter Storage And Throughput Rules

Cloudflare Durable Objects are still a strong fit for realtime coordination, but the plan should be stricter about what lives there.

Current limits and behavior that matter:

- SQLite-backed Durable Objects are recommended for new classes.
- A SQLite-backed Durable Object has a 10 GB per-object storage limit on Workers Paid.
- Individual key/value or row payload sizes are small enough that large event payloads must not live inline.
- Each individual object is single-threaded and has a soft limit around 1,000 requests per second.
- The WebSocket Hibernation API supports up to 32,768 WebSocket connections per object, but CPU and memory reduce practical capacity.
- Worker/Queue/Alarm wall-clock limits mean Cloudflare is not the right place for long research/coding/build tasks.
- Cloudflare Queues message size is 128 KB, with 14-day configurable retention and at-least-once delivery. Queues do not guarantee ordering.

Implementation correction:

- Use DOs for hot state, connection fanout, replay cursors, notifications, presence, and small command envelopes.
- Keep large payloads in S3 and send pointers through DO/Queue messages.
- Keep durable event archives in AWS, not in DO SQLite.
- Use AWS/DynamoDB as the authoritative run ledger.
- Use server-issued sequence numbers and idempotency keys because Cloudflare Queues are at-least-once and unordered.

Recommended DO split:

```text
UserHubDO
  current devices, notification cursors, auth/session summaries

WorkspaceDO
  workspace presence, open runs, active dashboards, compact state

SessionDO
  WebSocket fanout, replay cursor, event gap repair pointers

NotificationDO
  push fanout, delivery status, debounce/coalesce windows

RateLimiterDO
  edge-side per-user/workspace throttles
```

Add sharding later:

```text
SessionDO by runId
WorkspaceDO by workspaceId
NotificationDO by userId
RateLimiterDO by userId or orgId
```

Do not put all activity for a large user or organization into one global DO.

### Finding 4: Cloudflare Agents SDK Is Worth Using, But Only For Edge Realtime Abstractions

Cloudflare Agents SDK now provides useful abstractions over Durable Objects:

- Client WebSocket SDK for state sync, RPC, reconnects, and streaming.
- Server-side Agent class with lifecycle hooks.
- Built-in state synchronization backed by per-agent SQLite.
- Queue, scheduling, WebSocket, MCP, sub-agent, observability, and workflow helpers.
- Hibernation support for MCP agents.

Recommended use:

- Use Cloudflare Agents SDK for the edge realtime layer if it accelerates `SessionDO`, `WorkspaceDO`, and `NotificationDO`.
- Keep the wire protocol platform-owned so Flutter can connect without depending on React hooks.
- For the Next.js app, the Cloudflare client SDK may be useful.
- For Flutter, implement the same protocol over WebSocket directly.

Do not use Cloudflare Agents as the 24/7 autonomous worker runtime. It is an edge/session abstraction, not a replacement for ECS containers.

### Finding 5: ECS Managed Instances Are Real, But Capacity Provider Strategy Needs Care

The roadmap's Fargate plus ECS Managed Instances direction is now confirmed by AWS docs, but there is an important implementation constraint:

- A cluster can have multiple capacity provider types.
- A capacity provider strategy should not mix different capacity provider types in the same strategy.
- Fargate and Fargate Spot are predefined.
- Managed Instances require a managed instances capacity provider, infrastructure role, launch template settings, networking, storage configuration, and compatible task definitions.
- CDK support exists at L1/L2 surfaces, but Managed Instances may require direct `CfnCapacityProvider` use for full control.

Implementation correction:

- Model Fargate worker pools and Managed Instance worker pools as separate scheduling targets.
- Do not rely on one mixed capacity provider strategy to choose between Fargate and Managed Instances at runtime.
- The AgentManager should choose a worker class first, then call `RunTask` against the matching capacity provider path.

Recommended worker classes:

```text
agent-light
  capacity: Fargate
  tasks: planning, short research, tool-only work

agent-code
  capacity: Fargate or Managed Instances depending on repo/build size
  tasks: Codex MCP, tests, small builds

agent-builder-heavy
  capacity: ECS Managed Instances
  tasks: Docker builds, browser-heavy work, large monorepos

agent-eval
  capacity: Fargate Spot or Managed Instances
  tasks: eval packs, replay, mutation testing

preview-app
  capacity: Fargate service or static S3
  tasks: long-lived project preview
```

### Finding 6: Step Functions Should Be More Central

The roadmap already includes Step Functions, but it should become the durable run orchestrator for ECS tasks.

Use:

- `ecs:runTask.sync` for bounded tasks where Step Functions should wait for completion.
- `ecs:runTask.waitForTaskToken` for long-running agent tasks where the container reports completion, failure, or heartbeat.
- Distributed Map only for controlled fanout jobs, with explicit maximum concurrency and tolerated failure thresholds.

Implementation correction:

- Add a state machine per run class:
  - `ResearchRunStateMachine`
  - `CodeBuildRunStateMachine`
  - `EvalRunStateMachine`
  - `SelfEvolutionRunStateMachine`
- Every ECS task receives:
  - `RUN_ID`
  - `TASK_ID`
  - `WORKSPACE_ID`
  - `STEP_FUNCTIONS_TASK_TOKEN` when applicable
  - S3/EFS workspace pointers
  - event sink credentials

Do not rely on a long-lived web API process polling ECS forever.

### Finding 7: A2UI Should Become The GenUI Baseline

The roadmap had "GenUI descriptor schema" as unresolved. Current research makes A2UI the best baseline.

Why:

- A2UI is designed for agent-driven interfaces across web, mobile, and desktop.
- It is declarative JSON, not executable code.
- It supports trusted component catalogs.
- It has Flutter and web renderer work in the ecosystem.
- It supports progressive rendering and structured message types.
- It directly matches the user's requirement for AI-created dashboards/forms/status UIs across Flutter and Next.js.

Implementation correction:

- Adopt A2UI v0.8 stable as the initial production GenUI schema.
- Track v0.9 for `createSurface`, custom catalogs, and richer extension semantics.
- Wrap A2UI messages inside the platform's canonical event envelope.

Recommended event:

```json
{
  "type": "ui.a2ui.delta",
  "seq": 4242,
  "runId": "run_123",
  "workspaceId": "ws_123",
  "surfaceId": "surface_market_dashboard",
  "catalogId": "agents-cloud-v1",
  "payloadRef": null,
  "payload": {
    "updateComponents": {
      "surfaceId": "surface_market_dashboard",
      "components": []
    }
  }
}
```

Security rule:

- Agents can only emit A2UI for approved catalogs.
- The server validates every A2UI message before it reaches clients.
- Clients render only known components.
- Component actions go back through the approval/policy layer, not directly to tools.

### Finding 8: Miro MCP Is Useful, But REST Is Still Required

Miro MCP is a good fit for board-native AI workflows, but its documented current use cases are focused around:

- Generating diagrams from code/text/GitHub URLs/PRDs.
- Generating code based on Miro board content.

Miro REST is still needed for:

- OAuth app linking.
- Token refresh.
- Board CRUD.
- Board item CRUD.
- Webhooks.
- Scopes and auditability.
- Enterprise-specific behavior.

Implementation correction:

- Keep `miro-bridge` as a first-class backend service.
- Use Miro MCP where a model or agent needs board-native context/actions.
- Use REST for product integration, persistence, and deterministic operations.
- Never pass raw Miro refresh tokens to agent containers.
- Treat Miro content as untrusted input for prompt-injection purposes.

Miro token lifecycle matters:

- Access tokens are short lived.
- Refresh tokens must be stored in Secrets Manager or a dedicated credential vault.
- Enterprise orgs may need MCP enablement before use.

### Finding 9: S3 Storage Model Needs One More Split

The roadmap's S3/EFS split is right, but the audit recommends separating mutable workspace objects from immutable audit objects.

Reason:

- S3 Object Lock is useful for WORM/audit retention, but enabling Object Lock and versioning has operational consequences.
- Object Lock cannot simply be treated as a toggle on the main mutable workspace bucket.
- CloudTrail data events are not enabled by default and must be explicitly configured.
- S3 Access Points have quotas, so creating one per workspace is not always a good default at high scale.

Recommended buckets:

```text
workspace-live-artifacts
  mutable versioned bucket
  user/workspace/project/run prefixes
  lifecycle transitions
  no default Object Lock

workspace-audit-log
  append-only event/archive bucket
  Object Lock enabled from creation
  strict retention policy
  separate KMS key

preview-static
  static website build outputs
  short lifecycle for previews
  optional promotion to permanent hosting bucket

research-datasets
  curated corpora, eval datasets, specialist-agent research packs
  stricter provenance metadata
```

Prefix pattern:

```text
s3://workspace-live-artifacts/users/{userId}/workspaces/{workspaceId}/projects/{projectId}/runs/{runId}/
s3://workspace-audit-log/orgs/{orgId}/workspaces/{workspaceId}/runs/{runId}/events/{seq}.json
s3://preview-static/workspaces/{workspaceId}/projects/{projectId}/deployments/{deploymentId}/
```

IAM should use ABAC tags and scoped prefixes first. Add S3 Access Points when a workspace/org becomes large enough to justify dedicated access policies.

### Finding 10: Preview Hosting Recommendation Still Stands

The audit confirms the original correction:

- Do not create one ALB listener rule or target group per preview.
- AWS ALB defaults include 100 non-default rules per ALB and 100 target groups per ALB.
- Host-based routing supports multiple domains/subdomains, but per-project listener rules are still a scaling trap.

Keep:

```text
*.domain.com -> Route 53 wildcard -> ACM wildcard cert -> ALB -> preview-router
```

The preview-router resolves the host against a registry:

```text
{slug}.{domain}
  -> static S3 deployment
  -> long-lived ECS preview service
  -> short-lived ECS preview task
  -> archived/unavailable response
```

### Finding 11: Cloudflare Queues Are Not An Ordering Backbone

Cloudflare Queues are useful for edge-to-AWS command buffering and notification work, but they are not the canonical ordered event stream.

Current docs call out:

- 128 KB message size.
- At-least-once delivery.
- No guaranteed ordering.
- Configurable retention up to 14 days.
- DLQs must be explicitly configured.

Implementation correction:

- Use Cloudflare Queues for small command envelopes and notification jobs.
- Include `idempotencyKey`, `runId`, `workspaceId`, `seq`, `createdAt`, and `payloadRef`.
- Use DynamoDB/S3 for ordered event truth.
- Use DLQs from day one.

## 3. Revised Harness Decision

### Primary Harness

Use **OpenAI Agents SDK** for:

- Manager agent.
- Specialist agent definitions.
- Handoffs.
- Guardrails.
- Human review.
- Tool policy.
- MCP integrations.
- Trace generation.
- Eval connection.

### Runtime Worker

Use **Hermes Agent** for:

- Specialist work where its memory/skills/toolsets are valuable.
- Long-lived autonomous assistant style tasks.
- Self-improvement candidate generation.
- Portable skills experiments.

Use **Codex CLI as MCP** for:

- Repository edits.
- Code generation.
- Test fixing.
- PR preparation.
- Local file patch workflows inside an isolated worker.

Use **plain purpose-built tools** for:

- Deterministic AWS/GitHub/Miro/S3 operations.
- Upload/download/snapshot tasks.
- Security-sensitive side effects.

### Durable Orchestration

Use **Step Functions + DynamoDB** for:

- Run state.
- Task lifecycle.
- Retries.
- Cancellation.
- Human approval pause/resume when the approval has to survive process death.
- Fanout/fanin.
- Long-running ECS task callbacks.

### Realtime

Use **Cloudflare Durable Objects / Cloudflare Agents SDK** for:

- WebSocket fanout.
- Client state sync.
- Presence.
- Replay cursors.
- Notifications.
- Small low-latency command envelopes.

## 4. Updated Implementation Phases

This does not replace the full roadmap. It changes priority and adds missing gates.

### Phase 0A: Decisions And ADRs

Create ADRs for:

- Primary harness: OpenAI Agents SDK.
- Hermes role: worker runtime only.
- Codex auth modes.
- A2UI as GenUI baseline.
- Cloudflare Agents SDK vs raw DO implementation.
- S3 bucket split.
- ECS worker class split.

Exit criteria:

- No unresolved "which harness owns what" ambiguity.
- Every plane has one owner.

### Phase 0B: Protocol Contract

Build schemas before infra code:

- Canonical event envelope.
- A2UI event wrapper.
- Tool approval request event.
- Tool approval decision event.
- Run/task status event.
- Artifact pointer event.
- Miro artifact event.
- GitHub PR event.
- Error event.

Exit criteria:

- TypeScript schema package.
- Dart generated models.
- Contract tests for replay and gap repair.

### Phase 1: Identity And User Storage

Build:

- Amplify Gen 2 auth skeleton.
- Cognito user pools.
- User/org/workspace/project tables.
- S3 bucket structure.
- KMS keys.
- Secrets Manager namespaces.

New gate:

- Decide how personal Codex auth is represented, even if implementation is delayed.
- Decide OpenAI API project/org configuration for platform-owned mode.

### Phase 2: AWS Durable Run Ledger

Build:

- DynamoDB run/task/event index tables.
- EventBridge buses.
- SQS queues.
- Step Functions state machines for simple ECS task launch.
- Idempotency key enforcement.
- Kill switch path.

New gate:

- A run must survive web/API process restart.
- A run must survive WebSocket disconnect.

### Phase 3: Cloudflare Realtime V1

Build either raw DOs or Cloudflare Agents SDK wrappers for:

- SessionDO.
- WorkspaceDO.
- UserHubDO.
- NotificationDO.
- RateLimiterDO.

Required:

- WebSocket hibernation support.
- Auto-response ping/pong where appropriate.
- Replay cursor.
- S3/DynamoDB gap repair path.
- Queue DLQs.
- 128 KB message-size guard.

Exit criteria:

- Next.js and a small CLI client can receive the same ordered events.
- Flutter protocol client can connect without React-specific assumptions.

### Phase 4: OpenAI Agents SDK Orchestrator

Build:

- Manager agent service.
- Specialist registry.
- Tool registry.
- Handoff policy.
- Guardrails.
- Human approval bridge.
- Trace export.
- Eval result pointers.

Exit criteria:

- Manager can plan, call a specialist, pause for approval, resume, emit trace, and archive run output.

### Phase 5: ECS Worker Runtime

Build:

- Fargate worker task definition.
- Managed Instances worker task definition.
- AgentManager worker selector.
- EFS mount.
- S3 snapshot service.
- Event emitter sidecar or library.
- Task-token callback support.

New gate:

- Capacity provider strategy does not mix incompatible provider types in one strategy.
- AgentManager chooses a worker class before scheduling.

### Phase 6: Codex MCP Worker

Build:

- Codex CLI MCP wrapper image.
- Workspace-write sandbox default.
- Approval policy bridge.
- API-key auth path.
- Optional trusted linked-user auth path.
- Git diff artifact export.
- Test command execution.

Exit criteria:

- A coding specialist can receive a task, patch a repo, run tests, emit a diff, and stop without direct production credentials.

### Phase 7: Hermes Worker

Build:

- Hermes wrapper image.
- Per-run `HERMES_HOME`.
- Skill allowlist.
- Memory adapter.
- Event adapter.
- Tool policy adapter.
- S3/EFS workspace adapter.

Exit criteria:

- Hermes can run as a specialist worker without owning SaaS auth, tenancy, or deployment.

### Phase 8: A2UI GenUI

Build:

- Platform A2UI catalog.
- Validator.
- Next.js renderer.
- Flutter renderer integration.
- Action callback protocol.
- Approval-gated actions.

Exit criteria:

- An agent can stream a dashboard UI that renders in web and Flutter from the same event stream.
- Unknown components fail closed.

### Phase 9: Miro Bridge

Build:

- Miro OAuth linking.
- REST token broker.
- REST board/item tools.
- MCP connection mode.
- Webhook receiver.
- Board artifact records.

Exit criteria:

- Agent can create/update a board through approved tools.
- Miro board content is sanitized before being used as model context.

### Phase 10: Self-Improvement Quarantine

Build:

- Candidate specialist generator.
- Research pack generator.
- Eval pack generator.
- Hermes self-evolution runner.
- OpenAI eval/trace grading integration.
- Promotion workflow.
- Rollback workflow.

Exit criteria:

- No self-improved skill or prompt can reach production without eval pass and promotion decision.

## 5. Updated Research Backlog

### Must Resolve Before Building Production

- Exact OpenAI billing/auth strategy:
  - Platform API project.
  - User-linked Codex mode.
  - Whether ChatGPT-managed auth is allowed at all for hosted workers.
- Whether to implement Cloudflare realtime with raw DO classes or Cloudflare Agents SDK.
- A2UI renderer maturity for Flutter and Next.js.
- ECS Managed Instances CDK support depth and required L1 constructs.
- Whether browser-heavy automation needs ECS Managed Instances, CodeBuild, or a separate sandbox provider.
- EFS cost/performance under many concurrent workspaces.
- Miro Enterprise enablement requirements for MCP.

### Can Defer Until After MVP

- LangGraph integration for graph-specific workflows.
- Mastra integration for TypeScript-native agent apps.
- Cloudflare Workflows use.
- Custom GenUI components beyond A2UI baseline.
- Organization-level S3 Access Points.
- Advanced prompt optimization automation.

## 6. Updated Risk Register

| Risk | Severity | Updated Recommendation |
|---|---:|---|
| Assuming Codex OAuth can power all SaaS automation | Critical | Default to API-key/service-account auth; user-linked Codex only as trusted optional mode |
| Treating Hermes as the platform control plane | Critical | Keep Hermes inside isolated ECS workers |
| Putting durable ordered event history in Durable Objects | High | Use DynamoDB/S3 as event truth; DOs hold hot cursors/state |
| Using Cloudflare Queues as ordered stream | High | Treat as at-least-once unordered command buffer |
| Mixing Fargate and Managed Instances in one capacity provider strategy | High | Select worker class first, then use matching capacity provider |
| Per-preview ALB listener rules | High | Keep preview-router |
| Letting agents emit arbitrary UI code | High | Use A2UI allowlisted catalogs and validation |
| Putting Object Lock on mutable workspace bucket | Medium | Split mutable workspace bucket from immutable audit bucket |
| Overusing S3 Access Points per workspace | Medium | Start with ABAC/prefix policies; add access points for large tenants |
| Running long compute in Cloudflare Workers/DOs | High | Keep long execution in ECS/Step Functions |

## 7. Direct Changes To Make In The Main Roadmap

The main roadmap should be updated or interpreted as follows:

1. Section 13 should mention Cloudflare Agents SDK as a candidate implementation layer over DOs.
2. Section 14 should keep Hermes, but explicitly make OpenAI Agents SDK the manager harness.
3. Section 17.4 should replace "custom GenUI descriptor schema" with "A2UI-first schema wrapped in canonical platform events."
4. Section 21 should state API-key auth is the production default for Codex/OpenAI automation.
5. Section 24 should move protocol contracts and ADRs before large infra implementation.
6. Section 26 should add Cloudflare Agents SDK, A2UI, Codex auth, and ECS Managed Instances CDK maturity as priority research items.

## 8. Source Links

Primary sources used in this Exa MCP audit:

- Cloudflare Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Cloudflare Durable Object state and WebSocket hibernation API: https://developers.cloudflare.com/durable-objects/api/state/
- Cloudflare Agents API: https://developers.cloudflare.com/agents/api-reference/agents-api/
- Cloudflare Agents client SDK: https://developers.cloudflare.com/agents/api-reference/client-sdk/
- Cloudflare Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Cloudflare Queues batching/retries: https://developers.cloudflare.com/queues/configuration/batching-retries/
- AWS ECS launch types and capacity providers: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/capacity-launch-type-comparison.html
- AWS ECS Managed Instances capacity providers: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-capacity-provider-managed-instances.html
- AWS Step Functions ECS integration: https://docs.aws.amazon.com/step-functions/latest/dg/connect-ecs.html
- AWS Step Functions Distributed Map: https://docs.aws.amazon.com/step-functions/latest/dg/state-map-distributed.html
- AWS ALB quotas: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html
- AWS S3 Access Points limits: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-restrictions-limitations.html
- AWS S3 Object Lock configuration: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html
- AWS CloudTrail data events: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html
- AWS Amplify Gen 2 resource overrides: https://docs.amplify.aws/gen2/build-a-backend/data/override-resources/
- Miro MCP server docs: https://developers.miro.com/docs/miro-mcp
- Miro OAuth docs: https://developers.miro.com/docs/getting-started-with-oauth
- Miro scopes: https://developers.miro.com/reference/scopes
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk
- OpenAI Agents guardrails and human review: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
- OpenAI Agents observability and MCP: https://developers.openai.com/api/docs/guides/agents/integrations-observability
- OpenAI agent evals: https://developers.openai.com/api/docs/guides/agent-evals
- OpenAI Codex authentication: https://developers.openai.com/codex/guides/api-key
- OpenAI Codex non-interactive mode: https://developers.openai.com/codex/guides/autofix-ci
- OpenAI Codex CI/CD auth: https://developers.openai.com/codex/auth/ci-cd-auth
- OpenAI Codex with Agents SDK: https://developers.openai.com/codex/guides/agents-sdk
- OpenAI API keys and project headers: https://platform.openai.com/docs/api-reference/api-keys
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits/usage-tiers
- OpenAI Responses API migration: https://platform.openai.com/docs/guides/migrate-to-responses
- OpenAI tools with Responses API: https://platform.openai.com/docs/guides/tools
- A2UI official site: https://a2ui.org/
- Hermes Agent docs: https://hermes-agent.nousresearch.com/docs/
