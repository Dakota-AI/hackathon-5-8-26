import assert from "node:assert/strict";
import { test } from "node:test";
import { publishRealtimeEvent } from "../src/relay.js";
import { InMemoryRealtimeStore } from "../src/subscriptions.js";

class RecordingPublisher {
  public readonly sent: Array<{ connectionId: string; payload: unknown }> = [];
  public readonly stale = new Set<string>();

  async postToConnection(connectionId: string, payload: unknown): Promise<void> {
    if (this.stale.has(connectionId)) {
      const error = new Error("Gone");
      (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata = { httpStatusCode: 410 };
      throw error;
    }
    this.sent.push({ connectionId, payload });
  }
}

test("publishRealtimeEvent sends a run event to subscribed connections", async () => {
  const store = new InMemoryRealtimeStore();
  const publisher = new RecordingPublisher();
  await store.saveConnection({
    connectionId: "conn-1",
    userId: "user-1",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });
  await store.subscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1", userId: "user-1" });

  await publishRealtimeEvent(
    {
      runId: "run-1",
      workspaceId: "workspace-1",
      seq: 2,
      type: "run.status",
      createdAt: "2026-05-10T00:00:01.000Z",
      payload: { status: "running" }
    },
    store,
    publisher
  );

  assert.equal(publisher.sent.length, 1);
  assert.equal(publisher.sent[0].connectionId, "conn-1");
  assert.deepEqual(publisher.sent[0].payload, {
    eventId: "run-1:2",
    userId: undefined,
    runId: "run-1",
    workspaceId: "workspace-1",
    seq: 2,
    type: "run.status",
    createdAt: "2026-05-10T00:00:01.000Z",
    payload: { status: "running" }
  });
});

test("publishRealtimeEvent only sends user-scoped events to matching authenticated connections", async () => {
  const store = new InMemoryRealtimeStore();
  const publisher = new RecordingPublisher();
  await store.saveConnection({
    connectionId: "conn-1",
    userId: "user-1",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });
  await store.saveConnection({
    connectionId: "conn-2",
    userId: "user-2",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });
  await store.subscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1", userId: "user-1" });
  await store.subscribeRun({ connectionId: "conn-2", workspaceId: "workspace-1", runId: "run-1", userId: "user-2" });

  await publishRealtimeEvent(
    {
      eventId: "evt-run-1-000002",
      userId: "user-1",
      runId: "run-1",
      workspaceId: "workspace-1",
      seq: 2,
      type: "run.status",
      createdAt: "2026-05-10T00:00:01.000Z",
      payload: { status: "running" }
    },
    store,
    publisher
  );

  assert.deepEqual(publisher.sent.map((item) => item.connectionId), ["conn-1"]);
});

test("publishRealtimeEvent deletes stale connections when API Gateway returns gone", async () => {
  const store = new InMemoryRealtimeStore();
  const publisher = new RecordingPublisher();
  publisher.stale.add("conn-1");
  await store.saveConnection({
    connectionId: "conn-1",
    userId: "user-1",
    domainName: "abc.execute-api.us-east-1.amazonaws.com",
    stage: "dev",
    connectedAt: "2026-05-10T00:00:00.000Z"
  });
  await store.subscribeRun({ connectionId: "conn-1", workspaceId: "workspace-1", runId: "run-1", userId: "user-1" });

  await publishRealtimeEvent(
    {
      runId: "run-1",
      workspaceId: "workspace-1",
      seq: 2,
      type: "run.status",
      createdAt: "2026-05-10T00:00:01.000Z",
      payload: { status: "running" }
    },
    store,
    publisher
  );

  assert.equal(await store.getConnection("conn-1"), undefined);
  assert.deepEqual(await store.listConnectionsForRun("workspace-1", "run-1"), []);
});
