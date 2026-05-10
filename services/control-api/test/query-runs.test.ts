import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRunStatusEvent } from "@agents-cloud/protocol";
import { getRun, listRunEvents } from "../src/query-runs.js";
import type { AuthenticatedUser, ControlApiStore, EventRecord, RunRecord, TaskRecord } from "../src/ports.js";

class MemoryStore implements ControlApiStore {
  public constructor(
    private readonly run?: RunRecord,
    private readonly events: EventRecord[] = []
  ) {}

  async putRun(): Promise<void> {}
  async putTask(): Promise<void> {}
  async putEvent(): Promise<void> {}

  async putWorkItem(): Promise<void> {}
  async getWorkItem(): Promise<undefined> { return undefined; }
  async getWorkItemByIdempotencyScope(): Promise<undefined> { return undefined; }
  async updateWorkItem(): Promise<undefined> { return undefined; }
  async listWorkItemsForUser(): Promise<[]> { return []; }
  async listRunsForWorkItem(): Promise<[]> { return []; }
  async listRunsForUser(): Promise<[]> { return []; }
  async createRunLedger(): Promise<void> {}
  async updateRunExecution(): Promise<void> {}

  async getRunById(): Promise<RunRecord | undefined> {
    return this.run;
  }

  async getRunByIdempotencyScope(): Promise<undefined> {
    return undefined;
  }

  async listRecentRuns(): Promise<RunRecord[]> {
    return this.run ? [this.run] : [];
  }

  async listEvents(_runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]> {
    return this.events
      .filter((event) => options?.afterSeq === undefined || event.seq > options.afterSeq)
      .slice(0, options?.limit ?? 100);
  }
}

const owner: AuthenticatedUser = { userId: "user-123", email: "owner@example.com" };
const run: RunRecord = {
  workspaceId: "workspace-abc",
  runId: "run-1",
  userId: "user-123",
  ownerEmail: "owner@example.com",
  objective: "Build",
  status: "queued",
  createdAt: "2026-05-09T19:30:00.000Z",
  updatedAt: "2026-05-09T19:30:00.000Z",
  executionArn: "execution-1"
};
const events: EventRecord[] = [
  buildRunStatusEvent({
    id: "evt-run-1-000001",
    seq: 1,
    createdAt: "2026-05-09T19:30:00.000Z",
    userId: "user-123",
    workspaceId: "workspace-abc",
    runId: "run-1",
    source: { kind: "control-api", name: "test" },
    status: "queued"
  }),
  buildRunStatusEvent({
    id: "evt-run-1-000002",
    seq: 2,
    createdAt: "2026-05-09T19:31:00.000Z",
    userId: "user-123",
    workspaceId: "workspace-abc",
    runId: "run-1",
    source: { kind: "worker", name: "test" },
    status: "running"
  })
];

describe("query runs", () => {
  it("returns an owned run by id", async () => {
    const result = await getRun({ store: new MemoryStore(run), user: owner, runId: "run-1" });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { run });
  });

  it("does not return another user's run", async () => {
    const result = await getRun({
      store: new MemoryStore({ ...run, userId: "other-user" }),
      user: owner,
      runId: "run-1"
    });
    assert.equal(result.statusCode, 404);
  });

  it("returns owned ordered events with an afterSeq cursor", async () => {
    const result = await listRunEvents({
      store: new MemoryStore(run, events),
      user: owner,
      runId: "run-1",
      afterSeq: 1,
      limit: 50
    });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { events: [events[1]], nextSeq: 2 });
  });
});
