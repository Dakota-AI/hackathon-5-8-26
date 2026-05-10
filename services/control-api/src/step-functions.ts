import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { ExecutionStarter } from "./ports.js";

export class StepFunctionsExecutionStarter implements ExecutionStarter {
  public constructor(
    private readonly client: SFNClient,
    private readonly stateMachineArn: string
  ) {}

  public static fromEnvironment(): StepFunctionsExecutionStarter {
    const stateMachineArn = process.env.STATE_MACHINE_ARN;
    if (!stateMachineArn) {
      throw new Error("Missing required environment variable STATE_MACHINE_ARN");
    }
    return new StepFunctionsExecutionStarter(new SFNClient({}), stateMachineArn);
  }

  async startExecution(input: {
    readonly runId: string;
    readonly taskId: string;
    readonly workspaceId: string;
    readonly workItemId?: string;
    readonly userId: string;
    readonly objective: string;
  }): Promise<{ executionArn: string }> {
    const result = await this.client.send(
      new StartExecutionCommand({
        stateMachineArn: this.stateMachineArn,
        name: input.runId,
        input: JSON.stringify({ ...input, workItemId: input.workItemId ?? "" })
      })
    );

    if (!result.executionArn) {
      throw new Error("Step Functions did not return an executionArn.");
    }

    return { executionArn: result.executionArn };
  }
}
