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
  readonly runId: string;
  readonly seq: number;
  readonly workspaceId: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface ControlApiStore {
  putRun(item: RunRecord): Promise<void>;
  putTask(item: TaskRecord): Promise<void>;
  putEvent(item: EventRecord): Promise<void>;
  getRunById(runId: string): Promise<RunRecord | undefined>;
  listEvents(runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]>;
}

export interface ExecutionStarter {
  startExecution(input: {
    readonly runId: string;
    readonly taskId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly objective: string;
  }): Promise<{ executionArn: string }>;
}
