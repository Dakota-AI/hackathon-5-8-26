import type { AgentProfileVersion, ProfileLifecycleState, ValidationResult } from "@agents-cloud/agent-profile";

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email?: string;
  readonly groups?: readonly string[];
  readonly isSuspended?: boolean;
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
  /** Private IP the resident container reports during its first heartbeat after launch. */
  readonly privateIp?: string;
  /** Resolved HTTP endpoint (e.g. http://10.40.1.23:8787). Derived from privateIp when absent. */
  readonly runnerEndpoint?: string;
  /** ARN of the most recent ECS task that materialized this runner. */
  readonly taskArn?: string;
  /** Last error reported by the dispatcher (e.g. RunTask failure). */
  readonly lastErrorMessage?: string;
  /** Wall-clock when the dispatcher last ran a launch attempt. */
  readonly launchedAt?: string;
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

export interface DataSourceRefRecord {
  readonly workspaceId: string;
  readonly dataSourceId: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly runId?: string;
  readonly workItemId?: string;
  readonly artifactId?: string;
  readonly sourceKind: string;
  readonly source: string;
  readonly displayName?: string;
  readonly metadata?: Record<string, unknown>;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SurfaceRecord {
  readonly workspaceId: string;
  readonly surfaceId: string;
  readonly runId?: string;
  readonly workItemId?: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly surfaceType: string;
  readonly name: string;
  readonly status: string;
  readonly definition: Record<string, unknown>;
  readonly workspaceStatus: string;
  readonly publishedUrl?: string;
  readonly publishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApprovalRecord {
  readonly workspaceId: string;
  readonly approvalId: string;
  readonly runId: string;
  readonly workItemId?: string;
  readonly taskId?: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly toolName: string;
  readonly risk: string;
  readonly requestedAction: string;
  readonly status: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly decision?: string;
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly reason?: string;
  readonly argumentsPreview?: Record<string, unknown>;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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

export interface AgentProfileRecord {
  readonly workspaceId: string;
  readonly profileVersionKey: string;
  readonly profileId: string;
  readonly version: string;
  readonly userId: string;
  readonly ownerEmail?: string;
  readonly lifecycleState: ProfileLifecycleState;
  readonly role: string;
  readonly artifactS3Uri: string;
  readonly profile: AgentProfileVersion;
  readonly validationSummary: ValidationResult["summary"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentProfileRegistryStore {
  putAgentProfileVersion(record: AgentProfileRecord): Promise<void>;
  getAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string }): Promise<AgentProfileRecord | undefined>;
  listAgentProfilesForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<AgentProfileRecord[]>;
  updateAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string; readonly updates: Partial<AgentProfileRecord> }): Promise<AgentProfileRecord | undefined>;
}

export interface AgentProfileBundleStore {
  putAgentProfileArtifact(input: { readonly key: string; readonly body: string; readonly contentType: string }): Promise<{ readonly s3Uri: string }>;
}

export interface ArtifactRecord {
  readonly runId: string;
  readonly artifactId: string;
  readonly workspaceId: string;
  readonly workItemId?: string;
  readonly userId: string;
  readonly taskId?: string;
  readonly kind: string;
  readonly name: string;
  readonly bucket: string;
  readonly key: string;
  readonly uri: string;
  readonly contentType: string;
  readonly createdAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ArtifactPresigner {
  presignDownload(input: { readonly bucket: string; readonly key: string; readonly expiresInSeconds: number; readonly contentType?: string; readonly fileName?: string }): Promise<{ readonly url: string; readonly expiresAt: string }>;
}

export interface ArtifactStore {
  listArtifactsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<ArtifactRecord[]>;
  listArtifactsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<ArtifactRecord[]>;
  getArtifact(input: { readonly runId: string; readonly artifactId: string }): Promise<ArtifactRecord | undefined>;
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
  listRunsForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<RunRecord[]>;
  listRunsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<RunRecord[]>;
  listEvents(runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<EventRecord[]>;
}

export interface DataSourceRefStore {
  putDataSourceRef(item: DataSourceRefRecord): Promise<void>;
  getDataSourceRef(workspaceId: string, dataSourceId: string): Promise<DataSourceRefRecord | undefined>;
  listDataSourceRefsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<DataSourceRefRecord[]>;
  listDataSourceRefsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<DataSourceRefRecord[]>;
}

export interface SurfaceStore {
  putSurface(item: SurfaceRecord): Promise<void>;
  getSurface(workspaceId: string, surfaceId: string): Promise<SurfaceRecord | undefined>;
  updateSurface(input: { readonly workspaceId: string; readonly surfaceId: string; readonly updates: Partial<SurfaceRecord> }): Promise<SurfaceRecord | undefined>;
  listSurfacesForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<SurfaceRecord[]>;
  listSurfacesForRun(input: { readonly runId: string; readonly limit?: number }): Promise<SurfaceRecord[]>;
}

export interface ApprovalStore {
  putApproval(item: ApprovalRecord): Promise<void>;
  getApproval(workspaceId: string, approvalId: string): Promise<ApprovalRecord | undefined>;
  listApprovalsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<ApprovalRecord[]>;
  updateApproval(input: { readonly workspaceId: string; readonly approvalId: string; readonly updates: Partial<ApprovalRecord> }): Promise<ApprovalRecord | undefined>;
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
