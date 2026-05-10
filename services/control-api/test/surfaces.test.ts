import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSurface, getSurface, listSurfacesForRun, listSurfacesForWorkItem, publishSurface, updateSurface, validateSurfaceDefinition, validateSurfaceStatus } from "../src/surfaces.js";
import type { AuthenticatedUser, ControlApiStore, EventRecord, RunRecord, SurfaceRecord, SurfaceStore, TaskRecord, WorkItemRecord } from "../src/ports.js";

class MemoryStore implements ControlApiStore, SurfaceStore {
  public workItems: WorkItemRecord[] = [];
  public runs: RunRecord[] = [];
  public events: EventRecord[] = [];
  public tasks: TaskRecord[] = [];
  public surfaces: SurfaceRecord[] = [];

  async createRunLedger(input: { run: RunRecord; task: TaskRecord; event: EventRecord }) { this.runs.push(input.run); this.tasks.push(input.task); this.events.push(input.event); }
  async putRun(item: RunRecord) { this.runs.push(item); }
  async putTask(item: TaskRecord) { this.tasks.push(item); }
  async putEvent(item: EventRecord) { this.events.push(item); }
  async updateRunExecution() { /* no-op */ }
  async getRunById(runId: string) { return this.runs.find((r) => r.runId === runId); }
  async getRunByIdempotencyScope() { return undefined; }
  async listRecentRuns() { return this.runs; }
  async listRunsForWorkItem(input: { workItemId: string; limit?: number }) {
    return this.runs.filter((r) => r.workItemId === input.workItemId).slice(0, input.limit ?? 50);
  }
  async listRunsForUser(input: { userId: string; workspaceId?: string; limit?: number }) {
    return this.runs.filter((r) => r.userId === input.userId).filter((r) => !input.workspaceId || r.workspaceId === input.workspaceId).slice(0, input.limit ?? 50);
  }
  async listEvents(runId: string) { return this.events.filter((e) => e.runId === runId); }
  async putWorkItem(item: WorkItemRecord) { this.workItems.push(item); }
  async getWorkItem(workspaceId: string, workItemId: string) { return this.workItems.find((w) => w.workspaceId === workspaceId && w.workItemId === workItemId); }
  async getWorkItemByIdempotencyScope() { return undefined; }
  async updateWorkItem() { return undefined; }
  async listWorkItemsForUser() { return this.workItems; }

  async putSurface(item: SurfaceRecord) { this.surfaces.push(item); }
  async getSurface(workspaceId: string, surfaceId: string) {
    return this.surfaces.find((s) => s.workspaceId === workspaceId && s.surfaceId === surfaceId);
  }
  async updateSurface(input: { workspaceId: string; surfaceId: string; updates: Partial<SurfaceRecord> }) {
    const surface = await this.getSurface(input.workspaceId, input.surfaceId);
    if (!surface) return undefined;
    Object.assign(surface, input.updates);
    return surface;
  }
  async listSurfacesForWorkItem(input: { workItemId: string; limit?: number }) {
    return this.surfaces.filter((s) => s.workItemId === input.workItemId).slice(0, input.limit ?? 50);
  }
  async listSurfacesForRun(input: { runId: string; limit?: number }) {
    return this.surfaces.filter((s) => s.runId === input.runId).slice(0, input.limit ?? 50);
  }
}

const owner: AuthenticatedUser = { userId: "user-owner", email: "owner@example.com" };
const stranger: AuthenticatedUser = { userId: "user-stranger" };

function seed(store: MemoryStore): void {
  store.workItems.push({
    workspaceId: "ws-1", workItemId: "wi-1", userId: owner.userId, ownerEmail: owner.email,
    title: "T", objective: "O", status: "open", workspaceStatus: "ws-1#open", priority: "normal",
    createdAt: "2026-05-10T00:00:00.000Z", updatedAt: "2026-05-10T00:00:00.000Z"
  });
  store.runs.push({
    workspaceId: "ws-1", runId: "run-1", workItemId: "wi-1", userId: owner.userId,
    objective: "O", status: "succeeded", createdAt: "2026-05-10T00:01:00.000Z", updatedAt: "2026-05-10T00:02:00.000Z"
  });
}

describe("surfaces validation", () => {
  it("rejects unknown surfaceType", () => {
    const result = validateSurfaceDefinition({ surfaceType: "rocket", definition: {} });
    assert.equal(result?.code, "UNSUPPORTED_SURFACE_TYPE");
  });
  it("rejects oversized definitions", () => {
    const big: Record<string, unknown> = { huge: "x".repeat(100_000) };
    const result = validateSurfaceDefinition({ surfaceType: "dashboard", definition: big });
    assert.equal(result?.code, "DEFINITION_TOO_LARGE");
  });
  it("accepts allowed surface types", () => {
    for (const type of ["dashboard", "report", "preview", "table", "form", "markdown"]) {
      assert.equal(validateSurfaceDefinition({ surfaceType: type, definition: { ok: true } }), undefined);
    }
  });
  it("rejects unknown status values", () => {
    assert.equal(validateSurfaceStatus("rocket")?.code, "INVALID_STATUS");
    assert.equal(validateSurfaceStatus("draft"), undefined);
    assert.equal(validateSurfaceStatus("published"), undefined);
  });
});

describe("surface API", () => {
  it("creates a surface bound to an owned WorkItem", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await createSurface({
      store, user: owner, now: () => "2026-05-10T00:05:00.000Z", newId: () => "abc",
      request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "dashboard", name: "Sales overview", definition: { components: [] } }
    });
    assert.equal(result.statusCode, 201);
    const created = (result.body as { surface: SurfaceRecord }).surface;
    assert.equal(created.surfaceId, "surface-abc");
    assert.equal(created.status, "draft");
    assert.equal(created.workspaceStatus, "ws-1#draft");
    assert.equal(store.surfaces.length, 1);
  });

  it("rejects unsupported surfaceType at create", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await createSurface({
      store, user: owner, now: () => "n", newId: () => "abc",
      request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "rocket", name: "x", definition: {} }
    });
    assert.equal(result.statusCode, 400);
  });

  it("does not create a surface against another user's WorkItem", async () => {
    const store = new MemoryStore();
    seed(store);
    const result = await createSurface({
      store, user: stranger, now: () => "n", newId: () => "abc",
      request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "dashboard", name: "x", definition: {} }
    });
    assert.equal(result.statusCode, 404);
    assert.equal(store.surfaces.length, 0);
  });

  it("publishes a surface and stamps publishedAt", async () => {
    const store = new MemoryStore();
    seed(store);
    await createSurface({ store, user: owner, now: () => "2026-05-10T00:05:00.000Z", newId: () => "x", request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "dashboard", name: "n", definition: {} } });
    const surfaceId = store.surfaces[0].surfaceId;
    const result = await publishSurface({ store, user: owner, now: () => "2026-05-10T00:06:00.000Z", workspaceId: "ws-1", surfaceId, publishedUrl: "https://preview.example/x" });
    assert.equal(result.statusCode, 200);
    const surface = (result.body as { surface: SurfaceRecord }).surface;
    assert.equal(surface.status, "published");
    assert.equal(surface.publishedUrl, "https://preview.example/x");
    assert.equal(surface.publishedAt, "2026-05-10T00:06:00.000Z");
  });

  it("rejects status transition to an invalid value via update", async () => {
    const store = new MemoryStore();
    seed(store);
    await createSurface({ store, user: owner, now: () => "n", newId: () => "x", request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "dashboard", name: "n", definition: {} } });
    const surfaceId = store.surfaces[0].surfaceId;
    const result = await updateSurface({ store, user: owner, now: () => "n2", workspaceId: "ws-1", surfaceId, updates: { status: "completed" } });
    assert.equal(result.statusCode, 400);
  });

  it("returns surface only to its owner", async () => {
    const store = new MemoryStore();
    seed(store);
    await createSurface({ store, user: owner, now: () => "n", newId: () => "x", request: { workspaceId: "ws-1", workItemId: "wi-1", surfaceType: "dashboard", name: "n", definition: {} } });
    const surfaceId = store.surfaces[0].surfaceId;
    assert.equal((await getSurface({ store, user: owner, workspaceId: "ws-1", surfaceId })).statusCode, 200);
    assert.equal((await getSurface({ store, user: stranger, workspaceId: "ws-1", surfaceId })).statusCode, 404);
  });

  it("lists surfaces by WorkItem and Run filtered to current user", async () => {
    const store = new MemoryStore();
    seed(store);
    await createSurface({ store, user: owner, now: () => "n", newId: () => "x1", request: { workspaceId: "ws-1", workItemId: "wi-1", runId: "run-1", surfaceType: "dashboard", name: "n", definition: {} } });
    const wiList = await listSurfacesForWorkItem({ store, user: owner, workspaceId: "ws-1", workItemId: "wi-1" });
    assert.equal((wiList.body as { surfaces: SurfaceRecord[] }).surfaces.length, 1);
    const runList = await listSurfacesForRun({ store, user: owner, runId: "run-1" });
    assert.equal((runList.body as { surfaces: SurfaceRecord[] }).surfaces.length, 1);
    assert.equal((await listSurfacesForWorkItem({ store, user: stranger, workspaceId: "ws-1", workItemId: "wi-1" })).statusCode, 404);
    assert.equal((await listSurfacesForRun({ store, user: stranger, runId: "run-1" })).statusCode, 404);
  });
});
