# ADR 0002: Agent Harness

Date: 2026-05-09
Status: Accepted

## Context

The platform needs manager agents, specialist agents, delegation, tool
policies, external tools, human review, traces, evals, coding tools, and
isolated worker containers.

Specialist runtimes can add useful tool execution and self-improvement
capabilities, but they should not own multi-tenant SaaS auth, tenancy, billing,
or scheduling.

## Decision

Use a primary orchestration harness for:

- Manager and specialist definitions.
- Handoffs.
- Guardrails.
- Human review.
- tool wiring.
- Tracing.
- Eval hooks.

Use isolated ECS worker runtimes for selected specialist tasks.

Use coding tools inside isolated ECS workers only through scoped workspace and
approval policies.

Use AWS Step Functions and DynamoDB for durable lifecycle truth.

## Consequences

- Agent behavior is inspectable through traces and evals.
- Worker runtimes remain replaceable.
- Specialist runtimes can be used where they add value without becoming the
  control plane.
- Coding tools can be scoped to workspace-write containers and explicit approval
  policies.
