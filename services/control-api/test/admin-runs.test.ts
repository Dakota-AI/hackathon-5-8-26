import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArtifactCreatedEvent, buildRunStatusEvent } from "@agents-cloud/protocol";
import { listAdminRuns } from "../src/query-runs.js";
import type { AuthenticatedUser, ControlApiStore, EventRecord, RunRecord, TaskRecord } from "../src/ports.js";

class MemoryStore implements ControlApiStore {
  public constructor(
    private readonly runs: RunRecord[],
    private readonly eventsByRun: Record<string, EventRecord[]> = {}
  ) {}

  async putRun(): Promise<void> {}
  async putTask(): Promise<void> {}
  async putEvent(): Promise<void> {}
  async createRunLedger(): Promise<void> {}
  async updateRunExecution(): Promise<void> {}

  async getRunById(runId: string): Promise<RunRecord | undefined> {
    return this.runs.find((run) => run.runId === runId);
  }

  async getRunByIdempotencyScope(): Promise<RunRecord | undefined> {
    return undefined;
  }

  async listEvents(runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]> {
    return (this.eventsByRun[runId] ?? [])
      .filter((event) => options?.afterSeq === undefined || event.seq > options.afterSeq)
      .slice(0, options?.limit ?? 100);
  }

  async listRecentRuns(limit?: number): Promise<RunRecord[]> {
    return [...this.runs]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit ?? 50);
  }
}

const admin: AuthenticatedUser = { userId: "admin-user", email: "seb4594@gmail.com" };
const nonAdmin: AuthenticatedUser = { userId: "normal-user", email: "person@example.com" };

const runs: RunRecord[] = [
  {
    workspaceId: "workspace-web",
    runId: "run-failed",
    userId: "user-a",
    ownerEmail: "user-a@example.com",
    objective: "create stock app",
    status: "failed",
    createdAt: "2026-05-10T04:00:00.000Z",
    updatedAt: "2026-05-10T04:02:00.000Z",
    executionArn: "arn:failed"
  },
  {
    workspaceId: "workspace-web",
    runId: "run-ok",
    userId: "user-b",
    ownerEmail: "user-b@example.com",
    objective: "research market",
    status: "succeeded",
    createdAt: "2026-05-10T03:00:00.000Z",
    updatedAt: "2026-05-10T03:03:00.000Z",
    executionArn: "arn:ok"
  }
];

const failedEvents: EventRecord[] = [
  buildRunStatusEvent({
    id: "evt-failed-1",
    seq: 1,
    createdAt: "2026-05-10T04:00:00.000Z",
    userId: "user-a",
    workspaceId: "workspace-web",
    runId: "run-failed",
    source: { kind: "control-api", name: "test" },
    status: "queued"
  }),
  buildRunStatusEvent({
    id: "evt-failed-2",
    seq: 2,
    createdAt: "2026-05-10T04:02:00.000Z",
    userId: "user-a",
    workspaceId: "workspace-web",
    runId: "run-failed",
    source: { kind: "worker", name: "test" },
    status: "failed",
    error: { code: "WorkerError", message: "worker crashed", retryable: true }
  })
];

const okEvents: EventRecord[] = [
  buildRunStatusEvent({
    id: "evt-ok-1",
    seq: 1,
    createdAt: "2026-05-10T03:00:00.000Z",
    userId: "user-b",
    workspaceId: "workspace-web",
    runId: "run-ok",
    source: { kind: "control-api", name: "test" },
    status: "queued"
  }),
  buildArtifactCreatedEvent({
    id: "evt-ok-2",
    seq: 2,
    createdAt: "2026-05-10T03:02:00.000Z",
    userId: "user-b",
    workspaceId: "workspace-web",
    runId: "run-ok",
    source: { kind: "worker", name: "test" },
    artifactId: "artifact-ok",
    kind: "report",
    name: "Report",
    uri: "s3://bucket/report.md",
    contentType: "text/markdown"
  })
];

describe("admin runs", () => {
  it("rejects non-admin users", async () => {
    const result = await listAdminRuns({
      store: new MemoryStore(runs),
      user: nonAdmin,
      adminEmails: ["seb4594@gmail.com"],
      limit: 20
    });

    assert.equal(result.statusCode, 403);
  });

  it("returns recent runs across users with event and failure summaries", async () => {
    const result = await listAdminRuns({
      store: new MemoryStore(runs, { "run-failed": failedEvents, "run-ok": okEvents }),
      user: admin,
      adminEmails: ["seb4594@gmail.com"],
      limit: 20
    });

    assert.equal(result.statusCode, 200);
    const body = result.body as { runs: Array<Record<string, unknown>>; totals: Record<string, number> };
    assert.equal(body.runs.length, 2);
    assert.equal(body.totals.totalRuns, 2);
    assert.equal(body.totals.failedRuns, 1);
    assert.deepEqual(body.runs[0], {
      runId: "run-failed",
      workspaceId: "workspace-web",
      userId: "user-a",
      ownerEmail: "user-a@example.com",
      objective: "create stock app",
      status: "failed",
      createdAt: "2026-05-10T04:00:00.000Z",
      updatedAt: "2026-05-10T04:02:00.000Z",
      executionArn: "arn:failed",
      eventCount: 2,
      latestEventType: "run.status",
      latestEventAt: "2026-05-10T04:02:00.000Z",
      artifactCount: 0,
      failureCount: 1,
      lastFailure: {
        code: "WorkerError",
        message: "worker crashed",
        retryable: true
      }
    });
  });
});
