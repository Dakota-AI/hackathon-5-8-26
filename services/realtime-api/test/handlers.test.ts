import assert from "node:assert/strict";
import { test } from "node:test";
import { handleConnect, handleDisconnect, handleDefault } from "../src/handlers.js";
import { InMemoryRealtimeStore } from "../src/subscriptions.js";
import { InMemoryRunStore } from "../src/run-store.js";

const baseEvent = {
  requestContext: {
    connectionId: "conn-1",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    authorizer: {
      userId: "user-1",
      email: "user@example.com"
    }
  }
};

test("handleConnect persists authorized connection metadata", async () => {
  const store = new InMemoryRealtimeStore();
  const response = await handleConnect(baseEvent, store, () => "2026-05-10T00:00:00.000Z");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(await store.getConnection("conn-1"), {
    connectionId: "conn-1",
    userId: "user-1",
    email: "user@example.com",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });
});

test("handleDefault subscribes and unsubscribes a connection to a run", async () => {
  const store = new InMemoryRealtimeStore();
  const runStore = new InMemoryRunStore([{ runId: "run-1", workspaceId: "workspace-1", userId: "user-1" }]);
  await handleConnect(baseEvent, store, () => "2026-05-10T00:00:00.000Z");

  const subscribe = await handleDefault({
    ...baseEvent,
    body: JSON.stringify({ action: "subscribeRun", workspaceId: "workspace-1", runId: "run-1" })
  }, store, runStore);
  assert.equal(subscribe.statusCode, 200);
  assert.equal((await store.listConnectionsForRun("workspace-1", "run-1")).length, 1);

  const unsubscribe = await handleDefault({
    ...baseEvent,
    body: JSON.stringify({ action: "unsubscribeRun", workspaceId: "workspace-1", runId: "run-1" })
  }, store, runStore);
  assert.equal(unsubscribe.statusCode, 200);
  assert.equal((await store.listConnectionsForRun("workspace-1", "run-1")).length, 0);
});

test("handleDisconnect removes connection and subscriptions", async () => {
  const store = new InMemoryRealtimeStore();
  const runStore = new InMemoryRunStore([{ runId: "run-1", workspaceId: "workspace-1", userId: "user-1" }]);
  await handleConnect(baseEvent, store, () => "2026-05-10T00:00:00.000Z");
  await handleDefault({
    ...baseEvent,
    body: JSON.stringify({ action: "subscribeRun", workspaceId: "workspace-1", runId: "run-1" })
  }, store, runStore);

  const response = await handleDisconnect(baseEvent, store);

  assert.equal(response.statusCode, 200);
  assert.equal(await store.getConnection("conn-1"), undefined);
  assert.deepEqual(await store.listConnectionsForRun("workspace-1", "run-1"), []);
});

test("handleDefault rejects unauthorized subscription attempts for non-owner users", async () => {
  const store = new InMemoryRealtimeStore();
  const runStore = new InMemoryRunStore([{ runId: "run-1", workspaceId: "workspace-1", userId: "owner-user-1" }]);
  await handleConnect({
    ...baseEvent,
    requestContext: { ...baseEvent.requestContext, authorizer: { userId: "different-user" } }
  }, store, () => "2026-05-10T00:00:00.000Z");

  const response = await handleDefault({
    ...baseEvent,
    requestContext: { ...baseEvent.requestContext, authorizer: { userId: "different-user" } },
    body: JSON.stringify({ action: "subscribeRun", workspaceId: "workspace-1", runId: "run-1" })
  }, store, runStore);

  assert.equal(response.statusCode, 403);
});
