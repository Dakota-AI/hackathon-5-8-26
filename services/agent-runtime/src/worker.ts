import { buildArtifactCreatedEvent, buildRunStatusEvent } from "@agents-cloud/protocol";
import type { RunStatus } from "@agents-cloud/protocol";
import type { ArtifactSink, EventSink, HermesRunner, RuntimeContext, RuntimeEvent } from "./ports.js";

export interface ExecuteRunDeps {
  readonly context: RuntimeContext;
  readonly events: EventSink;
  readonly artifacts: ArtifactSink;
  readonly hermes: HermesRunner;
}

export interface ExecuteRunResult {
  readonly status: "succeeded" | "failed";
  readonly artifactId?: string;
}

export async function executeRun(deps: ExecuteRunDeps): Promise<ExecuteRunResult> {
  const { context, events, artifacts, hermes } = deps;

  await events.updateRunStatus("running");
  await events.updateTaskStatus("running");
  await events.putEvent(statusEvent(context, 2, "running", "Hermes worker started."));

  try {
    const hermesResult = await hermes.run(buildHermesPrompt(context));
    const artifactId = artifactIdForAttempt(context);
    const createdAt = context.now();
    const key = `workspaces/${context.workspaceId}/runs/${context.runId}/artifacts/${artifactId}/hermes-report.md`;
    const contentType = "text/markdown; charset=utf-8";
    const body = renderHermesReport(context, hermesResult);
    const artifactPointer = await artifacts.putArtifact({ key, body, contentType });

    await artifacts.putArtifactRecord({
      runId: context.runId,
      artifactId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      taskId: context.taskId,
      kind: "report",
      name: "Hermes worker report",
      bucket: artifactPointer.bucket,
      key: artifactPointer.key,
      uri: artifactPointer.uri,
      contentType,
      createdAt
    });

    await events.putEvent(buildArtifactCreatedEvent({
      id: eventId(context.runId, 3),
      seq: 3,
      createdAt,
      userId: context.userId,
      workspaceId: context.workspaceId,
      runId: context.runId,
      taskId: context.taskId,
      source: { kind: "worker", name: "agent-runtime.hermes" },
      artifactId,
      kind: "report",
      name: "Hermes worker report",
      uri: artifactPointer.uri,
      contentType,
      metadata: {
        runnerMode: hermesResult.mode
      }
    }));
    await events.updateRunStatus("succeeded");
    await events.updateTaskStatus("succeeded");
    await events.putEvent(statusEvent(context, 4, "succeeded", hermesResult.summary));

    return { status: "succeeded", artifactId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await events.updateRunStatus("failed");
    await events.updateTaskStatus("failed");
    await events.putEvent(statusEvent(context, 3, "failed", `Hermes worker failed: ${message}`, {
      code: "HERMES_WORKER_FAILED",
      message,
      retryable: true
    }));
    return { status: "failed" };
  }
}

function statusEvent(
  context: RuntimeContext,
  seq: number,
  status: "running" | "succeeded" | "failed",
  message: string,
  error?: { readonly code: string; readonly message: string; readonly retryable?: boolean }
): RuntimeEvent {
  return buildRunStatusEvent({
    id: eventId(context.runId, seq),
    seq,
    createdAt: context.now(),
    userId: context.userId,
    workspaceId: context.workspaceId,
    runId: context.runId,
    taskId: context.taskId,
    source: { kind: "worker", name: "agent-runtime.hermes" },
    status,
    message,
    error
  });
}

function eventId(runId: string, seq: number): string {
  return `evt-${runId}-${String(seq).padStart(6, "0")}`;
}

function artifactIdForAttempt(context: RuntimeContext): string {
  const safeTaskId = context.taskId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `artifact-${safeTaskId}-0001`;
}

function buildHermesPrompt(context: RuntimeContext): string {
  return [
    "You are an Agents Cloud Hermes worker running inside ECS.",
    "Produce a concise execution report for this first durable worker run.",
    "Do not perform external side effects unless explicitly asked by the run objective.",
    `Run ID: ${context.runId}`,
    `Task ID: ${context.taskId}`,
    `Workspace ID: ${context.workspaceId}`,
    `User ID: ${context.userId}`,
    `Objective: ${context.objective}`,
    "Return: summary, work performed, artifacts produced, and next recommended step."
  ].join("\n");
}

function renderHermesReport(
  context: RuntimeContext,
  hermesResult: { readonly summary: string; readonly rawOutput: string; readonly mode: string }
): string {
  return [
    "# Hermes Worker Report",
    "",
    `- Run: ${context.runId}`,
    `- Task: ${context.taskId}`,
    `- Workspace: ${context.workspaceId}`,
    `- User: ${context.userId}`,
    `- Runner mode: ${hermesResult.mode}`,
    `- Created at: ${context.now()}`,
    "",
    "## Objective",
    "",
    context.objective,
    "",
    "## Summary",
    "",
    hermesResult.summary,
    "",
    "## Raw Hermes Output",
    "",
    "```text",
    hermesResult.rawOutput.trim(),
    "```",
    ""
  ].join("\n");
}
