import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { ExecutionStarter } from "./ports.js";

export interface AsyncRunDispatchPayload {
  readonly runId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly workItemId?: string;
  readonly userId: string;
  readonly objective: string;
}

export class LambdaAsyncExecutionStarter implements ExecutionStarter {
  public constructor(
    private readonly client: Pick<LambdaClient, "send">,
    private readonly functionName: string
  ) {}

  public static isConfigured(): boolean {
    return Boolean(process.env.DISPATCH_RUN_FUNCTION_NAME);
  }

  public static fromEnvironment(): LambdaAsyncExecutionStarter {
    const functionName = process.env.DISPATCH_RUN_FUNCTION_NAME;
    if (!functionName) {
      throw new Error("Missing required env var: DISPATCH_RUN_FUNCTION_NAME");
    }
    return new LambdaAsyncExecutionStarter(new LambdaClient({}), functionName);
  }

  public async startExecution(input: AsyncRunDispatchPayload): Promise<{ executionArn: string }> {
    await this.client.send(new InvokeCommand({
      FunctionName: this.functionName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(input))
    }));
    return { executionArn: `async-lambda:${this.functionName}:${input.runId}` };
  }
}
