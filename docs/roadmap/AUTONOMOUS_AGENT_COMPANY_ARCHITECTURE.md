# Autonomous Agent Company Architecture

_Last updated: 2026-05-09_

Current implementation status is tracked in
`docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md` and
`docs/roadmap/PROJECT_STATUS.md`. This document describes the target product
shape and should be read as architecture guidance, not as the current build
ledger.

## Executive intent

Agents Cloud should become an autonomous AI company platform, not only a job runner.

The product philosophy is CEO-command driven:

```text
CEO/user gives a strategic command
  -> chief-of-staff / executive agent decomposes it
  -> specialist agents are hired or selected
  -> teams work in parallel in isolated containers
  -> research, design, code, tests, artifacts, and reports are produced
  -> humans approve high-risk actions
  -> final outputs are available across web, desktop, mobile, Miro, and preview domains
```

The system should support 24/7 autonomous teams that can:

- create and staff agent teams dynamically,
- delegate and parallelize work,
- run deep research,
- create custom tools,
- write, test, review, and commit code,
- publish websites and documents,
- collaborate on Miro boards,
- emit live GenUI surfaces to every client,
- synchronize messages, status, approvals, notifications, and artifacts across web, desktop, and mobile.

## Architecture Inputs

This document is internal architecture guidance for Agents Cloud. The stable
decisions live in ADRs; this file describes the target product shape.

## Current foundation already in this repo

The current Agents Cloud foundation is directionally aligned, but it is still a platform skeleton.

Already deployed or present:

- CDK platform stacks:
  - foundation
  - network
  - storage
  - state
  - cluster
  - runtime
  - orchestration
- DynamoDB tables:
  - runs
  - tasks
  - events
  - artifacts
  - approvals
  - preview deployments
- S3 buckets:
  - live artifacts
  - audit logs
  - preview static sites
  - research datasets
- ECS cluster and agent-runtime Fargate worker task.
- Step Functions state machine that can launch a Fargate task.
- Amplify Auth sandbox and working Amplify Hosting build.
- Optional wildcard preview ingress stack.

Big missing pieces:

- Control API.
- Real agent runtime image.
- Persistent agent/team/org model.
- Heartbeat scheduler.
- Agent harness adapter layer.
- Cloudflare realtime plane.
- Web/desktop/mobile product clients.
- Miro integration services.
- Preview router implementation.
- Codex OAuth/session handling policy.

## Product mental model

### Core entities

The data model should be closer to a durable company/org model than to a simple queue.

Recommended entities:

```text
Tenant / Company
  Workspace
    Project
      Goal
        Run
          Task
            AgentSession
            ToolCall
            Artifact
            Event
            Approval
            Evaluation
            PreviewDeployment

AgentProfile
  Role
  Job description
  Skills
  Tool permissions
  Model/provider policy
  Budget policy
  Harness adapter
  Memory/context policy
  Quality gates

AgentTeam
  Org chart
  Reporting lines
  Delegation rules
  Shared goals
  Standup/heartbeat cadence
```

### CEO-command flow

```text
1. User: "Create a new product XYZ."
2. Executive agent creates a goal and initial plan.
3. System creates or selects a team:
   - product strategist
   - market researcher
   - UX designer
   - architect
   - engineer
   - QA/reviewer
   - marketing strategist
   - finance/market sizing analyst
4. Each agent gets a scoped task and container workspace.
5. Research and build tasks run in parallel.
6. QA agents verify outputs and request revisions.
7. Human approves high-risk actions.
8. Artifacts are published:
   - report
   - repo branch / PR
   - generated website preview
   - Miro board updates
   - dashboard / GenUI summary
9. Executive summary and next steps are sent to all clients.
```

## Recommended high-level architecture

```text
Clients
  Flutter desktop
  Flutter mobile
  Next.js web
        |
        | Auth + app shell
        v
Amplify / Cognito
        |
        | JWT
        v
Control API on AWS
  API Gateway or ALB/API service
  Lambda or ECS control service
        |
        +--> DynamoDB state tables
        +--> Step Functions orchestration
        +--> EventBridge schedules/heartbeats
        +--> ECS RunTask for isolated agents
        +--> S3 artifacts/previews
        +--> GitHub / repo providers
        +--> Miro OAuth + MCP broker
        +--> Cloudflare realtime publisher

Realtime plane
  Cloudflare Worker
  Durable Object per workspace/run/channel
  Hibernatable WebSockets
  Fanout to web/desktop/mobile
        ^
        |
  AWS events -> EventBridge/Pipes/Lambda publisher -> Cloudflare Worker

Agent runtime plane
  ECS Fargate task per agent/session/task
  EFS or S3-backed workspace snapshots
  ECR images per harness class
  Secrets Manager for scoped credentials
  IAM task role with least privilege
  optional Firecracker/gVisor later for stronger sandboxing

Preview plane
  *.preview.<domain>
     -> Route 53 wildcard
     -> ACM wildcard cert
     -> ALB
     -> preview-router ECS service
     -> preview registry table
     -> static S3 preview or dynamic ECS target
```

## AWS CDK stack plan

The current CDK foundation should be extended with these stacks.

### 1. ControlApiStack

Purpose:

- Main authenticated API for clients and agent callbacks.

Resources:

- API Gateway HTTP API or REST API.
- Cognito JWT authorizer wired to Amplify/Cognito User Pool.
- Lambda router or ECS control service.
- IAM permissions for DynamoDB, Step Functions, S3 signed URLs, EventBridge.

First endpoints:

```text
POST   /runs
GET    /runs
GET    /runs/{runId}
GET    /runs/{runId}/events
GET    /runs/{runId}/artifacts
POST   /runs/{runId}/cancel
POST   /runs/{runId}/approvals/{approvalId}/approve
POST   /runs/{runId}/approvals/{approvalId}/reject
POST   /runs/{runId}/preview
```

Later endpoints:

```text
POST   /agents
GET    /agents
POST   /teams
GET    /teams
POST   /projects/{projectId}/goals
POST   /tools
POST   /miro/connect
GET    /miro/boards
POST   /miro/boards/{boardId}/sync
```

### 2. AgentRegistryStack / StateStack extension

Add tables for:

- companies/tenants
- workspaces/projects
- goals
- agent profiles
- teams/org chart
- agent sessions
- tool registry
- evaluations
- budgets/usage
- schedules/heartbeats

Possible table approach:

- Keep existing purpose-built tables for run/task/event/artifact/approval.
- Add `AgentProfilesTable`, `AgentTeamsTable`, `GoalsTable`, `SchedulesTable`, `ToolRegistryTable`, `EvaluationsTable`, `UsageLedgerTable`.
- Avoid one overloaded single-table design until access patterns are proven.

### 3. AgentRuntimeStack v2

Purpose:

- Harden the agent-runtime worker image path.

Resources:

- ECR repositories:
  - `agent-runtime-hermes`
  - `agent-runtime-codex`
  - `agent-runtime-claude-code`
  - `agent-runtime-open-harness`
  - `agent-runtime-harness-adapter`
- ECS task definitions per worker class.
- Task roles scoped by worker capability.
- CloudWatch log groups with structured JSON logs.
- Optional EFS access point per workspace for long-lived coding workspaces.
- S3 workspace snapshot bucket usage for cheaper durable storage.

Isolation model:

- One ECS task per agent session or task.
- One workspace directory per run/task.
- No shared mutable filesystem across unrelated tenants.
- Scoped IAM per task definition.
- Secrets are injected by reference from Secrets Manager only when allowed by agent policy.

### 4. OrchestrationStack v2

Purpose:

- Support team orchestration, fan-out/fan-in, retries, approvals, and long-running work.

Resources:

- Step Functions standard workflows for long-running durable orchestration.
- Map states for parallel agents.
- Wait-for-task-token states for human approvals and external callbacks.
- EventBridge rules for heartbeats and scheduled agents.
- Dead-letter queues for failed agent starts/events.

Workflow shape:

```text
CreateRun
  -> PlanGoal
  -> CreateTeam
  -> FanOutAgentTasks
  -> QualityReview
  -> If failed: revise/retry
  -> PublishArtifacts
  -> RegisterPreview
  -> ExecutiveSummary
```

Important: Step Functions should orchestrate durable lifecycle, but not contain all agent intelligence. The intelligence lives in agent runtime/harness containers.

### 5. RealtimeBridgeStack

Purpose:

- Bridge AWS durable events into Cloudflare Durable Objects.

Resources on AWS side:

- EventBridge bus for domain events.
- Lambda publisher to Cloudflare Worker endpoint.
- Secrets Manager secret for Cloudflare API/webhook token.
- Optional SQS buffer for retry/backpressure.

Event types:

```text
run.created
run.status_changed
task.created
task.assigned
task.started
task.completed
task.failed
event.appended
artifact.created
approval.requested
approval.resolved
preview.published
notification.created
genui.patch
```

### 6. CloudflareRealtimeStack / Worker project

Cloudflare will not be managed directly by AWS CDK unless we add a provider/custom resource. Prefer a separate `infra/cloudflare` package using Wrangler or Pulumi/Terraform.

Recommended design:

- Worker is stateless HTTP/WebSocket entrypoint.
- Durable Object per workspace/run/channel:
  - `workspace:{workspaceId}` for global workspace notifications.
  - `run:{runId}` for live run detail.
  - `thread:{threadId}` for chat/message sync.
- Use hibernatable WebSockets.
- Batch small event frames to reduce overhead.
- Durable Object stores small recent event cursor/state; DynamoDB/S3 remain source of truth.

Do not use one global Durable Object. Shard by run/workspace.

### 7. PreviewIngressStack v2

Current stack exists; the router currently uses a temporary nginx image.

Upgrade to:

- preview-router service that reads Host header.
- lookup `previewHost` in PreviewDeploymentsTable.
- support static S3 deployments.
- support SPA fallback.
- later support dynamic ECS target/proxy mode.
- support `*.preview.solo-ceo.ai`
- later support customer-owned custom domains.

Preview modes:

```text
static-s3:
  host -> S3 prefix -> file response

dynamic-ecs:
  host -> target service/task -> reverse proxy

hybrid:
  static shell + API proxy
```

### 8. MiroIntegrationStack

Purpose:

- Let agents collaborate on Miro boards, diagrams, docs, tables, flows, and prototypes.

Two integration paths:

#### Miro MCP path

Use Miro's hosted MCP endpoint:

```text
https://mcp.miro.com/
```

Agent runtimes connect through an MCP broker/proxy so credentials and board permissions are not sprayed into every container.

Useful Miro MCP tools:

- board item listing
- context exploration
- context retrieval
- diagram creation
- document update
- image read
- table create/list/sync

#### Miro REST API path

Use OAuth 2.0 authorization code flow for backend integrations.

Store per-user/team tokens in Secrets Manager or encrypted DynamoDB.

Needed capabilities:

- create/update boards
- create frames
- create diagrams/tables/docs
- sync research artifacts into Miro
- use Miro boards as context for coding/design agents

Product pattern:

- Agents can create a strategy board.
- Researcher adds market map and competitor matrix.
- Architect adds system diagram.
- Product agent adds PRD/user flows.
- Designer adds prototype/wireframe frames.
- Executive agent leaves summary comments.

## Agent harness recommendation

No single runtime framework should own the whole platform. The platform should have a two-layer model:

```text
internal company/org control plane
  -> harness adapter layer
      -> isolated worker backends
```

### Best default platform pattern

Use internal organization concepts as the product/control-plane model:

- companies
- goals
- org chart
- agents
- roles
- tickets/tasks
- heartbeats
- budgets
- governance
- audit
- adapters

Use Hermes Agent as the first rich general-purpose runtime because it already provides:

- persistent memory,
- session search,
- native tools,
- skills,
- MCP client,
- browser/web/terminal/file tools,
- subagent delegation,
- multi-provider support,
- runtime adapter precedent.

Use Codex CLI as the first dedicated coding harness for OpenAI/Codex-account workflows.

Use a narrow adapter interface for swappable worker implementations. The durable
run ledger, tenant policy, approvals, and artifact model must remain owned by
Agents Cloud even when individual workers change.

### Why not only a runtime framework?

- Runtime frameworks are useful for task execution, but they should not own the
  company/org/governance/budget product model.
- Durable production state and resumability must stay in the platform control
  plane.
- Provider-specific SDKs are useful behind adapters, but should not define the
  whole platform boundary.

### Recommended harness stack

```text
Control plane / product model:
  Agents Cloud control plane

Primary general agent runtime:
  Hermes Agent via runtime adapter

Primary coding runtime:
  Codex CLI container, authenticated with Codex/ChatGPT where appropriate

Harness abstraction/evaluation:
  Open Harness-style adapter interface

Deterministic workflow engine:
  Step Functions for cloud orchestration
  LangGraph inside selected worker containers for complex resumable agent graphs

Realtime/client rendering:
  GenUI/A2UI event stream emitted by Control API/agents
```

## Self-testing and self-improving loop

The harness must not just run agents. It must evaluate them.

Every serious run should include quality gates:

```text
Plan quality check
Research source quality check
Implementation test check
Security scan
Style/lint check
Artifact validation
Reviewer agent critique
Executive summary check
Human approval where needed
```

Recommended evaluation records:

- expected outcome
- rubric
- tests executed
- reviewer agent verdict
- human verdict
- failure mode
- retry count
- cost/time
- reusable lessons

Self-improvement loop:

```text
1. Agent completes task.
2. Evaluator scores output against rubric/tests.
3. If fail, route back to worker with precise remediation instructions.
4. If repeated fail, escalate to manager/human.
5. Successful strategy/prompt/tool pattern can become a reusable skill/template.
6. Agent profile is updated only after approval or confidence threshold.
```

Do not let agents silently rewrite their own production instructions without review. Treat self-improvement as proposed patches to skills, rubrics, and templates.

## Dynamic expert agent creation

When user asks for a new specialist, e.g. "hire a marketing agent":

```text
1. Intake agent clarifies objective only if required.
2. Research agent performs deep domain research.
3. Meta-agent drafts an AgentProfile:
   - role name
   - responsibilities
   - decision rights
   - tools
   - knowledge sources
   - evaluation rubric
   - communication style
   - budget
   - safety restrictions
4. Evaluator agent tests the profile on benchmark tasks.
5. Human approves creation.
6. AgentProfile is saved and can be assigned work.
```

Marketing-agent example outputs:

- market research rubric,
- campaign strategy rubric,
- competitor analysis checklist,
- channel planning framework,
- positioning framework,
- analytics/reporting expectations,
- examples of excellent vs shallow work.

The key is that a specialist agent is not just a prompt. It is:

```text
profile + tools + knowledge + workflows + tests + budget + governance + memory policy
```

## Codex OAuth / ChatGPT credit usage policy

The user wants to use their Codex OAuth login and credit usage.

Supported path:

- Codex CLI supports ChatGPT OAuth login.
- Codex CLI also supports device auth for headless environments.
- ChatGPT login can use subscription/credit-backed features.

Important constraint:

- OpenAI recommends API-key authentication for programmatic CI/server workflows.
- Running user OAuth sessions in multi-tenant cloud containers has security and account-governance risk.

Recommended architecture:

### Dev/private mode

- User runs `codex login` locally or on a trusted private runner.
- Store Codex auth only in a user-scoped, encrypted secret.
- ECS Codex tasks mount/inject the session only for that user's jobs.
- Never share a Codex session across tenants.
- Add a `CodexCredentialBroker` that refreshes/validates session status and refuses work if login is expired.

### Production/team mode

- Prefer official API keys or enterprise-approved workspace auth.
- Use per-user/team credential records.
- Audit every Codex job against the user/workspace.
- Budget/throttle by user and run.

Do not bake `~/.codex/auth.json` into container images. It must be injected at runtime from an encrypted secret or session broker.

## Client architecture

### Next.js web app

Purpose:

- Primary dashboard and admin console.

Screens:

- login/signup
- dashboard
- companies/workspaces/projects
- CEO command center
- runs list
- run detail
- teams/org chart
- agents directory
- approvals inbox
- artifacts
- previews
- Miro boards
- settings/credentials/budgets

### Flutter desktop app

Purpose:

- Native command center for long-running work, notifications, local files, and developer workflows.

Should sync with web via Cloudflare WebSockets and Control API.

### Flutter mobile app

Purpose:

- CEO-on-the-go control surface.

Core mobile features:

- issue command
- approve/reject actions
- watch live status
- receive push notifications
- open reports/previews
- comment on runs/tasks

### Shared client protocol

Use the same event schema across all clients:

```text
message.created
run.updated
task.updated
approval.requested
artifact.created
preview.published
genui.patch
notification.created
```

Clients should render live GenUI from a controlled component catalog, not arbitrary generated code.

## GenUI architecture

The agents should be able to create custom dashboards and workflow surfaces, but safely.

Recommended model:

```text
Agent emits A2UI/GenUI packet
  -> Control API validates schema and permissions
  -> event stored in DynamoDB/S3
  -> realtime bridge sends `genui.patch`
  -> clients render using approved catalog components
```

Catalog examples:

- status timeline
- org chart
- task board
- market map
- competitor matrix
- report card
- artifact gallery
- code review summary
- test results panel
- preview tile
- approval card
- Miro board embed/reference

Rules:

- No arbitrary JS/Dart from agents in trusted clients.
- Agents submit declarative UI specs only.
- Components are versioned.
- Schemas are validated server-side and client-side.
- Raw JSON/debug views are hidden behind advanced toggles.

## Security and governance

Minimum controls:

- Tenant/workspace isolation.
- Per-agent IAM/task role scoping.
- Per-agent tool permissions.
- Secrets broker; no raw credentials in prompts/logs.
- Human approval for:
  - external spend,
  - deployment/publishing,
  - GitHub write/merge,
  - outbound email/social actions,
  - credential/tool creation,
  - Miro board writes in sensitive workspaces.
- Immutable audit logs for tool calls and approvals.
- Budget controls per tenant/project/agent.
- Kill switch per run/agent/team/company.

## Implementation sequence

### Milestone 1: Control API and real run loop

Goal:

A signed-in user can create a run, Step Functions launches an ECS worker, events are written, and clients can read status.

Build:

- `ControlApiStack`.
- `POST /runs`.
- `GET /runs/{runId}`.
- `GET /runs/{runId}/events`.
- Worker writes real DynamoDB events instead of only CloudWatch logs.

### Milestone 2: Agent runtime image

Goal:

Harden the `agent-runtime-hermes` image.

Build:

- ECR repo.
- Dockerfile.
- worker entrypoint.
- Hermes single-task execution.
- event/artifact writer SDK.
- simple smoke run that creates a markdown report artifact.

### Milestone 3: internal org model

Goal:

Represent teams, roles, goals, heartbeats, tickets, and budgets.

Build:

- agent profiles table.
- teams/org chart table.
- goals table.
- schedules/heartbeats.
- team-planning run type.

### Milestone 4: Next.js web app

Goal:

Expand the web dashboard.

Build:

- `apps/web-next`.
- Amplify Auth wiring.
- dashboard.
- create-run flow.
- run detail timeline.
- artifact list.

### Milestone 5: Cloudflare realtime plane

Goal:

All clients receive synchronized messages, status, notifications, and GenUI patches.

Build:

- `infra/cloudflare` Worker/Durable Objects.
- Durable Object per run/workspace/thread.
- WebSocket auth.
- AWS event bridge publisher.
- client realtime SDK.

### Milestone 6: desktop/mobile clients

Goal:

Native apps share the same command center and realtime state.

Build:

- shared Dart API/realtime client package.
- desktop shell.
- mobile shell.
- push notifications.
- approvals inbox.

### Milestone 7: Preview publishing

Goal:

Agents publish websites to wildcard domains.

Build:

- deploy preview ingress for selected domains.
- implement preview-router.
- `POST /runs/{runId}/preview`.
- static S3 website bundle support.
- dynamic ECS preview support later.

### Milestone 8: Miro integration

Goal:

Agents can read/write Miro boards as collaborative artifacts.

Build:

- Miro OAuth app.
- token storage.
- MCP broker to `https://mcp.miro.com/`.
- board sync actions.
- diagram/table/doc writers.
- UI to connect boards to projects/runs.

### Milestone 9: Self-testing/self-improving harness

Goal:

Every agent output goes through automated review, tests, and reusable learning proposals.

Build:

- evaluation table.
- rubrics.
- evaluator agents.
- failure/retry workflow.
- skill/template proposal system.
- benchmark tasks per agent profile.

## Immediate next build recommendation

Do this next:

1. Build `ControlApiStack` and first run endpoints.
2. Build a minimal real worker that writes events/artifacts.
3. Add a internal `AgentProfile` and `AgentTeam` schema, but do not overbuild the full org UI yet.
4. Add the Next.js command center shell.
5. Add Cloudflare Durable Object realtime after polling works.

Reason:

The platform needs a real end-to-end loop before more UI or advanced agent-team abstractions. Once the loop exists, agent teams, Miro, previews, GenUI, and Codex containers can plug into it cleanly.
