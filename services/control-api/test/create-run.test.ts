import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRun } from "../src/create-run.js";
import type { ControlApiStore, ExecutionStarter } from "../src/ports.js";

class MemoryStore implements ControlApiStore {
  public runs: unknown[] = [];
  public events: unknown[] = [];
  public tasks: unknown[] = [];


  async putWorkItem(): Promise<void> {}
  async getWorkItem(): Promise<undefined> { return undefined; }
  async getWorkItemByIdempotencyScope(): Promise<undefined> { return undefined; }
  async updateWorkItem(): Promise<undefined> { return undefined; }
  async listWorkItemsForUser(): Promise<[]> { return []; }
  async listRunsForWorkItem(): Promise<[]> { return []; }
  async listRunsForUser(): Promise<[]> { return []; }
  async createRunLedger(input: { run: unknown; task: unknown; event: unknown }): Promise<void> {
    await this.putRun(input.run);
    await this.putTask(input.task);
    await this.putEvent(input.event);
  }

  async putRun(item: unknown): Promise<void> {
    this.runs.push(item);
  }

  async putEvent(item: unknown): Promise<void> {
    this.events.push(item);
  }

  async putTask(item: unknown): Promise<void> {
    this.tasks.push(item);
  }

  async updateRunExecution(input: { workspaceId: string; runId: string; executionArn: string; updatedAt: string }): Promise<void> {
    const run = this.runs.find((item) => (item as { runId?: string }).runId === input.runId) as Record<string, unknown> | undefined;
    if (run) {
      run.executionArn = input.executionArn;
      run.updatedAt = input.updatedAt;
    }
  }

  async getRunById(): Promise<undefined> {
    return undefined;
  }

  async getRunByIdempotencyScope(): Promise<undefined> {
    return undefined;
  }

  async listRecentRuns(): Promise<[]> {
    return [];
  }

  async listEvents(): Promise<[]> {
    return [];
  }
}

class MemoryExecutionStarter implements ExecutionStarter {
  public started: unknown[] = [];

  async startExecution(input: unknown): Promise<{ executionArn: string }> {
    this.started.push(input);
    return { executionArn: "arn:aws:states:us-east-1:123456789012:execution:agents-cloud-dev-simple-run:test" };
  }
}

describe("createRun", () => {
  it("creates a durable run, initial event, task, and Step Functions execution for an authenticated user", async () => {
    const store = new MemoryStore();
    const executions = new MemoryExecutionStarter();

    const result = await createRun({
      store,
      executions,
      now: () => "2026-05-09T19:30:00.000Z",
      newId: () => "fixed-id",
      user: { userId: "user-123", email: "owner@example.com" },
      request: {
        workspaceId: "workspace-abc",
        objective: "Research market and draft plan",
        idempotencyKey: "request-1"
      }
    });

    assert.equal(result.statusCode, 202);
    assert.equal(result.body.runId, "run-idem-9afb2e14da64cb03d37d99eb");
    assert.equal(result.body.status, "queued");
    assert.equal(result.body.executionArn, "arn:aws:states:us-east-1:123456789012:execution:agents-cloud-dev-simple-run:test");

    assert.deepEqual(store.runs[0], {
      workspaceId: "workspace-abc",
      runId: "run-idem-9afb2e14da64cb03d37d99eb",
      userId: "user-123",
      ownerEmail: "owner@example.com",
      objective: "Research market and draft plan",
      status: "queued",
      idempotencyKey: "request-1",
      idempotencyScope: "user-123#workspace-abc#request-1",
      createdAt: "2026-05-09T19:30:00.000Z",
      updatedAt: "2026-05-09T19:30:00.000Z",
      executionArn: "arn:aws:states:us-east-1:123456789012:execution:agents-cloud-dev-simple-run:test"
    });
    assert.deepEqual(store.tasks[0], {
      runId: "run-idem-9afb2e14da64cb03d37d99eb",
      taskId: "task-idem-9afb2e14da64cb03d37d99eb",
      workspaceId: "workspace-abc",
      userId: "user-123",
      workerClass: "agent-runtime",
      status: "queued",
      createdAt: "2026-05-09T19:30:00.000Z",
      updatedAt: "2026-05-09T19:30:00.000Z"
    });
    assert.deepEqual(store.events[0], {
      id: "evt-run-idem-9afb2e14da64cb03d37d99eb-000001",
      type: "run.status",
      seq: 1,
      createdAt: "2026-05-09T19:30:00.000Z",
      orgId: "org:user-123",
      userId: "user-123",
      workspaceId: "workspace-abc",
      runId: "run-idem-9afb2e14da64cb03d37d99eb",
      taskId: "task-idem-9afb2e14da64cb03d37d99eb",
      idempotencyKey: "request-1",
      source: {
        kind: "control-api",
        name: "control-api.create-run"
      },
      payload: {
        runId: "run-idem-9afb2e14da64cb03d37d99eb",
        taskId: "task-idem-9afb2e14da64cb03d37d99eb",
        status: "queued",
        message: "Run accepted and queued for execution."
      }
    });
    assert.deepEqual(executions.started[0], {
      runId: "run-idem-9afb2e14da64cb03d37d99eb",
      taskId: "task-idem-9afb2e14da64cb03d37d99eb",
      workspaceId: "workspace-abc",
      userId: "user-123",
      objective: "Research market and draft plan"
    });
  });

  it("rejects missing objective before writing records or starting execution", async () => {
    const store = new MemoryStore();
    const executions = new MemoryExecutionStarter();

    const result = await createRun({
      store,
      executions,
      now: () => "2026-05-09T19:30:00.000Z",
      newId: () => "fixed-id",
      user: { userId: "user-123" },
      request: {
        workspaceId: "workspace-abc",
        objective: " "
      }
    });

    assert.equal(result.statusCode, 400);
    assert.equal(store.runs.length, 0);
    assert.equal(store.events.length, 0);
    assert.equal(store.tasks.length, 0);
    assert.equal(executions.started.length, 0);
  });
});
