import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { RealtimeConnection, RealtimeSubscriptionStore, SubscribeRunInput, UnsubscribeRunInput } from "./ports.js";

const META_SK = "META";
const CONNECTION_PREFIX = "CONN#";
const TOPIC_PREFIX = "TOPIC#";
const RUN_TOPIC_PREFIX = "run:";

export function runTopic(workspaceId: string, runId: string): string {
  return `${RUN_TOPIC_PREFIX}${workspaceId}:${runId}`;
}

export class DynamoRealtimeStore implements RealtimeSubscriptionStore {
  public constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}

  public static fromEnvironment(): DynamoRealtimeStore {
    const tableName = process.env.REALTIME_CONNECTIONS_TABLE_NAME;
    if (!tableName) {
      throw new Error("Missing required environment variable REALTIME_CONNECTIONS_TABLE_NAME");
    }
    return new DynamoRealtimeStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), tableName);
  }

  async saveConnection(connection: RealtimeConnection): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: connectionItem(connection) }));
  }

  async getConnection(connectionId: string): Promise<RealtimeConnection | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: connectionPk(connectionId), sk: META_SK } })
    );
    return result.Item ? connectionFromItem(result.Item) : undefined;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "by-connection",
        KeyConditionExpression: "connectionId = :connectionId",
        ExpressionAttributeValues: { ":connectionId": connectionId }
      })
    );

    const keys = (result.Items ?? []).map((item) => ({ pk: item.pk, sk: item.sk }));
    if (keys.length === 0) {
      await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: connectionPk(connectionId), sk: META_SK } }));
      return;
    }

    for (let index = 0; index < keys.length; index += 25) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } }))
          }
        })
      );
    }
  }

  async subscribeRun(input: SubscribeRunInput): Promise<void> {
    const topic = runTopic(input.workspaceId, input.runId);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: topicPk(topic),
          sk: connectionPk(input.connectionId),
          kind: "RUN_SUBSCRIPTION",
          topic,
          connectionId: input.connectionId,
          workspaceId: input.workspaceId,
          runId: input.runId,
          userId: input.userId
        }
      })
    );
  }

  async unsubscribeRun(input: UnsubscribeRunInput): Promise<void> {
    const topic = runTopic(input.workspaceId, input.runId);
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: topicPk(topic), sk: connectionPk(input.connectionId) } }));
  }

  async listConnectionsForRun(workspaceId: string, runId: string): Promise<RealtimeConnection[]> {
    const topic = runTopic(workspaceId, runId);
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :topicPk",
        ExpressionAttributeValues: { ":topicPk": topicPk(topic) }
      })
    );

    const connections: RealtimeConnection[] = [];
    for (const item of result.Items ?? []) {
      if (typeof item.connectionId !== "string") {
        continue;
      }
      const connection = await this.getConnection(item.connectionId);
      if (connection) {
        connections.push(connection);
      }
    }
    return connections;
  }
}

export class InMemoryRealtimeStore implements RealtimeSubscriptionStore {
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly subscriptions = new Map<string, Set<string>>();

  async saveConnection(connection: RealtimeConnection): Promise<void> {
    this.connections.set(connection.connectionId, connection);
  }

  async getConnection(connectionId: string): Promise<RealtimeConnection | undefined> {
    return this.connections.get(connectionId);
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(connectionId);
    }
  }

  async subscribeRun(input: SubscribeRunInput): Promise<void> {
    const topic = runTopic(input.workspaceId, input.runId);
    const subscribers = this.subscriptions.get(topic) ?? new Set<string>();
    subscribers.add(input.connectionId);
    this.subscriptions.set(topic, subscribers);
  }

  async unsubscribeRun(input: UnsubscribeRunInput): Promise<void> {
    this.subscriptions.get(runTopic(input.workspaceId, input.runId))?.delete(input.connectionId);
  }

  async listConnectionsForRun(workspaceId: string, runId: string): Promise<RealtimeConnection[]> {
    const ids = this.subscriptions.get(runTopic(workspaceId, runId)) ?? new Set<string>();
    return [...ids].flatMap((id) => {
      const connection = this.connections.get(id);
      return connection ? [connection] : [];
    });
  }
}

function connectionItem(connection: RealtimeConnection): Record<string, unknown> {
  return {
    pk: connectionPk(connection.connectionId),
    sk: META_SK,
    kind: "CONNECTION",
    ...connection
  };
}

function connectionFromItem(item: Record<string, unknown>): RealtimeConnection {
  return {
    connectionId: String(item.connectionId),
    userId: String(item.userId),
    email: typeof item.email === "string" ? item.email : undefined,
    domainName: String(item.domainName),
    stage: String(item.stage),
    connectedAt: String(item.connectedAt)
  };
}

function connectionPk(connectionId: string): string {
  return `${CONNECTION_PREFIX}${connectionId}`;
}

function topicPk(topic: string): string {
  return `${TOPIC_PREFIX}${topic}`;
}
