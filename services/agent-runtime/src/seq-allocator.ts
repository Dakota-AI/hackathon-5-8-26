import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { SeqAllocator } from "./ports.js";

export class InMemorySeqAllocator implements SeqAllocator {
  private counter: number;

  public constructor(startFrom: number) {
    this.counter = startFrom;
  }

  public next(): number {
    this.counter += 1;
    return this.counter;
  }

  public peek(): number {
    return this.counter;
  }
}

export interface LoadSeqAllocatorOptions {
  readonly client: DynamoDBDocumentClient;
  readonly eventsTableName: string;
  readonly runId: string;
}

export async function loadSeqAllocator(options: LoadSeqAllocatorOptions): Promise<InMemorySeqAllocator> {
  const result = await options.client.send(new QueryCommand({
    TableName: options.eventsTableName,
    KeyConditionExpression: "runId = :runId",
    ExpressionAttributeValues: { ":runId": options.runId },
    ScanIndexForward: false,
    Limit: 1
  }));
  const top = result.Items?.[0];
  const maxSeq = top && typeof top.seq === "number" ? top.seq : 0;
  return new InMemorySeqAllocator(maxSeq);
}

export async function loadSeqAllocatorFromEnvironment(runId: string): Promise<InMemorySeqAllocator> {
  return loadSeqAllocator({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    eventsTableName: mustEnv("EVENTS_TABLE_NAME"),
    runId
  });
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
