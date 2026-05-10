# Services

Backend services live here.

- `control-api`: app/control API for commands, approvals, projects, credentials, and artifact metadata.
- `agent-manager`: ECS task lifecycle and worker-class scheduling.
- `agent-creator`: adaptive specialist agent workshop prototype.
- `agent-runtime`: base worker runtime wrapper.
- `builder-runtime`: build/test/browser-heavy worker runtime.
- `preview-router`: wildcard host router for project websites.
- `event-relay`: AWS to Cloudflare event relay.
- `miro-bridge`: Miro OAuth, REST, MCP broker, token isolation.
- `github-bridge` (planned): GitHub App/OAuth, repository registry, branch,
  commit, and PR broker.
