# Product Coordination Workstream

## Mission

Own cross-workstream alignment: product sequencing, architecture coherence,
documentation quality, risk audits, demo readiness, and shared contract hygiene.

This workstream should help the other agents move faster without becoming a
catch-all owner for implementation.

## Primary Paths

- `docs/`
- `AGENTS.md`
- `README.md`
- shared roadmap/status files
- protocol review touchpoints in `packages/protocol/`

## Current Focus

1. Keep docs current with actual implementation state.
2. Maintain the next-build sequence.
3. Identify cross-workstream blockers early.
4. Keep ADRs consistent.
5. Keep old exploratory/reference material out of the active read-first path.
6. Turn ambiguous product ideas into concrete contracts and acceptance criteria.
7. Verify agents self-audit before claiming completion.

Current priority:

```text
tenant authorization/access-code gate
  -> workspace membership and capability checks
  -> WorkItem/product API completion
  -> client wiring to real APIs
  -> resident runner and critical integrations
```

AWS-native realtime is the current primary realtime path. Cloudflare Durable
Objects remain documented as an alternate/fallback path, not the durable source
of truth.

## Must Coordinate With

- Infrastructure for deployment and state architecture status.
- Clients for user-facing flows and demo readiness.
- Agent Harness for runtime capability and safety boundaries.
- Realtime Streaming for live status and replay behavior.

## Do Not Own

- Large implementation changes in another workstream's primary paths.
- Untested claims of completion.
- Broad refactors without an agreed implementation owner.

## Required Validation

Docs-only changes should at least run:

```bash
git diff --check
```

When docs describe implemented behavior, verify the relevant tests or commands
from that workstream.

## Handoff Triggers

Create a handoff when:

- docs reveal inconsistent implementation claims,
- a feature needs acceptance criteria before coding,
- a contract change affects multiple workstreams,
- a demo path is blocked,
- an old status doc conflicts with current implementation reality.
