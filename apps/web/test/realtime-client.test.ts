import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRealtimeWebSocketUrl,
  getRealtimeApiHealth,
  parseRealtimeRunEvent,
  serializeSubscribeRunMessage,
  serializeUnsubscribeRunMessage
} from "../lib/realtime-client.ts";

test("getRealtimeApiHealth reports configured realtime URL outside mock mode", () => {
  assert.deepEqual(getRealtimeApiHealth({ realtimeUrl: "wss://example.test/dev", mockMode: false }), {
    configured: true,
    url: "wss://example.test/dev",
    mockMode: false
  });
});

test("getRealtimeApiHealth disables realtime in local API mock mode", () => {
  assert.deepEqual(getRealtimeApiHealth({ realtimeUrl: "wss://example.test/dev", mockMode: true }), {
    configured: false,
    url: "wss://example.test/dev",
    mockMode: true
  });
});

test("buildRealtimeWebSocketUrl appends the Cognito token query parameter safely", () => {
  assert.equal(
    buildRealtimeWebSocketUrl("wss://example.test/dev", "token with spaces+/="),
    "wss://example.test/dev?token=token+with+spaces%2B%2F%3D"
  );
  assert.equal(
    buildRealtimeWebSocketUrl("wss://example.test/dev?client=web", "abc"),
    "wss://example.test/dev?client=web&token=abc"
  );
});

test("serializeSubscribeRunMessage uses the deployed realtime action contract", () => {
  assert.equal(
    serializeSubscribeRunMessage({ workspaceId: "workspace-web", runId: "run-123" }),
    JSON.stringify({ action: "subscribeRun", workspaceId: "workspace-web", runId: "run-123" })
  );
});

test("serializeUnsubscribeRunMessage uses the deployed realtime action contract", () => {
  assert.equal(
    serializeUnsubscribeRunMessage({ workspaceId: "workspace-web", runId: "run-123" }),
    JSON.stringify({ action: "unsubscribeRun", workspaceId: "workspace-web", runId: "run-123" })
  );
});

test("parseRealtimeRunEvent accepts deployed run event messages", () => {
  const event = parseRealtimeRunEvent(
    JSON.stringify({
      eventId: "event-1",
      runId: "run-123",
      workspaceId: "workspace-web",
      seq: 2,
      type: "run.status",
      createdAt: "2026-05-10T00:00:00.000Z",
      payload: { status: "running" }
    })
  );

  assert.deepEqual(event, {
    id: "event-1",
    runId: "run-123",
    workspaceId: "workspace-web",
    seq: 2,
    type: "run.status",
    createdAt: "2026-05-10T00:00:00.000Z",
    payload: { status: "running" }
  });
});

test("parseRealtimeRunEvent ignores acks, pongs, and malformed messages", () => {
  assert.equal(parseRealtimeRunEvent(JSON.stringify({ ok: true, subscribed: { runId: "run-123" } })), null);
  assert.equal(parseRealtimeRunEvent(JSON.stringify({ type: "pong" })), null);
  assert.equal(parseRealtimeRunEvent("not-json"), null);
  assert.equal(parseRealtimeRunEvent(JSON.stringify({ runId: "run-123", seq: "2", type: "run.status" })), null);
});
