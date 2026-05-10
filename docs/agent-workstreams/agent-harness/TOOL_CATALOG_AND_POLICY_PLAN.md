# Tool Catalog And Policy Plan

Workstream: Agent Harness
Date: 2026-05-10
Status: proposed runtime contract

## Purpose

Agents Cloud needs powerful tools without giving models broad ambient
authority. The harness should expose a normalized tool catalog to logical
agents, while the runtime enforces tenant scope, workspace scope, credentials,
approvals, budgets, idempotency, and audit events outside the model.

## Core Rule

Tool descriptions can help the model choose an action. Tool policy is enforced
by runtime code.

Prompt instructions, profile text, MCP tool descriptions, or generated skills
are never a security boundary.

## Tool Descriptor

Every tool exposed to a logical agent should normalize to this shape before it
is made available:

```ts
interface RuntimeToolDescriptor {
  toolId: string;
  version: string;
  displayName: string;
  category:
    | "communication"
    | "workspace"
    | "artifact"
    | "preview"
    | "research"
    | "agent_team"
    | "approval"
    | "integration"
    | "system";
  source: "platform" | "mcp" | "apify" | "profile_bundle" | "internal";
  risk: "low" | "medium" | "high" | "critical";
  scopes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  sideEffects: Array<"read" | "write" | "publish" | "spend" | "contact_user" | "external_call">;
  credentialRefs: string[];
  approvalPolicy: {
    mode: "never" | "required" | "budgeted" | "preapproved";
    reason?: string;
  };
  budgetPolicy?: {
    maxCalls?: number;
    maxCostUsd?: number;
    windowSeconds?: number;
  };
  idempotency: {
    required: boolean;
    keyFields: string[];
  };
}
```

The descriptor should be stored with enough hash/source metadata to detect
tool-description drift for MCP and Apify-backed tools.

## Initial Tool Families

### Communication Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `communication.send_user_message` | Send a normal text update to the user | low | not required |
| `communication.ask_user_question` | Ask a blocking or non-blocking question | low | not required |
| `communication.request_attention` | Create an urgent notification | medium | policy-based |
| `communication.create_audio_message` | Generate/send an audio message | medium | policy-based |
| `communication.request_voice_call` | Request or initiate a voice call session | high | required |

Runtime rule: user-contacting tools must respect cadence, quiet hours, urgency,
and profile/user communication policy. A resident runner cannot claim proactive
communication unless it has explicit inbox, wake timer, or scheduled work state.

### Workspace And Code Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `workspace.read_file` | Read workspace file | low | not required inside scoped workspace |
| `workspace.write_file` | Write workspace file | medium | profile policy |
| `workspace.run_command` | Run shell command in workspace | high | required unless sandbox-preapproved |
| `workspace.run_tests` | Run declared test command | medium | profile policy |
| `workspace.git_status` | Inspect git state | low | not required |
| `workspace.git_diff` | Inspect changes | low | not required |
| `workspace.git_commit` | Create commit | high | required until policy matures |

Runtime rule: no host Docker socket, no broad home directory, no unscoped
credentials, and no local-only durable state.

### Artifact Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `artifact.create` | Create a document/report/dataset/log artifact | low | not required |
| `artifact.update_metadata` | Update artifact metadata | low | not required |
| `artifact.publish_preview` | Attach a user-visible preview URL | medium | profile policy |
| `artifact.archive` | Archive or supersede artifact | medium | profile policy |

Runtime rule: artifact bytes go to S3 or local artifact sink; artifact metadata
is recorded and emitted via `artifact.created` or future artifact lifecycle
events.

### Preview And Website Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `preview.build_static_site` | Build static website artifact | medium | profile policy |
| `preview.register_static_site` | Register S3-backed preview deployment | medium | profile policy |
| `preview.request_dynamic_service` | Request long-running service preview | high | required |
| `preview.update_dns_label` | Request label such as `stock-dashboard` | medium | policy-based |

Runtime rule: the agent should request a preview registration through the
platform contract. It should not mutate Route53 or Cloudflare DNS directly.

### Research Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `research.web_search` | Search public web | low | not required or policy-based |
| `research.web_fetch` | Fetch source content | low | not required or policy-based |
| `research.source_note` | Store source and confidence metadata | low | not required |
| `apify.catalog.search` | Search Apify actor catalog | low | not required |
| `apify.actor.inspect` | Inspect actor schema/pricing | low | not required |
| `apify.actor.request_run` | Request actor execution | medium/high | required unless budgeted |

Runtime rule: catalog discovery and execution are different capabilities.
Running actors can spend credits and touch external sites, so it must be gated.

### Agent Team Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `agent.create_task` | Create a task for another logical agent | low | not required |
| `agent.delegate` | Delegate to an existing logical agent | low | not required |
| `agent.request_specialist_profile` | Ask Agent Workshop to draft/tune profile | medium | policy-based |
| `agent.instantiate_profile` | Start approved profile in runner | medium | policy-based |
| `agent.schedule_wake` | Add wake timer for future work | low | not required |

Runtime rule: delegation should produce explicit task records, not hidden
model-to-model chatter.

### Integration Tools

| Tool | Purpose | Default risk | Approval |
| --- | --- | --- | --- |
| `miro.board.create` | Create a Miro board/artifact | medium | policy-based |
| `miro.board.update` | Modify Miro content | medium/high | policy-based |
| `github.issue.create` | Create GitHub issue | medium | policy-based |
| `github.pr.create` | Create pull request | high | required initially |
| `email.draft` | Draft email | low | not required |
| `email.send` | Send email | high | required |

Runtime rule: refresh tokens and provider secrets must be brokered. Generated
agent profiles reference credential IDs, not credential values.

## Approval Model

Approval should be created before execution when a tool has one of these
properties:

- spends money beyond pre-approved budget,
- contacts a person,
- publishes publicly,
- mutates external systems,
- accesses sensitive private data,
- changes permissions,
- runs arbitrary shell commands,
- writes to source control,
- starts long-lived compute.

Current protocol already has `tool-approval` JSON schema with `request` and
`decision` payload variants. The next protocol step is to add TypeScript event
builders and richer request fields for client rendering, such as:

```text
approvalId
toolId
toolDisplayName
risk
requestedAction
argumentsPreview
sideEffects
costEstimate
credentialRefLabels
expiresAt
resumeToken
```

The runtime must persist a wait state before emitting the approval request, so
approve/reject can resume the same logical task.

## Tenant And Credential Scope

Tool execution must receive:

```text
orgId
userId
workspaceId
projectId
runnerId
agentInstanceId
taskId
profileId
profileVersion
```

Credential use must resolve through scoped references:

```text
credentialRef -> broker -> short-lived execution credential -> adapter
```

No generated profile bundle, MCP config, skill, model prompt, artifact, or log
should contain raw refresh tokens, API keys, or broad provider credentials.

## MCP And Apify

MCP is useful as an integration protocol, but the platform should treat MCP
servers and tool results as untrusted inputs until policy checks pass.

Required MCP controls:

- allowlisted MCP servers per org/workspace/profile,
- pinned tool metadata hash where possible,
- least-privilege scopes,
- per-client/user consent for user-bound resources,
- short-lived access tokens,
- no credential logging,
- approval gates before side effects,
- result sanitization before model reinjection.

Apify should enter through curated tools:

```text
apify.catalog.search
apify.actor.inspect
apify.actor.request_run
apify.actor.output.read
```

The Agent Workshop may use Apify discovery to propose tools, but production
specialist profiles should not receive raw broad Apify execution without
budget, approval, and actor allowlists.

## Eventing And Audit

Every tool execution should create an internal trace record. User-visible
canonical events should be emitted only when useful to clients:

- `run.status` for progress/failure/waiting states,
- `artifact.created` for new artifacts,
- `tool.approval` for approval request/decision,
- future communication events for user messages, questions, calls, and audio,
- future profile lifecycle events for agent creation/tuning.

Duplicate behavior:

- tool requests that can side-effect must require an idempotency key,
- adapter writes must de-dupe by idempotency key,
- emitted events must use deterministic IDs when retrying the same transition.

## Smallest Runtime Slice

Implement in this order:

1. `RuntimeToolDescriptor` and validator in `services/agent-runtime`.
2. `AgentToolPolicy` that maps profile policy to allow/deny/approval.
3. Memory `ToolRegistry`.
4. Memory `ToolExecutionLedger` for idempotency tests.
5. Approval decision function:

```text
allowed | denied | approval_required
```

6. Tests for low, medium, high, denied, duplicate, and expired approval cases.

No MCP, Apify, Miro, GitHub, or email network adapter should be added before
the policy gateway is testable.

## Research Notes

Primary-source guidance used for this plan:

- OpenAI Agents SDK guidance emphasizes that the application or SDK owns
  orchestration, tools, approvals, handoffs, state, and observability:
  <https://developers.openai.com/api/docs/guides/agents>
- OpenAI guidance on defining/running agents supports small agents with
  explicit tools, guardrails, handoffs, durable state, approvals, and streaming:
  <https://developers.openai.com/api/docs/guides/agents/define-agents>,
  <https://developers.openai.com/api/docs/guides/agents/running-agents>,
  <https://developers.openai.com/api/docs/guides/agents/orchestration>,
  <https://developers.openai.com/api/docs/guides/agents/guardrails-approvals>,
  <https://developers.openai.com/api/docs/guides/agents/integrations-observability>
- MCP authorization and security docs call for OAuth-style authorization,
  least-privilege scopes, token validation, per-client consent, and resource
  binding:
  <https://modelcontextprotocol.io/docs/tutorials/security/authorization>,
  <https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices>,
  <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- Apify MCP docs support catalog discovery, actor inspection, actor execution,
  output retrieval, and configurable loaded tools:
  <https://docs.apify.com/platform/integrations/mcp>
- Anthropic agent/tool guidance reinforces sandboxed containers, minimal
  privileges, allowlisted access, human confirmation for meaningful real-world
  consequences, and harnesses that leave durable progress:
  <https://docs.anthropic.com/en/docs/agents-and-tools/computer-use>,
  <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>,
  <https://console.anthropic.com/docs/en/agents-and-tools/tool-use/how-tool-use-works>

