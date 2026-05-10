import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getArtifactDownloadUrl, getRunArtifact, listRunArtifacts, listWorkItemArtifacts } from "../src/artifacts.js";
import type { ArtifactPresigner, ArtifactRecord, ArtifactStore, AuthenticatedUser, ControlApiStore, EventRecord, RunRecord, TaskRecord, WorkItemRecord } from "../src/ports.js";

class FakePresigner implements ArtifactPresigner {
  public calls: Array<{ bucket: string; key: string; expiresInSeconds: number; contentType?: string; fileName?: string }> = [];
  async presignDownload(input: { bucket: string; key: string; expiresInSeconds: number; contentType?: string; fileName?: string }): Promise<{ url: string; expiresAt: string }> {
    this.calls.push(input);
    return {
      url: `https://example.s3/${input.bucket}/${encodeURIComponent(input.key)}?X-Amz-Expires=${input.expiresInSeconds}`,
      expiresAt: new Date(Date.UTC(2026, 4, 10, 0, 0, input.expiresInSeconds)).toISOString()
    };
  }
}

class MemoryStore implements ControlApiStore, ArtifactStore {
  public workItems: WorkItemRecord[] = [];
  public runs: RunRecord[] = [];
  public tasks: TaskRecord[] = [];
  public events: EventRecord[] = [];
  public artifacts: ArtifactRecord[] = [];

  async createRunLedger(input: { run: RunRecord; task: TaskRecord; event: EventRecord }): Promise<void> {
    this.runs.push(input.run);
    this.tasks.push(input.task);
    this.events.push(input.event);
  }
  async putRun(item: RunRecord): Promise<void> { this.runs.push(item); }
  async putTask(item: TaskRecord): Promise<void> { this.tasks.push(item); }
  async putEvent(item: EventRecord): Promise<void> { this.events.push(item); }
  async updateRunExecution(): Promise<void> { /* no-op */ }
  async getRunById(runId: string): Promise<RunRecord | undefined> { return this.runs.find((run) => run.runId === runId); }
  async getRunByIdempotencyScope(): Promise<RunRecord | undefined> { return undefined; }
  async listRecentRuns(): Promise<RunRecord[]> { return this.runs; }
  async listRunsForWorkItem(input: { workItemId: string; limit?: number }): Promise<RunRecord[]> {
    return this.runs.filter((run) => run.workItemId === input.workItemId).slice(0, input.limit ?? 50);
  }
  async listRunsForUser(): Promise<[]> { return []; }
  async listEvents(runId: string): Promise<EventRecord[]> { return this.events.filter((event) => event.runId === runId); }

  async putWorkItem(item: WorkItemRecord): Promise<void> { this.workItems.push(item); }
  async getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItemRecord | undefined> {
    return this.workItems.find((item) => item.workspaceId === workspaceId && item.workItemId === workItemId);
  }
  async getWorkItemByIdempotencyScope(): Promise<WorkItemRecord | undefined> { return undefined; }
  async updateWorkItem(): Promise<WorkItemRecord | undefined> { return undefined; }
  async listWorkItemsForUser(): Promise<WorkItemRecord[]> { return this.workItems; }

  async listArtifactsForRun(input: { runId: string; limit?: number }): Promise<ArtifactRecord[]> {
    return this.artifacts
      .filter((artifact) => artifact.runId === input.runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 50);
  }
  async listArtifactsForWorkItem(input: { workItemId: string; limit?: number }): Promise<ArtifactRecord[]> {
    return this.artifacts
      .filter((artifact) => artifact.workItemId === input.workItemId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 50);
  }
  async getArtifact(input: { runId: string; artifactId: string }): Promise<ArtifactRecord | undefined> {
    return this.artifacts.find((artifact) => artifact.runId === input.runId && artifact.artifactId === input.artifactId);
  }
}

const owner: AuthenticatedUser = { userId: "user-owner", email: "owner@example.com" };
const stranger: AuthenticatedUser = { userId: "user-stranger", email: "stranger@example.com" };

function seed(store: MemoryStore): void {
  store.workItems.push({
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: owner.userId,
    ownerEmail: owner.email,
    title: "T",
    objective: "O",
    status: "open",
    workspaceStatus: "workspace-1#open",
    priority: "normal",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  store.runs.push({
    workspaceId: "workspace-1",
    runId: "run-1",
    workItemId: "work-1",
    userId: owner.userId,
    objective: "O",
    status: "succeeded",
    createdAt: "2026-05-10T00:01:00.000Z",
    updatedAt: "2026-05-10T00:02:00.000Z"
  });
  store.artifacts.push({
    runId: "run-1",
    artifactId: "artifact-a",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: owner.userId,
    taskId: "task-1",
    kind: "report",
    name: "Hermes worker report",
    bucket: "bucket",
    key: "workspaces/workspace-1/runs/run-1/artifacts/artifact-a/report.md",
    uri: "s3://bucket/workspaces/workspace-1/runs/run-1/artifacts/artifact-a/report.md",
    contentType: "text/markdown; charset=utf-8",
    createdAt: "2026-05-10T00:01:30.000Z"
  });
  store.artifacts.push({
    runId: "run-1",
    artifactId: "artifact-b",
    workspaceId: "workspace-1",
    workItemId: "work-1",
    userId: owner.userId,
    taskId: "task-1",
    kind: "report",
    name: "Second report",
    bucket: "bucket",
    key: "k2",
    uri: "s3://bucket/k2",
    contentType: "text/markdown; charset=utf-8",
    createdAt: "2026-05-10T00:01:45.000Z"
  });
}

describe("artifact API", () => {
  it("lists artifacts for an owned run, newest first", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await listRunArtifacts({ store, user: owner, runId: "run-1" });
    assert.equal(result.statusCode, 200);
    const artifacts = result.body.artifacts as ArtifactRecord[];
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts[0].artifactId, "artifact-b");
    assert.equal(artifacts[1].artifactId, "artifact-a");
  });

  it("rejects listing artifacts for a run owned by another user", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await listRunArtifacts({ store, user: stranger, runId: "run-1" });
    assert.equal(result.statusCode, 404);
  });

  it("returns 404 when listing artifacts for an unknown run", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await listRunArtifacts({ store, user: owner, runId: "run-missing" });
    assert.equal(result.statusCode, 404);
  });

  it("returns a single artifact for an owned run", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await getRunArtifact({ store, user: owner, runId: "run-1", artifactId: "artifact-a" });
    assert.equal(result.statusCode, 200);
    const artifact = result.body.artifact as ArtifactRecord;
    assert.equal(artifact.artifactId, "artifact-a");
    assert.equal(artifact.uri, "s3://bucket/workspaces/workspace-1/runs/run-1/artifacts/artifact-a/report.md");
  });

  it("does not return another user's artifact", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await getRunArtifact({ store, user: stranger, runId: "run-1", artifactId: "artifact-a" });
    assert.equal(result.statusCode, 404);
  });

  it("returns 404 for unknown artifact id", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await getRunArtifact({ store, user: owner, runId: "run-1", artifactId: "missing" });
    assert.equal(result.statusCode, 404);
  });

  it("lists artifacts for an owned WorkItem filtered by user", async () => {
    const store = new MemoryStore();
    seed(store);
    store.artifacts.push({
      runId: "run-other",
      artifactId: "artifact-leak",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      userId: stranger.userId,
      taskId: "task-x",
      kind: "report",
      name: "leak",
      bucket: "bucket",
      key: "leak",
      uri: "s3://bucket/leak",
      contentType: "text/plain",
      createdAt: "2026-05-10T01:00:00.000Z"
    });
    const result = await listWorkItemArtifacts({ store, user: owner, workspaceId: "workspace-1", workItemId: "work-1" });
    assert.equal(result.statusCode, 200);
    const artifacts = result.body.artifacts as ArtifactRecord[];
    assert.equal(artifacts.length, 2);
    assert.ok(artifacts.every((artifact) => artifact.userId === owner.userId));
  });

  it("returns 404 when listing artifacts for another user's WorkItem", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await listWorkItemArtifacts({ store, user: stranger, workspaceId: "workspace-1", workItemId: "work-1" });
    assert.equal(result.statusCode, 404);
  });

  it("rejects malformed runId/artifactId path parameters", async () => {
    const store = new MemoryStore();
    seed(store);
    const bad = await listRunArtifacts({ store, user: owner, runId: "" });
    assert.equal(bad.statusCode, 400);
  });

  it("returns a presigned download url for an owned artifact with default expiry", async () => {
    const store = new MemoryStore();
    seed(store);
    const presigner = new FakePresigner();
    const result = await getArtifactDownloadUrl({ store, presigner, user: owner, runId: "run-1", artifactId: "artifact-a" });
    assert.equal(result.statusCode, 200);
    assert.equal(presigner.calls.length, 1);
    assert.equal(presigner.calls[0].bucket, "bucket");
    assert.equal(presigner.calls[0].key, "workspaces/workspace-1/runs/run-1/artifacts/artifact-a/report.md");
    assert.equal(presigner.calls[0].expiresInSeconds, 300);
    assert.equal(presigner.calls[0].fileName, "report.md");
    assert.equal(typeof (result.body as { url: string }).url, "string");
    assert.equal((result.body as { expiresInSeconds: number }).expiresInSeconds, 300);
  });

  it("clamps presign expiry to allowed range", async () => {
    const store = new MemoryStore();
    seed(store);
    const presigner = new FakePresigner();
    const lo = await getArtifactDownloadUrl({ store, presigner, user: owner, runId: "run-1", artifactId: "artifact-a", expiresInSeconds: 5 });
    const hi = await getArtifactDownloadUrl({ store, presigner, user: owner, runId: "run-1", artifactId: "artifact-a", expiresInSeconds: 99999 });
    assert.equal((lo.body as { expiresInSeconds: number }).expiresInSeconds, 30);
    assert.equal((hi.body as { expiresInSeconds: number }).expiresInSeconds, 900);
  });

  it("does not presign artifacts owned by another user", async () => {
    const store = new MemoryStore();
    seed(store);
    const presigner = new FakePresigner();
    const result = await getArtifactDownloadUrl({ store, presigner, user: stranger, runId: "run-1", artifactId: "artifact-a" });
    assert.equal(result.statusCode, 404);
    assert.equal(presigner.calls.length, 0);
  });

  it("returns 422 when artifact has no S3 location", async () => {
    const store = new MemoryStore();
    seed(store);
    store.artifacts.push({
      runId: "run-1",
      artifactId: "artifact-no-s3",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      userId: owner.userId,
      taskId: "task-1",
      kind: "report",
      name: "no s3",
      bucket: "",
      key: "",
      uri: "",
      contentType: "text/plain",
      createdAt: "2026-05-10T00:02:00.000Z"
    });
    const presigner = new FakePresigner();
    const result = await getArtifactDownloadUrl({ store, presigner, user: owner, runId: "run-1", artifactId: "artifact-no-s3" });
    assert.equal(result.statusCode, 422);
    assert.equal(presigner.calls.length, 0);
  });
});
