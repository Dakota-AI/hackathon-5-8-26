import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  AgentProfileRecord,
  ApprovalRecord,
  ArtifactRecord,
  ArtifactStore,
  ApprovalStore,
  ControlApiStore,
  DataSourceRefRecord,
  DataSourceRefStore,
  EventRecord,
  HostNodeRecord,
  RunRecord,
  RunnerStateStore,
  SurfaceRecord,
  SurfaceStore,
  TaskRecord,
  UserRunnerRecord,
  WorkItemRecord
} from "./ports.js";

export class DynamoControlApiStore implements
  ControlApiStore,
  ArtifactStore,
  DataSourceRefStore,
  SurfaceStore,
  ApprovalStore,
  RunnerStateStore {
  public constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tables: {
      readonly workItemsTableName: string;
      readonly runsTableName: string;
      readonly tasksTableName: string;
      readonly eventsTableName: string;
      readonly artifactsTableName?: string;
      readonly dataSourcesTableName?: string;
      readonly surfacesTableName?: string;
      readonly approvalsTableName?: string;
      readonly hostNodesTableName?: string;
      readonly userRunnersTableName?: string;
      readonly agentProfilesTableName?: string;
    }
  ) {}

  public static fromEnvironment(): DynamoControlApiStore {
    const workItemsTableName = mustEnv("WORK_ITEMS_TABLE_NAME");
    const runsTableName = mustEnv("RUNS_TABLE_NAME");
    const tasksTableName = mustEnv("TASKS_TABLE_NAME");
    const eventsTableName = mustEnv("EVENTS_TABLE_NAME");
    const artifactsTableName = mustEnv("ARTIFACTS_TABLE_NAME");
    const dataSourcesTableName = mustEnv("DATA_SOURCES_TABLE_NAME");
    const surfacesTableName = mustEnv("SURFACES_TABLE_NAME");
    const approvalsTableName = mustEnv("APPROVALS_TABLE_NAME");
    const hostNodesTableName = mustEnv("HOST_NODES_TABLE_NAME");
    const userRunnersTableName = mustEnv("USER_RUNNERS_TABLE_NAME");
    const agentProfilesTableName = mustEnv("AGENT_PROFILES_TABLE_NAME");
    return new DynamoControlApiStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), {
      workItemsTableName,
      runsTableName,
      tasksTableName,
      eventsTableName,
      artifactsTableName,
      dataSourcesTableName,
      surfacesTableName,
      approvalsTableName,
      hostNodesTableName,
      userRunnersTableName,
      agentProfilesTableName
    });
  }

  async putAgentProfileVersion(record: AgentProfileRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.agentProfilesTableName, "AGENT_PROFILES_TABLE_NAME"),
      Item: record,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(profileVersionKey)"
    }));
  }

  async getAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string }): Promise<AgentProfileRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.agentProfilesTableName, "AGENT_PROFILES_TABLE_NAME"),
      Key: { workspaceId: input.workspaceId, profileVersionKey: `${input.profileId}#${input.version}` }
    }));
    return result.Item as AgentProfileRecord | undefined;
  }

  async listAgentProfilesForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<AgentProfileRecord[]> {
    const values: Record<string, unknown> = { ":userId": input.userId };
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.agentProfilesTableName, "AGENT_PROFILES_TABLE_NAME"),
      IndexName: "by-user-created-at",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: input.workspaceId ? { ...values, ":workspaceId": input.workspaceId } : values,
      Limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      ScanIndexForward: false,
      ...(input.workspaceId ? { FilterExpression: "workspaceId = :workspaceId" } : {})
    }));
    return (result.Items ?? []) as AgentProfileRecord[];
  }

  async putDataSourceRef(item: DataSourceRefRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.dataSourcesTableName, "DATA_SOURCES_TABLE_NAME"),
      Item: item,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(dataSourceId)"
    }));
  }

  async getDataSourceRef(workspaceId: string, dataSourceId: string): Promise<DataSourceRefRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.dataSourcesTableName, "DATA_SOURCES_TABLE_NAME"),
      Key: { workspaceId, dataSourceId }
    }));
    return result.Item as DataSourceRefRecord | undefined;
  }

  async listDataSourceRefsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<DataSourceRefRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.dataSourcesTableName, "DATA_SOURCES_TABLE_NAME"),
      IndexName: "by-workitem-created-at",
      KeyConditionExpression: "workItemId = :workItemId",
      ExpressionAttributeValues: { ":workItemId": input.workItemId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as DataSourceRefRecord[]).filter(isCompleteDataSourceRefRecord);
  }

  async listDataSourceRefsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<DataSourceRefRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.dataSourcesTableName, "DATA_SOURCES_TABLE_NAME"),
      IndexName: "by-run-created-at",
      KeyConditionExpression: "runId = :runId",
      ExpressionAttributeValues: { ":runId": input.runId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as DataSourceRefRecord[]).filter(isCompleteDataSourceRefRecord);
  }

  async putSurface(item: SurfaceRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.surfacesTableName, "SURFACES_TABLE_NAME"),
      Item: item,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(surfaceId)"
    }));
  }

  async getSurface(workspaceId: string, surfaceId: string): Promise<SurfaceRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.surfacesTableName, "SURFACES_TABLE_NAME"),
      Key: { workspaceId, surfaceId }
    }));
    return isCompleteSurfaceRecord(result.Item) ? result.Item : undefined;
  }

  async updateSurface(input: { readonly workspaceId: string; readonly surfaceId: string; readonly updates: Partial<SurfaceRecord> }): Promise<SurfaceRecord | undefined> {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const assignments = Object.entries(input.updates)
      .filter(([, value]) => value !== undefined)
      .map(([key, value], index) => {
        const nameKey = `#n${index}`;
        const valueKey = `:v${index}`;
        names[nameKey] = key;
        values[valueKey] = value;
        return `${nameKey} = ${valueKey}`;
      });

    if (assignments.length === 0) {
      return this.getSurface(input.workspaceId, input.surfaceId);
    }

    const result = await this.client.send(new UpdateCommand({
      TableName: requiredTable(this.tables.surfacesTableName, "SURFACES_TABLE_NAME"),
      Key: { workspaceId: input.workspaceId, surfaceId: input.surfaceId },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));
    return isCompleteSurfaceRecord(result.Attributes) ? result.Attributes : undefined;
  }

  async listSurfacesForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<SurfaceRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.surfacesTableName, "SURFACES_TABLE_NAME"),
      IndexName: "by-workitem-updated-at",
      KeyConditionExpression: "workItemId = :workItemId",
      ExpressionAttributeValues: { ":workItemId": input.workItemId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as SurfaceRecord[]).filter(isCompleteSurfaceRecord);
  }

  async listSurfacesForRun(input: { readonly runId: string; readonly limit?: number }): Promise<SurfaceRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.surfacesTableName, "SURFACES_TABLE_NAME"),
      IndexName: "by-run-updated-at",
      KeyConditionExpression: "runId = :runId",
      ExpressionAttributeValues: { ":runId": input.runId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as SurfaceRecord[]).filter(isCompleteSurfaceRecord);
  }

  async putApproval(item: ApprovalRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.approvalsTableName, "APPROVALS_TABLE_NAME"),
      Item: item,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(approvalId)"
    }));
  }

  async getApproval(workspaceId: string, approvalId: string): Promise<ApprovalRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.approvalsTableName, "APPROVALS_TABLE_NAME"),
      Key: { workspaceId, approvalId }
    }));
    return isCompleteApprovalRecord(result.Item) ? result.Item : undefined;
  }

  async listApprovalsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<ApprovalRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.approvalsTableName, "APPROVALS_TABLE_NAME"),
      IndexName: "by-run-created-at",
      KeyConditionExpression: "runId = :runId",
      ExpressionAttributeValues: { ":runId": input.runId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as ApprovalRecord[]).filter(isCompleteApprovalRecord);
  }

  async updateApproval(input: { readonly workspaceId: string; readonly approvalId: string; readonly updates: Partial<ApprovalRecord> }): Promise<ApprovalRecord | undefined> {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const assignments = Object.entries(input.updates)
      .filter(([, value]) => value !== undefined)
      .map(([key, value], index) => {
        const nameKey = `#n${index}`;
        const valueKey = `:v${index}`;
        names[nameKey] = key;
        values[valueKey] = value;
        return `${nameKey} = ${valueKey}`;
      });

    if (assignments.length === 0) {
      return this.getApproval(input.workspaceId, input.approvalId);
    }

    const result = await this.client.send(new UpdateCommand({
      TableName: requiredTable(this.tables.approvalsTableName, "APPROVALS_TABLE_NAME"),
      Key: { workspaceId: input.workspaceId, approvalId: input.approvalId },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));
    return isCompleteApprovalRecord(result.Attributes) ? result.Attributes : undefined;
  }

  async updateAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string; readonly updates: Partial<AgentProfileRecord> }): Promise<AgentProfileRecord | undefined> {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const assignments = Object.entries(input.updates)
      .filter(([, value]) => value !== undefined)
      .map(([key, value], index) => {
        const nameKey = `#n${index}`;
        const valueKey = `:v${index}`;
        names[nameKey] = key;
        values[valueKey] = value;
        return `${nameKey} = ${valueKey}`;
      });

    if (assignments.length === 0) {
      return this.getAgentProfileVersion(input);
    }

    const result = await this.client.send(new UpdateCommand({
      TableName: requiredTable(this.tables.agentProfilesTableName, "AGENT_PROFILES_TABLE_NAME"),
      Key: { workspaceId: input.workspaceId, profileVersionKey: `${input.profileId}#${input.version}` },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));
    return result.Attributes as AgentProfileRecord | undefined;
  }

  async putWorkItem(item: WorkItemRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tables.workItemsTableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(workItemId)"
    }));
  }

  async getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItemRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tables.workItemsTableName,
      Key: { workspaceId, workItemId }
    }));
    return result.Item as WorkItemRecord | undefined;
  }

  async getWorkItemByIdempotencyScope(idempotencyScope: string): Promise<WorkItemRecord | undefined> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tables.workItemsTableName,
      IndexName: "by-idempotency-scope",
      KeyConditionExpression: "idempotencyScope = :idempotencyScope",
      ExpressionAttributeValues: { ":idempotencyScope": idempotencyScope },
      Limit: 1
    }));
    return result.Items?.[0] as WorkItemRecord | undefined;
  }

  async updateWorkItem(input: { readonly workspaceId: string; readonly workItemId: string; readonly updates: Partial<WorkItemRecord> }): Promise<WorkItemRecord | undefined> {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const assignments = Object.entries(input.updates)
      .filter(([, value]) => value !== undefined)
      .map(([key, value], index) => {
        const nameKey = `#n${index}`;
        const valueKey = `:v${index}`;
        names[nameKey] = key;
        values[valueKey] = value;
        return `${nameKey} = ${valueKey}`;
      });

    if (assignments.length === 0) {
      return this.getWorkItem(input.workspaceId, input.workItemId);
    }

    const result = await this.client.send(new UpdateCommand({
      TableName: this.tables.workItemsTableName,
      Key: { workspaceId: input.workspaceId, workItemId: input.workItemId },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    }));
    return result.Attributes as WorkItemRecord | undefined;
  }

  async listWorkItemsForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<WorkItemRecord[]> {
    const values: Record<string, unknown> = { ":userId": input.userId };
    const command: QueryCommand = new QueryCommand({
      TableName: this.tables.workItemsTableName,
      IndexName: "by-user-created-at",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: values,
      Limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      ScanIndexForward: false,
      ...(input.workspaceId
        ? {
            FilterExpression: "workspaceId = :workspaceId",
            ExpressionAttributeValues: { ...values, ":workspaceId": input.workspaceId }
          }
        : {})
    });
    const result = await this.client.send(command);
    return (result.Items ?? []) as WorkItemRecord[];
  }

  async putHostNode(item: HostNodeRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.hostNodesTableName, "HOST_NODES_TABLE_NAME"),
      Item: item
    }));
  }

  async getHostNode(hostId: string): Promise<HostNodeRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.hostNodesTableName, "HOST_NODES_TABLE_NAME"),
      Key: { hostId, hostRecordType: "HOST" }
    }));
    return result.Item as HostNodeRecord | undefined;
  }

  async listHostNodesByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<HostNodeRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const results = await Promise.all(input.statuses.map(async (status) => {
      const result = await this.client.send(new QueryCommand({
        TableName: requiredTable(this.tables.hostNodesTableName, "HOST_NODES_TABLE_NAME"),
        IndexName: "by-status-last-heartbeat",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
        Limit: limit,
        ScanIndexForward: false
      }));
      return (result.Items ?? []) as HostNodeRecord[];
    }));
    return results.flat().sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt)).slice(0, limit);
  }

  async putUserRunner(item: UserRunnerRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: requiredTable(this.tables.userRunnersTableName, "USER_RUNNERS_TABLE_NAME"),
      Item: item
    }));
  }

  async getUserRunner(userId: string, runnerId: string): Promise<UserRunnerRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.userRunnersTableName, "USER_RUNNERS_TABLE_NAME"),
      Key: { userId, runnerId }
    }));
    return result.Item as UserRunnerRecord | undefined;
  }

  async getUserRunnerByRunnerId(runnerId: string): Promise<UserRunnerRecord | undefined> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.userRunnersTableName, "USER_RUNNERS_TABLE_NAME"),
      IndexName: "by-runner-id",
      KeyConditionExpression: "runnerId = :runnerId",
      ExpressionAttributeValues: { ":runnerId": runnerId },
      Limit: 1
    }));
    return result.Items?.[0] as UserRunnerRecord | undefined;
  }

  async listUserRunnersByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<UserRunnerRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const results = await Promise.all(input.statuses.map(async (status) => {
      const result = await this.client.send(new QueryCommand({
        TableName: requiredTable(this.tables.userRunnersTableName, "USER_RUNNERS_TABLE_NAME"),
        IndexName: "by-status-last-heartbeat",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status },
        Limit: limit,
        ScanIndexForward: false
      }));
      return (result.Items ?? []) as UserRunnerRecord[];
    }));
    return results.flat().sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt)).slice(0, limit);
  }

  async createRunLedger(input: { readonly run: RunRecord; readonly task: TaskRecord; readonly event: EventRecord }): Promise<void> {
    await this.client.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: this.tables.runsTableName,
            Item: input.run,
            ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(runId)"
          }
        },
        {
          Put: {
            TableName: this.tables.tasksTableName,
            Item: input.task,
            ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(taskId)"
          }
        },
        {
          Put: {
            TableName: this.tables.eventsTableName,
            Item: input.event,
            ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(seq)"
          }
        }
      ]
    }));
  }

  async putRun(item: RunRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tables.runsTableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(workspaceId) AND attribute_not_exists(runId)"
    }));
  }

  async putTask(item: TaskRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tables.tasksTableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(taskId)"
    }));
  }

  async putEvent(item: EventRecord): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tables.eventsTableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(seq)"
    }));
  }

  async updateRunExecution(input: { readonly workspaceId: string; readonly runId: string; readonly executionArn: string; readonly updatedAt: string }): Promise<void> {
    await this.client.send(new UpdateCommand({
      TableName: this.tables.runsTableName,
      Key: { workspaceId: input.workspaceId, runId: input.runId },
      UpdateExpression: "SET executionArn = :executionArn, updatedAt = :updatedAt",
      ConditionExpression: "attribute_exists(workspaceId) AND attribute_exists(runId)",
      ExpressionAttributeValues: {
        ":executionArn": input.executionArn,
        ":updatedAt": input.updatedAt
      }
    }));
  }

  async getRunById(runId: string): Promise<RunRecord | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tables.runsTableName,
        IndexName: "by-run-id",
        KeyConditionExpression: "runId = :runId",
        ExpressionAttributeValues: { ":runId": runId },
        Limit: 1
      })
    );
    return result.Items?.[0] as RunRecord | undefined;
  }

  async getRunByIdempotencyScope(idempotencyScope: string): Promise<RunRecord | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tables.runsTableName,
        IndexName: "by-idempotency-scope",
        KeyConditionExpression: "idempotencyScope = :idempotencyScope",
        ExpressionAttributeValues: { ":idempotencyScope": idempotencyScope },
        Limit: 1
      })
    );
    return result.Items?.[0] as RunRecord | undefined;
  }

  async listRecentRuns(limit = 50): Promise<RunRecord[]> {
    const result = await this.client.send(new ScanCommand({
      TableName: this.tables.runsTableName,
      Limit: Math.min(Math.max(limit, 1), 100)
    }));
    return (result.Items ?? [])
      .filter(isCompleteRunRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listRunsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<RunRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tables.runsTableName,
      IndexName: "by-workitem-created-at",
      KeyConditionExpression: "workItemId = :workItemId",
      ExpressionAttributeValues: { ":workItemId": input.workItemId },
      Limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      ScanIndexForward: true
    }));
    return (result.Items ?? []).filter(isCompleteRunRecord);
  }

  async listRunsForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<RunRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tables.runsTableName,
      IndexName: "by-user-created-at",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: input.workspaceId
        ? {
            ":userId": input.userId,
            ":workspaceId": input.workspaceId
          }
        : { ":userId": input.userId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false,
      ...(input.workspaceId
        ? {
            FilterExpression: "workspaceId = :workspaceId"
          }
        : {})
    }));
    return (result.Items ?? []).filter(isCompleteRunRecord);
  }

  async listEvents(runId: string, options: { readonly afterSeq?: number; readonly limit?: number } = {}): Promise<EventRecord[]> {
    const names: Record<string, string> = { "#runId": "runId" };
    const values: Record<string, unknown> = { ":runId": runId };
    let keyCondition = "#runId = :runId";

    if (options.afterSeq !== undefined) {
      names["#seq"] = "seq";
      values[":afterSeq"] = options.afterSeq;
      keyCondition += " AND #seq > :afterSeq";
    }

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tables.eventsTableName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        Limit: Math.min(Math.max(options.limit ?? 100, 1), 100),
        ScanIndexForward: true
      })
    );
    return (result.Items ?? []) as EventRecord[];
  }
  async listArtifactsForRun(input: { readonly runId: string; readonly limit?: number }): Promise<ArtifactRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.artifactsTableName, "ARTIFACTS_TABLE_NAME"),
      KeyConditionExpression: "runId = :runId",
      ExpressionAttributeValues: { ":runId": input.runId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as ArtifactRecord[]).filter(isCompleteArtifactRecord);
  }

  async listArtifactsForWorkItem(input: { readonly workItemId: string; readonly limit?: number }): Promise<ArtifactRecord[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: requiredTable(this.tables.artifactsTableName, "ARTIFACTS_TABLE_NAME"),
      IndexName: "by-workitem-created-at",
      KeyConditionExpression: "workItemId = :workItemId",
      ExpressionAttributeValues: { ":workItemId": input.workItemId },
      Limit: clampDynamoLimit(input.limit),
      ScanIndexForward: false
    }));
    return ((result.Items ?? []) as ArtifactRecord[]).filter(isCompleteArtifactRecord);
  }

  async getArtifact(input: { readonly runId: string; readonly artifactId: string }): Promise<ArtifactRecord | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: requiredTable(this.tables.artifactsTableName, "ARTIFACTS_TABLE_NAME"),
      Key: { runId: input.runId, artifactId: input.artifactId }
    }));
    if (!result.Item) {
      return undefined;
    }
    return isCompleteArtifactRecord(result.Item) ? result.Item : undefined;
  }
}

function isCompleteArtifactRecord(value: unknown): value is ArtifactRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<ArtifactRecord>;
  return (
    typeof item.runId === "string" &&
    typeof item.artifactId === "string" &&
    typeof item.workspaceId === "string" &&
    typeof item.userId === "string" &&
    typeof item.uri === "string" &&
    typeof item.createdAt === "string"
  );
}

function clampDynamoLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function isCompleteRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<RunRecord>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.runId === "string" &&
    typeof item.userId === "string" &&
    typeof item.status === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function isCompleteDataSourceRefRecord(value: unknown): value is DataSourceRefRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<DataSourceRefRecord>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.dataSourceId === "string" &&
    typeof item.userId === "string" &&
    typeof item.sourceKind === "string" &&
    typeof item.source === "string" &&
    typeof item.status === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function isCompleteSurfaceRecord(value: unknown): value is SurfaceRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<SurfaceRecord>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.surfaceId === "string" &&
    typeof item.userId === "string" &&
    typeof item.surfaceType === "string" &&
    typeof item.name === "string" &&
    typeof item.status === "string" &&
    typeof item.definition === "object" &&
    item.definition !== null &&
    !Array.isArray(item.definition) &&
    typeof item.workspaceStatus === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function isCompleteApprovalRecord(value: unknown): value is ApprovalRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<ApprovalRecord>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.approvalId === "string" &&
    typeof item.runId === "string" &&
    typeof item.userId === "string" &&
    typeof item.toolName === "string" &&
    typeof item.risk === "string" &&
    typeof item.requestedAction === "string" &&
    typeof item.status === "string" &&
    typeof item.requestedBy === "string" &&
    typeof item.requestedAt === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function requiredTable(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required table configuration ${name}`);
  }
  return value;
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
