export interface AuthenticatedUser {
  readonly userId: string;
  readonly email?: string;
}

export interface CreateRunRequest {
  readonly workspaceId: string;
  readonly objective: string;
  readonly idempotencyKey?: string;
  readonly workItemId?: string;
}

export interface WorkItemRecord {
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly title: string;
  readonly objective: string;
  readonly status: string;
  readonly workspaceStatus: string;
  readonly priority: string;
  readonly idempotencyKey?: string;
  readonly idempotencyScope?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWorkItemRequest {
  readonly workspaceId: string;
  readonly title?: string;
  readonly objective: string;
  readonly priority?: string;
  readonly idempotencyKey?: string;
}

export interface HostNodeRecord {
  readonly hostId: string;
  readonly hostRecordType: "HOST";
  readonly placementTarget: string;
  readonly status: string;
  readonly placementTargetStatus: string;
  readonly capacity: Record<string, unknown>;
  readonly health: Record<string, unknown>;
  readonly registeredByUserId: string;
  readonly registeredByEmail?: string;
  readonly lastHeartbeatAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserRunnerRecord {
  readonly userId: string;
  readonly runnerId: string;
  readonly workspaceId: string;
  readonly status: string;
  readonly desiredState: string;
  readonly hostId?: string;
  readonly placementTarget?: string;
  readonly hostStatus: string;
  readonly resourceLimits: Record<string, unknown>;
  readonly health: Record<string, unknown>;
  readonly lastHeartbeatAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunRecord {
  readonly workspaceId: string;
  readonly runId: string;
  readonly workItemId?: string;
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
  readonly workItemId?: string;
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
  putWorkItem(item: WorkItemRecord): Promise<void>;
  getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItemRecord | undefined>;
  getWorkItemByIdempotencyScope(idempotencyScope: string): Promise<WorkItemRecord | undefined>;
  updateWorkItem(input: { readonly workspaceId: string; readonly workItemId: string; readonly updates: Partial<WorkItemRecord> }): Promise<WorkItemRecord | undefined>;
  listWorkItemsForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<WorkItemRecord[]>;
  putRun(item: RunRecord): Promise<void>;
  putTask(item: TaskRecord): Promise<void>;
  putEvent(item: EventRecord): Promise<void>;
  updateRunExecution(input: { readonly workspaceId: string; readonly runId: string; readonly executionArn: string; readonly updatedAt: string }): Promise<void>;
  getRunById(runId: string): Promise<RunRecord | undefined>;
  getRunByIdempotencyScope(idempotencyScope: string): Promise<RunRecord | undefined>;
  listRecentRuns(limit?: number): Promise<RunRecord[]>;
  listRunsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<RunRecord[]>;
  listEvents(runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]>;
}

export interface RunnerStateStore {
  putHostNode(item: HostNodeRecord): Promise<void>;
  getHostNode(hostId: string): Promise<HostNodeRecord | undefined>;
  listHostNodesByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<HostNodeRecord[]>;
  putUserRunner(item: UserRunnerRecord): Promise<void>;
  getUserRunner(userId: string, runnerId: string): Promise<UserRunnerRecord | undefined>;
  getUserRunnerByRunnerId(runnerId: string): Promise<UserRunnerRecord | undefined>;
  listUserRunnersByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<UserRunnerRecord[]>;
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
