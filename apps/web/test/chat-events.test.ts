import assert from "node:assert/strict";
import test from "node:test";
import { buildChatTurns, chatTurnFromEvent, mergeChatEvents } from "../lib/chat-events.ts";
import type { RunEvent, WorkItemRecord } from "../lib/control-api.ts";

const base = {
  id: "event-1",
  runId: "run-1",
  seq: 1,
  type: "run.status",
  createdAt: "2026-05-10T12:00:00.000Z",
  payload: {}
} satisfies RunEvent;

function event(overrides: Partial<RunEvent>): RunEvent {
  return { ...base, ...overrides, payload: overrides.payload ?? base.payload };
}

test("chatTurnFromEvent renders final assistant markdown as the assistant message", () => {
  const turn = chatTurnFromEvent(event({
    id: "event-final",
    seq: 5,
    type: "assistant.response.final",
    payload: { markdown: "# Final answer\n\n- shipped", agentRole: "Executive Delegator" }
  }));

  assert.equal(turn?.role, "assistant");
  assert.equal(turn?.kind, "message");
  assert.equal(turn?.actorLabel, "Executive Delegator");
  assert.match(turn?.text ?? "", /# Final answer/);
});

test("chatTurnFromEvent ignores run.status events so fake progress bubbles are not created", () => {
  assert.equal(chatTurnFromEvent(event({ seq: 2, type: "run.status", payload: { status: "planning" } })), null);
  assert.equal(chatTurnFromEvent(event({ seq: 3, type: "run.status", payload: { status: "running" } })), null);
});

test("chatTurnFromEvent renders delegated agents, work items, and engagement events as high-signal turns", () => {
  const delegated = chatTurnFromEvent(event({
    id: "event-delegated",
    seq: 2,
    type: "agent.delegated",
    payload: { delegatedAgentRole: "Research Agent", objective: "Map the market" }
  }));
  const work = chatTurnFromEvent(event({
    id: "event-work",
    seq: 3,
    type: "work.item.created",
    payload: { objective: "Draft the market report" }
  }));
  const call = chatTurnFromEvent(event({
    id: "event-call",
    seq: 4,
    type: "user.call.requested",
    payload: { summary: "Approve launch copy" }
  }));

  assert.equal(delegated?.text, "Created Research Agent: Map the market");
  assert.equal(work?.text, "Created task: Draft the market report");
  assert.equal(call?.role, "system");
  assert.equal(call?.text, "Phone call requested: Approve launch copy");
});

test("buildChatTurns includes the user objective, artifacts, and final markdown in sequence order", () => {
  const workItem: WorkItemRecord = {
    workItemId: "workitem-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    objective: "Build the dashboard",
    title: "Dashboard",
    status: "open",
    createdAt: "2026-05-10T11:59:00.000Z",
    updatedAt: "2026-05-10T11:59:00.000Z"
  };
  const turns = buildChatTurns({
    workItem,
    events: [
      event({ id: "event-final", seq: 4, type: "assistant.response.final", payload: { markdown: "Done." } }),
      event({ id: "event-running", seq: 2, type: "run.status", payload: { status: "running" } }),
      event({ id: "event-artifact", seq: 3, type: "artifact.created", payload: { kind: "report", name: "CEO report", artifactId: "artifact-1", uri: "s3://bucket/key" } })
    ]
  });

  assert.deepEqual(turns.map((turn) => [turn.role, turn.kind, turn.text]), [
    ["user", "message", "Build the dashboard"],
    ["assistant", "artifact", "Created report: CEO report"],
    ["assistant", "message", "Done."]
  ]);
});

test("mergeChatEvents de-duplicates realtime/polled events by id and sequence", () => {
  const merged = mergeChatEvents(
    [event({ id: "event-2", seq: 2, type: "artifact.created", payload: { name: "Old", kind: "report" } })],
    [
      event({ id: "event-2", seq: 2, type: "artifact.created", payload: { name: "New", kind: "report" } }),
      event({ id: "event-3", seq: 3, type: "assistant.response.final", payload: { markdown: "Done" } })
    ]
  );

  assert.deepEqual(merged.map((e) => [e.id, e.seq]), [["event-2", 2], ["event-3", 3]]);
  const first = merged[0];
  assert.ok(first);
  assert.equal(first.payload?.name, "New");
});
