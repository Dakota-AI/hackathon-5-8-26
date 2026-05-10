import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ResidentRunner, residentRunnerConfigFromPartial, type ResidentAgentProfile } from "../src/resident-runner.js";
import type { ArtifactSink, EventSink, RuntimeEvent } from "../src/ports.js";

const fixedNow = (): string => "2026-05-10T12:00:00.000Z";

describe("ResidentRunner", () => {
  it("runs multiple logical agents in one tenant-scoped resident runner", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = await writeFakeHermesCommand(rootDir);
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      hermesCommand,
      now: fixedNow
    }));

    await runner.initialize([
      agentProfile("agent-coder", "Coder Agent"),
      agentProfile("agent-researcher", "Research Agent")
    ]);

    const result = await runner.wake({
      objective: "Build a stock dashboard and produce market context.",
      runId: "run-resident",
      taskId: "task-resident",
      wakeReason: "assignment"
    });

    assert.equal(result.heartbeats.length, 2);
    assert.equal(result.artifacts.length, 2);
    assert.deepEqual(result.heartbeats.map((heartbeat) => heartbeat.agentId), ["agent-coder", "agent-researcher"]);

    const state = runner.getState();
    assert.equal(state.runner.status, "ready");
    assert.equal(state.metrics.totalHeartbeats, 2);
    assert.equal(state.metrics.totalArtifacts, 2);
    assert.equal(state.metrics.durableEvents, 8);
    assert.equal(state.agents.find((agent) => agent.agentId === "agent-coder")?.sessionId, "session-agent-coder");
    assert.equal(state.agents.find((agent) => agent.agentId === "agent-researcher")?.sessionId, "session-agent-researcher");

    const events = await runner.getEvents();
    assert.deepEqual(events.map((event) => event.seq), [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(events.map((event) => event.type), [
      "run.status",
      "run.status",
      "artifact.created",
      "assistant.response.final",
      "run.status",
      "artifact.created",
      "assistant.response.final",
      "run.status"
    ]);
    assert.equal(events.some((event) => event.type === "assistant.response.final" && String(event.payload.content).includes("session_id:")), false);
    assert.equal(events.some((event) => event.type === "tool.call"), false);

    const report = await readFile(result.artifacts[0]?.path ?? "", "utf8");
    assert.match(report, /Resident Runner Heartbeat/);
    assert.match(report, /Build a stock dashboard and produce market context/);
  });

  it("persists resident wake events and artifacts through durable sinks for the demo run ledger", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = await writeFakeHermesCommand(rootDir);
    const eventSink = new MemoryEventSink();
    const artifactSink = new MemoryArtifactSink();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      hermesCommand,
      now: fixedNow,
      eventSink,
      artifactSink
    }));

    await runner.initialize([agentProfile("agent-coder", "Coder Agent")]);
    const result = await runner.wake({
      objective: "Produce a durable report.",
      runId: "run-durable",
      taskId: "task-durable",
      workItemId: "workitem-durable"
    });

    assert.deepEqual(eventSink.events.map((event) => [event.seq, event.type]), [
      [2, "run.status"],
      [3, "run.status"],
      [4, "artifact.created"],
      [5, "assistant.response.final"],
      [6, "run.status"]
    ]);
    assert.equal(eventSink.events.find((event) => event.type === "assistant.response.final")?.payload.workItemId, "workitem-durable");
    assert.deepEqual(eventSink.runStatuses, ["planning", "running", "succeeded"]);
    assert.deepEqual(eventSink.taskStatuses, ["planning", "running", "succeeded"]);
    assert.equal(result.artifacts[0].uri, "s3://demo-bucket/workspaces/workspace-test/runs/run-durable/artifacts/artifact-task-durable-agent-coder-heartbeat/heartbeat-report.md");
    assert.equal(artifactSink.objects.length, 1);
    assert.equal(artifactSink.records[0]?.workItemId, "workitem-durable");
    assert.equal(artifactSink.records[0]?.bucket, "demo-bucket");
    assert.equal(artifactSink.records[0]?.key, "workspaces/workspace-test/runs/run-durable/artifacts/artifact-task-durable-agent-coder-heartbeat/heartbeat-report.md");
  });

  it("persists only high-signal resident action events emitted by the agent", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = await writeFakeHermesCommandWithOutput(rootDir, [
      "Delegating the app polish slice.",
      "```agents-cloud-event",
      JSON.stringify({
        type: "agent.delegated",
        payload: {
          delegatedAgentId: "agent-ui-polish",
          delegatedAgentRole: "UI Polish Agent",
          workItemId: "workitem-ui-polish",
          objective: "Polish the review walkthrough controls"
        }
      }),
      "```",
      "```agents-cloud-event",
      JSON.stringify({
        type: "work_item.created",
        payload: {
          workItemId: "workitem-ui-polish",
          title: "UI polish",
          objective: "Polish the review walkthrough controls"
        }
      }),
      "```",
      "```agents-cloud-event",
      JSON.stringify({
        type: "client.control.requested",
        payload: {
          commandId: "cmd-open-browser",
          kind: "show_page",
          surface: "browser",
          message: "Opening the report preview."
        }
      }),
      "```",
      "```agents-cloud-event",
      JSON.stringify({
        type: "browser.control.requested",
        payload: {
          commandId: "cmd-browser-snapshot",
          kind: "snapshot",
          message: "Checking the report page."
        }
      }),
      "```",
      "```agents-cloud-event",
      JSON.stringify({
        type: "client.control.requested",
        payload: {
          commandId: "cmd-unsafe-client",
          kind: "eval_js",
          surface: "browser",
          message: "This should be ignored."
        }
      }),
      "```",
      "```agents-cloud-event",
      JSON.stringify({ type: "tool.call", payload: { toolName: "terminal", command: "pwd" } }),
      "```",
      "session_id: session-action-events"
    ].join("\n"));
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      hermesCommand,
      now: fixedNow
    }));

    await runner.initialize([agentProfile("agent-delegator", "Agent Delegator")]);
    const result = await runner.wake({
      objective: "Delegate UI polish.",
      runId: "run-action-events",
      taskId: "task-action-events",
      workItemId: "workitem-root"
    });

    assert.equal(result.events.some((event) => event.type === "tool.call"), false);
    const delegated = result.events.find((event) => event.type === "agent.delegated");
    assert.ok(delegated);
    assert.equal(delegated.taskId, "task-action-events");
    assert.equal(delegated.payload.agentId, "agent-delegator");
    assert.equal(delegated.payload.delegatedAgentId, "agent-ui-polish");
    assert.equal(delegated.payload.workItemId, "workitem-ui-polish");
    const workItem = result.events.find((event) => event.type === "work.item.created");
    assert.ok(workItem);
    assert.equal(workItem.payload.legacyEventType, "work_item.created");
    assert.equal(workItem.payload.workItemId, "workitem-ui-polish");
    const clientControl = result.events.find((event) => event.type === "client.control.requested");
    const browserControl = result.events.find((event) => event.type === "browser.control.requested");
    assert.ok(clientControl);
    assert.ok(browserControl);
    assert.equal(clientControl.payload.surface, "browser");
    assert.equal(browserControl.payload.kind, "snapshot");
    assert.equal(result.events.some((event) => event.payload.commandId === "cmd-unsafe-client"), false);
  });

  it("persists preview artifact events emitted by the dynamic preview tool", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = await writeFakeHermesCommandWithOutput(rootDir, [
      "Preview tool output:",
      "```agents-cloud-event",
      JSON.stringify({
        type: "artifact.created",
        payload: {
          artifactId: "preview-task-preview",
          kind: "website",
          name: "dashboard live preview",
          uri: "https://preview-dashboard.solo-ceo.ai/",
          contentType: "text/html; charset=utf-8",
          previewUrl: "https://preview-dashboard.solo-ceo.ai/",
          metadata: {
            tunnelId: "tunnel-dashboard",
            mode: "dynamic-port-tunnel",
            toolId: "preview.expose_dynamic_site"
          }
        }
      }),
      "```",
      "session_id: session-preview-artifact"
    ].join("\n"));
    const artifactSink = new MemoryArtifactSink();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      hermesCommand,
      now: fixedNow,
      artifactSink
    }));

    await runner.initialize([agentProfile("agent-builder", "Builder Agent")]);
    const result = await runner.wake({
      objective: "Build and publish a dashboard preview.",
      runId: "run-preview-artifact",
      taskId: "task-preview-artifact",
      workItemId: "workitem-preview"
    });

    const previewEvent = result.events.find((event) => event.type === "artifact.created" && event.payload.artifactId === "preview-task-preview");
    assert.ok(previewEvent);
    assert.equal(previewEvent.payload.kind, "website");
    assert.equal(previewEvent.payload.previewUrl, "https://preview-dashboard.solo-ceo.ai/");
    assert.equal(artifactSink.records.some((record) => record.artifactId === "preview-task-preview" && record.previewUrl === "https://preview-dashboard.solo-ceo.ai/"), true);
  });

  it("records agent-requested user notification and call events durably", async () => {
    const rootDir = await tempRoot();
    const eventSink = new MemoryEventSink();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      now: fixedNow,
      eventSink
    }));

    await runner.initialize([agentProfile("agent-delegator", "Agent Delegator")]);

    const notification = await runner.recordUserEngagement({
      kind: "notify",
      runId: "run-engagement",
      taskId: "task-engagement",
      agentId: "agent-delegator",
      title: "Status",
      body: "I need a quick decision.",
      urgency: "high"
    });
    const call = await runner.recordUserEngagement({
      kind: "call",
      runId: "run-engagement",
      taskId: "task-engagement",
      agentId: "agent-delegator",
      summary: "Discuss the blocked deployment."
    });

    assert.equal(notification.type, "user.notification.requested");
    assert.equal(call.type, "user.call.requested");
    assert.deepEqual(eventSink.events.map((event) => event.type), [
      "user.notification.requested",
      "user.call.requested"
    ]);
    assert.equal(eventSink.events[0]?.payload.body, "I need a quick decision.");
    assert.equal(eventSink.events[1]?.payload.summary, "Discuss the blocked deployment.");
    assert.equal(eventSink.events[1]?.payload.targetUserId, "user-test");

    await assert.rejects(
      () => runner.recordUserEngagement({
        kind: "notify",
        runId: undefined as unknown as string,
        body: "Missing run id should fail."
      }),
      /runId is required/
    );
  });

  it("uses the demo timeout fallback to finish the run ledger when Hermes hangs", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = await writeHangingHermesCommand(rootDir);
    const env = snapshotEnv(["AGENTS_RESIDENT_TIMEOUT_FALLBACK", "AGENTS_RESIDENT_AGENT_TIMEOUT_MS"]);
    try {
      process.env.AGENTS_RESIDENT_TIMEOUT_FALLBACK = "1";
      process.env.AGENTS_RESIDENT_AGENT_TIMEOUT_MS = "20";
      const eventSink = new MemoryEventSink();
      const runner = new ResidentRunner(residentRunnerConfigFromPartial({
        rootDir,
        orgId: "org-test",
        userId: "user-test",
        workspaceId: "workspace-test",
        runnerId: "runner-test",
        runnerSessionId: "runner-session-test",
        adapterKind: "hermes-cli",
        hermesCommand,
        now: fixedNow,
        eventSink
      }));

      await runner.initialize([agentProfile("agent-timeout", "Timeout Agent")]);
      const result = await runner.wake({ objective: "Do not hang the demo.", runId: "run-timeout", taskId: "task-timeout" });

      assert.equal(result.heartbeats[0]?.status, "succeeded");
      assert.match(result.heartbeats[0]?.summary ?? "", /demo heartbeat timeout/);
      assert.equal(result.events.at(-1)?.payload.status, "succeeded");
      assert.deepEqual(eventSink.runStatuses.at(-1), "succeeded");
    } finally {
      restoreEnv(env);
    }
  });

  it("rejects logical agents outside the runner tenant boundary", async () => {
    const rootDir = await tempRoot();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      now: fixedNow
    }));

    await runner.initialize();

    await assert.rejects(
      () => runner.registerAgent(agentProfile("agent-wrong-tenant", "Research Agent", { orgId: "org-other" })),
      /orgId does not match/
    );
  });

  it("rejects unsafe agent identifiers and paths before writing runner files", async () => {
    const rootDir = await tempRoot();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      now: fixedNow
    }));

    await runner.initialize();

    await assert.rejects(
      () => runner.registerAgent(agentProfile("../escape", "Research Agent")),
      /agentId must be a safe identifier/
    );
    await assert.rejects(
      () => runner.registerAgent({ ...agentProfile("agent-safe", "Research Agent"), cwd: "/tmp/outside-runner" }),
      /cwd must stay within/
    );
  });

  it("rejects unsafe wake identifiers before writing artifacts or logs", async () => {
    const rootDir = await tempRoot();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      now: fixedNow
    }));

    await runner.initialize([agentProfile("agent-safe", "Research Agent")]);

    await assert.rejects(
      runner.wake({ objective: "bad run", runId: "../escape", taskId: "task-safe" }),
      /runId must be a safe identifier/
    );
    await assert.rejects(
      runner.wake({ objective: "bad task", runId: "run-safe", taskId: "../escape" }),
      /taskId must be a safe identifier/
    );
  });

  it("marks the wake failed when a selected agent heartbeat fails", async () => {
    const rootDir = await tempRoot();
    const runner = new ResidentRunner(residentRunnerConfigFromPartial({
      rootDir,
      orgId: "org-test",
      userId: "user-test",
      workspaceId: "workspace-test",
      runnerId: "runner-test",
      runnerSessionId: "runner-session-test",
      adapterKind: "hermes-cli",
      hermesCommand: "definitely-missing-hermes-command",
      now: fixedNow
    }));

    await runner.initialize([agentProfile("agent-coder", "Coder Agent")]);
    const result = await runner.wake({ objective: "fail safely", runId: "run-fail", taskId: "task-fail" });

    assert.equal(result.heartbeats[0].status, "failed");
    assert.equal(result.events.at(-1)?.type, "run.status");
    assert.equal(result.events.at(-1)?.payload.status, "failed");
  });

  it("does not expose ECS/task credentials to Hermes adapter child processes by default", async () => {
    const rootDir = await tempRoot();
    const hermesCommand = join(rootDir, "fake-hermes.mjs");
    await writeFile(hermesCommand, [
      "#!/usr/bin/env node",
      "console.log(JSON.stringify({",
      "  aws: process.env.AWS_SECRET_ACCESS_KEY ?? null,",
      "  runnerToken: process.env.RUNNER_API_TOKEN ?? null,",
      "  engagementToken: process.env.AGENTS_USER_ENGAGEMENT_TOKEN ? 'present' : null,",
      "  engagementUrl: process.env.AGENTS_USER_ENGAGEMENT_URL ?? null,",
      "  previewTool: process.env.AGENTS_CLOUD_PREVIEW_TOOL ?? null,",
      "  previewApiUrl: process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL ?? null,",
      "  previewToken: process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN ? 'present' : null,",
      "  runId: process.env.RUN_ID ?? null,",
      "  providerKey: process.env.OPENROUTER_API_KEY ?? null,",
      "  hermesHome: process.env.HERMES_HOME ?? null",
      "}));",
      "console.log('session_id: session-sandboxed-env');",
      ""
    ].join("\n"));
    await chmod(hermesCommand, 0o755);

    const previousEnv = snapshotEnv([
      "AWS_SECRET_ACCESS_KEY",
      "RUNNER_API_TOKEN",
      "OPENROUTER_API_KEY",
      "HERMES_HOME",
      "AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT",
      "AGENTS_USER_ENGAGEMENT_TOKEN",
      "AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL",
      "AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN"
    ]);
    process.env.AWS_SECRET_ACCESS_KEY = "aws-secret-should-not-leak";
    process.env.RUNNER_API_TOKEN = "runner-token-should-not-leak";
    process.env.AGENTS_USER_ENGAGEMENT_TOKEN = ["engagement", "token", "allowed"].join("-");
    process.env.OPENROUTER_API_KEY = "provider-key-should-not-leak";
    process.env.HERMES_HOME = join(rootDir, "hermes");
    process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL = "https://preview-api.solo-ceo.ai";
    process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN = "preview-token-should-not-be-printed";
    delete process.env.AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT;

    try {
      const runner = new ResidentRunner(residentRunnerConfigFromPartial({
        rootDir,
        orgId: "org-test",
        userId: "user-test",
        workspaceId: "workspace-test",
        runnerId: "runner-test",
        runnerSessionId: "runner-session-test",
        adapterKind: "hermes-cli",
        hermesCommand,
        now: fixedNow
      }));
      await runner.initialize([agentProfile("agent-secure", "Secure Agent")]);

      const result = await runner.wake({
        objective: "Check adapter environment boundaries.",
        agentId: "agent-secure",
        runId: "run-secure",
        taskId: "task-secure"
      });

      const report = await readFile(result.artifacts[0]?.path ?? "", "utf8");
      assert.match(report, /"aws":null/);
      assert.match(report, /"runnerToken":null/);
      assert.match(report, /"engagementToken":"present"/);
      assert.doesNotMatch(report, /engagement-token-allowed/);
      assert.match(report, /"engagementUrl":"http:\/\/127\.0\.0\.1:8787\/engagement"/);
      assert.match(report, /"previewTool":"agents-cloud-preview"/);
      assert.match(report, /"previewApiUrl":"https:\/\/preview-api\.solo-ceo\.ai"/);
      assert.match(report, /"previewToken":"present"/);
      assert.match(report, /"runId":"run-secure"/);
      assert.match(report, /"providerKey":null/);
      assert.match(report, /session_id: session-sandboxed-env/);
      assert.doesNotMatch(report, /aws-secret-should-not-leak/);
      assert.doesNotMatch(report, /runner-token-should-not-leak/);
      assert.doesNotMatch(report, /provider-key-should-not-leak/);
      assert.doesNotMatch(report, /preview-token-should-not-be-printed/);
    } finally {
      restoreEnv(previousEnv);
    }
  });
});

describe("resident runner HTTP API", () => {
  it("supports authenticated register, wake, event query, and shutdown flow", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const server = fileURLToPath(new URL("../src/resident-runner-server.js", import.meta.url));
    const hermesCommand = await writeFakeHermesCommand(rootDir);
    const child = spawn(process.execPath, [server], {
      env: {
        ...process.env,
        AGENTS_RUNNER_ROOT: rootDir,
        AGENTS_RESIDENT_ADAPTER: "hermes-cli",
        HERMES_COMMAND: hermesCommand,
        HERMES_HOME: join(rootDir, "hermes"),
        AGENT_ID: "agent-default",
        AGENT_ROLE: "Default Agent",
        ORG_ID: "org-http",
        USER_ID: "user-http",
        WORKSPACE_ID: "workspace-http",
        RUNNER_ID: "runner-http",
        RUNNER_SESSION_ID: "runner-session-http",
        RUNNER_API_TOKEN: "test-token",
        PORT: String(port)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
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

    try {
      await waitForHealth(port);

      const unauthorized = await fetchJson(port, "/health", { token: "wrong-token" });
      assert.equal(unauthorized.status, 401);

      const registered = await fetchJson(port, "/agents", {
        method: "POST",
        token: "test-token",
        body: agentProfile("agent-operator", "Operator Agent", {
          orgId: "org-http",
          userId: "user-http",
          workspaceId: "workspace-http"
        })
      });
      assert.equal(registered.status, 201);
      assert.equal(registered.body.agent.agentId, "agent-operator");

      const wake = await fetchJson(port, "/wake", {
        method: "POST",
        token: "test-token",
        body: {
          objective: "Create an operator dashboard artifact.",
          agentId: "agent-operator",
          runId: "run-http",
          taskId: "task-http",
          wakeReason: "on_demand"
        }
      });
      assert.equal(wake.status, 202);
      assert.equal(wake.body.status, "wake_accepted");

      const events = await waitForEvents(port, "test-token", 5);
      assert.equal(events.status, 200);
      assert.deepEqual(events.body.events.map((event: { type: string }) => event.type), [
        "run.status",
        "run.status",
        "artifact.created",
        "assistant.response.final",
        "run.status"
      ]);

      const state = await fetchJson(port, "/state", { token: "test-token" });
      assert.equal(state.body.metrics.totalHeartbeats, 1);
      assert.equal(state.body.agents.length, 2);

      const shutdown = await fetchJson(port, "/shutdown", { method: "POST", token: "test-token" });
      assert.equal(shutdown.status, 202);
      await waitForExit(child);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }

    assert.match(stdout, /resident-runner-listening/);
    assert.equal(stderr, "");
  });

  it("returns 400 for malformed JSON instead of crashing the runner server", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const child = spawnResidentServer(rootDir, port, { RUNNER_API_TOKEN: "test-token" });
    try {
      await waitForHealth(port);
      const response = await fetch(`http://127.0.0.1:${port}/agents`, {
        method: "POST",
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
        body: "{not-json"
      });
      assert.equal(response.status, 400);
      const body = await response.json() as { error: string };
      assert.equal(body.error, "BadRequest");
      const shutdown = await fetchJson(port, "/shutdown", { method: "POST", token: "test-token" });
      assert.equal(shutdown.status, 202);
      await waitForExit(child);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }
  });

  it("accepts local engagement tool calls from the Hermes subprocess boundary", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const child = spawnResidentServer(rootDir, port, { RUNNER_API_TOKEN: "test-token", AGENTS_USER_ENGAGEMENT_TOKEN: "engagement-token" });
    try {
      await waitForHealth(port);
      const rejectedAdminToken = await fetchJson(port, "/engagement/call", {
        method: "POST",
        token: "test-token",
        body: {
          runId: "run-http-engagement",
          taskId: "task-http-engagement",
          summary: "Call the user about the stalled agent run."
        }
      });
      assert.equal(rejectedAdminToken.status, 401);

      const accepted = await fetchJson(port, "/engagement/call", {
        method: "POST",
        token: "engagement-token",
        body: {
          runId: "run-http-engagement",
          taskId: "task-http-engagement",
          summary: "Call the user about the stalled agent run."
        }
      });
      assert.equal(accepted.status, 202);
      assert.equal(accepted.body.type, "user.call.requested");

      const events = await fetchJson(port, "/events", { token: "test-token" });
      assert.equal(events.status, 200);
      assert.equal(events.body.events[0].type, "user.call.requested");
      assert.equal(events.body.events[0].payload.summary, "Call the user about the stalled agent run.");

      const shutdown = await fetchJson(port, "/shutdown", { method: "POST", token: "test-token" });
      assert.equal(shutdown.status, 202);
      await waitForExit(child);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }
  });

  it("fails closed when ecs-resident mode starts without a runner API token", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const child = spawnResidentServer(rootDir, port, { AGENTS_RUNTIME_MODE: "ecs-resident", RUNNER_API_TOKEN: undefined });
    const { code, stderr } = await waitForExitWithOutput(child);
    assert.notEqual(code, 0);
    assert.match(stderr, /RUNNER_API_TOKEN is required/);
  });

  it("rejects the retired resident smoke adapter configuration", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const child = spawnResidentServer(rootDir, port, { AGENTS_RESIDENT_ADAPTER: "smoke", RUNNER_API_TOKEN: "test-token" });
    const { code, stderr } = await waitForExitWithOutput(child);
    assert.notEqual(code, 0);
    assert.match(stderr, /Unsupported resident adapter: smoke/);
  });

  it("stores uploaded Hermes auth JSON without exposing it in the response", async () => {
    const rootDir = await tempRoot();
    const port = await freePort();
    const child = spawnResidentServer(rootDir, port, { RUNNER_API_TOKEN: "test-token" });
    try {
      await waitForHealth(port);
      const auth = {
        version: 1,
        providers: { "openai-codex": { type: "openai-codex" } },
        active_provider: "openai-codex",
        credential_pool: {}
      };
      const uploaded = await fetchJson(port, "/credentials/hermes-auth", {
        method: "POST",
        token: "test-token",
        body: { authJson: auth }
      });
      assert.equal(uploaded.status, 200);
      assert.deepEqual(uploaded.body, { status: "stored" });

      const stored = await readFile(join(rootDir, "hermes", "auth.json"), "utf8");
      assert.deepEqual(JSON.parse(stored), auth);
      assert.doesNotMatch(JSON.stringify(uploaded.body), /openai-codex/);

      const shutdown = await fetchJson(port, "/shutdown", { method: "POST", token: "test-token" });
      assert.equal(shutdown.status, 202);
      await waitForExit(child);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }
  });
});

class MemoryEventSink implements EventSink {
  public readonly events: RuntimeEvent[] = [];
  public readonly runStatuses: string[] = [];
  public readonly taskStatuses: string[] = [];

  async putEvent(event: RuntimeEvent): Promise<void> {
    this.events.push(event);
  }

  async updateRunStatus(status: string): Promise<void> {
    this.runStatuses.push(status);
  }

  async updateTaskStatus(status: string): Promise<void> {
    this.taskStatuses.push(status);
  }
}

class MemoryArtifactSink implements ArtifactSink {
  public readonly objects: Array<{ key: string; body: string; contentType: string }> = [];
  public readonly records: Record<string, unknown>[] = [];

  async putArtifact(input: { readonly key: string; readonly body: string; readonly contentType: string }): Promise<{ bucket: string; key: string; uri: string }> {
    this.objects.push(input);
    return { bucket: "demo-bucket", key: input.key, uri: `s3://demo-bucket/${input.key}` };
  }

  async putArtifactRecord(record: Record<string, unknown>): Promise<void> {
    this.records.push(record);
  }
}

async function tempRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "agents-cloud-resident-runner-"));
}

function agentProfile(
  agentId: string,
  role: string,
  tenant: NonNullable<ResidentAgentProfile["tenant"]> = {
    orgId: "org-test",
    userId: "user-test",
    workspaceId: "workspace-test"
  }
): ResidentAgentProfile {
  return {
    agentId,
    profileId: `${agentId}-profile`,
    profileVersion: "v1",
    role,
    provider: "openrouter",
    model: "openrouter/test-model",
    toolsets: "file,terminal,web",
    tenant
  };
}

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function writeFakeHermesCommand(rootDir: string): Promise<string> {
  const hermesCommand = join(rootDir, `fake-hermes-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(hermesCommand, [
    "#!/usr/bin/env node",
    "const queryIndex = process.argv.indexOf('-q');",
    "const prompt = queryIndex >= 0 ? process.argv[queryIndex + 1] ?? '' : '';",
    "const agent = prompt.match(/- Agent: ([^\\n]+)/)?.[1]?.trim() ?? 'agent-unknown';",
    "console.log(`${agent} completed heartbeat.`);",
    "console.log(prompt);",
    "console.log(`session_id: session-${agent}`);",
    ""
  ].join("\n"));
  await chmod(hermesCommand, 0o755);
  return hermesCommand;
}

async function writeFakeHermesCommandWithOutput(rootDir: string, output: string): Promise<string> {
  const hermesCommand = join(rootDir, `fake-hermes-output-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(hermesCommand, [
    "#!/usr/bin/env node",
    `process.stdout.write(${JSON.stringify(`${output}\n`)});`,
    ""
  ].join("\n"));
  await chmod(hermesCommand, 0o755);
  return hermesCommand;
}

async function writeHangingHermesCommand(rootDir: string): Promise<string> {
  const hermesCommand = join(rootDir, `hanging-hermes-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(hermesCommand, [
    "#!/usr/bin/env node",
    "setTimeout(() => {}, 60_000);",
    ""
  ].join("\n"));
  await chmod(hermesCommand, 0o755);
  return hermesCommand;
}

function spawnResidentServer(rootDir: string, port: number, overrides: Record<string, string | undefined> = {}): ReturnType<typeof spawn> {
  const server = fileURLToPath(new URL("../src/resident-runner-server.js", import.meta.url));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENTS_RUNNER_ROOT: rootDir,
    AGENTS_RESIDENT_ADAPTER: "hermes-cli",
    HERMES_HOME: join(rootDir, "hermes"),
    HERMES_COMMAND: join(rootDir, "missing-fake-hermes"),
    AGENT_ID: "agent-default",
    AGENT_ROLE: "Default Agent",
    ORG_ID: "org-http",
    USER_ID: "user-http",
    WORKSPACE_ID: "workspace-http",
    RUNNER_ID: "runner-http",
    RUNNER_SESSION_ID: "runner-session-http",
    PORT: String(port)
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return spawn(process.execPath, [server], { env, stdio: ["ignore", "pipe", "pipe"] });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!isAddressInfo(address)) {
    throw new Error("Expected TCP server address.");
  }
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
  return port;
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null && "port" in address;
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 5000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: "Bearer test-token" }
      });
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`resident runner did not become healthy: ${String(lastError)}`);
}

async function waitForEvents(
  port: number,
  token: string,
  minimumCount: number
): Promise<{ status: number; body: any }> {
  const deadline = Date.now() + 5000;
  let last: { status: number; body: any } | undefined;
  while (Date.now() < deadline) {
    last = await fetchJson(port, "/events", { token });
    if (last.status === 200 && Array.isArray(last.body.events) && last.body.events.length >= minimumCount) {
      return last;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return last ?? fetchJson(port, "/events", { token });
}

async function fetchJson(
  port: number,
  path: string,
  options: {
    readonly method?: string;
    readonly token?: string;
    readonly body?: unknown;
  } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return { status: response.status, body: await response.json() };
}

function waitForExitWithOutput(child: ReturnType<typeof spawn>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("resident runner server did not exit"));
    }, 5000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("resident runner server did not exit after shutdown"));
    }, 5000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`resident runner server exited with ${code}`));
      }
    });
  });
}
