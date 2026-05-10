import type { AuthenticatedUser, ControlApiStore } from "./ports.js";

export interface QueryResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
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

function notFound(): QueryResult {
  return {
    statusCode: 404,
    body: {
      error: "NotFound",
      message: "Run not found."
    }
  };
}
