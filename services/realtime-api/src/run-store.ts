import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

export interface RunReference {
  readonly runId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

export interface RunStore {
  getRunById(runId: string): Promise<RunReference | undefined>;
}

export interface InMemoryRunStoreInput {
  readonly runId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

export class DynamoRunStore implements RunStore {
  public constructor(private readonly client: DynamoDBDocumentClient, private readonly runsTableName: string) {}

  public static fromEnvironment(): DynamoRunStore {
    const runsTableName = process.env.RUNS_TABLE_NAME;
    if (!runsTableName) {
      throw new Error("Missing required environment variable RUNS_TABLE_NAME");
    }
    return new DynamoRunStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), runsTableName);
  }

  async getRunById(runId: string): Promise<RunReference | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.runsTableName,
        IndexName: "by-run-id",
        KeyConditionExpression: "runId = :runId",
        ExpressionAttributeValues: { ":runId": runId },
        Limit: 1
      })
    );
    const item = result.Items?.[0];
    if (!item || typeof item.runId !== "string" || typeof item.workspaceId !== "string" || typeof item.userId !== "string") {
      return undefined;
    }
    return {
      runId: item.runId,
      workspaceId: item.workspaceId,
      userId: item.userId
    };
  }
}

export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunReference>();

  public constructor(runs: ReadonlyArray<InMemoryRunStoreInput> = []) {
    for (const run of runs) {
      this.runs.set(run.runId, run);
    }
  }

  async getRunById(runId: string): Promise<RunReference | undefined> {
    return this.runs.get(runId);
  }
}
