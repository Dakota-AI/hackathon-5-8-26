# DynamoDB Tables — Reference

[← reference](README.md) · [wiki index](../README.md) · related: [StateStack](../infrastructure/stacks.md#statestack)

> All 14 tables in `infra/cdk/src/stacks/state-stack.ts`. Every table is `BillingMode.PAY_PER_REQUEST`. PITR enabled if env != `dev`. Deletion protection if env = `prod`.

---

## Index

Active in code:
1. [WorkItemsTable](#workitemstable)
2. [RunsTable](#runstable)
3. [TasksTable](#taskstable)
4. [EventsTable](#eventstable)
5. [ArtifactsTable](#artifactstable)
6. [RealtimeConnectionsTable](#realtimeconnectionstable)
7. [HostNodesTable](#hostnodestable)
8. [UserRunnersTable](#userrunnerstable)
9. [AgentProfilesTable](#agentprofilestable)

Provisioned but unused:
10. [DataSourcesTable](#datasourcestable)
11. [SurfacesTable](#surfacestable)
12. [ApprovalsTable](#approvalstable)
13. [PreviewDeploymentsTable](#previewdeploymentstable)
14. [RunnerSnapshotsTable](#runnersnapshotstable)
15. [AgentInstancesTable](#agentinstancestable)

---

## WorkItemsTable

**Used by:** control-api (real)

- **PK:** `workspaceId`
- **SK:** `workItemId`
- **GSIs:**
  - `by-user-created-at` (userId / createdAt) — list user's items
  - `by-status-updated-at` (workspaceStatus / updatedAt) — admin views
  - `by-idempotency-scope` (idempotencyScope) — POST dedup

**Reads:** `listWorkItemsForUser` (`dynamo-store.ts:151`), `getWorkItem`.
**Writes:** `createWorkItem`, `updateWorkItemStatus`, `patchWorkItem`.

[→ work-items surface](../surfaces/work-items.md)

---

## RunsTable

**Used by:** control-api + agent-runtime worker (real)

- **PK:** `workspaceId`
- **SK:** `runId`
- **GSIs:**
  - `by-user-created-at` — queried by `GET /runs`
  - `by-run-id` (runId) — for `GET /runs/{runId}` lookup
  - `by-idempotency-scope` — POST dedup
  - `by-workitem-created-at` (workItemId / createdAt) — work-item child runs

**Reads:** `getRunByRunId` (uses `by-run-id`), `listRecentRuns` (admin Scan), `listRunsForUser` (`by-user-created-at`).
**Writes:** `createRunLedger` (TransactWrite), `updateRunStatus`, `updateRunExecution`.

⚠️ **No task-level read path exists yet** for `GET /runs/{runId}/tasks`.

[→ runs-and-tasks surface](../surfaces/runs-and-tasks.md)

---

## TasksTable

**Used by:** control-api + agent-runtime worker (real)

- **PK:** `runId`
- **SK:** `taskId`
- **GSI:** `by-worker-class-created-at` (workerClass / createdAt) — fleet routing

**Reads:** none in code yet (no `GET /runs/{runId}/tasks` route).
**Writes:** `createRunLedger` writes the initial task; `updateTaskStatus` updates it.

⚠️ No client-facing read endpoint.

---

## EventsTable

**Used by:** worker writes; relay reads stream

- **PK:** `runId`
- **SK:** `seq` (NUMBER)
- **Stream:** `NEW_IMAGE` enabled — drives realtime fanout
- **GSI:** `by-workspace-created-at` (workspaceId / createdAt)

**Reads:** `listEvents` (run-scoped), `listAdminRunEvents` (admin).
**Writes:** worker writes seq=2 (running), 3 (artifact), 4 (succeeded). Control API writes seq=1 (queued).

⚠️ **Hardcoded seq numbers** in worker → retries crash on `attribute_not_exists(seq)` conditional.

The DDB stream is consumed by `services/realtime-api/src/relay.ts`. See [realtime-api](../services/realtime-api.md).

---

## ArtifactsTable

**Used by:** worker writes; control API reads.

- **PK:** `runId`
- **SK:** `artifactId`
- **GSIs:**
  - `by-workspace-kind-created-at` (workspaceKind / createdAt)
  - `by-workitem-created-at` (workItemId / createdAt)

**Writes:** `aws-artifact-sink.ts:37-43` writes one row per artifact.
**Reads:** `listRunArtifacts`, `listWorkItemArtifacts`, `getRunArtifact`.

---

## DataSourcesTable

**Used by:** control-api via `DataSourceRefStore`.

- **PK:** `workspaceId`
- **SK:** `dataSourceId`
- **GSIs:** `by-workitem-created-at`, `by-run-created-at`, `by-artifact-id`

Used by `data-source-refs.ts` route handlers for create/list/get.

---

## SurfacesTable

**Used by:** control-api via `SurfaceStore`.

- **PK:** `workspaceId`
- **SK:** `surfaceId`
- **GSIs:** `by-workitem-updated-at`, `by-run-updated-at`, `by-status-updated-at`

Used by `surfaces.ts` for create/list/update/publish endpoints.

---

## ApprovalsTable

**Used by:** control-api via `ApprovalStore`.

- **PK:** `workspaceId`
- **SK:** `approvalId`
- **GSI:** `by-run-created-at`

Used by `approvals.ts` for create/list/get/decision endpoints.

---

## PreviewDeploymentsTable

**Used by:** ❌ nothing in code (preview-router service is README-only)

- **PK:** `previewHost`
- **SK:** `deploymentId`
- **GSIs:** `by-workspace-updated-at`, `by-project-updated-at`

Designed for the (deferred) preview router. 🗑️ Skip for hackathon.

---

## RealtimeConnectionsTable

**Used by:** realtime-api (real)

- **PK:** `pk` (e.g. `CONN#{connectionId}` or `TOPIC#run:{ws}:{run}`)
- **SK:** `sk` (e.g. `META` or `CONN#{connectionId}`)
- **GSI:** `by-connection`

**Writes:** `$connect` writes `pk=CONN#..., sk=META` with userId. `subscribeRun` writes `pk=TOPIC#..., sk=CONN#...` with userId.
**Reads:** relay queries `pk=TOPIC#run:{ws}:{run}` to fan out events.

See [realtime-api](../services/realtime-api.md).

---

## HostNodesTable

**Used by:** control-api (real, admin)

- **PK:** `hostId`
- **SK:** `hostRecordType`
- **GSIs:** `by-status-last-heartbeat`, `by-placement-target-status`

**Routes:** `POST /runner-hosts`, `POST /runner-hosts/{hostId}/heartbeat` (admin-gated).
**Reads:** `GET /admin/runners` joins this with UserRunnersTable.

---

## UserRunnersTable

**Used by:** control-api (CRUD); ❌ no actuator

- **PK:** **`userId`** (the only userId-keyed table)
- **SK:** `runnerId`
- **GSIs:**
  - `by-runner-id`
  - `by-host-status`
  - `by-status-last-heartbeat`
  - `by-desired-state-updated-at`

**Routes:** `POST /user-runners`, `GET/PATCH /user-runners/{runnerId}`, `POST /user-runners/{runnerId}/heartbeat`.

⚠️ **No code reads `desiredState` and starts/stops Fargate tasks.** This is the missing scheduler. See [multi-user-routing](../flows/multi-user-routing.md), [HACKATHON_CRITICAL_PATH](../HACKATHON_CRITICAL_PATH.md#2).

---

## RunnerSnapshotsTable

**Used by:** ❌ nothing

- **PK:** `runnerId`
- **SK:** `snapshotId`
- **GSIs:** `by-user-created-at`, `by-workspace-created-at`

Designed for ResidentRunner snapshot/restore. ResidentRunner currently persists state to local FS only. **No code writes here.**

---

## AgentInstancesTable

**Used by:** ❌ nothing

- **PK:** `runnerId`
- **SK:** `agentId`
- **GSIs:** `by-user-status-updated-at`, `by-next-wake-at`

Designed to track logical agents inside a runner. ResidentRunner state lives in local JSON. **No code writes here.**

---

## AgentProfilesTable

**Used by:** control-api (real)

- **PK:** `workspaceId`
- **SK:** `profileVersionKey` (`{profileId}#{version}`)
- **GSIs:** `by-user-created-at`, `by-lifecycle-updated-at`

**Routes:** agent-profile drafts/list/get/approve via `services/control-api/src/agent-profiles.ts`.
**Bundle store:** S3 bundles written to `WorkspaceLiveArtifactsBucket` at `workspaces/{workspaceId}/agent-profiles/{profileId}/versions/{version}/profile.json`.

[→ agent-profile-package](agent-profile-package.md) · [→ agent-creator](agent-creator.md)

---

## Summary

| Table | Code use | Status |
|---|---|---|
| WorkItemsTable | ✅ real |  |
| RunsTable | ✅ real (no user list endpoint) | ⚠️ |
| TasksTable | ✅ writes only |  |
| EventsTable | ✅ real |  |
| ArtifactsTable | ⚠️ writes only, 501 reads |  |
| RealtimeConnectionsTable | ✅ real |  |
| HostNodesTable | ✅ real |  |
| UserRunnersTable | ✅ CRUD, ❌ no actuator | 🚨 |
| AgentProfilesTable | ✅ real |  |
| DataSourcesTable | 🔘 unused |  |
| SurfacesTable | 🔘 unused |  |
| ApprovalsTable | 🔘 unused |  |
| PreviewDeploymentsTable | 🔘 unused | 🗑️ |
| RunnerSnapshotsTable | 🔘 unused |  |
| AgentInstancesTable | 🔘 unused |  |

**Provisioned but unused tables = 6.** They're cheap (PAY_PER_REQUEST), so leaving them is fine. But it does mean the surface area documented in ADRs is significantly larger than what the codebase actually exercises.

[← reference](README.md)
