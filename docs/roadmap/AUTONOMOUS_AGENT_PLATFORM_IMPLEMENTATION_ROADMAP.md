# Autonomous Agent Cloud Platform Implementation Roadmap

Date: 2026-05-09
Status: High-level build plan after local repo audit, cloned reference audit, and current web research

Current implementation status is tracked in
`docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md` and
`docs/roadmap/PROJECT_STATUS.md`. This document remains the long-form design
roadmap and research baseline, but its early-phase sequencing predates the
deployed CDK foundation, deployed Amplify Auth sandbox, and green Amplify
Hosting placeholder.

Second-pass audit: see `docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_EXA_AUDIT_ADDENDUM.md` for Exa MCP research updates on OpenAI Agents SDK, Codex auth, Cloudflare Agents/Durable Objects, A2UI, ECS Managed Instances, Step Functions, S3 bucket split, and Miro.

## 1. Executive Decision

Build this as an **agent operating system**, not as an unbounded swarm.

The platform should let a user act like a CEO: issue high-level objectives, delegate to persistent or temporary agent teams, inspect progress, approve risky actions, receive reports, and move on while the platform executes, tests, archives, and improves the work.

The recommended stack is:

- **AWS CDK** for core infrastructure.
- **AWS Amplify Gen 2** for product-facing backend resources, auth, data APIs, functions, and app integration.
- **Amazon ECS** for all agent execution, with Fargate as the default and ECS Managed Instances for builder/heavy workloads.
- **Hermes Agent** as a specialist worker runtime, not as the multi-tenant control plane.
- **Cloudflare Workers + Durable Objects + Queues** as the realtime sync and client fanout plane.
- **S3** as the durable workspace and artifact ledger.
- **EFS** as the hot mounted filesystem for live agent workspaces that need POSIX semantics.
- **DynamoDB** as the authoritative run/task/agent/control-state ledger.
- **Route 53 + ACM + ALB + preview-router service** for wildcard project websites.
- **Flutter** for desktop and mobile.
- **Next.js** for web.
- **VibeACP-style canonical events** as the event protocol that every client renders from.

The most important correction to the earlier plans is this:

Do **not** create one ALB listener rule or target group per project preview. Use a single wildcard ingress path and a preview-router service that resolves the Host header against a registry. ALB rules per load balancer default to 100, so per-project listener rules become a scaling trap.

## 2. What Was Researched

Local project inputs:

- `docs/research/compass_artifact_wf-db790d55-749c-4296-acdd-81451aeff6ec_text_markdown.md`
- `docs/research/deep-research-report.md`
- `/Users/sebastian/Developer/vibe-coder/`
- `/Users/sebastian/Developer/vibe-coder/vibe_coder/`

Local cloned reference repos, stored under `.research/repos/` and ignored by git:

- `NousResearch/hermes-agent`
- `NousResearch/hermes-agent-self-evolution`
- `cloudflare/agents`
- `cloudflare/agents-starter`
- `cloudflare/workers-chat-demo`
- `openai/openai-agents-python`
- `langchain-ai/langgraph`
- `mastra-ai/mastra`
- `aws-amplify/amplify-backend`
- `aws-samples/amazon-ecs-fargate-cdk-v2-cicd`

The cloned repos are useful for context only. The platform should not blindly copy them.

## 3. Product Philosophy

The core product should feel like a company of AI workers:

1. The user gives an objective.
2. An executive assistant agent turns it into a plan.
3. The platform creates or selects the right specialist agents.
4. Specialists work in isolated containers.
5. Work is streamed to every client in realtime.
6. Risky actions require approval.
7. Results become durable artifacts, reports, websites, PRs, datasets, Miro boards, and eval traces.
8. The system tests the work and evaluates the agents.
9. Good specialist definitions and skills can be promoted.
10. Weak specialist definitions are archived or evolved in quarantine.

The "self-improving" part must be gated. It should mean candidate generation, evaluation, review, canary, promotion, and rollback. It should not mean production agents rewrite their own runtime and deploy directly.

## 4. Non-Negotiable Architecture Rules

These rules prevent the platform from becoming fragile:

- **Backend run ledger beats socket state.** A WebSocket disconnect must never mean "the agent stopped."
- **Server sequence beats client timestamps.** The server assigns ordered `seq` values.
- **VibeACP canonical event log beats ad hoc UI events.** Provider-native events are normalized before clients see them.
- **S3 is the durable ledger. EFS is the hot workspace.** Do not force S3 to behave like a POSIX filesystem.
- **Hermes is a worker runtime, not the SaaS control plane.** Its own security model is personal/single-tenant.
- **Real delegation means new platform tasks.** Hermes in-process subagents are useful, but true isolation requires new ECS tasks.
- **Durable Objects are scoped authorities.** Use one per user, workspace, session, or run, not one global object.
- **Cloudflare does realtime coordination, not heavy compute.** ECS does long-running research, coding, testing, and build work.
- **Agents emit allowlisted GenUI descriptors, not arbitrary React/Flutter code.**
- **Every risky tool call has an approval policy.**
- **Every promoted skill/agent has an eval pack and rollback path.**
- **Every run has a budget and kill switch.**

## 5. Target Architecture

```text
Clients
  Flutter desktop
  Flutter mobile
  Next.js web
    |
    | WSS, HTTPS, push registration
    v
Cloudflare Edge Plane
  Worker router
  UserHubDO
  WorkspaceDO
  SessionDO
  NotificationDO
  RateLimiterDO
  Cloudflare Queues
    |
    | signed commands / signed callbacks
    v
AWS App and Control Plane
  Amplify Gen 2
  Cognito
  AppSync / API Gateway
  Control API
  AgentManager
  Step Functions
  EventBridge
  SQS
  DynamoDB
    |
    | ECS RunTask / Service Connect / Cloud Map
    v
AWS Execution Plane
  ECS Fargate workers
  ECS Managed Instance workers
  Hermes worker runtime
  Builder runtime
  Test/eval runtime
  Preview app runtime
    |
    | artifacts, workspaces, logs, traces
    v
Storage and Artifact Plane
  S3 workspace-artifacts
  S3 preview-static
  EFS live workspaces
  ECR runtime images
  Secrets Manager
  KMS
```

## 6. Repository Structure To Build

Recommended future structure:

```text
agents-cloud/
  apps/
    web-next/                    # Next.js web app
    flutter/                     # shared desktop/mobile app or monorepo package
  packages/
    protocol/                    # VibeACP/event schemas, GenUI schemas, TS types
    flutter_protocol/            # generated Dart models if kept separate
    eval_schemas/                # eval pack schemas and fixtures
  services/
    control-api/                 # backend control API
    agent-manager/               # ECS task lifecycle service
    agent-runtime/               # Hermes worker wrapper image
    builder-runtime/             # build/test/browser-heavy image
    preview-router/              # wildcard host router
    event-relay/                 # AWS events to Cloudflare/internal event sinks
    miro-bridge/                 # Miro REST/MCP helper service if needed
  infra/
    cdk/                         # AWS CDK app
    cloudflare/                  # Workers, Durable Objects, Queues
    amplify/                     # Amplify Gen 2 backend resources
  docs/
    roadmap/
      AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md
    adr/
    runbooks/
    schemas/
  tests/
    contract/
    e2e/
    load/
    security/
    evals/
```

## 7. Plan Audit Summary

Use the first plan for product vision:

- CEO assistant model.
- Agent factory.
- Miro integration.
- Live GenUI.
- Autonomous coding/research teams.
- Self-testing/self-improving loop.

Use the second plan for infrastructure corrections:

- Mixed Fargate + ECS Managed Instances.
- S3 + EFS split.
- Service Connect / Cloud Map.
- DynamoDB run ledger.
- Single preview-router instead of per-project ALB rules.
- Stronger Codex OAuth caution.
- Explicit governance and GitHub workflow.

## 8. What To Cherry-Pick From `vibe-coder`

Useful patterns:

- ECS `RunTask` lifecycle wrapper.
- Task health wait, then `/execute` handoff.
- Per-run environment override pattern.
- Persistent session/container registry idea.
- SSE event relay with sequence numbers.
- Cognito JWT verification.
- Cloudflare Worker + Durable Object websocket proxy.
- S3 archive service pattern.
- GitHub App account-linking flow.
- Flutter cloud session status vocabulary.
- VibeACP event reducer and audit replay idea.
- Tool/action widget registry.
- Permission request handling.
- Live Activity token ACK/retry.

Do not copy as-is:

- Public-IP Fargate networking.
- Hardcoded AWS account IDs and endpoints.
- Raw task definition JSON as the source of truth.
- Mutable `latest` image tags.
- Global OAuth token model.
- Broad CORS.
- Anonymous auth fallbacks.
- Query-string JWTs except as a short compatibility path.
- One huge Riverpod provider that owns transport, UI, files, terminal, notifications, and sync.

## 9. Data Model

The platform needs explicit objects before infrastructure gets large.

### 9.1 Core Entities

```text
User
  id
  cognitoSub
  email
  plan
  settings

Workspace
  workspaceId
  ownerUserId
  name
  members
  defaultBudget
  createdAt

Project
  projectId
  workspaceId
  name
  repoProvider
  repoUrl
  s3Prefix
  efsAccessPointId
  previewHost

AgentDefinition
  agentDefinitionId
  workspaceId
  role
  version
  runtime
  modelPolicy
  toolPolicy
  skillVersions
  memoryScopes
  evalPackIds
  status

Run
  runId
  workspaceId
  projectId
  sessionId
  parentRunId
  rootObjective
  runType
  status
  budget
  taskArn
  startedAt
  heartbeatAt
  completedAt

Task
  taskId
  runId
  parentTaskId
  assigneeAgentDefinitionId
  objective
  status
  leaseOwner
  leaseExpiresAt
  retryCount

RunEvent
  runId
  seq
  eventId
  prevSeq
  eventType
  module
  source
  provider
  payload
  traceId
  createdAt

Artifact
  artifactId
  workspaceId
  projectId
  runId
  type
  s3Key
  mimeType
  checksum
  metadata

Approval
  approvalId
  runId
  toolName
  riskLevel
  requestedAction
  status
  requestedAt
  decidedAt

CredentialLink
  credentialId
  userId
  workspaceId
  provider
  secretArn
  scopes
  expiresAt

EvalPack
  evalPackId
  workspaceId
  targetRole
  version
  datasetS3Prefix
  graders
  thresholds

SkillVersion
  skillVersionId
  name
  version
  source
  s3Key
  checksum
  status
  evalResults
```

### 9.2 DynamoDB Tables

Start with two tables:

```text
app-state
  PK/SK table for users, workspaces, projects, sessions, runs, tasks, locks,
  agent definitions, approvals, credential links, preview registry, idempotency.

run-events
  PK = RUN#<runId>
  SK = SEQ#<zero-padded-seq>
  GSI by sessionId if needed.
  TTL for hot event retention only. Durable archives go to S3.
```

Rules:

- Use conditional writes for active-run locks.
- Use TTL only as cleanup, never for correctness.
- Store large payloads in S3 and put pointers in DynamoDB.
- Every external callback uses `eventId` and `commandId` for idempotency.
- Every state mutation emits an audit event.

## 10. S3 and EFS Workspace Model

### 10.1 S3 Durable Layout

Use one or a small number of encrypted buckets with strict prefixes, not one bucket per user.

```text
s3://agents-cloud-workspaces-{env}/
  users/{userId}/
    workspaces/{workspaceId}/
      projects/{projectId}/
        source-snapshots/{snapshotId}/
        runs/{runId}/
          input/
          output/
          logs/
          traces/
          events/
          evals/
          approvals/
        artifacts/{artifactId}/
        previews/{deploymentId}/
        reports/{reportId}.md
        miro/{boardId}/
        exports/
        backups/

s3://agents-cloud-preview-static-{env}/
  workspaces/{workspaceId}/projects/{projectId}/deployments/{deploymentId}/
    index.html
    assets/
```

Enable:

- SSE-KMS encryption.
- Versioning.
- Block public access.
- Lifecycle policies.
- Object tags for workspace, project, run, artifact type, retention tier.
- CloudTrail data events for sensitive prefixes.
- Optional Object Lock for audit artifacts if compliance or non-repudiation matters.
- Presigned upload/download URLs through backend APIs.

### 10.2 EFS Hot Workspace

Use EFS when agents need:

- A mutable project tree.
- Shared filesystem access across multiple ECS tasks.
- Long-running build/test processes.
- File watchers or incremental work.

Mount EFS into ECS at `/workspace` using access points.

Recommended pattern:

```text
/workspace/
  project/
  .agent/
    run-spec.json
    events/
    scratch/
  artifacts/
```

Rules:

- Use EFS access points with enforced UID/GID and root directory.
- Use transit encryption.
- Use IAM authorization.
- Snapshot important EFS state back to S3 at run boundaries.
- Do not treat EFS as the permanent artifact record.

### 10.3 Ephemeral Task Storage

Fargate gives task ephemeral storage by default and can be configured higher. Use it for:

- Package installs.
- Browser caches.
- Temporary build output.
- Test scratch data.

Anything important must be copied to S3 before the task exits.

## 11. AWS CDK Stack Plan

Use TypeScript CDK.

### 11.1 FoundationStack

Builds:

- Environment configuration.
- Shared tags.
- KMS keys.
- SSM parameters.
- Removal policies.
- Imported hosted zone and Cognito settings.
- CDK outputs consumed by Amplify and Cloudflare config.

Exit criteria:

- `dev`, `stage`, and `prod` context values are explicit.
- No hardcoded account IDs in code.

### 11.2 NetworkStack

Builds:

- VPC across 2 AZs initially, 3 for production.
- Public subnets for ALB and NAT.
- Private-with-egress subnets for ECS.
- Isolated/private subnets for EFS.
- Gateway endpoints for S3 and DynamoDB.
- Interface endpoints for ECR, CloudWatch Logs, Secrets Manager, SSM, and ECS as justified.
- Security groups for ALB, control services, agent tasks, preview tasks, EFS.

Exit criteria:

- ECS tasks do not require public IPs.
- S3/DynamoDB traffic avoids NAT.
- EFS only accepts traffic from expected ECS security groups.

### 11.3 RegistryStack

Builds ECR repositories:

- `agent-runtime`
- `builder-runtime`
- `control-api`
- `agent-manager`
- `preview-router`
- `preview-runner`
- `event-relay`

Rules:

- Immutable release tags.
- Scan on push.
- Lifecycle cleanup for branch tags.
- No production deployment from `latest`.

### 11.4 StorageStack

Builds:

- S3 workspace/artifact bucket.
- Optional S3 preview-static bucket.
- EFS filesystem.
- EFS access point creation mechanism.
- KMS keys and bucket policies.
- Lifecycle policies.
- Presigned URL Lambda or control API permissions.

Exit criteria:

- A run can create workspace state on EFS and archive to S3.
- S3 object layout is stable and documented.

### 11.5 StateStack

Builds:

- `app-state` DynamoDB table.
- `run-events` DynamoDB table.
- Streams where needed.
- TTL attributes.
- GSI choices.
- DLQ table or failure projection if useful.

Exit criteria:

- Run lifecycle can be represented without Redis/Postgres.
- Every run transition can be made idempotent.

### 11.6 ClusterStack

Builds:

- ECS cluster.
- Fargate and Fargate Spot capacity providers.
- ECS Managed Instances capacity provider for heavy/build workloads.
- Cloud Map namespace or Service Connect.
- Container Insights.
- ECS Exec for non-prod and break-glass prod.

Exit criteria:

- A normal worker can run on Fargate.
- A builder worker can run on Managed Instances.
- Internal services resolve each other without public IPs.

### 11.7 RuntimeStack

Builds task definitions and services:

- `control-api` service.
- `agent-manager` service or Lambda.
- `agent-runtime` standalone ECS task definition.
- `builder-runtime` standalone ECS task definition.
- `event-relay` service.
- Log groups.
- Task roles and execution roles.

Worker contract:

```text
GET  /health
POST /execute
POST /cancel
GET  /events or callback mode
POST /approval-result
GET  /workspace/status
```

Exit criteria:

- A run can be created, task launched, health checked, executed, and stopped.

### 11.8 OrchestrationStack

Builds:

- Step Functions for deterministic run lifecycle.
- EventBridge bus and rules.
- SQS queues.
- DLQs.
- Cleanup Lambdas.
- Retry policies.

Use Step Functions for:

- Acquire lock.
- Start/reuse ECS task.
- Wait for callback or heartbeat.
- Handle timeout/cancel.
- Finalize and archive.

Use EventBridge/SQS for:

- Dynamic agent-to-agent events.
- Webhook buffering.
- Long-running fanout.
- Tool-specific rate-limit queues.

### 11.9 EdgePreviewStack

Builds:

- ALB.
- HTTPS listener.
- ACM wildcard certificate.
- Route 53 wildcard record, for example `*.projects.example.com`.
- Preview-router ECS service.
- Preview registry in DynamoDB.

Preview flow:

```text
project-id.projects.example.com
  -> Route 53 wildcard
  -> ALB
  -> preview-router
  -> DynamoDB preview registry
  -> static S3 object or internal ECS preview target
```

Exit criteria:

- Static preview works from S3.
- Dynamic preview proxies to an ECS service/task.
- No per-project ALB listener rule is required.

### 11.10 SecretsIamStack

Builds:

- Secrets Manager namespaces.
- Per-service IAM roles.
- Per-agent task roles.
- IAM permissions boundaries.
- `iam:PassRole` constraints.

Secret namespaces:

```text
/agents/{env}/system/*
/agents/{env}/users/{userId}/{provider}
/agents/{env}/workspaces/{workspaceId}/{provider}
/agents/{env}/github-app/*
/agents/{env}/miro/*
```

Rules:

- Agent tasks get only the secrets needed for that run.
- Long-lived refresh tokens stay in Secrets Manager or encrypted token tables.
- Short-lived access tokens can be brokered into task runtime.
- Never inject global provider tokens into every task.

### 11.11 ObservabilityStack

Builds:

- CloudWatch dashboards.
- Metrics filters.
- Alarms.
- Log retention policies.
- Cost/budget alarms.
- X-Ray or OpenTelemetry plumbing where useful.
- S3 audit export pipeline.

Track:

- Task cold start time.
- Run duration.
- Run success/failure.
- Heartbeat lag.
- Stuck runs.
- Queue depth.
- DLQ depth.
- Preview 404/5xx.
- S3 artifact volume.
- EFS burst credits.
- NAT traffic.
- Per-user spend.

## 12. Amplify Gen 2 Role

Amplify should own the product-facing app backend, not all infrastructure.

Use Amplify for:

- Cognito user auth.
- AppSync GraphQL or data APIs.
- User/workspace/project data models if convenient.
- Lambda functions for app workflows.
- Frontend hosting integration.
- Client config generation.
- GitHub/Miro/Codex linking UI callbacks.

Use raw CDK for:

- VPC.
- ECS.
- EFS.
- ALB.
- Route 53.
- Complex IAM.
- Step Functions.
- EventBridge/SQS.
- Observability.

Amplify Gen 2 supports adding CDK custom resources through `backend.createStack()`. Use that for integration points, but keep the heavy infrastructure in dedicated CDK stacks for clarity and blast-radius control.

## 13. Cloudflare Realtime Plane

Cloudflare should become the realtime authority for clients, not just a device-to-device proxy.

### 13.1 Durable Object Classes

`UserHubDO`

- One per user.
- Authenticates websocket connection handoff from Worker.
- Tracks connected devices: mobile, desktop, web, browser tabs.
- Handles presence and notifications.
- Preserves compatibility with old `target_type` and `source_type` routing during migration.

`WorkspaceDO`

- One per workspace/project.
- Owns workspace summary and active-session list.
- Fans out summary updates, not high-volume chat streams.

`SessionDO`

- One per agent session or run.
- Owns ordered event log.
- Assigns `seq`.
- Deduplicates by `eventId` and `commandId`.
- Stores snapshots and status projections.
- Serves replay after `lastSeenSeq`.
- Receives AWS progress callbacks.

`NotificationDO`

- One per user or folded into `UserHubDO` at first.
- Stores push subscriptions, unread state, collapse keys, retry schedule.

`RateLimiterDO`

- Per user/IP/workspace limits.
- Message count and byte count limits.
- Protects WebSocket and command routes.

`TunnelRegistryDO` and `TunnelSessionDO`

- Optional for Cloudflare tunnel-style previews.
- Use DO as authority and KV as a projection.

### 13.2 Worker Routes

```text
/ws/user
/ws/workspace/:workspaceId
/ws/session/:sessionId
/api/replay/session/:sessionId?afterSeq=N
/internal/aws/events
/api/notifications/register
/api/tunnels
/connect
```

### 13.3 Client Event Envelope

```json
{
  "v": 1,
  "type": "hello|hello_ack|command|ack|event|resume|replay_batch|replay_complete|snapshot|presence|notification|error|ping|pong",
  "eventType": "chat.message.delta",
  "eventId": "evt_...",
  "commandId": "cmd_...",
  "workspaceId": "w_...",
  "sessionId": "s_...",
  "runId": "r_...",
  "deviceId": "dev_...",
  "deviceType": "mobile|desktop|web|server|aws",
  "seq": 123,
  "prevSeq": 122,
  "sentAt": "2026-05-09T00:00:00.000Z",
  "payload": {},
  "meta": {
    "traceId": "...",
    "requiresAck": true,
    "ttlMs": 30000
  }
}
```

Rules:

- Clients send `commandId`.
- Server assigns `eventId` and `seq`.
- `seq=0` is reserved for seed/snapshot frames.
- Clients store `lastAppliedSeq`.
- Replay fills gaps.
- If replay is too old, server sends snapshot plus newer events.

### 13.4 Cloudflare to AWS Bridge

Flow:

```text
Client command
  -> SessionDO validates and appends intent
  -> SessionDO writes outbox row
  -> Cloudflare Queue message
  -> Queue consumer signs command
  -> AWS control API
  -> ECS/Step Functions executes
  -> AWS posts signed callback to /internal/aws/events
  -> SessionDO appends canonical event
  -> Clients receive event
```

Every AWS action must be idempotent because queues and callbacks can duplicate.

## 14. Hermes Runtime Plan

### 14.1 Boundary

Hermes is a worker runtime for specialist agents.

The platform owns:

- Tenancy.
- Auth.
- Secrets.
- Scheduling.
- Agent registry.
- Skill registry.
- Memory authority.
- Eval and promotion.
- Run ledger.
- Budget enforcement.
- Approval policy.
- Artifact storage.
- Client streaming.

Hermes owns:

- The local agent loop inside a bounded task.
- Tool use.
- Skill execution.
- Terminal/file/browser actions within the task boundary.
- Optional bounded in-task helper subagents.
- Structured result emission through a platform adapter.

### 14.2 ECS Worker Shape

Each run gets:

- ECS task.
- Task role.
- Run-scoped `HERMES_HOME`.
- Run-scoped workspace mount.
- Generated Hermes config.
- Tool policy.
- Memory scope.
- Skill versions.
- Budget and timeout config.
- Platform callback URL.
- Signed run token.

The Hermes wrapper should:

1. Read `run-spec.json`.
2. Materialize Hermes config.
3. Mount read-only promoted skills.
4. Configure memory provider adapter.
5. Start Hermes in non-interactive execution mode.
6. Emit VibeACP events.
7. Upload artifacts.
8. Send final result and exit.

### 14.3 Internal Delegation

Use Hermes internal delegation only for local parallel helper work inside the same task boundary.

Use platform delegation for true isolation:

```text
delegate_to_specialist(role, brief, workspaceScope, budget)
  -> AgentManager
  -> ECS RunTask
  -> new runId
  -> parent subscribes to child events
```

### 14.4 Memory

Use platform memory as source of truth.

Implement a Hermes `MemoryProvider` adapter that can:

- Fetch scoped user/workspace/project memory.
- Fetch role-specific memory.
- Write proposed memory updates to a reviewable queue.
- Avoid mixing tenants.
- Avoid exposing parent memory to child tasks unless explicitly allowed.

### 14.5 Skills

Skills are platform artifacts.

Production workers mount only:

- Versioned skills.
- Approved skills.
- Signed skills.
- Role-appropriate skills.
- Read-only skill directories.

Candidate skill creation runs in quarantine:

- Separate ECS task.
- Separate S3 prefix.
- Separate EFS access point.
- No production secrets.
- Eval pack required before promotion.

## 15. Specialist Agent Factory

This is the heart of the "hire a marketing agent" idea.

### 15.1 Specialist Definition

```json
{
  "role": "marketing-strategist",
  "version": "1.0.0",
  "mission": "Research, plan, and evaluate marketing strategy for product launches.",
  "modelPolicy": {
    "preferred": ["gpt-5.4", "claude-opus", "fallback-model"],
    "maxCostPerRunUsd": 25
  },
  "tools": [
    "web_research",
    "market_data",
    "miro",
    "document_writer",
    "spreadsheet",
    "artifact_publish"
  ],
  "skills": [
    "market-research",
    "competitive-analysis",
    "pricing-strategy"
  ],
  "memoryScopes": [
    "workspace/company",
    "project/product",
    "role/marketing"
  ],
  "evalPacks": [
    "marketing-agent-v1"
  ],
  "approvalPolicy": {
    "readOnlyResearch": "auto",
    "externalWrite": "approve",
    "spendOverUsd": 5
  }
}
```

### 15.2 Factory Workflow

```text
User: "Hire a marketing agent"
  -> Executive Assistant creates agent-factory run
  -> Deep research about marketing roles and required capabilities
  -> Create specialist definition
  -> Create initial skill set
  -> Create eval pack
  -> Run candidate specialist in quarantine
  -> Compare against baseline/generalist
  -> Generate scorecard
  -> Human approves or rejects
  -> Registry promotes specialist
  -> Future tasks can delegate to it
```

### 15.3 Promotion Gates

No specialist reaches production without:

- Static validation.
- Secret scan.
- Tool policy validation.
- Eval dataset.
- Regression threshold.
- Cost threshold.
- Latency threshold.
- Artifact quality threshold.
- Human approval for first promotion.
- Canary mode.
- Rollback version.

## 16. Self-Improvement Plan

Use `hermes-agent-self-evolution` as a candidate generator and benchmark runner pattern.

### 16.1 Safe Optimization Targets

Start with:

1. Skill files.
2. Tool descriptions.
3. System prompt sections.
4. Eval rubrics.

Delay:

1. Tool implementation code.
2. Runtime code.
3. Autonomous production promotion.

### 16.2 Self-Improvement Loop

```text
Select underperforming skill or specialist
  -> Build eval dataset from traces and golden tasks
  -> Generate variants
  -> Run variants in quarantine
  -> Score on held-out tests
  -> Compare with current production version
  -> Produce scorecard
  -> Open promotion proposal
  -> Human review
  -> Canary
  -> Promote or rollback
```

### 16.3 Eval Pack Schema

```json
{
  "evalPackId": "marketing-agent-v1",
  "targetRole": "marketing-strategist",
  "version": "1.0.0",
  "datasets": [
    {
      "name": "competitor-research",
      "s3Prefix": "evals/marketing-agent-v1/competitor-research/",
      "size": 25
    }
  ],
  "graders": [
    {
      "name": "source-quality",
      "type": "llm-rubric",
      "threshold": 0.8
    },
    {
      "name": "citation-coverage",
      "type": "deterministic",
      "threshold": 0.95
    }
  ],
  "budgets": {
    "maxCostUsd": 10,
    "maxWallMinutes": 45
  }
}
```

LLM judges are supporting signal only. Prefer deterministic tests wherever possible.

## 17. Client App Plan

### 17.1 Shared Contract

All clients consume the same canonical event stream:

- Flutter desktop.
- Flutter mobile.
- Next.js web.

All clients must share:

- Event schema.
- Run/session status vocabulary.
- Tool/action names.
- Approval payloads.
- GenUI component descriptors.
- Replay and snapshot behavior.

### 17.2 Flutter Desktop and Mobile

Build shared packages:

```text
RealtimeClient
  WSS connection, auth refresh, resume, replay, backoff, heartbeats

SessionRepository
  SQLite cache, lastAppliedSeq, messages, tool state, approvals

EventReducer
  VibeACP event -> UI state

ActionRendererRegistry
  terminal, shell, edit, patch, grep, glob, ls, fetch, plan, MCP, unknown

NotificationBridge
  push token registration, Live Activity token handling, ACK/retry

GenUiRenderer
  allowlisted component renderer
```

Do not keep separate desktop and mobile implementations that drift.

### 17.3 Next.js Web

Build:

- App Router shell.
- Workspace/project/session navigation.
- WebSocket connection to Cloudflare.
- React VibeACP reducer.
- Action renderer registry matching Flutter.
- GenUI component registry.
- Artifact browser.
- Approval inbox.
- Run timeline.
- Audit replay page.

The Vercel AI SDK can help render typed UI parts, but it should not become the source of truth. The source of truth is the canonical platform event log.

### 17.4 Live GenUI

Agents emit descriptors like:

```json
{
  "surfaceId": "market-dashboard",
  "component": "competitor_matrix",
  "version": "1",
  "props": {
    "artifactId": "art_123",
    "rowsRef": "s3://..."
  },
  "actions": [
    {
      "id": "approve-next-step",
      "label": "Approve",
      "type": "approval"
    }
  ]
}
```

Rules:

- Components are allowlisted.
- Props are validated.
- Large data is referenced from S3, not sent over WebSocket.
- Unknown components degrade to markdown.
- UI actions return idempotent `ui.action` events.
- Tool execution still goes through server approval policy.

## 18. Website and Artifact Preview Hosting

### 18.1 Static Preview

Flow:

```text
Agent builds static website
  -> uploads to S3 preview-static
  -> writes PreviewDeployment record
  -> preview-router serves it by host
```

Good for:

- Docs.
- Reports.
- Static Next export.
- Marketing pages.
- Generated dashboards with static data.

### 18.2 Dynamic Preview

Flow:

```text
Agent builds dynamic app image or command
  -> preview ECS task/service starts
  -> registers internal target
  -> preview-router maps host to target
```

Good for:

- Full-stack prototypes.
- WebSocket demos.
- Apps with API routes.
- Stateful previews.

### 18.3 Domain Strategy

Use one-level preview names:

```text
{projectSlug}.projects.example.com
{deploymentId}.previews.example.com
```

Do not rely on `*.example.com` to cover nested TLS names. Wildcard certificates cover only one subdomain level.

## 19. GitHub Integration

Use a GitHub App, not personal access tokens.

Needed capabilities:

- Install app per user/org.
- Store installation mapping to Cognito user/workspace.
- Mint short-lived installation tokens.
- Clone selected repos.
- Create branches.
- Commit changes.
- Open PRs.
- Listen to webhooks.
- Run checks.
- Comment status.
- Respect repo allowlist.

Governance:

- Agents work on branches.
- CI runs before PR is marked ready.
- Production deployment requires environment protection or approval.
- Agent commits include run IDs and trace links.

## 20. Miro Integration

Use both Miro MCP and Miro REST.

Miro MCP is useful when agents need board-native reasoning and creation tools.

Miro REST is useful for:

- Backend synchronization.
- Board metadata.
- Artifact export.
- Deterministic create/update operations.
- Permission and token management.

Needed implementation:

- Miro OAuth callback.
- Store per-user/team tokens.
- Track selected Miro team.
- Track board permissions.
- Token refresh.
- Rate-limit handling.
- Board artifact records in S3.
- Miro board references in run events.

Security:

- Request only needed scopes.
- Treat MCP tool calls as external writes.
- Require approval for creating or modifying board content unless the user has opted in.
- Never expose Miro refresh tokens to agent containers directly; broker short-lived access.

## 21. Codex and OpenAI Integration

Treat Codex/ChatGPT sign-in as a linked user capability, not the SaaS identity backbone.

Support two modes:

1. **User-linked Codex mode**
   - User signs in.
   - Platform stores linked credential securely.
   - Use only for user-owned trusted workloads where terms and technical limits allow it.

2. **Service API mode**
   - Workspace provides API billing credentials.
   - Production unattended agents use service-billed API keys or project-scoped credentials.
   - This is the safer default for 24/7 cloud execution.

Rules:

- Do not assume Codex OAuth is suitable for commercial multi-user resale.
- Keep an API-key/service-billing fallback.
- Track token usage and cost per run.
- Allow users to choose provider/model policy per workspace.

## 22. Security and Governance

### 22.1 Identity

Use Cognito/Amplify identity for app users.

Use:

- User pool for auth.
- Workspace membership table for authorization.
- JWT validation at Cloudflare and AWS edges.
- Internal service-to-service signed requests.
- Short-lived connection tickets for WebSocket where possible.

### 22.2 Agent IAM

Every agent task needs a narrow role:

- S3 prefix access only for its workspace/project/run.
- DynamoDB write access only to allowed event/run records.
- Secrets access only for specific credential ARNs.
- EventBridge publish only to allowed bus.
- No broad admin permissions.
- No `iam:*`.
- No `sts:AssumeRole` except explicit brokered roles.

The orchestrator role can call `ecs:RunTask` and `iam:PassRole`, but only for known task roles.

### 22.3 Secrets

Rules:

- No shared global provider token.
- No secrets in logs.
- No secrets in generated artifacts.
- No secrets in S3 workspace files unless intentionally encrypted.
- Secrets broker issues short-lived credentials where possible.
- Redaction runs before client display and before audit export.

### 22.4 Network Egress

Add egress policy by workload type:

- Research agents can access the public web.
- Coding agents can access GitHub/package registries.
- Eval agents can access only needed endpoints.
- High-risk candidate agents run in quarantine.
- Internal control services are private.

Future hardening:

- NAT egress filtering.
- AWS Network Firewall or proxy.
- Domain allowlists for sensitive workspaces.
- Metadata endpoint protection.

### 22.5 Tool Approval

Define risk levels:

```text
read_only
workspace_write
external_write
credential_use
costly_action
deployment
destructive
```

Examples:

- Reading a public web page: auto.
- Writing S3 artifact: auto if under workspace prefix.
- Committing to branch: policy-controlled.
- Opening PR: policy-controlled.
- Sending external email: approval.
- Modifying Miro board: approval by default.
- Deploying public website: approval unless workspace policy allows auto.
- Deleting data: approval.

### 22.6 Prompt Injection

Controls:

- Separate trusted instructions from untrusted content.
- Normalize external data into structured fields before tool decisions.
- Use allowlisted tools by agent role.
- Require approvals for external writes.
- Run trace graders and prompt-injection evals.
- Keep browser/research output as untrusted.
- Treat Miro board content, web pages, GitHub issues, PR comments, and uploaded files as untrusted.

### 22.7 Audit

Every run should export:

- User command.
- Generated plan.
- Agent definitions and versions.
- Tool calls.
- Approvals.
- Provider events.
- VibeACP canonical events.
- Artifacts.
- Test outputs.
- Cost.
- Final result.
- Links to PRs, previews, Miro boards, reports.

The VibeACP lineage lab from `vibe_coder` is a strong starting point. Extend it to full lineage:

```text
client input
  -> platform command
  -> provider request
  -> raw provider event
  -> adapter event
  -> VibeACP event
  -> client reducer
  -> rendered UI state
```

## 23. Observability and Operations

Dashboards:

- Runs by status.
- Runs by workspace.
- Active ECS tasks.
- Fargate vs Managed Instance usage.
- Task cold starts.
- Heartbeat lag.
- Queue lag.
- DLQ depth.
- Cloudflare replay gaps.
- WebSocket connection counts.
- Preview-router hits/misses.
- S3 artifact growth.
- EFS throughput and burst credits.
- Per-user and per-workspace spend.

Alarms:

- Stuck run.
- No heartbeat.
- Run budget exceeded.
- DLQ non-empty.
- ECS task launch failures.
- ECR pull failures.
- Preview 5xx spike.
- Cloudflare Queue backlog.
- S3/KMS access denied spikes.
- Unexpected secrets access.

Runbooks:

- Kill run.
- Quarantine agent definition.
- Rollback skill version.
- Disable provider.
- Disable workspace.
- Restore artifact.
- Rotate token.
- Drain queue.
- Recover preview-router.

## 24. Implementation Phases

### Phase 0: Contract Freeze and Repo Bootstrap

Build:

- Monorepo structure.
- `packages/protocol`.
- Event envelope schema.
- VibeACP schema subset.
- GenUI descriptor schema.
- Run spec schema.
- Artifact schema.
- Approval schema.
- `.research/` ignored by git.
- Architecture ADRs.

Exit criteria:

- Every future service can import or generate protocol types.
- No infra is built before core contracts are clear.

### Phase 1: Amplify and Identity Skeleton

Build:

- Amplify Gen 2 backend.
- Cognito user pool.
- Workspace/project/session models.
- Basic GraphQL or API routes.
- User settings.
- GitHub/Miro/Codex credential link placeholders.

Exit criteria:

- User can sign in.
- User can create workspace and project records.
- Backend authorizes by workspace membership.

### Phase 2: CDK Foundation

Build:

- FoundationStack.
- NetworkStack.
- RegistryStack.
- Basic StateStack.
- Basic StorageStack.
- CDK deploy pipeline for dev.

Exit criteria:

- VPC, tables, buckets, ECR repos, and baseline security groups deploy cleanly.

### Phase 3: Agent Runtime POC

Build:

- `agent-runtime` wrapper image around Hermes.
- Generated `run-spec.json`.
- Fargate task definition.
- `/health` and `/execute` contract.
- CloudWatch logs.
- S3 artifact upload.

Exit criteria:

- One ECS task can run one simple prompt, emit logs, upload a final report, and stop.

### Phase 4: AgentManager and Run Lifecycle

Build:

- Control API endpoint for `createRun`.
- DynamoDB run record.
- ECS `RunTask`.
- Health wait.
- Heartbeat.
- Cancel.
- Stop.
- Finalize.
- Idempotency keys.

Exit criteria:

- A run can survive retries without duplicate side effects.
- A stuck run is detected and stopped.

### Phase 5: S3/EFS Workspace Storage

Build:

- S3 workspace layout.
- EFS access point provisioning.
- Workspace mount into ECS.
- Snapshot-to-S3 process.
- Artifact registry.
- Presigned URL API.

Exit criteria:

- Agent can work in `/workspace`, then archive outputs to S3.
- Client can browse artifacts through authorized URLs.

### Phase 6: Cloudflare Realtime V1

Build:

- Worker project.
- Cognito JWT validation.
- `UserHubDO`.
- `SessionDO`.
- v1 event envelope.
- Replay by `lastSeenSeq`.
- AWS callback route.
- Cloudflare Queue to AWS command bridge.

Exit criteria:

- Web, desktop, and mobile can connect to same session stream.
- Disconnect/reconnect replays missing events.

### Phase 7: Flutter Shared Client Package

Build:

- `RealtimeClient`.
- `SessionRepository`.
- `EventReducer`.
- `ActionRendererRegistry`.
- `NotificationBridge`.
- Cloud-first session list.

Exit criteria:

- Desktop and mobile render the same run from the same event log.
- Connection state does not overwrite run state.

### Phase 8: Next.js Web App V1

Build:

- Workspace/project/session shell.
- WebSocket client.
- Event reducer.
- Tool/action renderers.
- Approval inbox.
- Artifact browser.
- Run timeline.

Exit criteria:

- Web can observe and control a run created from Flutter.

### Phase 9: Preview Hosting

Build:

- ALB.
- ACM cert.
- Route 53 wildcard.
- Preview-router service.
- Preview registry.
- Static S3 preview mode.
- Dynamic ECS preview mode.

Exit criteria:

- `project.projects.domain.com` serves a generated artifact.
- Dynamic preview can be started and cleaned up.
- No per-project ALB listener rules.

### Phase 10: GitHub App Integration

Build:

- GitHub App install flow.
- OAuth state linking to Cognito user.
- Installation token broker.
- Repo allowlist.
- Branch creation.
- Commit and PR flow.
- Webhook ingestion.

Exit criteria:

- Agent can clone a selected repo, commit to a branch, open PR, and attach run trace.

### Phase 11: Miro Integration

Build:

- Miro OAuth linking.
- Token storage.
- Miro MCP connection path.
- Miro REST helper.
- Board artifact records.
- Approval policy for board writes.

Exit criteria:

- Agent can read board context with permission.
- Agent can create/update a board item after approval.
- Board output is linked as an artifact.

### Phase 12: Specialist Registry

Build:

- `AgentDefinition` registry.
- Role/tool/skill/memory policies.
- Specialist versioning.
- Registry UI/API.
- Manual creation flow.
- Basic "hire specialist" workflow.

Exit criteria:

- Executive Assistant can delegate to a registered specialist.
- Specialist runs in its own ECS task with scoped tools.

### Phase 13: Eval Harness V1

Build:

- Eval pack schema.
- Golden datasets.
- Deterministic graders.
- LLM rubric graders.
- Browser/app tests for generated websites.
- Code tests for PR work.
- Scorecard artifact.

Exit criteria:

- Every promoted specialist has at least one eval pack.
- Eval results are stored and visible.

### Phase 14: Self-Evolution Quarantine

Build:

- Candidate skill generation sandbox.
- Hermes self-evolution runner integration.
- Static scans.
- Skills Guard.
- Eval comparison.
- Promotion proposal.
- Canary and rollback.

Exit criteria:

- System can propose an improved skill without touching production.
- Human can review metrics and promote or reject.

### Phase 15: Multi-Agent Team Orchestration

Build:

- Parent/child run graph.
- Platform-level delegation tool.
- Parallel fanout.
- Fan-in reducer.
- Cross-agent message contracts.
- Conflict handling.
- Shared artifact handoff.

Exit criteria:

- A CEO objective can spawn multiple specialist runs and return one consolidated report.

### Phase 16: Budget, Safety, and Approval Hardening

Build:

- Per-user/workspace budgets.
- Per-run budget.
- Tool risk matrix.
- Approval queue.
- Cost ledger.
- Egress controls.
- Secrets broker.
- Prompt-injection test suite.

Exit criteria:

- A run cannot exceed policy without stopping or asking for approval.
- Dangerous tools are blocked or approved.

### Phase 17: Audit, Replay, and Observability

Build:

- Full lineage export.
- Replay UI.
- Drift detection.
- CloudWatch dashboards.
- Cloudflare metrics.
- Cost dashboards.
- Incident runbooks.

Exit criteria:

- Any run can be replayed from canonical events.
- UI projections can be tested across Flutter and Next.js.

### Phase 18: Beta Hardening

Build:

- Load tests.
- Tenant isolation tests.
- DR restore tests.
- Token rotation tests.
- Preview abuse protections.
- WAF rules.
- Backup/restore.
- Production runbooks.

Exit criteria:

- Platform can run 24/7 with stuck-run cleanup, budget controls, audit logs, and rollback.

## 25. MVP Scope

The smallest useful MVP:

1. User signs in.
2. User creates a workspace/project.
3. User starts one cloud agent run.
4. ECS Fargate starts one Hermes worker.
5. Worker writes events and artifacts.
6. Cloudflare SessionDO streams ordered events to web and Flutter.
7. S3 stores artifacts.
8. User can approve or cancel.
9. User can view final report and logs.
10. Generated static website can be served on a wildcard preview host.

Do not include autonomous self-evolution in the MVP. Build the hooks and schemas, then add it after the baseline run loop is observable and reliable.

## 26. Research Still Left

These items need deeper validation before implementation decisions are locked.

### Hermes Runtime

- Exact best non-interactive execution mode for ECS.
- Whether to use Hermes API server, CLI wrapper, or a custom Python adapter.
- How to disable live skill mutation safely.
- How to implement a platform `MemoryProvider`.
- How to emit canonical VibeACP events from Hermes without brittle log parsing.

### ECS Managed Instances

- Exact capacity provider setup and launch constraints.
- Whether builder workloads need one-task-per-instance isolation.
- Whether Docker builds should run in Managed Instances, CodeBuild, or an external sandbox.

### Cloudflare Realtime

- Load testing for one `SessionDO` under long agent streams.
- Replay retention and snapshot size.
- Whether to use raw Durable Objects or Cloudflare Agents for higher-level abstractions.
- Signed Cloudflare-to-AWS command format.

### Miro

- Actual MCP tool list and behavior under OAuth.
- Enterprise enablement requirements.
- Team-specific install UX.
- REST-vs-MCP responsibility split.
- Board export/versioning options.
- Rate limits under automation.

### Codex/OpenAI

- Current programmatic Codex SDK/auth capabilities.
- What usage draws from ChatGPT plan credits versus API billing.
- Terms and product constraints for unattended cloud workloads.
- Best fallback mode for production service accounts.

### GenUI

- Whether to adopt A2UI, a custom schema, or another stable standard.
- Flutter renderer maturity.
- Next.js renderer architecture.
- Component compatibility negotiation.
- Security model for UI actions.

### Storage

- Cost/performance of EFS for large numbers of workspaces.
- Snapshot frequency.
- S3 object count growth.
- Archive retention policy.
- Workspace restore speed.

### Security

- Egress filtering design.
- Tenant isolation test suite.
- Secrets broker design.
- Prompt-injection red-team dataset.
- Approval UX and emergency stop behavior.

## 27. Main Risks

| Risk | Impact | Mitigation |
|---|---:|---|
| Treating Hermes as multi-tenant SaaS control plane | Critical | Use Hermes only inside isolated ECS workers |
| Dynamic ALB listener rules per preview | High | Use preview-router |
| Codex OAuth assumptions break | High | Support API-key/service billing fallback |
| Skill self-improvement pollutes production | High | Quarantine, evals, human promotion |
| WebSocket connection state mistaken for run state | High | Run ledger is authoritative |
| S3 used as live filesystem | Medium | Use EFS for hot workspace |
| EFS cost/performance surprises | Medium | Use S3 snapshots and lifecycle policies |
| Prompt injection through web/Miro/GitHub | High | Structured extraction, tool policies, approvals |
| Provider/event UI drift across clients | Medium | Canonical VibeACP reducer and replay tests |
| Cost runaway | High | Budgets, quotas, kill switches |

## 28. Source Links

Official docs and references used:

- Cloudflare Durable Objects WebSocket hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Cloudflare Agents repo: https://github.com/cloudflare/agents
- Cloudflare Workers chat demo: https://github.com/cloudflare/workers-chat-demo
- AWS ALB listener rule docs: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-rules.html
- AWS ALB quotas: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html
- AWS Fargate task storage: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-storage.html
- AWS ECS Fargate task definition differences: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html
- AWS Route 53 wildcard behavior: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DomainNameFormat.html
- AWS S3 versioning: https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html
- AWS S3 Object Lock: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- AWS S3 CloudTrail data events: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html
- Amplify Gen 2 custom resources with CDK: https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/
- Amplify Gen 2 backend overview: https://docs.amplify.aws/react/build-a-backend/
- Miro MCP intro: https://developers.miro.com/docs/mcp-intro
- Miro MCP connection guide: https://developers.miro.com/docs/connecting-to-miro-mcp
- Miro REST API overview: https://developers.miro.com/reference/overview
- Miro REST scopes: https://developers.miro.com/reference/scopes
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk/
- OpenAI agent evals: https://platform.openai.com/docs/guides/agent-evals
- OpenAI trace grading: https://platform.openai.com/docs/guides/trace-grading
- OpenAI safety in building agents: https://platform.openai.com/docs/guides/agent-builder-safety
- OpenAI Codex CLI and ChatGPT sign-in help: https://help.openai.com/en/articles/11381614
- Codex plan usage help: https://help.openai.com/en/articles/11369540
- Hermes Agent repo: https://github.com/NousResearch/hermes-agent
- Hermes Agent Self-Evolution repo: https://github.com/NousResearch/hermes-agent-self-evolution
