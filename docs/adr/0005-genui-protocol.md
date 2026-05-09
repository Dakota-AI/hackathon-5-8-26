# ADR 0005: GenUI Protocol

Date: 2026-05-09
Status: Accepted

## Context

The platform needs generated UI across Next.js web and Flutter desktop/mobile. Agents should create dashboards, status panels, forms, reports, and action surfaces without executing arbitrary UI code on the client.

## Decision

Use A2UI v0.8 stable as the initial GenUI protocol baseline.

Wrap A2UI messages inside the platform canonical event envelope.

Agents may only emit A2UI for approved component catalogs. Server-side validators must reject unknown components, invalid actions, malformed data bindings, and disallowed catalog IDs before the event reaches clients.

## Consequences

- Web and Flutter can render the same generated UI intent.
- Agents cannot ship arbitrary React, JavaScript, or Flutter code.
- Custom platform components must be registered in allowlisted catalogs.
- Client actions return through the control/policy layer.
