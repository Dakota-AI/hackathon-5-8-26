import type { AuthenticatedUser, ControlApiStore, CreateRunRequest, ExecutionStarter, EventRecord, RunRecord, TaskRecord } from "./ports.js";

export interface CreateRunDependencies {
  readonly store: ControlApiStore;
  readonly executions: ExecutionStarter;
  readonly now: () => string;
  readonly newId: () => string;
  readonly user: AuthenticatedUser;
  readonly request: CreateRunRequest;
}

export interface CreateRunResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createRun(deps: CreateRunDependencies): Promise<CreateRunResult> {
  const objective = deps.request.objective?.trim();
  const workspaceId = deps.request.workspaceId?.trim();

  if (!workspaceId) {
    return validationError("workspaceId is required.");
  }

  if (!objective) {
    return validationError("objective is required.");
  }

  const timestamp = deps.now();
  const id = deps.newId();
  const runId = `run-${id}`;
  const taskId = `task-${id}`;

  const execution = await deps.executions.startExecution({
    runId,
    taskId,
    workspaceId,
    userId: deps.user.userId,
    objective
  });

  const run: RunRecord = withoutUndefined({
    workspaceId,
    runId,
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    objective,
    status: "queued",
    idempotencyKey: deps.request.idempotencyKey,
    createdAt: timestamp,
    updatedAt: timestamp,
    executionArn: execution.executionArn
  });

  const task: TaskRecord = {
    runId,
    taskId,
    workspaceId,
    userId: deps.user.userId,
    workerClass: "agent-runtime",
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const event: EventRecord = {
    runId,
    seq: 1,
    workspaceId,
    userId: deps.user.userId,
    createdAt: timestamp,
    type: "run.status",
    payload: {
      status: "queued",
      message: "Run accepted and queued for execution."
    }
  };

  await deps.store.putRun(run);
  await deps.store.putTask(task);
  await deps.store.putEvent(event);

  return {
    statusCode: 202,
    body: {
      runId,
      workspaceId,
      taskId,
      status: "queued",
      executionArn: execution.executionArn
    }
  };
}

function validationError(message: string): CreateRunResult {
  return {
    statusCode: 400,
    body: {
      error: "BadRequest",
      message
    }
  };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
