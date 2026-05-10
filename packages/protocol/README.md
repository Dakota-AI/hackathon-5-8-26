# Protocol Package

Canonical event and payload contracts for the platform.

This package owns:

- Event envelope schema.
- Run/task status event schemas.
- Approval request/decision schemas.
- Artifact pointer schemas.
- A2UI wrapper event schema.
- TypeScript event builder/types used by service producers.
- Future Dart model generation.

Every backend service and client must treat these schemas and builders as the shared contract.

## TypeScript helpers

`src/events.ts` exports the first shared producer helpers:

- `buildCanonicalEvent(...)`
- `buildRunStatusEvent(...)`
- `buildArtifactCreatedEvent(...)`
- `buildToolApprovalEvent(...)`
- `RunStatus`
- `ArtifactKind`
- `ToolApprovalPayload`
- `CanonicalEventEnvelope`

Control API and agent-runtime now use these helpers for service-produced
`run.status`, `artifact.created`, and `tool.approval` events so event envelope
fields do not drift between producers.

## Commands

```bash
pnpm contracts:build
pnpm contracts:test
```

`contracts:test` builds the TypeScript helpers and validates the JSON Schemas and
golden example.
