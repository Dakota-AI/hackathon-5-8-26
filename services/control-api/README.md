# Control API

Owns user-facing backend commands:

- Workspaces, projects, runs, tasks.
- Approval requests and decisions.
- Artifact metadata.
- Credential linking.
- Miro/GitHub/Codex/OpenAI integration callbacks.

The Control API must not be the only place run state lives. DynamoDB and Step Functions are authoritative for durable execution.
