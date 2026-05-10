import { AwsArtifactSink } from "./aws-artifact-sink.js";
import { DynamoEventSink } from "./dynamo-event-sink.js";
import { CliHermesRunner } from "./hermes-runner.js";
import type { RuntimeContext } from "./ports.js";
import { executeRun } from "./worker.js";

async function main(): Promise<void> {
  const context = contextFromEnvironment();
  const result = await executeRun({
    context,
    events: DynamoEventSink.fromEnvironment(context),
    artifacts: AwsArtifactSink.fromEnvironment(),
    hermes: CliHermesRunner.fromEnvironment()
  });

  console.log(JSON.stringify({
    runId: context.runId,
    taskId: context.taskId,
    workspaceId: context.workspaceId,
    status: result.status,
    artifactId: result.artifactId
  }));

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

function contextFromEnvironment(): RuntimeContext {
  return {
    runId: mustEnv("RUN_ID"),
    taskId: mustEnv("TASK_ID"),
    workspaceId: mustEnv("WORKSPACE_ID"),
    userId: mustEnv("USER_ID"),
    objective: mustEnv("OBJECTIVE"),
    now: () => new Date().toISOString()
  };
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

await main();
