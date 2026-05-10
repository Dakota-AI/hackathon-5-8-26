import type { AuthenticatedUser, ControlApiStore, RunRecord } from "./ports.js";

export interface QueryResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function listRuns(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId?: string;
  readonly limit?: number;
}): Promise<QueryResult> {
  const runs = await deps.store.listRunsForUser({
    userId: deps.user.userId,
    workspaceId: cleanOptional(deps.workspaceId),
    limit: clampLimit(deps.limit)
  });

  return {
    statusCode: 200,
    body: { runs }
  };
}

export async function getRun(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
}): Promise<QueryResult> {
  const run = await deps.store.getRunById(deps.runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound();
  }

  return {
    statusCode: 200,
    body: { run }
  };
}

export async function listRunEvents(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly afterSeq?: number;
  readonly limit?: number;
}): Promise<QueryResult> {
  const run = await deps.store.getRunById(deps.runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound();
  }

  const events = await deps.store.listEvents(deps.runId, {
    afterSeq: deps.afterSeq,
    limit: deps.limit
  });
  const nextSeq = events.length > 0 ? events[events.length - 1]?.seq : deps.afterSeq;

  return {
    statusCode: 200,
    body: { events, nextSeq }
  };
}

export async function listAdminRuns(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly adminEmails: readonly string[];
  readonly limit?: number;
}): Promise<QueryResult> {
  if (!isAdminUser(deps.user, deps.adminEmails)) {
    return forbidden();
  }

  const runs = await deps.store.listRecentRuns(Math.min(Math.max(deps.limit ?? 50, 1), 100));
  const summaries = await Promise.all(runs.map(async (run) => summarizeRun(deps.store, run)));

  return {
    statusCode: 200,
    body: {
      runs: summaries,
      totals: {
        totalRuns: summaries.length,
        failedRuns: summaries.filter((run) => run.status === "failed").length,
        runningRuns: summaries.filter((run) => run.status === "running").length,
        succeededRuns: summaries.filter((run) => run.status === "succeeded").length
      }
    }
  };
}

export async function listAdminRunEvents(deps: {
  readonly store: ControlApiStore;
  readonly user: AuthenticatedUser;
  readonly adminEmails: readonly string[];
  readonly runId: string;
  readonly afterSeq?: number;
  readonly limit?: number;
}): Promise<QueryResult> {
  if (!isAdminUser(deps.user, deps.adminEmails)) {
    return forbidden();
  }

  const run = await deps.store.getRunById(deps.runId);
  if (!run) {
    return notFound();
  }

  const events = await deps.store.listEvents(deps.runId, {
    afterSeq: deps.afterSeq,
    limit: deps.limit
  });
  const nextSeq = events.length > 0 ? events[events.length - 1]?.seq : deps.afterSeq;

  return {
    statusCode: 200,
    body: { run, events, nextSeq }
  };
}

async function summarizeRun(store: ControlApiStore, run: RunRecord): Promise<Record<string, unknown>> {
  const events = await store.listEvents(run.runId, { limit: 100 });
  const latestEvent = events.at(-1);
  const artifactEvents = events.filter((event) => event.type === "artifact.created");
  const failureEvents = events.filter((event) => event.type === "run.status" && hasFailurePayload(event.payload));
  const lastFailurePayload = failureEvents.at(-1)?.payload.error;

  return {
    runId: run.runId,
    workspaceId: run.workspaceId,
    userId: run.userId,
    ownerEmail: run.ownerEmail,
    objective: run.objective,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    executionArn: run.executionArn,
    eventCount: events.length,
    latestEventType: latestEvent?.type,
    latestEventAt: latestEvent?.createdAt,
    artifactCount: artifactEvents.length,
    failureCount: failureEvents.length,
    lastFailure: isRecord(lastFailurePayload) ? lastFailurePayload : undefined
  };
}

function isAdminUser(user: AuthenticatedUser, adminEmails: readonly string[]): boolean {
  if (!user.email) {
    return false;
  }
  const normalizedUserEmail = user.email.trim().toLowerCase();
  return adminEmails.map((email) => email.trim().toLowerCase()).includes(normalizedUserEmail);
}

function hasFailurePayload(payload: Record<string, unknown>): boolean {
  return payload.status === "failed" || payload.error !== undefined;
}

function cleanOptional(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forbidden(): QueryResult {
  return {
    statusCode: 403,
    body: {
      error: "Forbidden",
      message: "Admin access is required."
    }
  };
}

function notFound(): QueryResult {
  return {
    statusCode: 404,
    body: {
      error: "NotFound",
      message: "Run not found."
    }
  };
}
