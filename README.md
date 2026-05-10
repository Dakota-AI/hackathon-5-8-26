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
- [Docs Index](docs/README.md)
- [Repository Agent Instructions](AGENTS.md)
- [Architecture Decision Records](docs/adr/)
- [Protocol Schemas](packages/protocol/)
- [Implementation Roadmap](docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md)
- [Exa MCP Audit Addendum](docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_EXA_AUDIT_ADDENDUM.md)

Current next implementation slice:

1. Make service-produced events match the canonical protocol envelope.
2. Make `POST /runs` truly idempotent and failure-safe.
3. Harden the worker event/artifact path for retries and partial failures.
4. Exercise the durable run loop from real web/native Cognito sessions.
5. Add realtime relay and client surfaces after durable run lifecycle works.
