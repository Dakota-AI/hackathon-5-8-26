export interface AuthenticatedUser {
  readonly userId: string;
  readonly email?: string;
}

export interface CreateRunRequest {
  readonly workspaceId: string;
  readonly objective: string;
  readonly idempotencyKey?: string;
}

export interface RunRecord {
  readonly workspaceId: string;
  readonly runId: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly objective: string;
  readonly status: string;
  readonly idempotencyKey?: string;
  readonly idempotencyScope?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly executionArn?: string;
}

export interface TaskRecord {
  readonly runId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly workerClass: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EventRecord {
  readonly id: string;
  readonly type: string;
  readonly seq: number;
  readonly createdAt: string;
  readonly orgId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly idempotencyKey?: string;
  readonly source: {
    readonly kind: string;
    readonly name: string;
    readonly version?: string;
  };
  readonly payload: Record<string, unknown>;
}

export interface ControlApiStore {
  createRunLedger(input: { readonly run: RunRecord; readonly task: TaskRecord; readonly event: EventRecord }): Promise<void>;
  putRun(item: RunRecord): Promise<void>;
  putTask(item: TaskRecord): Promise<void>;
  putEvent(item: EventRecord): Promise<void>;
  updateRunExecution(input: { readonly workspaceId: string; readonly runId: string; readonly executionArn: string; readonly updatedAt: string }): Promise<void>;
  getRunById(runId: string): Promise<RunRecord | undefined>;
  getRunByIdempotencyScope(idempotencyScope: string): Promise<RunRecord | undefined>;
  listRecentRuns(limit?: number): Promise<RunRecord[]>;
  listEvents(runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]>;
}

export interface ExecutionStarter {
  startExecution(input: {
    readonly runId: string;
    readonly taskId: string;
    readonly workspaceId: string;
    readonly workItemId?: string;
    readonly userId: string;
    readonly objective: string;
  }): Promise<{ executionArn: string }>;
}
