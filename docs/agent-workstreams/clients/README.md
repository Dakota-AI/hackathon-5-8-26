# Clients Workstream

## Mission

Own the user-facing web, desktop, and mobile experience. Build the command
center, WorkItem surfaces, run/event views, artifact browsing, approvals,
notifications, generated UI rendering, and realtime status behavior.

## Primary Paths

- `apps/web/`
- `apps/desktop_mobile/`
- client-specific docs under `docs/roadmap/`
- shared UI contract touchpoints in `packages/protocol/`

## Current Focus

1. Make WorkItems the primary user-facing object.
2. Show run ledgers, ordered events, artifacts, approvals, and generated
   surfaces under each WorkItem.
3. Connect authenticated clients to the real Control API.
4. Connect clients to realtime event streams.
5. Add loading, empty, error, denied, offline, and reconnect states.
6. Keep web and Flutter concepts aligned.
7. Keep generated UI rendering constrained to validated server payloads.

## Must Coordinate With

- Infrastructure for deployed URLs, auth outputs, preview hosting, and feature
  flags.
- Realtime Streaming for websocket protocol, subscription shape, cursor/replay,
  and reconnect behavior.
- Agent Harness for event payloads, artifact metadata, approval requests, and
  runtime status states.
- Product Coordination for product flow, naming, and demo sequence.

## Do Not Own

- Cloud deployment architecture.
- Runtime tool execution.
- Server-side authorization rules.
- Durable state schema except through agreed protocol changes.

## Required Validation

For web changes:

```bash
pnpm web:typecheck
pnpm web:test
pnpm web:build
```

For Flutter changes:

```bash
cd apps/desktop_mobile && flutter analyze
cd apps/desktop_mobile && flutter test
```

When changing generated UI rendering, add fixtures and tests that prove invalid
payloads fail safely.

## Handoff Triggers

Create a handoff when:

- the client needs a new API route or field,
- an event payload is ambiguous,
- realtime reconnect/replay behavior is missing,
- a server-side validation rule blocks a UI feature,
- auth or deployment outputs are unclear.

