# Protocol Package

Canonical protocol schemas for the platform.

This package owns:

- Event envelope schema.
- Run/task status event schemas.
- Approval request/decision schemas.
- Artifact pointer schemas.
- A2UI wrapper event schema.
- Future TypeScript and Dart model generation.

Every backend service and client must treat these schemas as the shared contract.
