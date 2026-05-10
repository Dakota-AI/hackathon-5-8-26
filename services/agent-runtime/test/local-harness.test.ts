import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { inspectLocalHarness, runLocalHarnessScenario } from "../src/local-harness.js";

const execFileAsync = promisify(execFile);
const fixedNow = (): string => "2026-05-10T12:00:00.000Z";

describe("local resident harness", () => {
  it("runs an approved user-style preview workflow with approval, artifact, transcript, and state outputs", async () => {
    const rootDir = await tempRoot();

    const result = await runLocalHarnessScenario({
      rootDir,
      runId: "run-local-approved",
      taskId: "task-local-approved",
      workspaceId: "workspace-test",
      userId: "user-test",
      orgId: "org-test",
      objective: "Create a stock dashboard preview site",
      agentRole: "Coder Agent",
      userAnswer: "Keep it concise and publish only after approval.",
      previewDecision: "approved",
      now: fixedNow
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.artifacts.length, 2);
    assert.equal(result.approvals[0]?.decision, "approved");

    const { state, events } = await inspectLocalHarness(rootDir);
    assert.equal(state.runner.mode, "resident-dev");
    assert.equal(state.runner.status, "completed");
    assert.equal(state.policy.autonomy, "mostly_autonomous");
    assert.equal(state.policy.durableEventMode, "critical_only");
    assert.equal(state.agents.length, 2);
    assert.equal(state.waitStates.length, 0);
    assert.equal(state.artifacts.some((artifact) => artifact.kind === "website"), true);
    assert.equal(state.toolMetrics.totalCalls, 6);
    assert.equal(state.toolMetrics.byToolId["workspace.plan_task"], 1);
    assert.equal(state.toolMetrics.byToolId["research.summarize_context"], 1);
    assert.equal(state.toolMetrics.approvalGatedCalls, 1);
    assert.equal(state.toolMetrics.durableToolEvents, 1);
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(events.map((event) => event.type), [
      "run.status",
      "run.status",
      "run.status",
      "tool.approval",
      "tool.approval",
      "run.status",
      "artifact.created",
      "artifact.created",
      "run.status",
      "run.status"
    ]);
    assert.equal(events[3]?.payload.kind, "request");
    assert.equal(events[4]?.payload.kind, "decision");
    assert.equal(events[4]?.payload.decision, "approved");
    assert.equal(events.some((event) => event.type === "tool.call"), false);
    assert.equal(events.some((event) => event.type === "tool.metrics"), false);

    const transcript = await readFile(result.transcriptPath, "utf8");
    assert.match(transcript, /User objective: Create a stock dashboard preview site/);
    assert.match(transcript, /Preview published at/);
  });

  it("persists an explicit wait state when preview approval is pending", async () => {
    const rootDir = await tempRoot();

    const result = await runLocalHarnessScenario({
      rootDir,
      runId: "run-local-pending",
      taskId: "task-local-pending",
      objective: "Create a dashboard but wait for approval",
      previewDecision: "pending",
      now: fixedNow
    });

    const { state, events } = await inspectLocalHarness(rootDir);
    assert.equal(result.status, "waiting_for_approval");
    assert.equal(state.runner.status, "waiting");
    assert.equal(state.waitStates.length, 1);
    assert.equal(state.artifacts.length, 0);
    assert.equal(state.toolMetrics.totalCalls, 4);
    assert.equal(state.toolMetrics.approvalGatedCalls, 1);
    assert.deepEqual(events.map((event) => event.type), ["run.status", "run.status", "run.status", "tool.approval"]);
    assert.equal(events.at(-1)?.payload.kind, "request");
  });

  it("honors a rejected approval by skipping preview publication and still producing a report", async () => {
    const rootDir = await tempRoot();

    const result = await runLocalHarnessScenario({
      rootDir,
      runId: "run-local-rejected",
      taskId: "task-local-rejected",
      objective: "Create a public website preview",
      previewDecision: "rejected",
      now: fixedNow
    });

    const { state, events } = await inspectLocalHarness(rootDir);
    assert.equal(result.status, "succeeded");
    assert.equal(state.artifacts.length, 1);
    assert.equal(state.artifacts[0]?.kind, "report");
    assert.equal(state.toolMetrics.totalCalls, 5);
    assert.equal(state.toolMetrics.byToolId["workspace.generate_static_site"], undefined);
    assert.equal(events.find((event) => event.type === "tool.approval" && event.payload.kind === "decision")?.payload.decision, "rejected");
    assert.equal(events.some((event) => event.type === "artifact.created" && event.payload.kind === "website"), false);
  });

  it("runs through the CLI and can inspect the generated local runner root", async () => {
    const rootDir = await tempRoot();
    const cli = fileURLToPath(new URL("../src/local-runner-cli.js", import.meta.url));

    const run = await execFileAsync(process.execPath, [
      cli,
      "run",
      "--root",
      rootDir,
      "--run-id",
      "run-cli",
      "--objective",
      "Create a competitor research mini site",
      "--approve-preview",
      "approved",
      "--print-inspection"
    ]);
    assert.match(run.stdout, /status=succeeded/);
    assert.match(run.stdout, /eventTypes=run.status,tool.approval,artifact.created/);
    assert.match(run.stdout, /toolCalls=6/);
    assert.match(run.stdout, /durableToolEvents=1/);

    const inspect = await execFileAsync(process.execPath, [cli, "inspect", "--root", rootDir]);
    assert.match(inspect.stdout, /runnerStatus=completed/);
    assert.match(inspect.stdout, /artifacts=2/);
  });

  it("supports scripted interactive CLI input for user-style testing", async () => {
    const rootDir = await tempRoot();
    const cli = fileURLToPath(new URL("../src/local-runner-cli.js", import.meta.url));

    const run = await execFileWithInput([
      cli,
      "run",
      "--interactive",
      "--root",
      rootDir,
      "--run-id",
      "run-cli-interactive",
      "--print-inspection"
    ], [
        "Create a founder KPI dashboard preview",
        "Operator Agent",
        "Keep it concise and ask before publishing.",
        "approved",
        ""
      ].join("\n"));

    assert.match(run.stdout, /status=succeeded/);
    assert.match(run.stdout, /runnerStatus=completed/);
    const { state } = await inspectLocalHarness(rootDir);
    assert.equal(state.run.objective, "Create a founder KPI dashboard preview");
    assert.equal(state.agents[1]?.role, "Operator Agent");
  });
});

async function tempRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "agents-cloud-local-harness-"));
}

function execFileWithInput(args: string[], stdin: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with ${code}: ${stderr}`));
      }
    });
    child.stdin.end(stdin);
  });
}
