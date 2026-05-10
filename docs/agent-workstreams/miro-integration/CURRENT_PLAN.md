# Miro Integration Current Plan

Workstream: Miro Integration
Owner: Miro Integration Workstream
Updated: 2026-05-10
Status: planned; blocked on integration credential broker and access control

## Current Scope

Own Miro OAuth/MCP/REST integration for board-aware agents and board artifacts.

## Current State

- Miro is part of the top-level scope.
- `services/miro-bridge` exists as a service boundary README.
- Official Miro references are captured in roadmap docs.
- No OAuth callback, token vault, MCP broker, REST helper, board artifact event,
  or runtime tool exists yet.

## Gaps

- Credential and scope plan.
- Miro OAuth app and callback.
- Token storage/refresh/revocation.
- MCP/REST broker service.
- Board list/read/search/summarize/write tools.
- Approval gates for board writes and external sharing.
- Board artifact events and client cards.

## Risks

- Raw Miro refresh tokens must never enter arbitrary agent containers.
- Board writes are visible collaboration side effects and should require clear
  approval policy.
- Board read access must be tied to workspace membership and connected account
  ownership.

## Files Expected To Change

- `services/miro-bridge/**`
- `services/control-api/**`
- `services/agent-runtime/**`
- `infra/cdk/**`
- `packages/protocol/**`
- client board picker/artifact surfaces

## Cross-Workstream Dependencies

- Access Control: connected-account ownership and workspace membership checks.
- Agent Harness: Miro tool policy and tool adapter.
- Clients: connected-account status, board picker, board artifact cards.
- Infrastructure: Secrets Manager/KMS grants and optional webhook endpoints.

## Implementation Plan

1. Define `MIRO_CREDENTIAL_AND_SCOPE_PLAN.md`.
2. Define `MIRO_BRIDGE_API_CONTRACT.md`.
3. Add OAuth/token broker boundary.
4. Add read-only board list/read/summarize tools first.
5. Add board artifact records and client cards.
6. Add approval-gated board write tools.
7. Add webhooks only after read/write flows are stable.

## Validation Plan

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
```

Add tests for missing credential, revoked token, insufficient scope, board not
accessible, write approval required, and artifact event creation.

## Completion Criteria

- Agents can read and summarize authorized boards.
- Board outputs are durable artifacts.
- Writes require approval and are audited.
- Tokens stay brokered and scoped.
