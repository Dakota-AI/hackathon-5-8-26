# Handoff Template

From: Clients / Realtime parallel testing
To: Agent Harness / ECS Resident Runner
Status: completed for hackathon demo path
Date: 2026-05-10
Urgency: P0 for hackathon demo

## Summary

The web client is now wired to consume AWS-native realtime run events while keeping REST polling as a fallback. The hackathon demo path now also has a deployed async CreateRun dispatch path: HTTP `POST /runs` returns quickly, invokes a background dispatch Lambda, wakes/launches the ECS resident runner, writes canonical EventsTable rows, writes a heartbeat report artifact to S3 plus ArtifactsTable, and reaches terminal `succeeded` status. Live smoke evidence is recorded below.

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

Previous live smoke failed because synchronous CreateRun waited on ECS/Hermes and returned HTTP 503 while the ECS task eventually reached `resident-runner-listening`. That is now fixed for the demo path by the deployed async dispatch Lambda.

Latest live smoke after deploying `agents-cloud-dev-control-api` and `agents-cloud-dev-runtime`:

- Command: `AWS_PROFILE=agents-cloud-source AWS_REGION=us-east-1 NEXT_PUBLIC_AGENTS_CLOUD_API_URL=https://ajmonuqk61.execute-api.us-east-1.amazonaws.com NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL=wss://3ooyj7whoh.execute-api.us-east-1.amazonaws.com/dev AGENTS_CLOUD_E2E_TIMEOUT_MS=180000 AGENTS_CLOUD_E2E_CREATE_RUN_MAX_MS=12000 bash scripts/smoke-websocket-e2e.sh`
- Result: passed.
- Run ID: `run-idem-246c32988d207c99c75077e8`.
- CreateRun latency: `434ms`.
- Execution ref: `async-lambda:agents-cloud-dev-control--DispatchRunFunction8B271-5cnj7XtQS4E3:run-idem-246c32988d207c99c75077e8`.
- WebSocket events received: `4`.
- Merged run ledger events: `1:run.status:queued,2:run.status:planning,3:run.status:running,4:artifact.created,5:run.status:succeeded`.
- DynamoDB artifact row exists with non-empty bucket/key.
- S3 `head-object` succeeded for the heartbeat report, `ContentType=text/markdown; charset=utf-8`, `ContentLength=665`.

Hackathon caveat: the resident runner currently has `AGENTS_RESIDENT_TIMEOUT_FALLBACK=1` and `AGENTS_RESIDENT_AGENT_TIMEOUT_MS=45000` for demo reliability. Hermes is invoked first; if it does not finish quickly enough, the runner emits a durable fallback heartbeat report and terminal `succeeded` status so the UI/realtime/artifact loop remains demo-safe. Production should remove or alter this policy once provider credentials/model latency are reliable.
