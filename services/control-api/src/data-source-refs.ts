import type {
  AuthenticatedUser,
  ControlApiStore,
  DataSourceRefStore,
  DataSourceRefRecord
} from "./ports.js";

export interface DataSourceRefResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createDataSourceRef(deps: {
  readonly store: ControlApiStore & DataSourceRefStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly newId: () => string;
  readonly request: {
    readonly workspaceId: string;
    readonly sourceKind: string;
    readonly source: string;
    readonly runId?: string;
    readonly workItemId?: string;
    readonly artifactId?: string;
    readonly displayName?: string;
    readonly metadata?: Record<string, unknown>;
    readonly status?: string;
  };
}): Promise<DataSourceRefResult> {
  const workspaceId = deps.request.workspaceId.trim();
  const sourceKind = cleanOptional(deps.request.sourceKind);
  const source = cleanOptional(deps.request.source);
  const runId = cleanOptional(deps.request.runId);
  const workItemId = cleanOptional(deps.request.workItemId);
  const artifactId = cleanOptional(deps.request.artifactId);
  const status = cleanOptional(deps.request.status) ?? "available";

  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }

  if (!sourceKind || !source) {
    return badRequest("sourceKind and source are required.");
  }

  if (!runId && !workItemId) {
    return badRequest("Either runId or workItemId is required.");
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

  const createdAt = deps.now();
  const dataSourceId = `data-${deps.newId()}`;
  const item: DataSourceRefRecord = withoutUndefined({
    workspaceId,
    dataSourceId,
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    runId,
    workItemId,
    artifactId,
    sourceKind,
    source,
    displayName: cleanOptional(deps.request.displayName),
    metadata: deps.request.metadata,
    status,
    createdAt,
    updatedAt: createdAt
  });

  await deps.store.putDataSourceRef(item);
  return { statusCode: 201, body: { dataSourceRef: item } };
}

export async function getDataSourceRef(deps: {
  readonly store: ControlApiStore & DataSourceRefStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly dataSourceId: string;
}): Promise<DataSourceRefResult> {
  const dataSourceRef = await deps.store.getDataSourceRef(deps.workspaceId, deps.dataSourceId);
  if (!dataSourceRef || dataSourceRef.userId !== deps.user.userId) {
    return notFound("Data source reference not found.");
  }
  return { statusCode: 200, body: { dataSourceRef } };
}

export async function listDataSourceRefsForWorkItem(deps: {
  readonly store: ControlApiStore & DataSourceRefStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly limit?: number;
}): Promise<DataSourceRefResult> {
  const workItem = await deps.store.getWorkItem(deps.workspaceId, deps.workItemId);
  if (!workItem || workItem.userId !== deps.user.userId) {
    return notFound("WorkItem not found.");
  }

  const dataSourceRefs = await deps.store.listDataSourceRefsForWorkItem({
    workItemId: deps.workItemId,
    limit: clampLimit(deps.limit)
  });
  return {
    statusCode: 200,
    body: { dataSourceRefs: dataSourceRefs.filter((item: DataSourceRefRecord) => item.userId === deps.user.userId && item.workspaceId === deps.workspaceId) }
  };
}

export async function listDataSourceRefsForRun(deps: {
  readonly store: ControlApiStore & DataSourceRefStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly limit?: number;
}): Promise<DataSourceRefResult> {
  const run = await deps.store.getRunById(deps.runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const dataSourceRefs = await deps.store.listDataSourceRefsForRun({
    runId: deps.runId,
    limit: clampLimit(deps.limit)
  });
  return {
    statusCode: 200,
    body: {
      dataSourceRefs: dataSourceRefs.filter((item: DataSourceRefRecord) => item.userId === deps.user.userId && item.workspaceId === run.workspaceId)
    }
  };
}

function badRequest(message: string): DataSourceRefResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function notFound(message: string): DataSourceRefResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
