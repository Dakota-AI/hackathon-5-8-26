# Miro Integration Workstream

Status: planned
Updated: 2026-05-10

## Mission

Own the Miro bridge for board-aware agents, board artifacts, collaborative
planning, and Miro-backed execution workflows.

The goal is not just "call Miro APIs." The platform should let agents inspect
boards, summarize context, create planning artifacts, update boards with
traceable outputs, and use Miro as one of the CEO command center collaboration
surfaces.

## Primary Docs

- `docs/roadmap/MASTER_SCOPE_AND_PROGRESS.md`
- `docs/roadmap/NEXT_SYSTEM_AUDIT_AND_EXECUTION_PLAN_2026_05_10.md`
- `docs/agent-workstreams/COORDINATION.md`
- Miro MCP intro: https://developers.miro.com/docs/mcp-intro
- Miro developer portal: https://developers.miro.com/
- Miro REST API overview: https://developers.miro.com/reference/overview

## Ownership

Own:

- Miro OAuth app and token lifecycle design.
- Miro REST/MCP broker service.
- Board import, search, summarize, and write-back tools.
- Board artifact records and links in the run ledger.
- Approval gates before public or destructive board writes.
- Miro-specific tests, mocks, and tool policy docs.

Do not own:

- General agent runtime orchestration.
- Generic artifact storage.
- Client rendering beyond Miro-specific surfaces and handoffs.

## Current State

- Miro is part of the top-level product scope.
- Official Miro references are documented.
- No production Miro OAuth, MCP, REST broker, token storage, or board tool exists
  yet.

## Near-Term Plan

1. Define the Miro credential model and required scopes.
2. Add a broker boundary so agents never receive raw refresh tokens.
3. Define tool contracts for board list/read/search/summarize/create/update.
4. Add approval policy for board writes, board sharing, and external publishing.
5. Add durable artifact links for Miro board snapshots or generated board items.
6. Add client handoffs for board picker, connected-account status, and board
   artifact cards.

## Validation

Required before implementation is considered product-ready:

```bash
pnpm contracts:test
pnpm control-api:test
pnpm agent-runtime:test
```

Add tests for:

- missing Miro credential,
- revoked token,
- insufficient scope,
- board not accessible to the user,
- read-only tool behavior,
- write tool requiring approval,
- audit event creation,
- artifact link creation.

## Handoffs

Expected handoffs:

- To Access Control: workspace membership and integration ownership checks.
- To Agent Harness: MCP/REST tool wrapper and approval policy.
- To Clients: connect-account UI, board picker, and board artifact surfaces.
- To Infrastructure: Secrets Manager/KMS grants and webhook endpoints if needed.
