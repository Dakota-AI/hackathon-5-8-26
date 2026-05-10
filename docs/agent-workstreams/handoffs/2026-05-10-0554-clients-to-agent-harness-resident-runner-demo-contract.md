# Handoff Template

From: Clients / Realtime parallel testing
To: Agent Harness / ECS Resident Runner
Status: proposed
Date: 2026-05-10
Urgency: P0 for hackathon demo

## Summary

The web client is now wired to consume AWS-native realtime run events while keeping REST polling as a fallback. For the demo to work end-to-end, the resident runner must persist canonical events to the EventsTable and artifacts to S3 plus ArtifactsTable using the existing run/work item identifiers.

## Why It Matters

The deployed realtime API fans out from DynamoDB EventsTable streams, and the artifact board/download flow reads ArtifactsTable plus S3 presigned URLs. If the resident runner only writes local NDJSON/local files, the agent may run successfully in ECS but the user will not see live responses or downloadable artifacts in the UI.

## Requested Action

- Emit durable run events from the resident runner into the Control API EventsTable, not only local `events.ndjson`.
- Persist generated artifacts to the configured artifacts S3 bucket and write ArtifactsTable records.
- Include `runId`, `workspaceId`, `workItemId`, `userId`, `taskId` where available.
- For live UI messages, emit `run.message` or `agent.message` events with `payload.text`/`payload.message`/`payload.content`.
- For status transitions, emit `run.status` with `payload.status`.
- For artifacts, emit `artifact.created` with `payload.artifactId`, `payload.name`, `payload.kind`, `payload.uri`, and `payload.contentType` when available.

## Files Or Contracts Affected

- `services/agent-runtime/src/resident-runner.ts`
- `services/agent-runtime/src/dynamo-event-sink.ts`
- `services/agent-runtime/src/aws-artifact-sink.ts`
- `services/control-api/src/ports.ts`
- `apps/web/lib/realtime-client.ts`
- `apps/web/lib/use-run-realtime-events.ts`
- `apps/web/components/app/hero-command-panel.tsx`
- `apps/web/components/app/runs-chat.tsx`
- `apps/web/components/app/artifacts-board.tsx`

## Expected Output

- Starting a run from the web launches/wakes the resident runner.
- The web run conversation receives live event messages over WebSocket, with HTTP polling still available as fallback.
- A completed run creates at least one artifact row with non-empty `bucket` and `key`.
- The artifact appears under the selected WorkItem in `/artifacts` and downloads through the Control API presigned URL route.

## Validation Needed

- `pnpm --filter @agents-cloud/agent-runtime test`
- `pnpm --filter @agents-cloud/control-api test`
- `pnpm --filter @agents-cloud/realtime-api test`
- `pnpm --filter @agents-cloud/web test`
- `pnpm web:typecheck`
- `pnpm web:build`
- Live smoke with a valid Cognito JWT:
  1. open web app with `NEXT_PUBLIC_AGENTS_CLOUD_API_URL` and `NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL` configured,
  2. create a run,
  3. confirm ECS task launch/wake,
  4. confirm EventsTable receives new rows,
  5. confirm WebSocket delivers events to the run chat,
  6. confirm ArtifactsTable receives a row with S3 `bucket`/`key`,
  7. confirm `/artifacts` lists and downloads the artifact.

## Notes

Live AWS read-only check found the deployed Control API and realtime endpoints healthy and JWT-protected. A state-changing WebSocket e2e smoke was attempted with a temporary Cognito user; `POST /runs` returned HTTP 503 while the CreateRun Lambda continued running and ECS launched an `agents-cloud-dev-resident-runner:8` task that reached `resident-runner-listening` on port 8787. This confirms the launch path is much closer, but the synchronous create-run/wake flow is not demo-safe behind API Gateway/Lambda timeouts. Make `/wake`/dispatch asynchronous or make CreateRun return immediately after launch/enqueue.
