# Architecture Overview

> System shape, data flow, and authority. The detailed per-layer pages are linked at the bottom.

[← back to wiki index](README.md)

---

## Authority model

```
                  ┌────────────────────────────────────┐
                  │   AWS = durable source of truth    │
                  │   DynamoDB · S3 · SFN · ECS · Cog. │
                  └─────────────────┬──────────────────┘
                                    │
                                    │  events
                                    ▼
                  ┌────────────────────────────────────┐
                  │   API Gateway WebSocket relay      │
                  │   (DDB Stream → Lambda → wss://)   │
                  └─────────────────┬──────────────────┘
                                    │
                                    ▼
                  ┌────────────────────────────────────┐
                  │   Clients (web · Flutter)          │
                  │   Render canonical events          │
                  └────────────────────────────────────┘
```

Cloudflare is **not** in the active path for the hackathon. See [secondary-infra.md](infrastructure/secondary-infra.md).

---

## Run lifecycle (the working vertical slice)

```
[ user ]
    │  type objective in web command center
    ▼
[ apps/web/components/command-center.tsx ]
    │  POST /runs   (Bearer Cognito ID token)
    ▼
[ API Gateway HttpApi  +  HttpJwtAuthorizer ]
    │  verifies JWT, attaches sub to event.requestContext
    ▼
[ Lambda createRunHandler  →  services/control-api/src/create-run.ts ]
    │  TransactWrite RUNS + TASKS + EVENTS(seq=1, run.status:queued)
    │  StartExecution  on  agents-cloud-dev-simple-run  Step Function
    ▼
[ Step Functions simple-run  (ecs:runTask.sync) ]
    │  ContainerOverrides: RUN_ID, TASK_ID, WORKSPACE_ID, USER_ID, OBJECTIVE
    ▼
[ ECS Fargate task  (agent-runtime image) ]
    │  services/agent-runtime/src/index.ts   →   worker.ts   →   hermes-runner.ts
    │  HERMES_RUNNER_MODE=smoke → returns canned text (NO real model call)
    │  events: seq=2 run.status:running   →   PutObject S3 hermes-report.md
    │            seq=3 artifact.created   →   seq=4 run.status:succeeded
    ▼
[ DynamoDB EventsTable  (Stream NEW_IMAGE) ]
    │
    ▼
[ Lambda relay  →  services/realtime-api/src/relay.ts ]
    │  query RealtimeConnections by TOPIC#run:{ws}:{run}
    │  filter where conn.userId === event.userId   (cross-user safe)
    │  postToConnection  via API Gateway Management
    ▼
[ wss://3ooyj7whoh...  WebSocket ]
    ▼
[ apps/web/components/command-center.tsx ]
    │  parseRealtimeRunEvent → mergeRunEvents → React state
    ▼
[ user sees timeline + artifact card ]
```

Full forensic trace with file:line citations: [run-creation.md](flows/run-creation.md).

---

## Per-user execution model (intent vs reality)

**Vision (what the user wants for hackathon):**

```
   user A              user B              user C
     │                   │                   │
     ▼                   ▼                   ▼
 ┌────────────┐    ┌────────────┐    ┌────────────┐
 │ ResidentRunner   ResidentRunner   ResidentRunner│
 │ ECS task     │   ECS task     │   ECS task     │
 │              │                │                │
 │ ├ agent: PM  │   ├ agent: ENG │   ├ agent: RES │
 │ ├ agent: ENG │   ├ agent: QA  │   └ agent: WRI │
 │ └ agent: RES │   └ agent: PM  │                │
 └────────────┘    └────────────┘    └────────────┘
```

**Reality today:**

```
   user A              user B              user C
     │                   │                   │
     ▼                   ▼                   ▼
 ┌─────────────────────────────────────────────────┐
 │ Step Functions simple-run                       │
 │ (one stateless ECS Fargate task per run)        │
 │ launches agent-runtime image (smoke worker)     │
 │ does NOT route by userId, does NOT reuse runner │
 └─────────────────────────────────────────────────┘
```

The resident-runner Docker image, TaskDefinition, in-process server, and HTTP API all exist. **The dispatcher that calls `ecs:RunTask` for it does not.** The `UserRunners` DDB table is provisioned and writable but no scheduler reads `desiredState` and acts on it.

Full analysis: [multi-user-routing.md](flows/multi-user-routing.md), [agent-runtime.md](services/agent-runtime.md).

---

## DynamoDB table map

14 tables all in [stacks.md#statestack](infrastructure/stacks.md#statestack). Quick map:

| Table | Partition / Sort | Used by | Purpose |
|---|---|---|---|
| WorkItems | workspaceId / workItemId | control-api | objectives above runs |
| Runs | workspaceId / runId | control-api, worker | run header |
| Tasks | runId / taskId | control-api, worker | sub-units |
| Events | runId / seq | worker writes; relay reads stream | canonical event log |
| Artifacts | runId / artifactId | worker writes | output index |
| DataSources | workspaceId / dataSourceId | none | unused |
| Surfaces | workspaceId / surfaceId | none | unused |
| Approvals | workspaceId / approvalId | none | unused |
| PreviewDeployments | previewHost / deploymentId | none | unused |
| RealtimeConnections | pk / sk | realtime-api | active WS connections + topics |
| HostNodes | hostId / hostRecordType | control-api | runner placement state (no scheduler) |
| UserRunners | **userId** / runnerId | control-api | per-user runner ledger (no actuator) |
| RunnerSnapshots | runnerId / snapshotId | none | unused |
| AgentInstances | runnerId / agentId | none | unused |
| AgentProfiles | workspaceId / profileVersionKey | control-api | profile lifecycle |

Tables marked "no scheduler"/"unused" have schema and IAM grants but no code reads/writes them yet.

---

## Authentication

| Layer | Mechanism | Where |
|---|---|---|
| HTTP API ingress | API Gateway HttpJwtAuthorizer | infra/cdk/src/stacks/control-api-stack.ts |
| Lambda extracts userId | `event.requestContext.authorizer.jwt.claims.sub` | services/control-api/src/handlers.ts:391 |
| Run/work-item ownership | `record.userId !== user.userId → 404` | query-runs.ts:14, work-items.ts:193 |
| Admin gate | `ADMIN_EMAILS` env match | query-runs.ts:130 (hardcoded `seb4594@gmail.com`) |
| WebSocket connect | aws-jwt-verify of Cognito ID token in `?token=` | services/realtime-api/src/auth.ts:30 |
| Stream relay fan-out | filter `conn.userId !== event.userId` | services/realtime-api/src/relay.ts:25 |
| ECS task | task role; no JWT (trusted because launched only by SFN, which is launched only by authenticated Lambda) | runtime-stack.ts |

Cognito user pool is **owned by Amplify**, not CDK. ID `us-east-1_1UeU1hTME` is hardcoded in CDK config. See [secondary-infra.md](infrastructure/secondary-infra.md).

---

## Event protocol

All events are `CanonicalEventEnvelope<TPayload>` defined in `packages/protocol/src/events.ts:39-64`:
- Required: `id`, `type` matching `[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+`, `seq`, `createdAt`, `orgId`, `userId`, `workspaceId`, `runId`, `source.{kind,name}`, `payload`.
- Concrete types in use today: `run.status`, `artifact.created`, `tool.approval` (harness only).
- Reserved (defined, no producer): `a2ui.delta`.

Schema files: `packages/protocol/schemas/events/{run-status,artifact,tool-approval,a2ui-delta}.schema.json`.

---

## Layer pages

- [Infrastructure](infrastructure/README.md) — all CDK + secondary infra
- [Services](services/README.md) — backend services
- [Clients](clients/README.md) — web + Flutter
- [Flows](flows/run-creation.md) — end-to-end traces
- [Product surfaces](surfaces/README.md) — what users see
- [Gaps & skip list](gaps.md) — what's deferred
