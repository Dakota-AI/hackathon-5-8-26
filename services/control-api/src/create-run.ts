import { createHash } from "node:crypto";
import { buildRunStatusEvent } from "@agents-cloud/protocol";
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
  const idempotencyKey = deps.request.idempotencyKey?.trim();

  if (!workspaceId) {
    return validationError("workspaceId is required.");
  }

  if (!objective) {
    return validationError("objective is required.");
  }

  const idempotencyScope = idempotencyKey ? makeIdempotencyScope(deps.user.userId, workspaceId, idempotencyKey) : undefined;
  if (idempotencyScope) {
    const existing = await deps.store.getRunByIdempotencyScope(idempotencyScope);
    if (existing) {
      if (existing.executionArn) {
        return runResult(existing, 202);
      }
      const taskId = taskIdFromRunId(existing.runId);
      const execution = await deps.executions.startExecution({
        runId: existing.runId,
        taskId,
        workspaceId: existing.workspaceId,
        userId: existing.userId,
        objective: existing.objective
      });
      await deps.store.updateRunExecution({
        workspaceId: existing.workspaceId,
        runId: existing.runId,
        executionArn: execution.executionArn,
        updatedAt: deps.now()
      });
      return runResult({ ...existing, executionArn: execution.executionArn }, 202, taskId);
    }
  }

  const timestamp = deps.now();
  const id = idempotencyScope ? `idem-${hashIdempotencyScope(idempotencyScope)}` : deps.newId();
  const runId = `run-${id}`;
  const taskId = `task-${id}`;

  const run: RunRecord = withoutUndefined({
    workspaceId,
    runId,
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    objective,
    status: "queued",
    idempotencyKey,
    idempotencyScope,
    createdAt: timestamp,
    updatedAt: timestamp
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

  const event: EventRecord = buildRunStatusEvent({
    id: eventId(runId, 1),
    seq: 1,
    createdAt: timestamp,
    userId: deps.user.userId,
    workspaceId,
    runId,
    taskId,
    idempotencyKey,
    source: {
      kind: "control-api",
      name: "control-api.create-run"
    },
    status: "queued",
    message: "Run accepted and queued for execution."
  });

  await deps.store.createRunLedger({ run, task, event });

  const execution = await deps.executions.startExecution({
    runId,
    taskId,
    workspaceId,
    userId: deps.user.userId,
    objective
  });

  await deps.store.updateRunExecution({
    workspaceId,
    runId,
    executionArn: execution.executionArn,
    updatedAt: deps.now()
  });

  return runResult({ ...run, executionArn: execution.executionArn }, 202, taskId);
}

function runResult(run: RunRecord, statusCode: number, explicitTaskId?: string): CreateRunResult {
  const taskId = explicitTaskId ?? taskIdFromRunId(run.runId);
  return {
    statusCode,
    body: withoutUndefined({
      runId: run.runId,
      workspaceId: run.workspaceId,
      taskId,
      status: run.status,
      executionArn: run.executionArn
    })
  };
}

function eventId(runId: string, seq: number): string {
  return `evt-${runId}-${String(seq).padStart(6, "0")}`;
}

function taskIdFromRunId(runId: string): string {
  return runId.replace(/^run-/, "task-");
}

function makeIdempotencyScope(userId: string, workspaceId: string, idempotencyKey: string): string {
  return `${userId}#${workspaceId}#${idempotencyKey}`;
}

function hashIdempotencyScope(idempotencyScope: string): string {
  return createHash("sha256").update(idempotencyScope).digest("hex").slice(0, 24);
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
