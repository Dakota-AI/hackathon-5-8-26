# Services

Backend services live here.

- `control-api`: app/control API for commands, approvals, projects, credentials, and artifact metadata.
- `agent-manager`: ECS task lifecycle and worker-class scheduling.
- `agent-runtime`: base worker runtime wrapper.
- `builder-runtime`: build/test/browser-heavy worker runtime.
- `preview-router`: wildcard host router for project websites.
- `event-relay`: AWS to Cloudflare event relay.
- `miro-bridge`: Miro OAuth, REST, MCP broker, token isolation.
