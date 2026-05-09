# Agents Cloud

Autonomous AI agent cloud platform foundation for 24/7 agent teams, isolated ECS
workers, durable AWS orchestration, Cloudflare realtime sync, and synchronized
Next.js plus Flutter clients.

Start here:

- [Master Scope And Progress](docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md)
- [Current Project Status](docs/roadmap/PROJECT_STATUS.md)
- [Docs Index](docs/README.md)
- [Repository Agent Instructions](AGENTS.md)
- [Architecture Decision Records](docs/adr/)
- [Protocol Schemas](packages/protocol/)
- [Implementation Roadmap](docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_IMPLEMENTATION_ROADMAP.md)
- [Exa MCP Audit Addendum](docs/roadmap/AUTONOMOUS_AGENT_PLATFORM_EXA_AUDIT_ADDENDUM.md)

Current next implementation slice:

1. Tighten the protocol package where needed.
2. Build `ControlApiStack` with authenticated `POST /runs` and read endpoints.
3. Start the existing Step Functions to ECS path through the API.
4. Replace the placeholder worker with a minimal artifact/event writer.
5. Add realtime relay and client surfaces after durable run lifecycle works.
