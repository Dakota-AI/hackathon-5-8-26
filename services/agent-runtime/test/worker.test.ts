import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeRun } from "../src/worker.js";
import type { ArtifactSink, EventSink, HermesRunner, RuntimeContext, RuntimeEvent } from "../src/ports.js";
import { InMemorySeqAllocator } from "../src/seq-allocator.js";

class MemoryEventSink implements EventSink {
  public events: RuntimeEvent[] = [];
  public runStatuses: string[] = [];
  public taskStatuses: string[] = [];

  async putEvent(event: RuntimeEvent): Promise<void> {
    this.events.push(event);
  }

  async updateRunStatus(status: string): Promise<void> {
    this.runStatuses.push(status);
  }

  async updateTaskStatus(status: string): Promise<void> {
    this.taskStatuses.push(status);
  }
}

class MemoryArtifactSink implements ArtifactSink {
  public artifacts: Array<{ key: string; body: string; contentType: string }> = [];
  public records: Array<Record<string, unknown>> = [];

  async putArtifact(input: { key: string; body: string; contentType: string }): Promise<{ bucket: string; key: string; uri: string }> {
    this.artifacts.push(input);
    return { bucket: "artifact-bucket", key: input.key, uri: `s3://artifact-bucket/${input.key}` };
  }

  async putArtifactRecord(record: Record<string, unknown>): Promise<void> {
    this.records.push(record);
  }
}

class SuccessfulHermesRunner implements HermesRunner {
  public prompts: string[] = [];

  async run(prompt: string): Promise<{ summary: string; rawOutput: string; mode: string }> {
    this.prompts.push(prompt);
    return {
      summary: "Hermes completed the first worker run.",
      rawOutput: "Hermes completed the first worker run.\nNext: wire richer tools.",
      mode: "hermes-gateway"
    };
  }
}

const context: RuntimeContext = {
  runId: "run-123",
  taskId: "task-123",
  workspaceId: "workspace-abc",
  userId: "user-123",
  objective: "Research market and draft a plan",
  now: () => "2026-05-10T01:00:00.000Z"
};

describe("executeRun", () => {
  it("runs Hermes, writes running/artifact/succeeded events, writes one S3 artifact, and updates statuses", async () => {
    const events = new MemoryEventSink();
    const artifacts = new MemoryArtifactSink();
    const hermes = new SuccessfulHermesRunner();
    const seq = new InMemorySeqAllocator(1);

    const result = await executeRun({ context, events, artifacts, hermes, seq });

    assert.equal(result.status, "succeeded");
    assert.equal(hermes.prompts.length, 1);
    assert.match(hermes.prompts[0] ?? "", /Research market and draft a plan/);

    assert.deepEqual(events.runStatuses, ["running", "succeeded"]);
    assert.deepEqual(events.taskStatuses, ["running", "succeeded"]);
    assert.deepEqual(
      events.events.map((event) => [event.id, event.seq, event.type, event.payload.status ?? event.payload.artifactId]),
      [
        ["evt-run-123-000002", 2, "run.status", "running"],
        ["evt-run-123-000003", 3, "artifact.created", "artifact-task-123-0003"],
        ["evt-run-123-000004", 4, "run.status", "succeeded"]
      ]
    );
    assert.equal(events.events[0]?.source.kind, "worker");
    assert.equal(events.events[0]?.payload.runId, "run-123");
    assert.equal(events.events[1]?.payload.kind, "report");
    assert.equal(events.events[1]?.payload.name, "Hermes worker report");

    assert.equal(artifacts.artifacts.length, 1);
    assert.equal(artifacts.artifacts[0]?.key, "workspaces/workspace-abc/runs/run-123/artifacts/artifact-task-123-0003/hermes-report.md");
    assert.match(artifacts.artifacts[0]?.body ?? "", /Hermes completed the first worker run/);
    assert.deepEqual(artifacts.records[0], {
      runId: "run-123",
      artifactId: "artifact-task-123-0003",
      workspaceId: "workspace-abc",
      userId: "user-123",
      taskId: "task-123",
      kind: "report",
      name: "Hermes worker report",
      bucket: "artifact-bucket",
      key: "workspaces/workspace-abc/runs/run-123/artifacts/artifact-task-123-0003/hermes-report.md",
      uri: "s3://artifact-bucket/workspaces/workspace-abc/runs/run-123/artifacts/artifact-task-123-0003/hermes-report.md",
      contentType: "text/markdown; charset=utf-8",
      createdAt: "2026-05-10T01:00:00.000Z"
    });
  });

  it("writes a failed event and returns failed when Hermes fails", async () => {
    const events = new MemoryEventSink();
    const artifacts = new MemoryArtifactSink();
    const seq = new InMemorySeqAllocator(1);
    const hermes: HermesRunner = {
      async run(): Promise<{ summary: string; rawOutput: string; mode: string }> {
        throw new Error("Hermes unavailable");
      }
    };

    const result = await executeRun({ context, events, artifacts, hermes, seq });

    assert.equal(result.status, "failed");
    assert.deepEqual(events.runStatuses, ["running", "failed"]);
    assert.deepEqual(events.taskStatuses, ["running", "failed"]);
    assert.equal(events.events.at(-1)?.seq, 3);
    assert.equal(events.events.at(-1)?.type, "run.status");
    assert.equal(events.events.at(-1)?.payload.status, "failed");
    assert.match(String(events.events.at(-1)?.payload.message), /Hermes unavailable/);
    assert.equal(artifacts.artifacts.length, 0);
  });

  it("on retry continues from the last persisted seq, avoiding artifact ID collision", async () => {
    const events = new MemoryEventSink();
    const artifacts = new MemoryArtifactSink();
    const hermes = new SuccessfulHermesRunner();
    // simulate retry: previous attempt left seq 4 in the events table
    const seq = new InMemorySeqAllocator(4);

    const result = await executeRun({ context, events, artifacts, hermes, seq });

    assert.equal(result.status, "succeeded");
    assert.deepEqual(events.events.map((event) => event.seq), [5, 6, 7]);
    assert.equal(artifacts.artifacts[0]?.key, "workspaces/workspace-abc/runs/run-123/artifacts/artifact-task-123-0006/hermes-report.md");
  });
});
