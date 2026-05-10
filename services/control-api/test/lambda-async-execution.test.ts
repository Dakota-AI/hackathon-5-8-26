import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { LambdaAsyncExecutionStarter } from "../src/lambda-async-execution.js";

class FakeLambdaClient {
  public commands: InvokeCommand[] = [];

  async send(command: InvokeCommand): Promise<{}> {
    this.commands.push(command);
    return {};
  }
}

describe("LambdaAsyncExecutionStarter", () => {
  it("asynchronously invokes the background dispatch lambda and returns a stable dispatch reference", async () => {
    const client = new FakeLambdaClient();
    const starter = new LambdaAsyncExecutionStarter(client, "dispatch-run-function");

    const result = await starter.startExecution({
      runId: "run-123",
      taskId: "task-123",
      workspaceId: "workspace-abc",
      workItemId: "work-123",
      userId: "user-123",
      objective: "Build the hackathon demo"
    });

    assert.equal(result.executionArn, "async-lambda:dispatch-run-function:run-123");
    assert.equal(client.commands.length, 1);
    const input = client.commands[0]!.input;
    assert.equal(input.FunctionName, "dispatch-run-function");
    assert.equal(input.InvocationType, "Event");
    assert.deepEqual(JSON.parse(Buffer.from(input.Payload as Uint8Array).toString("utf8")), {
      runId: "run-123",
      taskId: "task-123",
      workspaceId: "workspace-abc",
      workItemId: "work-123",
      userId: "user-123",
      objective: "Build the hackathon demo"
    });
  });
});
