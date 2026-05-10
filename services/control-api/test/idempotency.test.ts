import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRun } from "../src/create-run.js";
import type { ControlApiStore, ExecutionStarter, EventRecord, RunRecord, TaskRecord } from "../src/ports.js";

class IdempotentMemoryStore implements ControlApiStore {
  public runs: RunRecord[] = [];
  public events: EventRecord[] = [];
  public tasks: TaskRecord[] = [];

  async createRunLedger(input: { run: RunRecord; task: TaskRecord; event: EventRecord }): Promise<void> {
    await this.putRun(input.run);
    await this.putTask(input.task);
    await this.putEvent(input.event);
  }

  async putRun(item: RunRecord): Promise<void> {
    this.runs.push(item);
  }

  async putEvent(item: EventRecord): Promise<void> {
    this.events.push(item);
  }

  async putTask(item: TaskRecord): Promise<void> {
    this.tasks.push(item);
  }

  async updateRunExecution(input: { workspaceId: string; runId: string; executionArn: string; updatedAt: string }): Promise<void> {
    const run = this.runs.find((item) => item.runId === input.runId);
    if (run) {
      (run as { executionArn?: string; updatedAt: string }).executionArn = input.executionArn;
      (run as { updatedAt: string }).updatedAt = input.updatedAt;
    }
  }

  async getRunById(): Promise<undefined> {
    return undefined;
  }

  async getRunByIdempotencyScope(idempotencyScope: string): Promise<RunRecord | undefined> {
    return this.runs.find((run) => run.idempotencyScope === idempotencyScope);
  }

  async listRecentRuns(): Promise<RunRecord[]> {
    return [...this.runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listEvents(): Promise<EventRecord[]> {
    return [];
  }
}

class CountingExecutionStarter implements ExecutionStarter {
  public started: unknown[] = [];

  async startExecution(input: unknown): Promise<{ executionArn: string }> {
    this.started.push(input);
    return { executionArn: `arn:execution:${this.started.length}` };
  }
}

describe("createRun idempotency", () => {
  it("returns the existing run and does not start duplicate work when idempotency key is reused", async () => {
    const store = new IdempotentMemoryStore();
    const executions = new CountingExecutionStarter();
    let counter = 0;

    const deps = {
      store,
      executions,
      now: () => "2026-05-09T19:30:00.000Z",
      newId: () => `fixed-id-${++counter}`,
      user: { userId: "user-123", email: "owner@example.com" },
      request: {
        workspaceId: "workspace-abc",
        objective: "Research market and draft plan",
        idempotencyKey: "request-1"
      }
    };

    const first = await createRun(deps);
    const second = await createRun(deps);

    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 202);
    assert.equal(second.body.runId, first.body.runId);
    assert.equal(second.body.executionArn, first.body.executionArn);
    assert.equal(store.runs.length, 1);
    assert.equal(store.tasks.length, 1);
    assert.equal(store.events.length, 1);
    assert.equal(executions.started.length, 1);
  });

  it("does not start an execution when durable run writes fail", async () => {
    const store = new IdempotentMemoryStore();
    store.createRunLedger = async () => {
      throw new Error("DynamoDB unavailable");
    };
    const executions = new CountingExecutionStarter();

    await assert.rejects(
      createRun({
        store,
        executions,
        now: () => "2026-05-09T19:30:00.000Z",
        newId: () => "fixed-id",
        user: { userId: "user-123" },
        request: {
          workspaceId: "workspace-abc",
          objective: "Research market and draft plan",
          idempotencyKey: "request-1"
        }
      }),
      /DynamoDB unavailable/
    );

    assert.equal(executions.started.length, 0);
  });
});
