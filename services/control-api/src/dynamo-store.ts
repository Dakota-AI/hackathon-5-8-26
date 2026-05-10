import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ControlApiStore, EventRecord, RunRecord, TaskRecord } from "./ports.js";

export class DynamoControlApiStore implements ControlApiStore {
  public constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tables: {
      readonly runsTableName: string;
      readonly tasksTableName: string;
      readonly eventsTableName: string;
    }
  ) {}

  public static fromEnvironment(): DynamoControlApiStore {
    const runsTableName = mustEnv("RUNS_TABLE_NAME");
    const tasksTableName = mustEnv("TASKS_TABLE_NAME");
    const eventsTableName = mustEnv("EVENTS_TABLE_NAME");
    return new DynamoControlApiStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), {
      runsTableName,
      tasksTableName,
      eventsTableName
    });
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
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tables.runsTableName,
        Limit: Math.min(Math.max(limit, 1), 100)
      })
    );
    return (result.Items ?? [])
      .filter(isCompleteRunRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
