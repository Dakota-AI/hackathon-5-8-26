# ADR 0002: Agent Harness

Date: 2026-05-09
Status: Accepted

## Context

The platform needs manager agents, specialist agents, delegation, tool policies, MCP tools, human review, traces, evals, coding tools, and isolated worker containers.

Hermes has strong specialist/runtime features and self-improvement ideas, but it should not own multi-tenant SaaS auth, tenancy, billing, or scheduling.

## Decision

Use OpenAI Agents SDK as the primary orchestration harness for:

- Manager and specialist definitions.
- Handoffs.
- Guardrails.
- Human review.
- MCP wiring.
- Tracing.
- Eval hooks.

Use Hermes Agent as an isolated ECS worker runtime for selected specialist tasks.

Use Codex CLI as an MCP-backed coding tool inside isolated ECS workers.

Use AWS Step Functions and DynamoDB for durable lifecycle truth.

## Consequences

- Agent behavior is inspectable through traces and evals.
- Worker runtimes remain replaceable.
- Hermes can be used where it adds value without becoming the control plane.
- Codex can be scoped to workspace-write containers and explicit approval policies.
