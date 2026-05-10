import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthenticatedUser, ControlApiStore, DataSourceRefRecord, DataSourceRefStore, RunRecord, WorkItemRecord } from "../src/ports.js";
import { createDataSourceRef, getDataSourceRef, listDataSourceRefsForRun, listDataSourceRefsForWorkItem } from "../src/data-source-refs.js";

interface DataSourceTestStore extends ControlApiStore, DataSourceRefStore {
  readonly dataSourceRefs: DataSourceRefRecord[];
}

function createStore(seed: {
  readonly runById: Record<string, RunRecord>;
  readonly workItemById: Record<string, WorkItemRecord>;
  readonly dataSourceRefs: DataSourceRefRecord[];
}): DataSourceTestStore {
  const dataSourceRefs = [...seed.dataSourceRefs];

  return {
    dataSourceRefs,

    putRun: async () => undefined,
    putTask: async () => undefined,
    putEvent: async () => undefined,
    putWorkItem: async () => undefined,
    getWorkItem: async (workspaceId, workItemId) => seed.workItemById[`${workspaceId}:${workItemId}`],
    getWorkItemByIdempotencyScope: async () => undefined,
    updateWorkItem: async () => undefined,
    listWorkItemsForUser: async () => [],
    listRunsForWorkItem: async () => [],
    createRunLedger: async () => undefined,
    updateRunExecution: async () => undefined,
    getRunById: async (runId) => seed.runById[runId],
    getRunByIdempotencyScope: async () => undefined,
    listRecentRuns: async () => [],
    listRunsForUser: async () => [],
    listEvents: async () => [],

    putDataSourceRef: async (item) => {
      dataSourceRefs.push(item);
    },
    getDataSourceRef: async (_workspaceId, dataSourceId) => dataSourceRefs.find((item) => item.dataSourceId === dataSourceId),
    listDataSourceRefsForWorkItem: async ({ workItemId }) => dataSourceRefs.filter((item) => item.workItemId === workItemId),
    listDataSourceRefsForRun: async ({ runId }) => dataSourceRefs.filter((item) => item.runId === runId)
  };
}

describe("data source refs", () => {
  it("creates and reads a data source ref for a run", async () => {
    const store = createStore({
      runById: {
        "run-1": {
          workspaceId: "ws-1",
          runId: "run-1",
          userId: "user-123",
          objective: "Research competitors",
          status: "running",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      },
      workItemById: {},
      dataSourceRefs: []
    });

    const createResult = await createDataSourceRef({
      store,
      user: { userId: "user-123" },
      now: () => "2026-05-10T00:00:00.000Z",
      newId: () => "id-1",
      request: {
        workspaceId: "ws-1",
        runId: "run-1",
        sourceKind: "web",
        source: "https://example.com"
      }
    });
    assert.equal(createResult.statusCode, 201);

    const created = createResult.body.dataSourceRef as DataSourceRefRecord;
    const getResult = await getDataSourceRef({
      store,
      user: { userId: "user-123" },
      workspaceId: "ws-1",
      dataSourceId: created.dataSourceId
    });

    assert.equal(getResult.statusCode, 200);
    assert.deepEqual(getResult.body.dataSourceRef, { ...created, dataSourceId: "data-id-1" });
  });

  it("does not allow reading refs from another user", async () => {
    const store = createStore({
      runById: {
        "run-1": {
          workspaceId: "ws-1",
          runId: "run-1",
          userId: "user-123",
          objective: "Research competitors",
          status: "running",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      },
      workItemById: {},
      dataSourceRefs: [
        {
          workspaceId: "ws-1",
          dataSourceId: "ds-1",
          userId: "user-123",
          runId: "run-1",
          sourceKind: "web",
          source: "https://mine.example",
          status: "available",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      ]
    });

    const result = await getDataSourceRef({
      store,
      user: { userId: "user-999" },
      workspaceId: "ws-1",
      dataSourceId: "ds-1"
    });

    assert.equal(result.statusCode, 404);
  });

  it("returns only current-user refs when listing run refs", async () => {
    const store = createStore({
      runById: {
        "run-1": {
          workspaceId: "ws-1",
          runId: "run-1",
          userId: "user-123",
          objective: "Research competitors",
          status: "running",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      },
      workItemById: {},
      dataSourceRefs: [
        {
          workspaceId: "ws-1",
          dataSourceId: "ds-owned",
          userId: "user-123",
          runId: "run-1",
          sourceKind: "web",
          source: "https://mine.example",
          status: "available",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        },
        {
          workspaceId: "ws-1",
          dataSourceId: "ds-other",
          userId: "other-user",
          runId: "run-1",
          sourceKind: "web",
          source: "https://others.example",
          status: "available",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      ]
    });

    const result = await listDataSourceRefsForRun({ store, user: { userId: "user-123" }, runId: "run-1" });
    assert.equal(result.statusCode, 200);
    assert.deepEqual((result.body.dataSourceRefs as DataSourceRefRecord[]).map((ref) => ref.dataSourceId), ["ds-owned"]);
  });

  it("returns only current-user refs when listing work-item refs", async () => {
    const store = createStore({
      runById: {},
      workItemById: {
        "ws-1:wi-1": {
          workspaceId: "ws-1",
          workItemId: "wi-1",
          title: "Work item title",
          userId: "user-123",
          objective: "Research competitors",
          priority: "normal",
          status: "created",
          workspaceStatus: "active",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      },
      dataSourceRefs: [
        {
          workspaceId: "ws-1",
          dataSourceId: "d1",
          userId: "user-123",
          workItemId: "wi-1",
          sourceKind: "web",
          source: "https://mine.example",
          status: "available",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        },
        {
          workspaceId: "ws-1",
          dataSourceId: "d2",
          userId: "other-user",
          workItemId: "wi-1",
          sourceKind: "web",
          source: "https://others.example",
          status: "available",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z"
        }
      ]
    });

    const result = await listDataSourceRefsForWorkItem({
      store,
      user: { userId: "user-123" },
      workspaceId: "ws-1",
      workItemId: "wi-1"
    });

    assert.equal(result.statusCode, 200);
    assert.deepEqual((result.body.dataSourceRefs as DataSourceRefRecord[]).map((ref) => ref.dataSourceId), ["d1"]);
  });
});
