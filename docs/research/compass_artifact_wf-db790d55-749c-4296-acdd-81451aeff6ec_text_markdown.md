# Architecture Plan: Autonomous AI Agents Platform (AWS + Cloudflare Hybrid)

## TL;DR

- **Build the agent layer on the Claude Agent SDK as the primary harness, wrapped in a thin meta-orchestrator that adds a Sakana-DGM-inspired self-improvement loop and a "deep-research agent factory" for spawning specialty agents; treat Hermes Agent (Nous Research), Letta, and Mastra as secondary/optional runtimes (not Pi — Inflection AI's Pi is a consumer chatbot with no agent SDK and is not a viable harness in 2026).** The Claude Agent SDK ships the same loop that powers Claude Code, has measurably superior performance (78% vs 42% on CORE for Smolagents), supports subagents, hooks, MCP, and is the de facto standard harness in 2026.
- **Use ECS Fargate (not EC2) for per-agent isolation behind an ALB with a Route 53 wildcard `*.app.com` record and an ACM wildcard cert; orchestrate agent lifecycle (spawn/tear-down) via a dedicated "AgentManager" Lambda + Step Functions, with EventBridge/SQS for inter-agent messaging, DynamoDB for agent state, and S3 for artifacts.** Fargate's 20–30% premium is worth it for the per-task isolation, fast spawn, and zero-ops profile that an "AI company" with hundreds of ephemeral agents needs.
- **Put Cloudflare Workers + Durable Objects (one DO per user session, hibernatable WebSockets) in front of AWS as the real-time sync fabric for Flutter (mobile/desktop) and Next.js (web) clients, and implement Generative UI via Google's A2UI protocol — `flutter/genui` on Flutter and Vercel AI SDK 5 `useChat` with typed tool parts on Next.js — so a single agent response renders identical UI everywhere.** For auth, use AWS Cognito for user identity and store the user's OpenAI Codex OAuth tokens (PKCE flow, `app_EMoamEEZ73f0CkXaXp7hrann` client) in AWS Secrets Manager per-user, refreshed by a Lambda; treat Codex OAuth's "personal use only" terms as a real legal risk and offer Anthropic API key as the production-safe fallback.

---

## Key Findings

1. **The harness matters more than the model.** On the CORE benchmark, the same Claude Opus 4.5 model scores 78% with the Claude Code/Agent SDK harness vs 42% with Smolagents — a 36-point gap from harness design alone. Picking the right harness is the single highest-leverage decision.
2. **Claude Agent SDK is the 2026 default.** It exposes the exact same loop as Claude Code (renamed in March 2026), supports subagents with isolated context windows, MCP servers, hooks (PreToolUse/PostToolUse/Stop), filesystem-based skills, sessions with resume/fork, and Anthropic publishes proven patterns for long-running multi-context-window agents (initializer agent + `claude-progress.txt` + GAN-style generator/evaluator).
3. **Hermes Agent (Nous Research) is the best self-improving secondary harness** — MIT license, built-in learning loop (skills auto-generated from sessions, three-layer memory, agentskills.io standard), spawns isolated subagents with five backends (local, Docker, SSH, Singularity, Modal). It is open-source infrastructure, not a managed service. Hit 95K GitHub stars within ~7 weeks of February 2026 launch.
4. **Pi (Inflection AI) is not an agent harness.** It is an emotionally-intelligent consumer chatbot. Inflection licensed its core models to Microsoft (Azure) in 2024 and there is no agent SDK comparable to Claude/Hermes. Drop it from the harness shortlist.
5. **Sakana AI's Darwin Gödel Machine (DGM) is the reference design for self-improving agents.** ICLR 2026 oral, MIT-licensed companion `hermes-agent-self-evolution` uses DSPy + GEPA. DGM improved 20%→50% on SWE-bench by rewriting its own code via evolutionary archive selection. This is the pattern to copy for the meta-agent.
6. **Cloudflare Durable Objects with WebSocket Hibernation is the right sync layer.** One DO per user session/project, hibernatable connections (no GB-s charges while idle), built-in SQLite for per-session state, and `idFromName()` for globally consistent routing — exactly the primitive needed to keep Flutter, desktop, and Next.js in sync.
7. **Generative UI has converged on Google's A2UI protocol** (announced Dec 2025, Apache 2.0). `flutter/genui` (alpha on pub.dev) and the `@ai-sdk/react` `useChat` typed tool parts in AI SDK 5 both render the same JSON component descriptions, solving the cross-client GenUI problem cleanly. Vercel's RSC `streamUI` API is now in "paused development" — do not build new code on it.
8. **Miro's official MCP server (`https://mcp.miro.com/`) is OAuth 2.1 with Dynamic Client Registration.** It plugs directly into the Claude Agent SDK's MCP support (`claude mcp add --transport http miro https://mcp.miro.com`), giving agents native tools to read/write Miro boards as artifacts.
9. **Codex OAuth from a server-side platform is legally murky.** OpenAI's official policy is that Codex CLI sign-in with ChatGPT is for personal coding assistance; the system prompt must contain `"You are Codex, based on GPT-5..."` and the public client ID is `app_EMoamEEZ73f0CkXaXp7hrann`. Multiple community plugins (OpenCode, Cline, OpenClaw) implement this; OpenAI has confirmed it's allowed for "external tools like OpenClaw" but commercial multi-user resale is not. The platform should support it for the user's own credentials only and offer Anthropic API keys as the recommended path for production workloads.
10. **ECS Fargate is the correct choice for this workload.** EC2 is ~20–30% cheaper at high utilization, but agent containers are bursty, short-lived, per-tenant, and require strict isolation — Fargate's per-task billing, awsvpc-per-task ENI, and zero-ops model dominate for that profile. Fall back to ECS Managed Instances (launched 2025) only if monthly bill exceeds ~$10K/month and utilization is consistently >70%.

---

## Architecture Diagram (Components and Data Flow)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            CLIENTS (3 surfaces)                              │
│  Flutter Mobile/Desktop (genui SDK)   ◄── A2UI JSON ──►   Next.js Web        │
│  └──────────────┬─────────────────────────────────────────────┬──────────────┘
│                 │            WebSocket (WSS)                  │
│                 ▼                                             ▼
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                  ┌─────────────────┴──────────────────┐
                  │   CLOUDFLARE EDGE (sync fabric)    │
                  │  • Worker (auth, rate-limit, route)│
                  │  • Durable Object per session      │
                  │    (hibernatable WS, SQLite, fan-  │
                  │     out, message log, presence)    │
                  │  • R2 (large artifact CDN cache)   │
                  └─────────────────┬──────────────────┘
                                    │ Service Bindings → AWS API GW
                                    │ (mTLS, Cloudflare Tunnel, or signed JWT)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              AWS (control + compute)                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │              Amplify Gen 2 backend (CDK-extended)           │             │
│  │  AppSync GraphQL  • Cognito User Pool  • DynamoDB (state)   │             │
│  └────────────────────────────┬────────────────────────────────┘             │
│                               │                                              │
│  ┌─────────────────┐    ┌─────▼──────────┐    ┌────────────────────────┐     │
│  │  EventBridge    │◄──►│ AgentManager   │───►│ Step Functions          │    │
│  │  (events)       │    │ Lambda         │    │ (CEO→Exec→Team workflows)│   │
│  │  SQS (msg bus)  │    └─────┬──────────┘    └────────────────────────┘     │
│  └─────────────────┘          │ ECS RunTask API                              │
│                               ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │           ECS FARGATE CLUSTER (per-agent isolation)                  │    │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ Exec.Asst   │  │ Marketing   │  │ Researcher  │  │ Coder       │  │    │
│  │  │ Agent task  │  │ Team task   │  │ Subagent    │  │ Subagent    │  │    │
│  │  │ (Claude SDK)│  │ (Claude SDK)│  │ (Claude SDK)│  │ (Claude SDK)│  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │    │
│  │         └─────────┬──────┴────────┬───────┴────────┬───────┘         │    │
│  │                   │               │                │                  │   │
│  │             Each task = its own ENI in awsvpc, IAM role,              │   │
│  │             Secrets Manager access, sub-domain via ALB host header    │   │
│  └────────────────────────────────┬─────────────────────────────────────┘    │
│                                   │                                          │
│  ┌──────────┐  ┌──────────┐  ┌────▼─────────┐  ┌──────────┐  ┌───────────┐   │
│  │ ECR      │  │ S3       │  │ ALB          │  │ Route53  │  │ Secrets   │   │
│  │ (images) │  │ (artifacts)│ (host-routes │  │ *.app.com│  │ Manager   │   │
│  │          │  │           │ │ to tasks)    │  │ wildcard │  │ (Codex,   │   │
│  │          │  │           │ │              │  │ A → ALB  │  │  API keys)│   │
│  └──────────┘  └──────────┘  └──────────────┘  └──────────┘  └───────────┘   │
│                                                                              │
│  CloudWatch Logs/Metrics  •  X-Ray traces  •  GuardDuty  •  VPC w/ NAT GW    │
│                                                                              │
│  External MCP Servers (called from agent containers):                        │
│   ─ Miro MCP (https://mcp.miro.com/, OAuth 2.1)                              │
│   ─ GitHub, Linear, etc. via MCP                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Data flow (CEO command path):** CEO types in any client → message hits Durable Object via WSS → DO appends to log + fans out to other connected clients of the same user → DO calls AWS API Gateway → AgentManager Lambda routes to the user's "Executive Assistant" ECS task (via ECS ExecuteCommand or an internal HTTP endpoint on the task's ENI) → Exec Assistant uses Claude Agent SDK subagents, optionally provisioning new ECS tasks via `RunTask` for specialist teams → tasks publish progress events to EventBridge → an event-bridge-to-DO Worker pushes updates back through the DO → all clients receive A2UI patches and render the live dashboard.

---

## Details

### 1. Agent Harness Selection + Reasoning (Core Deep Dive)

**Decision: Claude Agent SDK as the primary harness, with a thin custom meta-orchestrator on top.**

Comparison of the realistic 2026 candidates:

| Harness | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **Claude Agent SDK** (Python + TS) | Same loop as Claude Code; subagents w/ isolated context; MCP; hooks; filesystem skills; built-in compaction; published long-running patterns; 78% on CORE | Anthropic-only models in production (Bedrock OK); subscription OAuth limited to "official Anthropic clients" per ToS | **Primary harness** |
| **Hermes Agent** (Nous Research) | MIT license; self-improving loop (skill auto-gen, 3-tier memory); model-agnostic (Nous Portal, OpenRouter, OpenAI, Anthropic); five exec backends incl Modal; Programmatic Tool Calling collapses pipelines into single inference | Newer, smaller production track record; security concern: skills persisted on disk are an injection vector | **Secondary / specialty harness** when self-improving compounding is needed |
| **Letta (MemGPT)** | Best stateful memory (core/recall/archival); REST/Postgres backed; Letta Code is #1 model-agnostic OSS on Terminal-Bench | Memory-first paradigm is heavier than needed for ephemeral coding subagents | Use for **long-lived "company employee" agents** (the Executive Assistant, persistent specialists) |
| **Mastra** (TS) | TypeScript-first (matches CDK + Next.js stack); 3,300+ models via router; suspend/resume workflows; integrates with Vercel AI SDK and CopilotKit | Younger; less proven on long-horizon autonomous tasks | Use for **TypeScript backend orchestration** code that lives next to the Amplify backend |
| **LangGraph** | Best fault-tolerant graph state machines; checkpointing/time-travel; LangSmith tracing; 62% on complex tasks (highest in category) | Steep learning curve; verbose | Use only if you need bulletproof DAG workflows with human-in-loop |
| **CrewAI** | Fastest to prototype role-based teams; YAML; 31K stars | Mediocre logging; weaker on cycles; loses on complex tasks | Skip — Claude Agent SDK subagents cover this better |
| **AutoGen / AG2** | Conversational GroupChat patterns | Microsoft moved focus to Microsoft Agent Framework (Oct 2025); effectively maintenance | Skip |
| **OpenAI Agents SDK** (Swarm successor) | Clean handoff API | OpenAI-only; ephemeral context; coarse error handling | Skip as primary; reasonable if you must use Codex |
| **Smolagents** (HF) | Code-as-action paradigm | Scored 42% on CORE vs Claude SDK's 78% | Skip |
| **OpenHands** | Strong end-to-end coding agent; production sandboxing via Daytona | Specialized to coding; less general | Embed as a specialty **coding-task subagent**, not the main harness |
| **Sakana DGM / ALE-Agent** | State-of-the-art self-improvement research | Proprietary research code, not a productizable SDK | Copy the **architecture pattern**, not the code |
| **Pi (Inflection)** | n/a | Consumer chatbot only; models licensed to Microsoft Azure; no agent SDK | **Drop** |

**Recommended hybrid stack:**

1. **Claude Agent SDK (TypeScript)** is the runtime inside every ECS container. It gets the system prompt, tools (incl. MCP), and permissions for that agent.
2. **A custom Meta-Agent (Mastra-based, TS)** sits above and implements:
   - The "agent factory" (deep research → spawn specialist) — see §6.
   - The Sakana-DGM-style self-improvement loop: keep an archive of agent definitions (system prompt + tool config + skill files) in DynamoDB, score them on task outcomes via an evaluator agent (GAN-style, per Anthropic's harness-design blog), and let the meta-agent propose mutated variants.
   - Routing of tasks to either Claude Agent SDK (default), Hermes Agent (when persistent learning is desired), or Letta (when long-term memory is critical).
3. **Letta** runs as a sidecar service for "permanent employee" agents (Executive Assistant, the user's hired specialists), giving them durable identity and core memory blocks across months.
4. **OpenHands SDK** is invoked as a tool when an agent needs heavy autonomous coding inside a sandboxed environment.

**Why Anthropic's own engineering blog matters here:** Anthropic published two pieces in late 2025 ("Effective harnesses for long-running agents" and "Harness design for long-running application development") that directly address the user's "build a clone of claude.ai from one prompt" use case. Their proven recipe — initializer agent writes feature spec + `claude-progress.txt`; coding subagents work feature-by-feature; separate evaluator agent grades against criteria; context resets between sessions — is the blueprint to copy. Implementing this on top of Claude Agent SDK means the platform inherits Anthropic's R&D for free.

### 2. CEO / Multi-Agent Orchestration Pattern (Core Deep Dive)

**Hierarchy (mirrors a real org chart):**

```
CEO (human user)
  └── Executive Assistant (Letta agent, persistent, 1 per user)
         ├── VP/Director agents (Letta, persistent; one per "department" the CEO has hired)
         │     └── Team Lead agents (Claude Agent SDK, semi-persistent)
         │            └── Worker subagents (Claude Agent SDK, ephemeral, one per task)
         │                   └── Tool subagents (research, coding, browse, draw)
```

**Implementation:**

- **Executive Assistant** is the only agent the CEO talks to directly. It runs in a long-lived ECS Fargate service (not a one-shot task), backed by Letta core memory: who the CEO is, hired departments, ongoing initiatives, preferences. It has `delegate(department, brief)` and `hire(role, requirements)` tools.
- **Delegation = `RunTask`.** When the Exec Assistant calls `delegate("marketing", "...")`, an EventBridge event triggers AgentManager Lambda → `ecs.runTask` with the marketing team's task definition, injecting the brief via container environment variables (small) or an S3 pointer (large). The new task starts on a sub-domain (`run-{ulid}.app.com`) so the CEO can visit the live workspace.
- **Parallel work.** The orchestrator pattern is "fan-out via EventBridge, fan-in via DynamoDB conditional writes." Each subagent writes its result to a `taskRun` item with a `status` field; a reducer Lambda (triggered by DynamoDB Streams) detects when all subagents of a parent are `done` and pushes the consolidated result back up.
- **Step Functions** is reserved for *deterministic* orchestration where the user wants guaranteed retry/replay (e.g., the deep-research pipeline in §6). For LLM-driven agent-to-agent dynamics, prefer EventBridge + SQS — Step Functions' state machine model fights you when the graph is dynamic.
- **Inter-agent messaging.** SQS FIFO queues per parent agent, named `agent-{parentId}.fifo`. Subagents push status messages; parent's Claude Agent SDK loop polls via a custom `mcp__inbox__poll` tool. This sidesteps the "agents waste tokens watching each other" anti-pattern.
- **Returning to the CEO.** When the CEO opens any client, the Durable Object replays the last N messages from its SQLite-backed log (zero-latency per Cloudflare's spec) and subscribes to live updates. The Exec Assistant's "morning briefing" tool generates a structured A2UI surface — exec summary, completed work, competitor analyst findings, market-size cards, "next steps" actionable list — rendered identically in Flutter and Next.js.

**The "hire a marketing team" command** flows: CEO message → DO → Exec Assistant agent → calls `hire(role="marketing team")` → triggers the **Specialty Agent Creation Flow** (§6) → that flow returns a new task definition ARN + Letta agent config → registered in DynamoDB → next time CEO says "marketing, do X" the Exec Assistant has a real subordinate.

### 3. ECS + Route 53 Wildcard Architecture (Core Deep Dive)

**Choice: Fargate (not EC2).** Justifications:
- **Per-tenant isolation** — Fargate gives each task its own micro-VM (Firecracker), kernel-level isolation. Critical when agents commit code, run shell, browse the web.
- **Spawn time** — `RunTask` cold-start is 30–60s on Fargate, fast enough for "hire a team" UX. EC2 capacity providers add cluster-scale-out latency.
- **Bursty workload** — Agents are inherently bursty; you don't want to pay for idle EC2.
- **Awsvpc-per-task ENI** — Fargate forces this, which is exactly what we need for sub-domain routing.
- **The 20–30% cost premium is the right trade-off** until monthly Fargate spend is sustained over ~$10K/month and utilization is consistently >70%, at which point migrate hot, long-running services (Exec Assistant, ALB-fronted website hosts) to **ECS Managed Instances** (launched 2025: EC2 economics + AWS-managed ops + $0.02/hr management fee). Keep ephemeral subagents on Fargate forever.

**Wildcard sub-domain routing (the `xyz.app.com` requirement):**

1. **Route 53** hosted zone for `app.com`, with one record:  
   `*.app.com` → Alias A → ALB DNS name.
2. **ACM wildcard certificate** issued for `*.app.com` and `app.com` in `us-east-1` (CloudFront-compatible) and the ALB region.
3. **ALB** has a single HTTPS listener on 443 with the wildcard cert. **Listener rules** dynamically match `Host: <project-id>.app.com` → forward to the **target group bound to that ECS task**.
4. **Dynamic listener rule provisioning.** When AgentManager spawns a project-website task:
   - Create a target group `tg-{projectId}` (IP target type, awsvpc).
   - Register the task's private IP after `ecs.describeTasks` returns it.
   - Create an ALB listener rule with `host-header: {projectId}.app.com` → `tg-{projectId}`. Priority is hash-of-projectId modulo a large prime to avoid collisions.
5. **Cleanup.** A scheduled Lambda removes listener rules + TGs for tasks that have been `STOPPED` for >30 minutes.

**Important caveat the user needs to know:** Route 53 wildcards match all sub-levels (`a.b.app.com` matches `*.app.com`). If you only want one level, create explicit non-wildcard records for known sub-domains (e.g., `api.app.com`, `auth.app.com`) — those take precedence per Route 53's specificity rules. Plan for this from day one so SSL doesn't break.

**Critical CDK snippet (TypeScript) — recommended over Python because it matches the rest of the stack (Next.js, Mastra, Cloudflare Workers, Flutter codegen all play nicely with TS):**

```typescript
// stacks/agents-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class AgentsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1, // cost-optimized; bump to 2 for HA
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
      ],
    });

    const cluster = new ecs.Cluster(this, 'AgentsCluster', {
      vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: 'app.com' });
    const cert = new acm.Certificate(this, 'WildcardCert', {
      domainName: 'app.com',
      subjectAlternativeNames: ['*.app.com'],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc, internetFacing: true, http2Enabled: true,
    });

    const listener = alb.addListener('Https', {
      port: 443,
      certificates: [cert],
      defaultAction: elbv2.ListenerAction.fixedResponse(404),
    });

    new route53.ARecord(this, 'WildcardA', {
      zone, recordName: '*',
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
    });

    // ECR repo for agent images, agent task definition, AgentManager Lambda
    // and an SSM parameter publishing { albArn, listenerArn, clusterArn, vpcId,
    // privateSubnetIds[], securityGroupId } so the Lambda can call
    // elbv2.CreateTargetGroup + CreateRule + ecs.RunTask at runtime.
    new ecr.Repository(this, 'AgentImage', { repositoryName: 'agent-runtime' });
  }
}
```

The AgentManager Lambda then calls `ecs.RunTask` with `networkConfiguration.awsvpcConfiguration.subnets = [private subnets]`, `assignPublicIp = 'DISABLED'`, and tags `projectId` so it can find the task's IP and wire the ALB rule.

### 4. Cloudflare Durable Objects WebSocket Sync Layer (Core Deep Dive)

**Topology: one DO per user session, optionally one DO per project.**

```typescript
// worker/src/index.ts (Cloudflare Worker)
import { Hono } from 'hono';
export { SessionDO } from './session-do';

const app = new Hono<{ Bindings: { SESSION: DurableObjectNamespace } }>();

app.get('/ws/:userId', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('expected ws', 426);
  const id = c.env.SESSION.idFromName(c.req.param('userId'));
  return c.env.SESSION.get(id).fetch(c.req.raw);
});

app.post('/agent-event/:userId', async (c) => {
  // Called from AWS via signed JWT; pushes events from EventBridge into the DO.
  const id = c.env.SESSION.idFromName(c.req.param('userId'));
  return c.env.SESSION.get(id).fetch(c.req.raw);
});

export default app;
```

```typescript
// worker/src/session-do.ts
import { DurableObject } from 'cloudflare:workers';

export class SessionDO extends DurableObject {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      // HIBERNATABLE: no GB-s charges while idle; CF wakes us on message.
      this.ctx.acceptWebSocket(pair[1]);
      const clientId = crypto.randomUUID();
      pair[1].serializeAttachment({ clientId, joinedAt: Date.now() });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname.endsWith('/agent-event')) {
      const event = await req.json();
      await this.ctx.storage.sql.exec(
        'INSERT INTO log (ts, kind, payload) VALUES (?, ?, ?)',
        Date.now(), event.kind, JSON.stringify(event),
      );
      this.broadcast(event);
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const data = JSON.parse(msg as string);
    if (data.type === 'user-input') {
      // Forward to AWS API GW → AgentManager → Exec Assistant ECS task.
      await fetch(this.env.AWS_AGENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${await this.signJwt()}` },
        body: JSON.stringify({ userId: this.ctx.id.name, ...data }),
      });
    }
    // Echo to other clients of this user (cross-device sync).
    this.broadcast({ kind: 'user-input', ...data }, ws);
  }

  webSocketClose(ws: WebSocket) { /* cleanup */ }

  private broadcast(event: unknown, except?: WebSocket) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) try { ws.send(payload); } catch {}
    }
  }
}
```

**Why this design:**
- **Hibernation**: CF docs explicitly state hibernatable WebSockets eliminate GB-s costs during idle periods. For a "24/7 agent platform" where most users will have multiple devices connected but idle most of the time, this can be 100–1000× cheaper than a custom WS server.
- **Strong consistency**: All three clients of one user hit the same DO instance globally. Message ordering, presence, and "last status" are trivially correct.
- **Built-in SQLite**: 1 GB per DO (10 GB at GA), zero-latency. Perfect for the per-session message log + last-N for replay.
- **Single source of truth for live status, notifications, input**: The DO owns it; the DO broadcasts; clients are dumb subscribers.
- **AWS bridge**: AWS pushes events into the DO via a Worker route protected by signed JWT (HMAC with a key in AWS Secrets Manager + matching secret in CF Worker env). Use the **gateway pattern** from Cloudflare's reference architecture: the Worker is the trust boundary, the DO and AWS trust it.

**Batching guidance (per CF docs):** Each WS frame incurs a kernel↔V8 context switch. Batch high-frequency agent progress events (50–100ms windows) into a single message frame. This is critical when many sub-agents are streaming progress.

**One-DO-per-project variant:** When the user opens a project workspace, the client opens a *second* WS to a project-scoped DO (`idFromName(projectId)`). This DO holds the live A2UI surface, collaborator presence, and per-project state. Use this when projects are shared across users.

### 5. Generative UI Strategy across Flutter + Next.js (Core Deep Dive)

**Decision: standardize on Google's A2UI protocol** (Apache 2.0, announced Dec 2025; backed by Google, CopilotKit, Lit/Angular/React/Flutter renderers).

**Why A2UI over alternatives:**
- It's the only protocol that has *first-party renderers in both Flutter and React*, plus Angular/Lit. Flutter's `genui` package is built on A2UI; CopilotKit has a React renderer.
- Adjacency-list component model + reference IDs → LLMs generate it incrementally, streaming partials render naturally.
- Framework-agnostic, JSON-based, no executable code → safe across trust boundaries.
- Vercel's RSC-based `streamUI` is officially in "paused development"; Anthropic's "artifacts" are a closed format. A2UI is the only durable bet.

**Flutter (mobile + desktop, single codebase):**
- Use `package:genui` (alpha on pub.dev) + `package:genui_a2a` for A2UI transport.
- Define a **widget catalog** that mirrors your design system (cards, charts, forms, sliders, KPI tiles, miro-board-preview, code-diff view, etc.).
- The agent emits A2UI JSON; `SurfaceController` deserializes and instantiates Flutter widgets natively.
- For non-AI screens (settings, login), use plain Flutter; A2UI is for agent-driven content surfaces only.
- Flutter's GenUI SDK is alpha — expect API churn. Pin a version, plan for a migration. Andrea's Code With Andrea Dec 2025 newsletter explicitly cautions about API stability.

**Next.js (web):**
- Use Vercel **AI SDK 5** (`@ai-sdk/react` `useChat`). The new transport-based architecture, typed `tool-{toolName}` parts, and `data-*` parts are exactly what A2UI needs.
- Implement a small adapter: `<A2UISurface stream={uiMessageStream} />` — when the assistant streams a `tool-render-surface` part with an A2UI payload, render via a React A2UI renderer (CopilotKit's open-source one, or roll your own; the spec is small).
- For chat itself, AI SDK Elements + the standard `parts` rendering covers messages, code, tool invocations.
- **Do not use** the deprecated `streamUI` / RSC `createStreamableUI` path for new code.

**Single agent, multi-client GenUI flow:**

```
Agent (Claude Agent SDK)
   │  uses tool: render_dashboard({ surfaceId, components: [...] })
   ▼
Custom MCP server "ui-surface" packs into A2UI JSON
   ▼
Streams as data-part in AI SDK 5 stream  AND  posts to DO via /agent-event
   ▼
DO broadcasts to all 3 clients
   ├─► Next.js: <A2UISurface> renders React components
   └─► Flutter mobile/desktop: SurfaceController renders native widgets
```

User interactions on either client (e.g., button click, slider drag) update the A2UI DataModel locally → patch is sent to the DO → DO broadcasts to other clients → Worker forwards to AWS → agent sees state change as a tool result. This is the "high-bandwidth interaction loop" the Flutter team's blog describes, but extended cross-platform via the DO.

**Live/streaming UI:** AI SDK 5's `tool-input-delta` parts let the model stream partial component descriptions; A2UI's incremental update format means you can render skeleton → partial → final without flicker. Set the AI SDK 5 `experimental_throttle` to ~50ms to coalesce updates.

### 6. Specialty Agent Creation Flow (Core Deep Dive)

When the CEO says "hire a marketing team", the meta-agent kicks off this **deterministic Step Functions workflow** (this is one of the few places Step Functions is the right answer — guaranteed retry, traceability, replayable):

```
1. ResearchPhase (parallel branches):
   a. Web research subagent (Claude Agent SDK + WebSearch tool)
      → "What does a senior marketing leader know? Frameworks, mental
         models, metrics, common mistakes, leading practitioners,
         seminal books, current 2026 best practices."
   b. Internal context subagent (reads CEO's product docs from S3 + Miro)
   c. Competitor scan subagent (browses competitor sites, summarizes
      positioning).
2. SynthesisPhase:
   - Single Claude Opus 4.5 call with extended thinking, given all
     research outputs, produces:
       • Domain knowledge document (5–15K tokens)
       • Recommended sub-roles ("brand strategist", "growth marketer",
         "content lead")
       • System prompt for each role (using Anthropic's harness blog's
         "criteria-based" prompt patterns)
       • Tool list per role (e.g., growth marketer needs analytics,
         content lead needs writing + image gen)
       • Eval rubric: 5–10 criteria with scoring scales (Anthropic's
         GAN-evaluator pattern)
3. KnowledgeBasePhase:
   - Chunk + embed the domain knowledge → write to a per-team OpenSearch
     Serverless collection (or pgvector on Aurora Serverless v2). Wire
     a `domain_kb_search` MCP tool to the team's task definition.
4. ProvisionPhase (CDK + AWS SDK):
   - Register a new ECS task definition (image: `agent-runtime:latest`,
     env: AGENT_ROLE, SYSTEM_PROMPT_S3, KB_ENDPOINT, EVAL_RUBRIC_S3).
   - Create a Letta agent for each persistent role, with core memory
     blocks: persona = role description, human = CEO profile, tools
     list, eval rubric.
   - Store agent metadata in DynamoDB `Agents` table.
5. SelfTestPhase (the harness's self-test requirement):
   - Generator/evaluator GAN loop (per Anthropic harness blog):
       • Generator agent runs 5 sample tasks from the rubric.
       • Evaluator agent (different system prompt, "be skeptical")
         scores against the rubric.
       • If avg score < threshold, MutationPhase rewrites system prompt
         + tool descriptions and retries (up to N=5).
6. CommitPhase:
   - Once passing, expose the new team as a delegate target on the
     Executive Assistant. Push notification to all 3 clients:
     "Marketing team is online (3 specialists, 12 tools)."
```

**Why this is decisive:** It directly maps to the Sakana DGM / ALE-Agent pattern the user pointed at, but uses *workflow* self-improvement (mutation between deployments) rather than runtime code-rewriting (which is risky in production). Combined with Hermes Agent's auto-skill-generation enabled inside each container, the system gets compounding improvement at two timescales: per-session (Hermes) and per-mission (DGM-style).

**Self-improvement at runtime** (lighter, always-on): every agent run emits a `trajectory` to S3 + an episodic memory write in Letta. Nightly, a Lambda samples trajectories, runs them through a "lessons-learned" Claude call, and appends new bullet points to the role's system prompt skill files (Claude Agent SDK reads `.claude/skills/*.md` automatically). This is the Hermes self-evolution pattern, scoped to the agent factory's outputs.

### 7. Amplify Gen 2 Setup (Higher Level)

Amplify Gen 2 is **TypeScript-first and layered on top of CDK** — it wraps L3 constructs for Auth (Cognito), Data (AppSync + DynamoDB), Storage (S3), and Functions (Lambda), and you can drop down to raw CDK for everything else (the ECS stack above). This is a great fit because:
- The web app's CRUD surfaces (user profile, project list, billing, settings) can be generated with `defineData` + a Zod-like schema.
- AppSync GraphQL with subscriptions is the right backplane for *non-realtime-critical* data (the realtime-critical path is the DO).
- Cognito user pool here (see §9) is the user identity store.
- Custom CDK constructs in `amplify/custom/` host the AgentsStack from §3, the Step Functions workflow from §6, and the EventBridge rules.

**Sandbox per developer** (`npx ampx sandbox`) gives every engineer a full ephemeral backend. Branch-based deployments deploy preview environments per Git branch. This is the cheapest way to give the agent platform's own engineers their own playgrounds.

**Tradeoff to flag:** Amplify Gen 2's Next.js SSR support has limits on edge API routes / on-demand ISR / streaming. Since the agent UI heavily streams, host the Next.js app on **Vercel** (or AWS Amplify Hosting with SSR caveats) and use Amplify Gen 2 *only* for the backend. This is officially supported — Amplify Gen 2 doesn't require Amplify Hosting.

### 8. Miro MCP Integration (Higher Level)

**Use the official Miro MCP server at `https://mcp.miro.com/`** (OAuth 2.1 with Dynamic Client Registration). It plugs straight into the Claude Agent SDK:

```ts
// inside an agent container's startup
const options: ClaudeAgentOptions = {
  mcpServers: {
    miro: {
      type: 'http',
      url: 'https://mcp.miro.com/',
      // OAuth token retrieved from Secrets Manager, scoped to this user's Miro team
      authToken: await getSecret(`/users/${userId}/miro/oauth_token`),
    },
  },
  allowedTools: ['mcp__miro__*', 'WebSearch', 'WebFetch', 'Bash', 'Edit'],
};
```

**OAuth flow:**
1. User clicks "Connect Miro" in the web app → opens Miro's OAuth consent for the chosen Miro team.
2. Callback to AWS API GW → Lambda exchanges code → stores access + refresh token in `/users/{userId}/miro/*` in Secrets Manager.
3. A refresher Lambda (EventBridge cron, every 30min) refreshes tokens before expiry.

**Capabilities unlocked:** Agents can read board context (frames, sticky notes, shapes), create diagrams, summarize boards, and produce Flows / Sidekicks / Prototypes outputs. Combined with the spec from Miro's "Create with AI" docs, the marketing team agent can, e.g., turn a competitor analysis into a Miro prototype board automatically.

**Enterprise note from Miro's docs**: on Enterprise plans, the admin must enable the MCP server first. Document this for users on enterprise Miro tenants.

**Architecture subtlety:** Don't have *every* subagent call Miro directly — you'll burn through Miro's rate limits. Funnel Miro calls through a single "Miro tool subagent" with a queue (SQS), rate-limited by token bucket.

### 9. Authentication (Higher Level)

**Layered design:**

1. **User identity** — Amazon Cognito User Pool (managed by Amplify Gen 2 `defineAuth`). Supports email/password, Google/Apple SSO. Returns JWT used by Next.js, Flutter, and the Worker (Worker validates Cognito JWT via JWK).
2. **Agent inference credentials — two paths:**
   - **(Recommended for production):** Anthropic API key in AWS Secrets Manager, used by Claude Agent SDK in containers. Predictable cost, no ToS gray area.
   - **(Optional, user-funded):** **OpenAI Codex OAuth** lets the user use their own ChatGPT Plus/Pro subscription as the inference budget.
     - PKCE OAuth flow against `https://auth.openai.com/oauth/authorize` with public client ID `app_EMoamEEZ73f0CkXaXp7hrann`.
     - Required system prompt prefix: `"You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's ..."` — without this, requests are rejected.
     - Auto-refresh tokens before 5-minute expiry margin.
     - Store per-user in Secrets Manager at `/users/{userId}/codex/oauth.json`.
   - **(Alternative):** **Claude Code OAuth token** (`sk-ant-oat01-...`) generated via `claude setup-token`. One-year long-lived. Works only against Claude Code endpoints, not the standard Messages API — a community pattern is to proxy via a localhost translator. **Anthropic's ToS technically forbids third-party OAuth** for agents built on Claude Agent SDK; their official guidance (per the Claude Agent SDK docs) is to use API key auth. Don't ship this for paid users.
3. **MCP / external tool credentials** — Per-user, per-tool OAuth (Miro, GitHub, Linear, Slack), stored in Secrets Manager keyed by `userId/service`.

**Hard recommendation:** Default to Anthropic API keys (your platform pays, you bill the user a markup). Offer Codex OAuth as an opt-in "bring your own ChatGPT subscription" mode but **make the user accept a clear notice that this is governed by OpenAI's terms and is for personal use**. Treat this as a feature for a private trusted-runner mode, not for a multi-tenant SaaS resold to others — that path violates OpenAI's policies.

### 10. Observability + Cost (Higher Level)

**Observability stack:**
- **CloudWatch Logs** for every ECS task (driver: `awslogs`, log group per agent role).
- **CloudWatch Container Insights** for cluster metrics; **OpenTelemetry** sidecar in each task pushing traces to **AWS X-Ray** (or Honeycomb).
- **Langfuse self-hosted** (or LangSmith if happy with SaaS) for per-agent LLM trace: prompts, tool calls, token costs. The Claude Agent SDK has hooks (`PreToolUse`, `PostToolUse`) — wire them to Langfuse.
- **Cloudflare Workers Logs + Logpush** to S3 → Athena for DO analytics.
- **EventBridge → CloudWatch Logs** for the entire delegation graph; this gives an audit log of "who delegated what to whom."
- **Per-agent budgets**: a Lambda triggered by Cost Explorer's daily anomaly alarms; if a single user's agents exceed N tokens/day, the AgentManager refuses new `RunTask` calls and the Exec Assistant tells the user.

**Cost hot spots and mitigations:**
- **LLM tokens** are dominant (often 60–80% of total). Mitigate with: prompt caching (Claude / OpenAI both support; the Claude Agent SDK uses it by default), model routing (Haiku for cheap tasks, Sonnet for default, Opus for hard tasks), aggressive context compaction.
- **Fargate**: Compute Savings Plans (1yr ≈ 20% off, 3yr ≈ 52% off). Use Fargate Spot for stateless ephemeral subagents (they tolerate interruption and the cost reduction is ~70%).
- **NAT Gateway**: Real cost trap. One NAT GW = $32/mo + $0.045/GB. With many agents browsing the web, this can dominate compute cost. Mitigate with **VPC endpoints** for S3, DynamoDB, ECR, Secrets Manager, CloudWatch Logs (free for gateway endpoints, $0.01/hr for interface endpoints — still cheaper than NAT for high traffic).
- **ALB**: ~$22/mo + LCU. Single ALB shared across all sub-domains; this is fine.
- **Cloudflare**: DO billing is per request + per GB-s of *active* duration. Hibernation makes the steady-state cost approximately $0 for idle connections. Workers Paid plan ($5/mo/account) covers most tiers; budget $0.15 per 1M DO requests + a few cents per active GB-s.
- **DynamoDB**: On-demand for the agent state tables; cheap until you hit ~$1K/month, then evaluate provisioned + auto-scaling.
- **OpenSearch Serverless** for per-team RAG: ~$700/mo minimum (2 OCU). If budget-tight at launch, replace with **Pinecone** (cheaper at small scale) or pgvector on Aurora Serverless v2 (cheapest at small scale).

**Rough monthly bill (single power user, ~50 agent runs/day):**
- Fargate: $200–500
- LLM tokens: $300–2,000 (highly variable; Codex/Anthropic subscription cap helps)
- Cloudflare (Workers Paid + DOs): $5–30
- ALB + Route 53 + ACM: ~$25
- NAT + VPC endpoints: ~$50
- Storage (S3 + DynamoDB + OpenSearch): $50–800
- Observability (Langfuse self-hosted on Fargate + CW): ~$50
- **Total: ~$700 – $3,500/month/power-user.** The big lever is LLM tokens.

---

## Recommendations

**Phase 0 — Spike (week 1–2):**
- Stand up the Claude Agent SDK in a single ECS Fargate task; confirm subagents + MCP work.
- Stand up one Cloudflare Worker + one DO; connect a Next.js client and a Flutter desktop client; broadcast a message between them.
- *Trigger to abandon:* if Claude Agent SDK's Anthropic-only constraint (or its ToS) is a deal-breaker, swap in **Mastra** as the primary harness and use Claude/OpenAI/Gemini interchangeably.

**Phase 1 — Skeleton (week 3–6):**
- CDK stack per §3 (VPC, cluster, ALB, wildcard cert, Route 53). Deploy the AgentManager Lambda.
- Cognito + Amplify Gen 2 backend for user accounts and basic CRUD.
- Single "Executive Assistant" agent (Letta-backed) accessible via the DO.
- Miro MCP integration (OAuth wired end-to-end).
- A2UI rendering on both clients with a tiny catalog (5 widgets).
- *Success metric:* CEO says "summarize my Miro board X" and gets an A2UI response on both clients.

**Phase 2 — Multi-agent (week 7–12):**
- AgentManager spawns subagent ECS tasks; SQS message bus; DynamoDB state store.
- Implement specialty agent creation flow (§6) end-to-end with one role ("researcher") fully working.
- Wildcard sub-domain dynamic provisioning for hosted artifacts.
- Generator/Evaluator GAN harness for self-test.
- *Success metric:* "Hire a researcher and tell me about agentic coding tools" → new agent provisioned in <5 min, returns a researched report.

**Phase 3 — Self-improvement + scale (month 4–6):**
- Sakana-DGM-style mutation loop on agent definitions, evaluated against per-role rubrics.
- Hermes Agent runtime as an alternative harness for a subset of agents (compare metrics).
- Cost controls (per-user budgets, Spot for ephemeral subagents, VPC endpoints).
- LangSmith/Langfuse rolled out to every agent.
- *Success metric:* week-over-week measurable improvement on internal eval suite from the mutation loop.

**Triggers that change the recommendation:**
- If ECS Fargate spend > $10K/month sustained → migrate hot, persistent agents to ECS Managed Instances (~30% savings, AWS still ops the EC2 fleet).
- If Anthropic API quota becomes a bottleneck → enable Bedrock claude models (same SDK, multi-region quota) and/or add Vertex AI Anthropic as a fallback.
- If Claude Agent SDK subagent latency on multi-step tasks is unacceptable → migrate orchestration to **LangGraph** (best-in-class graph state machine) while keeping Claude Agent SDK as the per-node executor.
- If Cloudflare DO regional placement causes latency for users far from the auto-chosen region → use DO **Location Hints** or move to a Cloudflare-fronted, AWS-backed alternative (API Gateway WebSocket + ElastiCache for Redis pub/sub).
- If per-user multi-tenancy of Codex OAuth raises legal flags from OpenAI → kill that path, default to Anthropic API keys with platform billing.

---

## Caveats

1. **Codex OAuth in a hosted multi-user platform is a legal risk.** OpenAI's ToS frames Codex CLI sign-in with ChatGPT as for personal coding assistance. Community plugins (OpenCode, OpenClaw, Cline) implement it; OpenAI has reportedly blessed "external tools" usage but **commercial resale of the inference is prohibited.** The platform should only let users wire their *own* Codex tokens for their *own* agents and be explicit about this; do not make this the only path. Source: OpenAI developers docs on Codex authentication; Cline blog on OpenAI Codex OAuth integration; community plugin READMEs.
2. **Claude Code/Agent SDK subscription OAuth is not sanctioned for third-party apps.** Anthropic's docs explicitly say so. Use API key auth for production. Sources: Claude Code docs "Authentication" page; multiple community write-ups confirming `sk-ant-oat01-` tokens only work against Claude Code endpoints.
3. **Flutter `genui` (and A2UI v0.9) is alpha/draft.** API will change; ship behind a feature flag and budget for migration work in Q3 2026. Sources: pub.dev/genui, flutter.dev/ai/genui, a2ui.org.
4. **Hermes Agent's auto-skill persistence is an injection vector.** A prompt-injection attack during one session can write a "trusted" skill to disk, persisting the attack across runs. Mitigation: review skills automatically with a separate evaluator agent before they're loaded. Source: Heyuan110 hands-on review and Medium review of Hermes Agent (Apr 2026).
5. **Sakana DGM / ALE-Agent are research artifacts.** ALE-Agent's 4-hour run cost ~$1,300 in compute; treat self-improvement loops as a budget line, not a free win. Source: VentureBeat coverage of Sakana ALE-Agent.
6. **Vercel AI SDK RSC `streamUI` is in paused development.** Don't build new features on RSC GenUI; use the AI SDK 5 `useChat` + typed tool parts path. Source: Vercel-labs RSC GenUI repo README; AI SDK migration guide.
7. **AutoGen v0.2 is effectively maintenance mode** (Microsoft consolidated into Microsoft Agent Framework / Semantic Kernel in late 2025). Source: AG2 rebrand announcement and framework comparison posts.
8. **Pi (Inflection AI) is not viable as an agent harness for this use case.** It's a consumer assistant; Inflection licensed its models to Microsoft Azure in 2024 and has no comparable agent SDK. Some 2026 third-party blog posts reference an "inflection-sdk" — these do not appear to be officially documented on inflection.ai and should be verified before relying on them. Sources: official inflection.ai site; eesel AI guide on Inflection AI pricing.
9. **Wildcard DNS + ACM** matches all sub-levels by default. If you don't want `a.b.app.com` to hit your ALB, create explicit non-wildcard records for known sub-domains, or use ALB host-header allow-listing. Source: AWS re:Post answer on Route 53 wildcard behavior.
10. **Step Functions vs. EventBridge** — published comparisons suggest EventBridge is better for dynamic agent graphs and Step Functions for deterministic workflows. This is an architectural opinion based on AWS docs and field reports, not a hard rule; revisit per workload.
11. **Cost numbers here are order-of-magnitude estimates** based on AWS published pricing pages and Cloudflare DO pricing as of late 2025. Real numbers depend heavily on token volume and idle ratios. Run the AWS Pricing Calculator with your actual projected workloads before committing.
