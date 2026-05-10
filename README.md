# Agents Cloud

Autonomous AI agent cloud platform foundation for 24/7 agent teams, isolated ECS
workers, durable AWS orchestration, Cloudflare realtime sync, and synchronized
Next.js plus Flutter clients.

Start here:

- [Master Scope And Progress](docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md)
- [Project Structure Guide](docs/PROJECT_STRUCTURE.md)
- [Implementation Readiness Audit](docs/IMPLEMENTATION_READINESS_AUDIT.md)
- [AI Agent Engineering Quality Gates](docs/AI_AGENT_ENGINEERING_QUALITY_GATES.md)
- [Current Project Status](docs/roadmap/PROJECT_STATUS.md)
- [Project Remaining Work Audit](docs/roadmap/PROJECT_REMAINING_WORK_AUDIT_2026_05_10.md)
- [Docs Index](docs/README.md)
- [Repository Agent Instructions](AGENTS.md)
- [Architecture Decision Records](docs/adr/)
- [User Runner Local And ECS Architecture](docs/roadmap/USER_RUNNER_LOCAL_ECS_ARCHITECTURE.md)
- [Protocol Schemas](packages/protocol/)
- [Implementation Roadmap](docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md)

Current next implementation slice:

1. Add the WorkItem layer above runs.
2. Add the user-runner placement model for local Docker and ECS execution.
3. Harden workspace membership and tenant authorization.
4. Enable production-shaped worker/runtime execution with scoped secrets.
5. Build artifact, approval, notification, and generated-UI product surfaces.
