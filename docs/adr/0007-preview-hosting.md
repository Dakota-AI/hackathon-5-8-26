# ADR 0007: Preview Hosting

Date: 2026-05-09
Status: Accepted

## Context

Agents must create websites and artifacts for many projects at once. Each project should be reachable through wildcard domains such as `project.domain.com`.

Creating one ALB listener rule or target group per project preview will hit scaling limits.

## Decision

Use one wildcard ingress path:

```text
*.domain.com -> Route 53 wildcard -> ACM wildcard certificate -> ALB -> preview-router
```

The preview-router resolves the host against a registry and serves:

- Static S3 deployments.
- Long-lived ECS preview services.
- Short-lived ECS preview tasks.
- Archived/unavailable responses.

## Consequences

- Many project previews can share one ALB path.
- Preview routing becomes a software registry problem instead of an ALB rule scaling problem.
- The preview-router needs strong tenant checks, cache controls, and clear unavailable states.
