# Coordination Protocol

Date: 2026-05-10
Status: Active coordination protocol

This is a lightweight coordination convention. It is not a full inbox system.
Agents can use it today by creating small markdown handoff files.

## Handoff Location

Create handoffs in:

```text
docs/agent-workstreams/handoffs/
```

Use this filename shape:

```text
YYYY-MM-DD-HHMM-from-workstream-to-workstream-topic.md
```

Example:

```text
2026-05-10-1430-clients-to-realtime-event-shape.md
```

## When To Create A Handoff

Create a handoff when:

- you need another workstream to implement something,
- your change alters a shared contract,
- you found a blocker owned by another workstream,
- you need review from another workstream before continuing,
- you discovered a risk that affects another lane.

Do not create handoffs for minor implementation details that stay inside your
lane.

## Handoff Fields

Use `HANDOFF_TEMPLATE.md`.

Required fields:

- From
- To
- Status
- Summary
- Why It Matters
- Requested Action
- Files/Contracts Affected
- Validation Needed
- Deadline/Urgency

## Status Values

- `proposed`: request created, not accepted yet.
- `accepted`: receiving workstream agrees to handle it.
- `blocked`: cannot proceed without missing information or a dependency.
- `in-progress`: work is underway.
- `done`: request is satisfied and validated.
- `superseded`: no longer needed because the plan changed.

## Conflict Rules

If two agents need the same file:

1. Prefer one owner to make the change.
2. If both must edit, split the file by clearly separate functions/sections.
3. Re-read the file immediately before editing.
4. Keep patches small.
5. Mention the conflict in the handoff or final report.

## Contract Change Rules

For shared contract changes:

1. Update `packages/protocol` first when possible.
2. Add examples or tests.
3. Update backend adapters.
4. Update clients.
5. Update docs.

Do not let clients and services invent separate payload shapes.

