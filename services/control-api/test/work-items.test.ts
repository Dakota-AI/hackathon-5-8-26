import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkItem, createWorkItemRun, getWorkItem, listWorkItemEvents, listWorkItemRuns, listWorkItems, updateWorkItemStatus } from "../src/work-items.js";
import type { AuthenticatedUser, ControlApiStore, EventRecord, ExecutionStarter, RunRecord, TaskRecord, WorkItemRecord } from "../src/ports.js";

class MemoryStore implements ControlApiStore {
  public workItems: WorkItemRecord[] = [];
  public runs: RunRecord[] = [];
  public tasks: TaskRecord[] = [];
  public events: EventRecord[] = [];

  async createRunLedger(input: { readonly run: RunRecord; readonly task: TaskRecord; readonly event: EventRecord }): Promise<void> {
    await this.putRun(input.run);
    await this.putTask(input.task);
    await this.putEvent(input.event);
  }
  async putRun(item: RunRecord): Promise<void> { this.runs.push(item); }
  async putTask(item: TaskRecord): Promise<void> { this.tasks.push(item); }
  async putEvent(item: EventRecord): Promise<void> { this.events.push(item); }
  async updateRunExecution(input: { readonly workspaceId: string; readonly runId: string; readonly executionArn: string; readonly updatedAt: string }): Promise<void> {
    const run = this.runs.find((item) => item.workspaceId === input.workspaceId && item.runId === input.runId);
    if (run) {
      Object.assign(run, { executionArn: input.executionArn, updatedAt: input.updatedAt });
    }
  }
  async getRunById(runId: string): Promise<RunRecord | undefined> { return this.runs.find((run) => run.runId === runId); }
  async getRunByIdempotencyScope(idempotencyScope: string): Promise<RunRecord | undefined> { return this.runs.find((run) => run.idempotencyScope === idempotencyScope); }
  async listRecentRuns(): Promise<RunRecord[]> { return this.runs; }
  async listRunsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<RunRecord[]> {
    return this.runs.filter((run) => run.workItemId === input.workItemId).slice(0, input.limit ?? 50);
  }
  async listEvents(runId: string): Promise<EventRecord[]> { return this.events.filter((event) => event.runId === runId).sort((left, right) => left.seq - right.seq); }

  async putWorkItem(item: WorkItemRecord): Promise<void> {
    this.workItems.push(item);
  }

  async getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItemRecord | undefined> {
    return this.workItems.find((item) => item.workspaceId === workspaceId && item.workItemId === workItemId);
  }

  async getWorkItemByIdempotencyScope(idempotencyScope: string): Promise<WorkItemRecord | undefined> {
    return this.workItems.find((item) => item.idempotencyScope === idempotencyScope);
  }

  async updateWorkItem(input: { readonly workspaceId: string; readonly workItemId: string; readonly updates: Partial<WorkItemRecord> }): Promise<WorkItemRecord | undefined> {
    const item = await this.getWorkItem(input.workspaceId, input.workItemId);
    if (!item) {
      return undefined;
    }
    Object.assign(item, input.updates);
    return item;
  }

  async listWorkItemsForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<WorkItemRecord[]> {
    return this.workItems
      .filter((item) => item.userId === input.userId)
      .filter((item) => input.workspaceId === undefined || item.workspaceId === input.workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 50);
  }
}

const user: AuthenticatedUser = { userId: "user-123", email: "owner@example.com" };

class MemoryExecutionStarter implements ExecutionStarter {
  public started: unknown[] = [];

  async startExecution(input: unknown): Promise<{ executionArn: string }> {
    this.started.push(input);
    return { executionArn: "arn:aws:states:us-east-1:123456789012:execution:agents-cloud-dev-simple-run:workitem" };
  }
}

describe("work items", () => {
  it("creates a durable WorkItem owned by the authenticated user", async () => {
    const store = new MemoryStore();

    const result = await createWorkItem({
      store,
      now: () => "2026-05-10T01:30:00.000Z",
      newId: () => "fixed-id",
      user,
      request: {
        workspaceId: "workspace-abc",
        title: "Track competitor pricing",
        objective: "Track competitor pricing weekly and create an executive dashboard.",
        idempotencyKey: "request-1"
      }
    });

    assert.equal(result.statusCode, 201);
    assert.equal(result.body.workItemId, "work-idem-9afb2e14da64cb03d37d99eb");
    assert.equal(result.body.status, "open");
    assert.deepEqual(store.workItems[0], {
      workspaceId: "workspace-abc",
      workItemId: "work-idem-9afb2e14da64cb03d37d99eb",
      userId: "user-123",
      ownerEmail: "owner@example.com",
      title: "Track competitor pricing",
      objective: "Track competitor pricing weekly and create an executive dashboard.",
      status: "open",
      workspaceStatus: "workspace-abc#open",
      priority: "normal",
      idempotencyKey: "request-1",
      idempotencyScope: "user-123#workspace-abc#request-1",
      createdAt: "2026-05-10T01:30:00.000Z",
      updatedAt: "2026-05-10T01:30:00.000Z"
    });
  });

  it("returns the existing WorkItem without duplicate writes when the idempotency key is reused", async () => {
    const store = new MemoryStore();

    const first = await createWorkItem({
      store,
      now: () => "2026-05-10T01:30:00.000Z",
      newId: () => "first",
      user,
      request: { workspaceId: "workspace-abc", title: "First", objective: "First objective", idempotencyKey: "same" }
    });
    const second = await createWorkItem({
      store,
      now: () => "2026-05-10T02:30:00.000Z",
      newId: () => "second",
      user,
      request: { workspaceId: "workspace-abc", title: "Changed", objective: "Changed objective", idempotencyKey: "same" }
    });

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.workItemId, first.body.workItemId);
    assert.equal(store.workItems.length, 1);
  });

  it("rejects missing objective before writing a WorkItem", async () => {
    const store = new MemoryStore();

    const result = await createWorkItem({
      store,
      now: () => "2026-05-10T01:30:00.000Z",
      newId: () => "fixed-id",
      user,
      request: { workspaceId: "workspace-abc", title: "Incomplete", objective: " " }
    });

    assert.equal(result.statusCode, 400);
    assert.equal(store.workItems.length, 0);
  });

  it("lists only WorkItems owned by the authenticated user", async () => {
    const store = new MemoryStore();
    store.workItems.push(
      workItem({ workItemId: "work-new", userId: "user-123", createdAt: "2026-05-10T02:00:00.000Z" }),
      workItem({ workItemId: "work-old", userId: "user-123", createdAt: "2026-05-10T01:00:00.000Z" }),
      workItem({ workItemId: "work-other", userId: "other-user", createdAt: "2026-05-10T03:00:00.000Z" })
    );

    const result = await listWorkItems({ store, user, workspaceId: "workspace-abc", limit: 10 });

    assert.equal(result.statusCode, 200);
    assert.deepEqual((result.body.workItems as WorkItemRecord[]).map((item) => item.workItemId), ["work-new", "work-old"]);
  });

  it("does not return another user's WorkItem by id", async () => {
    const store = new MemoryStore();
    store.workItems.push(workItem({ workItemId: "work-other", userId: "other-user" }));

    const result = await getWorkItem({ store, user, workspaceId: "workspace-abc", workItemId: "work-other" });

    assert.equal(result.statusCode, 404);
  });

  it("updates an owned WorkItem status and workspace status", async () => {
    const store = new MemoryStore();
    store.workItems.push(workItem({ workItemId: "work-owned", status: "open", workspaceStatus: "workspace-abc#open" }));

    const result = await updateWorkItemStatus({
      store,
      user,
      now: () => "2026-05-10T04:00:00.000Z",
      workspaceId: "workspace-abc",
      workItemId: "work-owned",
      status: "in_progress"
    });

    assert.equal(result.statusCode, 200);
    assert.equal((result.body.workItem as WorkItemRecord).status, "in_progress");
    assert.equal((result.body.workItem as WorkItemRecord).workspaceStatus, "workspace-abc#in_progress");
    assert.equal(store.workItems[0].updatedAt, "2026-05-10T04:00:00.000Z");
  });

  it("creates a run linked to an owned WorkItem and passes the WorkItem id into execution", async () => {
    const store = new MemoryStore();
    const executions = new MemoryExecutionStarter();
    store.workItems.push(workItem({ workItemId: "work-owned" }));

    const result = await createWorkItemRun({
      store,
      executions,
      user,
      now: () => "2026-05-10T05:00:00.000Z",
      newId: () => "fixed-run",
      workspaceId: "workspace-abc",
      workItemId: "work-owned",
      objective: "Run the first analysis",
      idempotencyKey: "run-1"
    });

    assert.equal(result.statusCode, 202);
    assert.equal(store.runs[0].workItemId, "work-owned");
    assert.equal(store.tasks[0].workItemId, "work-owned");
    assert.deepEqual(executions.started[0], {
      runId: "run-idem-7efafd5214faf8d4289fe127",
      taskId: "task-idem-7efafd5214faf8d4289fe127",
      workspaceId: "workspace-abc",
      workItemId: "work-owned",
      userId: "user-123",
      objective: "Run the first analysis"
    });
  });

  it("lists owned WorkItem runs and ordered events", async () => {
    const store = new MemoryStore();
    store.workItems.push(workItem({ workItemId: "work-owned" }));
    store.runs.push(
      runRecord({ runId: "run-1", workItemId: "work-owned", createdAt: "2026-05-10T01:00:00.000Z" }),
      runRecord({ runId: "run-2", workItemId: "work-owned", createdAt: "2026-05-10T02:00:00.000Z" }),
      runRecord({ runId: "run-other", workItemId: "other-work", createdAt: "2026-05-10T03:00:00.000Z" })
    );
    store.events.push(
      eventRecord({ runId: "run-2", seq: 2, id: "evt-2" }),
      eventRecord({ runId: "run-1", seq: 1, id: "evt-1" })
    );

    const runs = await listWorkItemRuns({ store, user, workspaceId: "workspace-abc", workItemId: "work-owned", limit: 10 });
    const events = await listWorkItemEvents({ store, user, workspaceId: "workspace-abc", workItemId: "work-owned", limit: 10 });

    assert.deepEqual((runs.body.runs as RunRecord[]).map((run) => run.runId), ["run-1", "run-2"]);
    assert.deepEqual((events.body.events as EventRecord[]).map((event) => event.id), ["evt-1", "evt-2"]);
  });
});

function workItem(overrides: Partial<WorkItemRecord>): WorkItemRecord {
  return {
    workspaceId: "workspace-abc",
    workItemId: "work-1",
    userId: "user-123",
    ownerEmail: "owner@example.com",
    title: "Track competitor pricing",
    objective: "Track competitor pricing weekly.",
    status: "open",
    workspaceStatus: "workspace-abc#open",
    priority: "normal",
    createdAt: "2026-05-10T01:00:00.000Z",
    updatedAt: "2026-05-10T01:00:00.000Z",
    ...overrides
  };
}

function runRecord(overrides: Partial<RunRecord>): RunRecord {
  return {
    workspaceId: "workspace-abc",
    runId: "run-1",
    workItemId: "work-owned",
    userId: "user-123",
    ownerEmail: "owner@example.com",
    objective: "Run analysis",
    status: "queued",
    createdAt: "2026-05-10T01:00:00.000Z",
    updatedAt: "2026-05-10T01:00:00.000Z",
    ...overrides
  };
}

function eventRecord(overrides: Partial<EventRecord>): EventRecord {
  const runId = overrides.runId ?? "run-1";
  const seq = overrides.seq ?? 1;
  return {
    id: `evt-${runId}-${seq}`,
    type: "run.status",
    seq,
    createdAt: "2026-05-10T01:00:00.000Z",
    orgId: "org:user-123",
    userId: "user-123",
    workspaceId: "workspace-abc",
    runId,
    source: { kind: "control-api", name: "control-api.test" },
    payload: { status: "queued" },
    ...overrides
  };
}
