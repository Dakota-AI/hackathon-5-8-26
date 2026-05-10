import { ApiGatewayManagementApiClient, DeleteConnectionCommand, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { DynamoRealtimeStore } from "./subscriptions.js";
import type { RealtimeEventRecord, RealtimePublisher, RealtimeSubscriptionStore } from "./ports.js";

export async function eventStreamRelayHandler(event: DynamoDBStreamEvent): Promise<void> {
  const store = DynamoRealtimeStore.fromEnvironment();
  const publisher = new ApiGatewayRealtimePublisher(mustEnv("WEBSOCKET_CALLBACK_URL"));

  for (const record of event.Records) {
    const realtimeEvent = eventFromStreamRecord(record);
    if (realtimeEvent) {
      await publishRealtimeEvent(realtimeEvent, store, publisher);
    }
  }
}

export async function publishRealtimeEvent(
  event: RealtimeEventRecord,
  store: RealtimeSubscriptionStore,
  publisher: RealtimePublisher
): Promise<void> {
  const connections = (await store.listConnectionsForRun(event.workspaceId, event.runId))
    .filter((connection) => !event.userId || connection.userId === event.userId);
  const message = eventMessage(event);
  await Promise.all(
    connections.map(async (connection) => {
      try {
        await publisher.postToConnection(connection.connectionId, message);
      } catch (error) {
        if (isStaleConnectionError(error)) {
          await store.deleteConnection(connection.connectionId);
          return;
        }
        throw error;
      }
    })
  );
}

export function eventFromStreamRecord(record: DynamoDBRecord): RealtimeEventRecord | undefined {
  if (record.eventName !== "INSERT" && record.eventName !== "MODIFY") {
    return undefined;
  }
  if (!record.dynamodb?.NewImage) {
    return undefined;
  }
  const item = unmarshall(record.dynamodb.NewImage as Parameters<typeof unmarshall>[0]);
  if (!isRealtimeEventRecord(item)) {
    return undefined;
  }
  return {
    eventId: typeof item.id === "string" ? item.id : typeof item.eventId === "string" ? item.eventId : undefined,
    userId: typeof item.userId === "string" ? item.userId : undefined,
    runId: String(item.runId),
    workspaceId: String(item.workspaceId),
    seq: Number(item.seq),
    type: String(item.type),
    createdAt: String(item.createdAt),
    payload: item.payload
  };
}

export class ApiGatewayRealtimePublisher implements RealtimePublisher {
  private readonly client: ApiGatewayManagementApiClient;

  public constructor(endpoint: string) {
    this.client = new ApiGatewayManagementApiClient({ endpoint });
  }

  async postToConnection(connectionId: string, payload: unknown): Promise<void> {
    const data = Buffer.from(JSON.stringify(payload));
    try {
      await this.client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }));
    } catch (error) {
      throw error;
    }
  }

  async deleteConnection(connectionId: string): Promise<void> {
    await this.client.send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
  }
}

function eventMessage(event: RealtimeEventRecord): RealtimeEventRecord & { eventId: string } {
  return {
    eventId: event.eventId ?? `${event.runId}:${event.seq}`,
    userId: event.userId,
    runId: event.runId,
    workspaceId: event.workspaceId,
    seq: event.seq,
    type: event.type,
    createdAt: event.createdAt,
    payload: event.payload
  };
}

function isRealtimeEventRecord(value: Record<string, unknown>): boolean {
  return (
    typeof value.runId === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.seq === "number" &&
    typeof value.type === "string" &&
    typeof value.createdAt === "string" &&
    "payload" in value
  );
}

function isStaleConnectionError(error: unknown): boolean {
  const maybe = error as { readonly name?: string; readonly message?: string; readonly $metadata?: { readonly httpStatusCode?: number } };
  return (
    maybe.name === "GoneException" ||
    maybe.$metadata?.httpStatusCode === 410 ||
    (maybe.name === "BadRequestException" && maybe.$metadata?.httpStatusCode === 400 && maybe.message?.includes("Invalid connectionId") === true)
  );
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
