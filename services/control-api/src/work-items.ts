import crypto from "node:crypto";
import { createRun } from "./create-run.js";
import type { AuthenticatedUser, ControlApiStore, CreateWorkItemRequest, EventRecord, ExecutionStarter, RunRecord, WorkItemRecord } from "./ports.js";

export interface WorkItemResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createWorkItem(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly request: CreateWorkItemRequest;
  readonly now: () => string;
  readonly newId: () => string;
}): Promise<WorkItemResult> {
  const workspaceId = deps.request.workspaceId.trim();
  const objective = deps.request.objective.trim();
  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }
  if (!objective) {
    return badRequest("objective is required.");
  }

  const idempotencyKey = cleanOptional(deps.request.idempotencyKey);
  const idempotencyScope = idempotencyKey ? `${deps.user.userId}#${workspaceId}#${idempotencyKey}` : undefined;
  if (idempotencyScope) {
    const existing = await deps.store.getWorkItemByIdempotencyScope(idempotencyScope);
    if (existing) {
      return { statusCode: 200, body: { workItem: existing, workItemId: existing.workItemId, status: existing.status } };
    }
  }

  const createdAt = deps.now();
  const status = "open";
  const workItemId = idempotencyScope ? `work-idem-${hashId(idempotencyScope)}` : `work-${deps.newId()}`;
  const item: WorkItemRecord = withoutUndefined({
    workspaceId,
    workItemId,
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    title: cleanOptional(deps.request.title) ?? deriveTitle(objective),
    objective,
    status,
    workspaceStatus: `${workspaceId}#${status}`,
    priority: cleanOptional(deps.request.priority) ?? "normal",
    idempotencyKey,
    idempotencyScope,
    createdAt,
    updatedAt: createdAt
  });

  await deps.store.putWorkItem(item);
  return { statusCode: 201, body: { workItem: item, workItemId, status } };
}

export async function listWorkItems(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId?: string;
  readonly limit?: number;
}): Promise<WorkItemResult> {
  const workItems = await deps.store.listWorkItemsForUser({
    userId: deps.user.userId,
    workspaceId: cleanOptional(deps.workspaceId),
    limit: clampLimit(deps.limit)
  });
  return { statusCode: 200, body: { workItems } };
}

export async function getWorkItem(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
}): Promise<WorkItemResult> {
  const item = await requireOwnedWorkItem(deps);
  if (!item) {
    return notFound("WorkItem not found.");
  }
  return { statusCode: 200, body: { workItem: item } };
}

export async function updateWorkItemStatus(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly status: string;
  readonly now: () => string;
}): Promise<WorkItemResult> {
  const current = await requireOwnedWorkItem(deps);
  if (!current) {
    return notFound("WorkItem not found.");
  }

  const status = cleanOptional(deps.status);
  if (!status || !["open", "in_progress", "blocked", "completed", "cancelled"].includes(status)) {
    return badRequest("status must be one of open, in_progress, blocked, completed, or cancelled.");
  }

  const updated = await deps.store.updateWorkItem({
    workspaceId: deps.workspaceId,
    workItemId: deps.workItemId,
    updates: {
      status,
      workspaceStatus: `${deps.workspaceId}#${status}`,
      updatedAt: deps.now()
    }
  });
  return { statusCode: 200, body: { workItem: updated ?? current } };
}

export async function createWorkItemRun(deps: {
  readonly store: ControlApiStore;
  readonly executions: ExecutionStarter;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly objective: string;
  readonly idempotencyKey?: string;
  readonly now: () => string;
  readonly newId: () => string;
}): Promise<WorkItemResult> {
  const item = await requireOwnedWorkItem(deps);
  if (!item) {
    return notFound("WorkItem not found.");
  }

  const result = await createRun({
    store: deps.store,
    executions: deps.executions,
    now: deps.now,
    newId: deps.newId,
    user: deps.user,
    request: {
      workspaceId: deps.workspaceId,
      workItemId: deps.workItemId,
      objective: deps.objective,
      idempotencyKey: cleanOptional(deps.idempotencyKey)
    }
  });
  return result;
}

export async function listWorkItemRuns(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly limit?: number;
}): Promise<WorkItemResult> {
  const item = await requireOwnedWorkItem(deps);
  if (!item) {
    return notFound("WorkItem not found.");
  }

  const runs = (await deps.store.listRunsForWorkItem({ workItemId: deps.workItemId, limit: clampLimit(deps.limit) }))
    .filter((run) => run.userId === deps.user.userId && run.workspaceId === deps.workspaceId);
  return { statusCode: 200, body: { runs } };
}

export async function listWorkItemEvents(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly limit?: number;
}): Promise<WorkItemResult> {
  const runsResult = await listWorkItemRuns(deps);
  if (runsResult.statusCode !== 200) {
    return runsResult;
  }

  const runs = runsResult.body.runs as RunRecord[];
  const eventsByRun = await Promise.all(runs.map((run) => deps.store.listEvents(run.runId)));
  const events = eventsByRun
    .flat()
    .filter((event) => event.userId === deps.user.userId && event.workspaceId === deps.workspaceId)
    .sort(compareEvents)
    .slice(0, clampLimit(deps.limit));
  return { statusCode: 200, body: { events } };
}

async function requireOwnedWorkItem(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
}): Promise<WorkItemRecord | undefined> {
  const item = await deps.store.getWorkItem(deps.workspaceId, deps.workItemId);
  if (!item || item.userId !== deps.user.userId) {
    return undefined;
  }
  return item;
}

function badRequest(message: string): WorkItemResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function notFound(message: string): WorkItemResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function deriveTitle(objective: string): string {
  return objective.length <= 80 ? objective : `${objective.slice(0, 77)}...`;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 50;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function hashId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function compareEvents(left: EventRecord, right: EventRecord): number {
  const timeCompare = left.createdAt.localeCompare(right.createdAt);
  if (timeCompare !== 0) {
    return timeCompare;
  }
  if (left.runId !== right.runId) {
    return left.runId.localeCompare(right.runId);
  }
  return left.seq - right.seq;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
