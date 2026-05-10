import type { AuthenticatedUser, ControlApiStore, SurfaceStore, SurfaceRecord } from "./ports.js";

export interface SurfaceResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createSurface(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly newId: () => string;
  readonly request: {
    readonly workspaceId: string;
    readonly runId?: string;
    readonly workItemId?: string;
    readonly surfaceType: string;
    readonly name: string;
    readonly definition: Record<string, unknown>;
    readonly status?: string;
    readonly publishedUrl?: string;
  };
}): Promise<SurfaceResult> {
  const workspaceId = cleanOptional(deps.request.workspaceId);
  const surfaceType = cleanOptional(deps.request.surfaceType);
  const name = cleanOptional(deps.request.name);
  const runId = cleanOptional(deps.request.runId);
  const workItemId = cleanOptional(deps.request.workItemId);
  const definition = deps.request.definition;
  const status = cleanOptional(deps.request.status) ?? "draft";

  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }
  if (!surfaceType || !name) {
    return badRequest("surfaceType and name are required.");
  }
  if (!isRecord(definition)) {
    return badRequest("definition must be an object.");
  }

  if (runId) {
    const run = await deps.store.getRunById(runId);
    if (!run || run.userId !== deps.user.userId || run.workspaceId !== workspaceId) {
      return notFound("Run not found.");
    }
  }

  if (workItemId) {
    const workItem = await deps.store.getWorkItem(workspaceId, workItemId);
    if (!workItem || workItem.userId !== deps.user.userId) {
      return notFound("WorkItem not found.");
    }
  }

  const now = deps.now();
  const item: SurfaceRecord = {
    workspaceId,
    surfaceId: `surface-${deps.newId()}`,
    runId,
    workItemId,
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    surfaceType,
    name,
    status,
    definition,
    workspaceStatus: `${workspaceId}#${status}`,
    publishedUrl: cleanOptional(deps.request.publishedUrl),
    publishedAt: status === "published" ? now : undefined,
    createdAt: now,
    updatedAt: now
  };

  await deps.store.putSurface(item);
  return { statusCode: 201, body: { surface: item } };
}

export async function getSurface(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly surfaceId: string;
}): Promise<SurfaceResult> {
  const surface = await deps.store.getSurface(deps.workspaceId, deps.surfaceId);
  if (!surface || surface.userId !== deps.user.userId) {
    return notFound("Surface not found.");
  }
  return { statusCode: 200, body: { surface } };
}

export async function updateSurface(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly workspaceId: string;
  readonly surfaceId: string;
  readonly updates: {
    readonly name?: string;
    readonly status?: string;
    readonly definition?: Record<string, unknown>;
  };
}): Promise<SurfaceResult> {
  const surface = await deps.store.getSurface(deps.workspaceId, deps.surfaceId);
  if (!surface || surface.userId !== deps.user.userId) {
    return notFound("Surface not found.");
  }

  const status = cleanOptional(deps.updates.status);
  const next = await deps.store.updateSurface({
    workspaceId: deps.workspaceId,
    surfaceId: deps.surfaceId,
    updates: {
      ...withoutUndefined({
        name: cleanOptional(deps.updates.name),
        status,
        definition: deps.updates.definition,
        workspaceStatus: status ? `${deps.workspaceId}#${status}` : undefined,
        updatedAt: deps.now()
      })
    }
  });

  return { statusCode: 200, body: { surface: next ?? surface } };
}

export async function publishSurface(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly workspaceId: string;
  readonly surfaceId: string;
  readonly publishedUrl?: string;
}): Promise<SurfaceResult> {
  const existing = await deps.store.getSurface(deps.workspaceId, deps.surfaceId);
  if (!existing || existing.userId !== deps.user.userId) {
    return notFound("Surface not found.");
  }

  const updates: Partial<SurfaceRecord> = {
    status: "published",
    workspaceStatus: `${deps.workspaceId}#published`,
    publishedUrl: cleanOptional(deps.publishedUrl) ?? existing.publishedUrl,
    publishedAt: deps.now(),
    updatedAt: deps.now()
  };

  const surface = await deps.store.updateSurface({
    workspaceId: deps.workspaceId,
    surfaceId: deps.surfaceId,
    updates
  });
  return { statusCode: 200, body: { surface: surface ?? existing } };
}

export async function listSurfacesForWorkItem(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly limit?: number;
}): Promise<SurfaceResult> {
  const workItem = await deps.store.getWorkItem(deps.workspaceId, deps.workItemId);
  if (!workItem || workItem.userId !== deps.user.userId) {
    return notFound("WorkItem not found.");
  }

  const surfaces = await deps.store.listSurfacesForWorkItem({ workItemId: deps.workItemId, limit: clampLimit(deps.limit) });
  return {
    statusCode: 200,
    body: { surfaces: surfaces.filter((surface: SurfaceRecord) => surface.userId === deps.user.userId && surface.workspaceId === deps.workspaceId) }
  };
}

export async function listSurfacesForRun(deps: {
  readonly store: ControlApiStore & SurfaceStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly limit?: number;
}): Promise<SurfaceResult> {
  const run = await deps.store.getRunById(deps.runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const surfaces = await deps.store.listSurfacesForRun({ runId: deps.runId, limit: clampLimit(deps.limit) });
  return {
    statusCode: 200,
    body: { surfaces: surfaces.filter((surface: SurfaceRecord) => surface.userId === deps.user.userId && surface.workspaceId === run.workspaceId) }
  };
}

function badRequest(message: string): SurfaceResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function notFound(message: string): SurfaceResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
