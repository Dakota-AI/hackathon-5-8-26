import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DynamoControlApiStore } from "../src/dynamo-store.js";
import type { RunRecord } from "../src/ports.js";

class FakeDynamoClient {
  public async send(): Promise<{ Items: unknown[] }> {
    return {
      Items: [
        {
          workspaceId: "workspace-a",
          runId: "run-a",
          userId: "user-a",
          status: "succeeded",
          createdAt: "2026-05-10T05:00:00.000Z",
          updatedAt: "2026-05-10T05:01:00.000Z"
        },
        {
          workspaceId: "workspace-malformed",
          runId: "run-malformed",
          userId: "user-b",
          status: "queued"
        },
        {
          workspaceId: "workspace-b",
          runId: "run-b",
          userId: "user-b",
          status: "queued",
          createdAt: "2026-05-10T06:00:00.000Z",
          updatedAt: "2026-05-10T06:01:00.000Z"
        }
      ]
    };
  }
}

describe("DynamoControlApiStore", () => {
  it("lists recent runs without crashing on malformed rows missing createdAt", async () => {
    const store = new DynamoControlApiStore(new FakeDynamoClient() as never, {
      workItemsTableName: "work-items",
      runsTableName: "runs",
      tasksTableName: "tasks",
      eventsTableName: "events"
    });

    const runs = await store.listRecentRuns(75);

    assert.deepEqual(
      runs.map((run: RunRecord) => run.runId),
      ["run-b", "run-a"]
    );
  });
});
