import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { EventSink, RuntimeContext, RuntimeEvent } from "./ports.js";

export class DynamoEventSink implements EventSink {
  public constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tables: {
      readonly runsTableName: string;
      readonly tasksTableName: string;
      readonly eventsTableName: string;
    },
    private readonly context: RuntimeContext
  ) {}

  public static fromEnvironment(context: RuntimeContext): DynamoEventSink {
    return new DynamoEventSink(DynamoDBDocumentClient.from(new DynamoDBClient({})), {
      runsTableName: mustEnv("RUNS_TABLE_NAME"),
      tasksTableName: mustEnv("TASKS_TABLE_NAME"),
      eventsTableName: mustEnv("EVENTS_TABLE_NAME")
    }, context);
  }

  async putEvent(event: RuntimeEvent): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tables.eventsTableName,
      Item: event,
      ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(seq)"
    }));
  }

  async updateRunStatus(status: string): Promise<void> {
    await this.client.send(new UpdateCommand({
      TableName: this.tables.runsTableName,
      Key: {
        workspaceId: this.context.workspaceId,
        runId: this.context.runId
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": this.context.now()
      }
    }));
  }

  async updateTaskStatus(status: string): Promise<void> {
    await this.client.send(new UpdateCommand({
      TableName: this.tables.tasksTableName,
      Key: {
        runId: this.context.runId,
        taskId: this.context.taskId
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": this.context.now()
      }
    }));
  }
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
