import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryRealtimeStore } from "../src/subscriptions.js";

test("realtime store saves, subscribes, queries, unsubscribes, and disconnects a connection", async () => {
  const store = new InMemoryRealtimeStore();

  await store.saveConnection({
    connectionId: "conn-1",
    userId: "user-1",
    email: "user@example.com",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });

  await store.subscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1", userId: "user-1" });

  assert.deepEqual(await store.listConnectionsForRun("workspace-1", "run-1"), [
    {
      connectionId: "conn-1",
      userId: "user-1",
      email: "user@example.com",
      domainName: "abc.execute-api.us-east-1.amazonaws.com",
      stage: "dev",
      connectedAt: "2026-05-10T00:00:00.000Z"
    }
  ]);

  await store.unsubscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1" });
  assert.deepEqual(await store.listConnectionsForRun("workspace-1", "run-1"), []);

  await store.subscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1", userId: "user-1" });
  await store.deleteConnection("conn-1");
  assert.deepEqual(await store.listConnectionsForRun("workspace-1", "run-1"), []);
});
