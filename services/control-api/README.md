# Control API

Owns user-facing durable backend commands for the Agents Cloud run lifecycle.

Implemented first slice:

- `POST /runs`
  - accepts `workspaceId`, `objective`, and optional `idempotencyKey`.
  - creates a run record, task record, and initial `run.status` event.
  - starts the existing Step Functions simple-run state machine.
- `GET /runs/{runId}`
  - returns an owned run by id.
  - hides other users' runs as `404`.
- `GET /runs/{runId}/events`
  - returns ordered events for an owned run.
  - supports `afterSeq` and `limit` query parameters.

The CDK stack is `ControlApiStack` under `infra/cdk` and wires these handlers to
API Gateway HTTP API routes with a Cognito JWT authorizer.

Durable truth remains in DynamoDB, Step Functions, and S3. This service is a
command/query boundary; it must not become an in-memory run owner.

Current gaps before declaring the broader run lifecycle complete:

- Exercise the HTTP routes with a real Cognito login token from web/native clients.
- Add full idempotency behavior for repeated `POST /runs` calls.
- Add explicit request/response schemas.
- Wire the minimal real worker so API-created runs produce running/artifact/
  terminal status events.

Deployed endpoint:

```text
https://ajmonuqk61.execute-api.us-east-1.amazonaws.com
```

Smoke evidence from 2026-05-09:

- Unauthenticated `POST /runs` returned `401`.
- Live Lambda smoke created `run-362d8866-ac8e-4b00-82d2-6b7eddaca43e`.
- Ordered event query returned initial `run.status` event.
- Step Functions execution reached `SUCCEEDED`.

Commands:

```bash
pnpm control-api:test
pnpm control-api:build
```
