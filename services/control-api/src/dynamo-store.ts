import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

  async putRun(item: RunRecord): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tables.runsTableName, Item: item }));
  }

  async putTask(item: TaskRecord): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tables.tasksTableName, Item: item }));
  }

  async putEvent(item: EventRecord): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tables.eventsTableName, Item: item }));
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

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
