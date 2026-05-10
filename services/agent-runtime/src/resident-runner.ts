import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ArtifactSink, EventSink } from "./ports.js";
import { AwsArtifactSink } from "./aws-artifact-sink.js";
import { DynamoEventSink } from "./dynamo-event-sink.js";
import {
  buildArtifactCreatedEvent,
  buildAssistantResponseFinalEvent,
  buildCanonicalEvent,
  buildRunStatusEvent,
  type ArtifactKind,
  type CanonicalEventEnvelope,
  type RunStatus
} from "@agents-cloud/protocol";

export type ResidentAdapterKind = "hermes-cli";
export type ResidentAgentStatus = "idle" | "running" | "waiting" | "failed" | "succeeded";

export interface ResidentRunnerConfig {
  readonly rootDir: string;
  readonly orgId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly runnerId: string;
  readonly runnerSessionId: string;
  readonly adapterKind?: ResidentAdapterKind;
  readonly hermesCommand?: string;
  readonly now?: () => string;
  readonly eventSink?: EventSink;
  readonly artifactSink?: ArtifactSink;
}

type ResidentRunnerResolvedConfig = Required<Omit<ResidentRunnerConfig, "eventSink" | "artifactSink">> & {
  readonly eventSink?: EventSink;
  readonly artifactSink?: ArtifactSink;
};

export interface ResidentAgentProfile {
  readonly agentId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly role: string;
  readonly tenant?: {
    readonly orgId?: string;
    readonly userId?: string;
    readonly workspaceId?: string;
  };
  readonly model?: string;
  readonly provider?: "auto" | "openrouter" | "openai-codex" | "copilot" | "anthropic" | "nous" | "custom";
  readonly toolsets?: string;
  readonly promptTemplate?: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly sessionId?: string;
}

export interface ResidentWakeRequest {
  readonly objective: string;
  readonly agentId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly workItemId?: string;
  readonly wakeReason?: "timer" | "assignment" | "on_demand" | "automation" | "api";
}

export type ResidentUserEngagementKind = "notify" | "call";

export interface ResidentUserEngagementRequest {
  readonly kind: ResidentUserEngagementKind;
  readonly runId: string;
  readonly taskId?: string;
  readonly workspaceId?: string;
  readonly targetUserId?: string;
  readonly agentId?: string;
  readonly title?: string;
  readonly body?: string;
  readonly summary?: string;
  readonly urgency?: "low" | "normal" | "high";
  readonly deepLink?: string;
  readonly idempotencyKey?: string;
}

export interface ResidentUserEngagementResult {
  readonly accepted: true;
  readonly eventId: string;
  readonly type: "user.notification.requested" | "user.call.requested";
  readonly seq: number;
  readonly runId: string;
  readonly taskId?: string;
  readonly targetUserId: string;
  readonly deliveryStatus: "event_recorded";
}

export interface ResidentHeartbeatRecord {
  readonly heartbeatId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly wakeReason: string;
  readonly status: "succeeded" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly summary: string;
  readonly sessionId?: string;
  readonly artifactIds: string[];
  readonly adapterKind: ResidentAdapterKind;
}

export interface ResidentRunnerState {
  readonly schemaVersion: "resident-runner.v1";
  readonly runner: {
    readonly runnerId: string;
    readonly runnerSessionId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly workspaceId: string;
    readonly mode: "resident-dev" | "ecs-resident";
    readonly status: "starting" | "ready" | "running" | "failed";
    readonly lastHeartbeatAt?: string;
    readonly updatedAt: string;
  };
  readonly agents: ResidentAgentRuntimeState[];
  readonly heartbeats: ResidentHeartbeatRecord[];
  readonly metrics: {
    readonly totalHeartbeats: number;
    readonly failedHeartbeats: number;
    readonly totalArtifacts: number;
    readonly durableEvents: number;
  };
}

export interface ResidentAgentRuntimeState {
  readonly agentId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly role: string;
  readonly status: ResidentAgentStatus;
  readonly model?: string;
  readonly provider?: string;
  readonly toolsets?: string;
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly sessionId?: string;
  readonly lastRunId?: string;
  readonly lastHeartbeatAt?: string;
  readonly heartbeatCount: number;
}

export interface ResidentWakeResult {
  readonly runId: string;
  readonly taskId: string;
  readonly heartbeats: ResidentHeartbeatRecord[];
  readonly artifacts: ResidentArtifactRecord[];
  readonly events: CanonicalEventEnvelope[];
}

export interface ResidentArtifactRecord {
  readonly artifactId: string;
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly path: string;
  readonly uri: string;
  readonly bucket?: string;
  readonly key?: string;
  readonly createdAt: string;
}

interface AdapterResult {
  readonly summary: string;
  readonly rawOutput: string;
  readonly sessionId?: string;
  readonly exitCode: number | null;
}

const SOURCE = { kind: "worker" as const, name: "agent-runtime.resident-runner", version: "0.1.0" };

export class ResidentRunner {
  private state: ResidentRunnerState;
  private readonly rootDir: string;
  private readonly statePath: string;
  private readonly eventsPath: string;
  private readonly artifactsDir: string;
  private readonly logsDir: string;
  private seq = 1;

  public constructor(private readonly config: ResidentRunnerResolvedConfig) {
    this.rootDir = resolve(config.rootDir);
    this.statePath = join(this.rootDir, "state", "resident-runner-state.json");
    this.eventsPath = join(this.rootDir, "state", "events.ndjson");
    this.artifactsDir = join(this.rootDir, "artifacts");
    this.logsDir = join(this.rootDir, "logs");
    this.state = {
      schemaVersion: "resident-runner.v1",
      runner: {
        runnerId: config.runnerId,
        runnerSessionId: config.runnerSessionId,
        orgId: config.orgId,
        userId: config.userId,
        workspaceId: config.workspaceId,
        mode: process.env.AGENTS_RUNTIME_MODE === "ecs-resident" ? "ecs-resident" : "resident-dev",
        status: "starting",
        updatedAt: config.now()
      },
      agents: [],
      heartbeats: [],
      metrics: {
        totalHeartbeats: 0,
        failedHeartbeats: 0,
        totalArtifacts: 0,
        durableEvents: 0
      }
    };
  }

  public static fromEnvironment(): ResidentRunner {
    return new ResidentRunner({
      rootDir: process.env.AGENTS_RUNNER_ROOT ?? "/runner",
      orgId: requiredEnv("ORG_ID", "org-local-001"),
      userId: requiredEnv("USER_ID", "user-local-001"),
      workspaceId: requiredEnv("WORKSPACE_ID", "workspace-local-001"),
      runnerId: requiredEnv("RUNNER_ID", "runner-local-001"),
      runnerSessionId: process.env.RUNNER_SESSION_ID ?? `session-${Date.now()}`,
      adapterKind: adapterKindFromEnv(),
      hermesCommand: process.env.HERMES_COMMAND ?? "hermes",
      now: () => new Date().toISOString(),
      artifactSink: artifactSinkFromEnvironment()
    });
  }

  public async initialize(defaultProfiles: readonly ResidentAgentProfile[] = []): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await mkdir(this.artifactsDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await mkdir(join(this.rootDir, "workspace"), { recursive: true });
    await mkdir(join(this.rootDir, "profiles"), { recursive: true });
    await writeFile(this.eventsPath, "");

    for (const profile of defaultProfiles) {
      await this.registerAgent(profile);
    }

    this.state = {
      ...this.state,
      runner: {
        ...this.state.runner,
        status: "ready",
        updatedAt: this.config.now()
      }
    };
    await this.persistState();
  }

  public getState(): ResidentRunnerState {
    return this.state;
  }

  public async getEvents(): Promise<CanonicalEventEnvelope[]> {
    const raw = await readFile(this.eventsPath, "utf8").catch(() => "");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CanonicalEventEnvelope);
  }

  public async recordUserEngagement(input: ResidentUserEngagementRequest): Promise<ResidentUserEngagementResult> {
    if (!nonEmpty(input.runId)) {
      throw new Error("runId is required.");
    }
    assertSafeId(input.runId, "runId");
    if (input.taskId) {
      assertSafeId(input.taskId, "taskId");
    }
    if (input.workspaceId && input.workspaceId !== this.config.workspaceId) {
      throw new Error("workspaceId does not match resident runner workspace.");
    }
    const targetUserId = nonEmpty(input.targetUserId) ?? this.config.userId;
    if (targetUserId !== this.config.userId) {
      throw new Error("targetUserId does not match resident runner user.");
    }
    const agent = input.agentId ? this.state.agents.find((item) => item.agentId === input.agentId) : undefined;
    if (input.agentId && !agent) {
      throw new Error(`Unknown agentId: ${input.agentId}`);
    }
    const message = nonEmpty(input.body) ?? nonEmpty(input.summary);
    if (!message) {
      throw new Error(input.kind === "call" ? "summary or body is required." : "body is required.");
    }

    const urgency = input.urgency ?? "normal";
    if (!["low", "normal", "high"].includes(urgency)) {
      throw new Error("urgency must be low, normal, or high.");
    }

    const eventType = input.kind === "call" ? "user.call.requested" : "user.notification.requested";
    const event = buildCanonicalEvent({
      id: eventId(input.runId, this.nextSeq()),
      seq: this.seq,
      createdAt: this.config.now(),
      orgId: this.config.orgId,
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      runId: input.runId,
      taskId: input.taskId,
      idempotencyKey: input.idempotencyKey,
      source: SOURCE,
      type: eventType,
      payload: withoutUndefined({
        kind: input.kind,
        targetUserId,
        agentId: agent?.agentId ?? input.agentId,
        agentRole: agent?.role,
        title: nonEmpty(input.title),
        body: input.kind === "notify" ? message : undefined,
        summary: input.kind === "call" ? message : undefined,
        urgency,
        deepLink: nonEmpty(input.deepLink),
        deliveryStatus: "requested"
      })
    });
    await this.persistEvent(event);
    return {
      accepted: true,
      eventId: event.id,
      type: eventType,
      seq: event.seq,
      runId: input.runId,
      taskId: input.taskId,
      targetUserId,
      deliveryStatus: "event_recorded"
    };
  }

  public async registerAgent(profile: ResidentAgentProfile): Promise<ResidentAgentRuntimeState> {
    this.assertTenant(profile);
    assertSafeId(profile.agentId, "agentId");
    assertSafeId(profile.profileId, "profileId");
    assertSafeId(profile.profileVersion, "profileVersion");
    const existing = this.state.agents.find((agent) => agent.agentId === profile.agentId);
    const now = this.config.now();
    const agent: ResidentAgentRuntimeState = {
      agentId: profile.agentId,
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      role: profile.role,
      status: existing?.status ?? "idle",
      model: profile.model,
      provider: profile.provider,
      toolsets: profile.toolsets,
      cwd: profile.cwd ? confinedPath(profile.cwd, join(this.rootDir, "workspace"), "cwd") : join(this.rootDir, "workspace", profile.agentId),
      timeoutMs: profile.timeoutMs,
      sessionId: profile.sessionId ?? existing?.sessionId,
      lastRunId: existing?.lastRunId,
      lastHeartbeatAt: existing?.lastHeartbeatAt,
      heartbeatCount: existing?.heartbeatCount ?? 0
    };

    await mkdir(agent.cwd, { recursive: true });
    await this.writeProfile(profile);

    this.state = {
      ...this.state,
      agents: existing
        ? this.state.agents.map((item) => item.agentId === agent.agentId ? agent : item)
        : [...this.state.agents, agent],
      runner: {
        ...this.state.runner,
        updatedAt: now
      }
    };
    await this.persistState();
    await this.persistAgentInstance(agent, "idle");
    return agent;
  }

  public async wake(input: ResidentWakeRequest): Promise<ResidentWakeResult> {
    const agents = this.selectAgents(input.agentId);
    const runId = input.runId ?? `run-${Date.now()}`;
    assertSafeId(runId, "runId");
    const taskId = input.taskId ?? `task-${runId}`;
    assertSafeId(taskId, "taskId");
    const events: CanonicalEventEnvelope[] = [];
    const artifacts: ResidentArtifactRecord[] = [];
    const heartbeats: ResidentHeartbeatRecord[] = [];

    this.state = {
      ...this.state,
      runner: {
        ...this.state.runner,
        status: "running",
        lastHeartbeatAt: this.config.now(),
        updatedAt: this.config.now()
      },
      agents: this.state.agents.map((agent) => agents.some((selected) => selected.agentId === agent.agentId) ? { ...agent, status: "running" } : agent)
    };
    await this.persistState();
    await Promise.all(agents.map((agent) => this.persistAgentInstance({ ...agent, status: "running" }, "running")));

    events.push(await this.emitStatus(runId, taskId, "planning", "Resident runner accepted wake request.", 0.1));

    for (const agent of agents) {
      const startedAt = this.config.now();
      const heartbeatId = `heartbeat-${runId}-${agent.agentId}`;
      events.push(await this.emitStatus(runId, taskId, "running", `${agent.role} heartbeat started.`, 0.35));

      let adapterResult: AdapterResult;
      let status: ResidentHeartbeatRecord["status"] = "succeeded";
      try {
        adapterResult = await this.runAdapter(agent, input, runId, taskId);
      } catch (error) {
        status = "failed";
        const message = error instanceof Error ? error.message : String(error);
        adapterResult = { summary: message, rawOutput: message, exitCode: 1 };
        events.push(await this.emitStatus(runId, taskId, "failed", `${agent.role} heartbeat failed: ${message}`, 1, {
          code: "RESIDENT_HEARTBEAT_FAILED",
          message,
          retryable: true
        }));
      }

      const actionableEvents = await this.emitActionableAgentEvents(agent, input, runId, taskId, adapterResult.rawOutput);
      events.push(...actionableEvents);

      const artifact = await this.writeHeartbeatArtifact(agent, runId, taskId, input.workItemId, adapterResult);
      artifacts.push(artifact);
      events.push(await this.emitArtifact(runId, taskId, artifact));
      events.push(await this.emitAssistantResponseFinal(agent, input, runId, taskId, artifact, adapterResult));

      const finishedAt = this.config.now();
      const record: ResidentHeartbeatRecord = {
        heartbeatId,
        runId,
        taskId,
        agentId: agent.agentId,
        wakeReason: input.wakeReason ?? "api",
        status,
        startedAt,
        finishedAt,
        summary: adapterResult.summary,
        sessionId: adapterResult.sessionId ?? agent.sessionId,
        artifactIds: [artifact.artifactId],
        adapterKind: this.config.adapterKind
      };
      heartbeats.push(record);
      await appendFile(join(this.logsDir, `${heartbeatId}.log`), adapterResult.rawOutput);

      this.state = {
        ...this.state,
        agents: this.state.agents.map((item) => item.agentId === agent.agentId
          ? {
            ...item,
            status: status === "succeeded" ? "succeeded" : "failed",
            sessionId: adapterResult.sessionId ?? item.sessionId,
            lastRunId: runId,
            lastHeartbeatAt: finishedAt,
            heartbeatCount: item.heartbeatCount + 1
          }
          : item),
        heartbeats: [...this.state.heartbeats, record],
        metrics: {
          totalHeartbeats: this.state.metrics.totalHeartbeats + 1,
          failedHeartbeats: this.state.metrics.failedHeartbeats + (status === "failed" ? 1 : 0),
          totalArtifacts: this.state.metrics.totalArtifacts + 1,
          durableEvents: this.state.metrics.durableEvents
        }
      };
      await this.persistState();
      const updatedAgent = this.state.agents.find((item) => item.agentId === agent.agentId);
      if (updatedAgent) {
        await this.persistAgentInstance(updatedAgent, updatedAgent.status, runId, record.finishedAt);
      }
    }

    const finalStatus: RunStatus = heartbeats.some((heartbeat) => heartbeat.status === "failed") ? "failed" : "succeeded";
    const finalMessage = finalStatus === "failed" ? "Resident runner wake completed with failed heartbeats." : "Resident runner wake completed.";
    events.push(await this.emitStatus(runId, taskId, finalStatus, finalMessage, 1, finalStatus === "failed" ? {
      code: "RESIDENT_WAKE_PARTIAL_FAILURE",
      message: finalMessage,
      retryable: true
    } : undefined));
    this.state = {
      ...this.state,
      runner: {
        ...this.state.runner,
        status: "ready",
        updatedAt: this.config.now()
      }
    };
    await this.persistState();

    return { runId, taskId, heartbeats, artifacts, events };
  }

  private selectAgents(agentId: string | undefined): ResidentAgentRuntimeState[] {
    if (agentId) {
      const agent = this.state.agents.find((item) => item.agentId === agentId);
      if (!agent) {
        throw new Error(`Unknown agentId: ${agentId}`);
      }
      return [agent];
    }
    if (this.state.agents.length === 0) {
      throw new Error("No resident agents are registered.");
    }
    return this.state.agents;
  }

  private async runAdapter(
    agent: ResidentAgentRuntimeState,
    input: ResidentWakeRequest,
    runId: string,
    taskId: string
  ): Promise<AdapterResult> {
    const prompt = renderPrompt(agent, input, this.state.runner, runId, taskId);
    const args = [
      "chat",
      "-q",
      prompt,
      "-Q",
      "--source",
      "agents-cloud",
      "--max-turns",
      process.env.AGENTS_HERMES_MAX_TURNS ?? "8",
      "--pass-session-id"
    ];
    if (agent.model) {
      args.push("-m", agent.model);
    }
    if (agent.provider && agent.provider !== "custom") {
      args.push("--provider", agent.provider);
    }
    if (agent.toolsets) {
      args.push("-t", agent.toolsets);
    }
    if (agent.sessionId) {
      args.push("--resume", agent.sessionId);
    }
    if (process.env.HERMES_ACCEPT_HOOKS === "1") {
      args.push("--accept-hooks");
    }
    if (process.env.AGENTS_HERMES_YOLO === "1") {
      args.push("--yolo");
    }

    const timeoutMs = agent.timeoutMs ?? positiveNumberFromEnv("AGENTS_RESIDENT_AGENT_TIMEOUT_MS") ?? 1_800_000;
    try {
      const rawOutput = await runProcess(
        this.config.hermesCommand,
        args,
        timeoutMs,
        agent.cwd,
        buildAdapterEnvironment({
          runId,
          taskId,
          workItemId: input.workItemId,
          workspaceId: this.config.workspaceId,
          userId: this.config.userId,
          agentId: agent.agentId,
          runnerId: this.config.runnerId
        })
      );
      return {
        summary: firstNonEmptyLine(stripSessionLine(rawOutput)) ?? `${agent.role} completed heartbeat.`,
        rawOutput,
        sessionId: sessionIdFromOutput(rawOutput) ?? agent.sessionId,
        exitCode: 0
      };
    } catch (error) {
      if (process.env.AGENTS_RESIDENT_TIMEOUT_FALLBACK === "1" && isProcessTimeout(error)) {
        const summary = `${agent.role} reached the demo heartbeat timeout after ${timeoutMs}ms. The resident runner remained healthy and produced a durable fallback report.`;
        return {
          summary,
          rawOutput: summary,
          sessionId: agent.sessionId,
          exitCode: 0
        };
      }
      throw error;
    }
  }

  private async emitActionableAgentEvents(
    agent: ResidentAgentRuntimeState,
    input: ResidentWakeRequest,
    runId: string,
    taskId: string,
    rawOutput: string
  ): Promise<CanonicalEventEnvelope[]> {
    const extracted = extractActionableAgentEvents(rawOutput);
    const events: CanonicalEventEnvelope[] = [];
    for (const item of extracted) {
      const type = normalizeActionableEventType(item.type);
      const event = buildCanonicalEvent({
        id: eventId(runId, this.nextSeq()),
        seq: this.seq,
        createdAt: this.config.now(),
        orgId: this.config.orgId,
        userId: this.config.userId,
        workspaceId: this.config.workspaceId,
        runId,
        taskId,
        source: SOURCE,
        type,
        payload: withoutUndefined({
          agentId: agent.agentId,
          agentRole: agent.role,
          profileId: agent.profileId,
          profileVersion: agent.profileVersion,
          rootWorkItemId: input.workItemId,
          legacyEventType: type === item.type ? undefined : item.type,
          ...item.payload
        })
      });
      await this.persistEvent(event);
      if (type === "artifact.created" && this.config.artifactSink) {
        await this.persistAgentArtifactRecord(runId, taskId, input.workItemId, event.payload);
      }
      events.push(event);
    }
    return events;
  }

  private async persistAgentArtifactRecord(
    runId: string,
    taskId: string,
    workItemId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.artifactSink) return;
    const artifactId = stringValue(payload.artifactId);
    const kind = stringValue(payload.kind);
    const name = stringValue(payload.name);
    const uri = stringValue(payload.uri);
    if (!artifactId || !kind || !name || !uri) return;
    const createdAt = this.config.now();
    await this.config.artifactSink.putArtifactRecord(withoutUndefined({
      artifactId,
      runId,
      taskId,
      workItemId,
      workspaceId: this.config.workspaceId,
      userId: this.config.userId,
      kind,
      name,
      title: name,
      uri,
      s3Uri: uri.startsWith("s3://") ? uri : undefined,
      contentType: stringValue(payload.contentType),
      metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : undefined,
      previewUrl: stringValue(payload.previewUrl),
      createdAt,
      updatedAt: createdAt
    }));
  }

  private async writeHeartbeatArtifact(
    agent: ResidentAgentRuntimeState,
    runId: string,
    taskId: string,
    workItemId: string | undefined,
    adapterResult: AdapterResult
  ): Promise<ResidentArtifactRecord> {
    const artifactId = `artifact-${taskId}-${agent.agentId}-heartbeat`;
    const filePath = join(this.artifactsDir, runId, artifactId, "heartbeat-report.md");
    const createdAt = this.config.now();
    const body = [
      "# Resident Runner Heartbeat",
      "",
      `Runner: ${this.config.runnerId}`,
      `Agent: ${agent.agentId}`,
      `Role: ${agent.role}`,
      `Profile: ${agent.profileId}@${agent.profileVersion}`,
      `Run: ${runId}`,
      `Task: ${taskId}`,
      `Adapter: ${this.config.adapterKind}`,
      `Created at: ${createdAt}`,
      "",
      "## Summary",
      "",
      adapterResult.summary,
      "",
      "## Raw Output",
      "",
      "```text",
      adapterResult.rawOutput.trim(),
      "```",
      ""
    ].join("\n");
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);

    const uploaded = this.config.artifactSink
      ? await this.config.artifactSink.putArtifact({
          key: `workspaces/${this.config.workspaceId}/runs/${runId}/artifacts/${artifactId}/heartbeat-report.md`,
          body,
          contentType: "text/markdown; charset=utf-8"
        })
      : undefined;

    const artifact: ResidentArtifactRecord = {
      artifactId,
      kind: "report",
      name: `${agent.role} heartbeat report`,
      path: filePath,
      uri: uploaded?.uri ?? pathToFileURL(filePath).toString(),
      bucket: uploaded?.bucket,
      key: uploaded?.key,
      createdAt
    };

    if (this.config.artifactSink) {
      await this.config.artifactSink.putArtifactRecord(withoutUndefined({
        artifactId,
        runId,
        taskId,
        workItemId,
        workspaceId: this.config.workspaceId,
        userId: this.config.userId,
        kind: artifact.kind,
        name: artifact.name,
        title: artifact.name,
        uri: artifact.uri,
        s3Uri: artifact.uri,
        bucket: artifact.bucket,
        key: artifact.key,
        contentType: "text/markdown; charset=utf-8",
        sizeBytes: Buffer.byteLength(body),
        metadata: {
          runnerId: this.config.runnerId,
          agentId: agent.agentId,
          localPath: filePath
        },
        createdAt,
        updatedAt: createdAt
      }));
    }

    return artifact;
  }

  private async emitStatus(
    runId: string,
    taskId: string,
    status: RunStatus,
    message: string,
    progress: number,
    error?: { readonly code: string; readonly message: string; readonly retryable?: boolean }
  ): Promise<CanonicalEventEnvelope> {
    const event = buildRunStatusEvent({
      id: eventId(runId, this.nextSeq()),
      seq: this.seq,
      createdAt: this.config.now(),
      orgId: this.config.orgId,
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      runId,
      taskId,
      source: SOURCE,
      status,
      workerClass: "agent-code",
      message,
      progress,
      error
    });
    await this.persistEvent(event);
    return event;
  }

  private async emitArtifact(runId: string, taskId: string, artifact: ResidentArtifactRecord): Promise<CanonicalEventEnvelope> {
    const event = buildArtifactCreatedEvent({
      id: eventId(runId, this.nextSeq()),
      seq: this.seq,
      createdAt: artifact.createdAt,
      orgId: this.config.orgId,
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      runId,
      taskId,
      source: SOURCE,
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      name: artifact.name,
      uri: artifact.uri,
      contentType: "text/markdown; charset=utf-8",
      metadata: {
        runnerId: this.config.runnerId,
        localPath: artifact.path,
        bucket: artifact.bucket,
        key: artifact.key
      }
    });
    await this.persistEvent(event);
    return event;
  }

  private async emitAssistantResponseFinal(
    agent: ResidentAgentRuntimeState,
    input: ResidentWakeRequest,
    runId: string,
    taskId: string,
    artifact: ResidentArtifactRecord,
    adapterResult: AdapterResult
  ): Promise<CanonicalEventEnvelope> {
    const content = finalAssistantContent(adapterResult);
    const event = buildAssistantResponseFinalEvent({
      id: eventId(runId, this.nextSeq()),
      seq: this.seq,
      createdAt: this.config.now(),
      orgId: this.config.orgId,
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      runId,
      taskId,
      source: SOURCE,
      messageId: `message-${runId}-${agent.agentId}-final`,
      agentId: agent.agentId,
      agentName: agent.role,
      agentRole: agent.role,
      role: "assistant",
      content,
      markdown: content,
      text: content,
      format: "markdown",
      sessionId: adapterResult.sessionId ?? agent.sessionId,
      workItemId: input.workItemId,
      artifactId: artifact.artifactId
    });
    await this.persistEvent(event);
    return event;
  }

  private async persistEvent(event: CanonicalEventEnvelope): Promise<void> {
    await appendFile(this.eventsPath, `${JSON.stringify(event)}\n`);
    const eventSink = this.config.eventSink ?? eventSinkForEvent(event, this.config.now);
    if (eventSink) {
      await eventSink.putEvent(event);
      if (event.type === "run.status" && typeof event.payload.status === "string") {
        await Promise.all([
          eventSink.updateRunStatus(event.payload.status),
          eventSink.updateTaskStatus(event.payload.status)
        ]);
      }
    }
    this.state = {
      ...this.state,
      metrics: {
        ...this.state.metrics,
        durableEvents: this.state.metrics.durableEvents + 1
      }
    };
  }

  private async persistState(): Promise<void> {
    await writeFile(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  private async persistAgentInstance(
    agent: ResidentAgentRuntimeState,
    status: ResidentAgentRuntimeState["status"],
    runId?: string,
    timestamp?: string
  ): Promise<void> {
    const tableName = process.env.AGENT_INSTANCES_TABLE_NAME;
    if (!tableName) {
      return;
    }
    const now = timestamp ?? this.config.now();
    const item = {
      runnerId: this.config.runnerId,
      agentId: agent.agentId,
      userId: this.config.userId,
      workspaceId: this.config.workspaceId,
      orgId: this.config.orgId,
      profileId: agent.profileId,
      profileVersion: agent.profileVersion,
      role: agent.role,
      status,
      userStatus: `${this.config.userId}#${status}`,
      model: agent.model,
      provider: agent.provider,
      toolsets: agent.toolsets,
      sessionId: agent.sessionId,
      lastRunId: runId ?? agent.lastRunId,
      lastHeartbeatAt: timestamp ?? agent.lastHeartbeatAt,
      heartbeatCount: agent.heartbeatCount,
      wakeBucket: `workspace#${this.config.workspaceId}`,
      createdAt: now,
      updatedAt: now
    };
    await dynamoDocumentClient().send(new PutCommand({ TableName: tableName, Item: withoutUndefined(item) }));
  }

  private async writeProfile(profile: ResidentAgentProfile): Promise<void> {
    const path = confinedPath(`${profile.agentId}.json`, join(this.rootDir, "profiles"), "profile path");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(redactProfile(profile), null, 2)}\n`);
  }

  private assertTenant(profile: ResidentAgentProfile): void {
    if (profile.tenant?.orgId && profile.tenant.orgId !== this.config.orgId) {
      throw new Error("Profile orgId does not match resident runner tenant.");
    }
    if (profile.tenant?.userId && profile.tenant.userId !== this.config.userId) {
      throw new Error("Profile userId does not match resident runner tenant.");
    }
    if (profile.tenant?.workspaceId && profile.tenant.workspaceId !== this.config.workspaceId) {
      throw new Error("Profile workspaceId does not match resident runner workspace.");
    }
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}

export function residentRunnerConfigFromPartial(input: ResidentRunnerConfig): ResidentRunnerResolvedConfig {
  return {
    ...input,
    adapterKind: input.adapterKind ?? "hermes-cli",
    hermesCommand: input.hermesCommand ?? "hermes",
    now: input.now ?? (() => new Date().toISOString())
  };
}

function renderPrompt(
  agent: ResidentAgentRuntimeState,
  input: ResidentWakeRequest,
  runner: ResidentRunnerState["runner"],
  runId: string,
  taskId: string
): string {
  const template = [
    "You are {{role}}, a resident Agents Cloud logical agent.",
    "Work autonomously inside the scoped workspace, but do not publish, spend, delete, contact users, change infrastructure, or write source control without platform approval.",
    "Keep durable progress visible through status, artifact, approval, question, or message events. Do not emit noisy internal tool calls.",
    "Only emit high-signal platform events when something actionable happens: delegated agent/work item created, agent profile requested/promoted, review feedback recorded, or webpage/artifact published. Use dotted event names such as agent.delegated, work.item.created, work.item.assigned, webpage.published, artifact.created, client.control.requested, and browser.control.requested.",
    "When you need to contact the user, use the local CLI tool instead of inventing a channel: `agents-cloud-user notify --body \"...\"` for a notification-style message, or `agents-cloud-user call --summary \"...\"` to request a phone call. These commands record durable platform events for the current run.",
    "When you build or start a web app on a local port, publish it with `agents-cloud-preview expose --port <port> --label <short-name>`. Start long-running dev servers and this preview command in the background so the run can finish; the command prints a redacted artifact.created preview event with a clickable previewUrl.",
    "When you need the foreground client to move, emit a single `client.control.requested` event with payload `{ kind: \"show_page\", surface: \"browser|kanban|approvals|agents\", message: \"short user-facing reason\" }`. For embedded browser work, emit `browser.control.requested` with a bounded command and a short message. Do not emit arbitrary JavaScript or unbounded UI commands.",
    "To emit one, include a fenced block exactly like ```agents-cloud-event followed by JSON with type and payload, then closing ```.",
    "",
    "Tenant:",
    "- Org: {{orgId}}",
    "- User: {{userId}}",
    "- Workspace: {{workspaceId}}",
    "- Runner: {{runnerId}}",
    "- Agent: {{agentId}}",
    "- Profile: {{profileId}}@{{profileVersion}}",
    "",
    "Run:",
    "- Run ID: {{runId}}",
    "- Task ID: {{taskId}}",
    "- Wake reason: {{wakeReason}}",
    "",
    "Objective:",
    "{{objective}}"
  ].join("\n");
  return template
    .replaceAll("{{role}}", agent.role)
    .replaceAll("{{orgId}}", runner.orgId)
    .replaceAll("{{userId}}", runner.userId)
    .replaceAll("{{workspaceId}}", runner.workspaceId)
    .replaceAll("{{runnerId}}", runner.runnerId)
    .replaceAll("{{agentId}}", agent.agentId)
    .replaceAll("{{profileId}}", agent.profileId)
    .replaceAll("{{profileVersion}}", agent.profileVersion)
    .replaceAll("{{runId}}", runId)
    .replaceAll("{{taskId}}", taskId)
    .replaceAll("{{wakeReason}}", input.wakeReason ?? "api")
    .replaceAll("{{objective}}", input.objective);
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<string> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveProcess(stdout.trim());
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function isProcessTimeout(error: unknown): boolean {
  return error instanceof Error && /timed out after \d+ms/.test(error.message);
}

function positiveNumberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildAdapterEnvironment(context: {
  readonly runId: string;
  readonly taskId: string;
  readonly workItemId?: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly agentId: string;
  readonly runnerId: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  copyEnv(env, "PATH");
  copyEnv(env, "HOME");
  copyEnv(env, "LANG");
  copyEnv(env, "LC_ALL");
  copyEnv(env, "TERM");
  copyEnv(env, "HERMES_HOME");
  copyEnv(env, "HERMES_CONFIG_DIR");
  copyEnv(env, "AGENTS_MODEL_PROVIDER");
  copyEnv(env, "AGENTS_MODEL");

  env.RUN_ID = context.runId;
  env.TASK_ID = context.taskId;
  env.WORK_ITEM_ID = context.workItemId ?? "";
  env.WORKSPACE_ID = context.workspaceId;
  env.USER_ID = context.userId;
  env.AGENT_ID = context.agentId;
  env.RUNNER_ID = context.runnerId;
  env.AGENTS_CLOUD_RUN_ID = context.runId;
  env.AGENTS_CLOUD_TASK_ID = context.taskId;
  env.AGENTS_CLOUD_WORK_ITEM_ID = context.workItemId ?? "";
  env.AGENTS_CLOUD_WORKSPACE_ID = context.workspaceId;
  env.AGENTS_CLOUD_USER_ID = context.userId;
  env.AGENTS_CLOUD_AGENT_ID = context.agentId;
  env.AGENTS_CLOUD_RUNNER_ID = context.runnerId;
  env.AGENTS_USER_ENGAGEMENT_URL =
    process.env.AGENTS_USER_ENGAGEMENT_URL ?? `http://127.0.0.1:${process.env.PORT ?? "8787"}/engagement`;
  const engagementToken = process.env.AGENTS_USER_ENGAGEMENT_TOKEN;
  if (engagementToken) {
    env.AGENTS_USER_ENGAGEMENT_TOKEN = engagementToken;
  }
  env.AGENTS_USER_TOOL = "agents-cloud-user";
  env.AGENTS_CLOUD_PREVIEW_TOOL = "agents-cloud-preview";
  copyEnv(env, "AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL");
  copyEnv(env, "AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN");

  if (process.env.AGENTS_ALLOW_RAW_PROVIDER_KEYS_TO_AGENT === "1") {
    for (const key of [
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "NOUS_API_KEY",
      "COPILOT_API_KEY"
    ]) {
      copyEnv(env, key);
    }
  }

  return env;
}

function copyEnv(target: NodeJS.ProcessEnv, key: string): void {
  const value = process.env[key];
  if (value !== undefined) {
    target[key] = value;
  }
}

let cachedDynamoDocumentClient: DynamoDBDocumentClient | undefined;
function dynamoDocumentClient(): DynamoDBDocumentClient {
  cachedDynamoDocumentClient ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true }
  });
  return cachedDynamoDocumentClient;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function adapterKindFromEnv(): ResidentAdapterKind {
  const adapter = process.env.AGENTS_RESIDENT_ADAPTER;
  if (adapter && adapter !== "hermes-cli") {
    throw new Error(`Unsupported resident adapter: ${adapter}. Resident runners require AGENTS_RESIDENT_ADAPTER=hermes-cli.`);
  }
  return "hermes-cli";
}

const ACTIONABLE_AGENT_EVENT_TYPES = new Set([
  "agent.delegated",
  "agent.profile.requested",
  "agent.profile.revision_proposed",
  "agent.profile.promoted",
  "work.item.created",
  "work.item.assigned",
  "work_item.created",
  "work_item.assigned",
  "review.session.created",
  "review.feedback.recorded",
  "webpage.published",
  "artifact.created",
  "client.control.requested",
  "browser.control.requested"
]);

function normalizeActionableEventType(type: string): string {
  if (type === "work_item.created") return "work.item.created";
  if (type === "work_item.assigned") return "work.item.assigned";
  return type;
}

interface ActionableAgentEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

function extractActionableAgentEvents(rawOutput: string): ActionableAgentEvent[] {
  const events: ActionableAgentEvent[] = [];
  const fencePattern = /```agents-cloud-event\s*\n([\s\S]*?)\n```/g;
  for (const match of rawOutput.matchAll(fencePattern)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "";
      if (!ACTIONABLE_AGENT_EVENT_TYPES.has(type)) continue;
      const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
        ? record.payload as Record<string, unknown>
        : {};
      const sanitizedPayload = sanitizeActionEventPayload(payload);
      const normalizedPayload = normalizeActionEventPayload(type, sanitizedPayload);
      if (!normalizedPayload) continue;
      events.push({ type, payload: normalizedPayload });
    } catch {
      continue;
    }
  }
  return events;
}

function sanitizeActionEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => isJsonSafeActionEventValue(value)));
}

const CLIENT_CONTROL_KINDS = new Set([
  "show_page",
  "open_artifact",
  "open_report",
  "open_browser",
  "highlight",
  "enter_voice_mode",
  "exit_voice_mode"
]);

const CLIENT_CONTROL_SURFACES = new Set(["agents", "kanban", "browser", "approvals"]);

const ARTIFACT_KINDS = new Set(["document", "website", "dataset", "report", "diff", "miro-board", "log", "trace", "other"]);

const BROWSER_CONTROL_KINDS = new Set(["snapshot", "find", "click", "fill", "scroll_by", "navigate", "reload", "back", "forward", "run_smoke"]);

function normalizeActionEventPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> | undefined {
  if (type === "artifact.created") {
    const artifactId = stringValue(payload.artifactId);
    const kind = stringValue(payload.kind);
    const name = stringValue(payload.name);
    const uri = stringValue(payload.uri);
    const contentType = stringValue(payload.contentType) ?? "application/octet-stream";
    if (!artifactId || !kind || !ARTIFACT_KINDS.has(kind) || !name || !uri || !isHttpLikeUri(uri)) return undefined;
    const previewUrl = stringValue(payload.previewUrl);
    if (previewUrl && !isHttpLikeUri(previewUrl)) return undefined;
    return limitActionEventText({
      artifactId,
      kind,
      name,
      uri,
      contentType,
      previewUrl,
      metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : undefined
    });
  }
  if (type === "client.control.requested") {
    const kind = stringValue(payload.kind);
    const surface = stringValue(payload.surface);
    if (!kind || !CLIENT_CONTROL_KINDS.has(kind)) return undefined;
    if (surface && !CLIENT_CONTROL_SURFACES.has(surface)) return undefined;
    return limitActionEventText(payload);
  }
  if (type === "browser.control.requested") {
    const kind = stringValue(payload.kind);
    if (!kind || !BROWSER_CONTROL_KINDS.has(kind)) return undefined;
    return limitActionEventText(payload);
  }
  return payload;
}

function limitActionEventText(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, boundActionEventValue(value)]));
}

function boundActionEventValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 512);
  if (Array.isArray(value)) return value.slice(0, 50).map(boundActionEventValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, nested]) => [key, boundActionEventValue(nested)]));
  }
  return value;
}

function isJsonSafeActionEventValue(value: unknown): boolean {
  if (value === null) return true;
  if (["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonSafeActionEventValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonSafeActionEventValue);
  return false;
}

function eventSinkForEvent(event: CanonicalEventEnvelope, now: () => string): EventSink | undefined {
  if (!process.env.RUNS_TABLE_NAME || !process.env.TASKS_TABLE_NAME || !process.env.EVENTS_TABLE_NAME) {
    return undefined;
  }
  const runId = stringValue(event.runId);
  const taskId = stringValue(event.taskId) ?? stringValue(event.payload.taskId);
  const workspaceId = stringValue(event.workspaceId);
  const userId = stringValue(event.userId);
  if (!runId || !taskId || !workspaceId || !userId) {
    return undefined;
  }
  return DynamoEventSink.fromEnvironment({
    runId,
    taskId,
    workspaceId,
    userId,
    objective: "resident runner wake",
    now
  });
}

function artifactSinkFromEnvironment(): ArtifactSink | undefined {
  if (!process.env.ARTIFACTS_BUCKET_NAME || !process.env.ARTIFACTS_TABLE_NAME) {
    return undefined;
  }
  return AwsArtifactSink.fromEnvironment();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function isHttpLikeUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "s3:" || url.protocol === "file:";
  } catch {
    return false;
  }
}

function eventId(runId: string, seq: number): string {
  return `evt-${runId}-${String(seq).padStart(6, "0")}`;
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function sessionIdFromOutput(value: string): string | undefined {
  return value.match(/^session_id:\s*(\S+)/m)?.[1];
}

function stripSessionLine(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("session_id:"))
    .join("\n")
    .trim();
}

function finalAssistantContent(result: AdapterResult): string {
  const cleaned = stripSessionLine(result.rawOutput);
  return cleaned.length > 0 ? cleaned : result.summary;
}

function assertSafeId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a safe identifier.`);
  }
}

function confinedPath(pathValue: string, root: string, label: string): string {
  const rootPath = resolve(root);
  const resolved = resolve(rootPath, pathValue);
  const rel = relative(rootPath, resolved);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`) || resolve(rel) === rel) {
    throw new Error(`${label} must stay within ${rootPath}.`);
  }
  return resolved;
}

function redactProfile(profile: ResidentAgentProfile): ResidentAgentProfile {
  const env = profile as unknown as { env?: Record<string, string> };
  if (!env.env) {
    return profile;
  }
  return {
    ...profile,
    env: Object.fromEntries(Object.keys(env.env).map((key) => [key, "[redacted]"]))
  } as ResidentAgentProfile;
}
