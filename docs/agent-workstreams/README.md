# Parallel Agent Workstreams

Date: 2026-05-10
Status: Active coordination guide

This folder splits the repository into focused work buckets so multiple AI
agents can work in parallel without stepping on each other.

Each agent should start by reading:

1. `AGENTS.md`
2. `docs/agent-workstreams/README.md`
3. the README for its assigned workstream
4. `docs/agent-workstreams/COORDINATION.md`
5. any handoff files that mention its workstream

Use `START_PROMPT_TEMPLATE.md` when assigning a new agent to a workstream.
Use `CURRENT_PLAN_TEMPLATE.md` when creating or updating a lane plan.

## Workstreams

| Workstream | Folder | Primary mission |
| --- | --- | --- |
| Infrastructure | `infrastructure/` | AWS, deployment, state, storage, runner placement, local/ECS host architecture |
| Clients | `clients/` | Web, desktop, mobile, user-facing workflows, generated UI rendering |
| Agent Harness | `agent-harness/` | Runtime, tools, logical agents, user runners, snapshots, safe execution |
| Realtime Streaming | `realtime-streaming/` | Event streams, websocket/fanout, replay, subscription auth |
| Product Coordination | `product-coordination/` | Cross-cutting product shape, docs, audits, sequencing, interface alignment |
| Access Control | `access-control/` | Cognito groups, access codes, tenant/workspace membership, capability checks |
| Miro Integration | `miro-integration/` | Miro OAuth/MCP/REST bridge, board artifacts, collaboration surfaces |
| Source Control | `source-control/` | GitHub/repository integration, commits, PRs, code review workflows |
| Preview Hosting | `preview-hosting/` | Wildcard domains, preview registry, preview router, publish/retire flows |
| Specialist Creation | `specialist-creation/` | New specialist profile drafts, tool policy, review, and approved version materialization |
| Self-Improvement | `self-improvement/` | Specialist profiles, evals, quarantine, promotion, regression evidence |
| Quality Audit | `quality-audit/` | Cross-agent audit phases, validation matrices, contract/readiness reviews |

## Parallel Work Rules

- Treat these workstreams as ownership lanes, not hard walls.
- Stay in your lane by default.
- Read the other lane's docs before changing its code or contracts.
- If a change affects another lane, create a handoff note before or alongside
  the code change.
- Do not edit unrelated files just to clean up style.
- Do not revert other agents' work unless the user explicitly asks.
- Run the validation commands relevant to your lane.
- Update docs when implementation reality changes.

## Start-Of-Session Checklist

Every agent should do this at the start of a run:

1. Check `git status --short --branch`.
2. Read its workstream README.
3. Scan `docs/agent-workstreams/handoffs/` for relevant requests.
4. Inspect recent changes in files it intends to edit.
5. Identify contract touchpoints with other workstreams.
6. Write or update that lane's `CURRENT_PLAN.md` before making broad changes.

## End-Of-Session Checklist

Every agent should do this before stopping:

1. Run relevant tests or clearly document why they were not run.
2. Self-audit against `docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md`.
3. Update status docs if behavior or architecture changed.
4. Create handoff notes for blocked cross-workstream work.
5. Leave the worktree understandable with no hidden generated artifacts staged.

## Shared Contracts

These areas are shared and require extra care:

- `packages/protocol`: event, artifact, generated UI, runner, and API payload
  contracts.
- `services/control-api`: product API boundary and authorization.
- `infra/cdk`: deployment shape, environment variables, task roles, tables, and
  queues.
- `services/agent-runtime`: runtime behavior and event/artifact production.
- `infra/cloudflare/realtime` and `services/realtime-api`: live event delivery.
- `apps/web` and `apps/desktop_mobile`: client expectations and UI behavior.
- tenant authorization tables/groups/access codes: shared by Control API,
  realtime, clients, runtime, preview, Miro, and source-control work.

If a workstream changes a shared contract, it must document the compatibility
impact and tell the affected workstreams through a handoff note.

## Current Plan Files

Each active workstream should maintain a local plan file:

```text
docs/agent-workstreams/{workstream}/CURRENT_PLAN.md
```

The plan is the visible scratchpad for other agents. It should be concise but
current enough that another workstream can see:

- what is being touched,
- what is blocked,
- what contract changes are expected,
- what validation will be run,
- what handoffs are needed.

Use `CURRENT_PLAN_TEMPLATE.md` for new plan files.
