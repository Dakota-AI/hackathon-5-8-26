# Agent Runtime

Base runtime wrapper for autonomous workers.

Responsibilities:

- Materialize per-run workspace.
- Load scoped credentials through a broker.
- Start the selected harness or tool runtime.
- Normalize output into canonical events.
- Snapshot artifacts to S3.
- Report completion/failure to Step Functions.
