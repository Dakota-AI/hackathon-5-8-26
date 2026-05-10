import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRealtimeEvent, parseRealtimeEvent } from "../src/protocol.js";

describe("realtime protocol", () => {
  it("builds a canonical AWS-led realtime event envelope with deterministic ids and timestamps", () => {
    const event = buildRealtimeEvent({
      eventId: "evt-1",
      runId: "run-123",
      workspaceId: "workspace-abc",
      seq: 7,
      type: "run.status",
      payload: { status: "running" },
      createdAt: "2026-05-10T00:00:00.000Z"
    });

    assert.deepEqual(event, {
      eventId: "evt-1",
      runId: "run-123",
      workspaceId: "workspace-abc",
      seq: 7,
      type: "run.status",
      payload: { status: "running" },
      createdAt: "2026-05-10T00:00:00.000Z"
    });
  });

  it("rejects malformed relay events before they can enter a Durable Object", () => {
    assert.throws(
      () => parseRealtimeEvent({ runId: "run-123", workspaceId: "workspace-abc", seq: 0, type: "run.status" }),
      /eventId is required/
    );

    assert.throws(
      () => parseRealtimeEvent({ eventId: "evt-1", runId: "run-123", workspaceId: "workspace-abc", seq: 0, type: "run.status", createdAt: "2026-05-10T00:00:00.000Z" }),
      /seq must be a positive integer/
    );
  });
});
