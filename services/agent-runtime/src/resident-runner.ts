import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  buildArtifactCreatedEvent,
  buildRunStatusEvent,
  type ArtifactKind,
  type CanonicalEventEnvelope,
  type RunStatus
} from "@agents-cloud/protocol";

export type ResidentAdapterKind = "smoke" | "hermes-cli";
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
}

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
  readonly wakeReason?: "timer" | "assignment" | "on_demand" | "automation" | "api";
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
  private seq = 0;

  public constructor(private readonly config: Required<ResidentRunnerConfig>) {
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
      now: () => new Date().toISOString()
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

      const artifact = await this.writeHeartbeatArtifact(agent, runId, taskId, adapterResult);
      artifacts.push(artifact);
      events.push(await this.emitArtifact(runId, taskId, artifact));

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
    if (this.config.adapterKind === "smoke") {
      const sessionId = agent.sessionId ?? `session-${agent.agentId}`;
      return {
        summary: `${agent.role} processed objective in smoke mode.`,
        rawOutput: [
          `agent=${agent.agentId}`,
          `profile=${agent.profileId}@${agent.profileVersion}`,
          `session_id: ${sessionId}`,
          "",
          prompt
        ].join("\n"),
        sessionId,
        exitCode: 0
      };
    }

    const args = ["chat", "-q", prompt, "-Q", "--source", "agents-cloud"];
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

    const rawOutput = await runProcess(
      this.config.hermesCommand,
      args,
      agent.timeoutMs ?? 1_800_000,
      agent.cwd,
      buildAdapterEnvironment()
    );
    return {
      summary: firstNonEmptyLine(stripSessionLine(rawOutput)) ?? `${agent.role} completed heartbeat.`,
      rawOutput,
      sessionId: sessionIdFromOutput(rawOutput) ?? agent.sessionId,
      exitCode: 0
    };
  }

  private async writeHeartbeatArtifact(
    agent: ResidentAgentRuntimeState,
    runId: string,
    taskId: string,
    adapterResult: AdapterResult
  ): Promise<ResidentArtifactRecord> {
    const artifactId = `artifact-${taskId}-${agent.agentId}-heartbeat`;
    const path = join(this.artifactsDir, runId, artifactId, "heartbeat-report.md");
    const createdAt = this.config.now();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, [
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
    ].join("\n"));
    return {
      artifactId,
      kind: "report",
      name: `${agent.role} heartbeat report`,
      path,
      uri: pathToFileURL(path).toString(),
      createdAt
    };
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
        localPath: artifact.path
      }
    });
    await this.persistEvent(event);
    return event;
  }

  private async persistEvent(event: CanonicalEventEnvelope): Promise<void> {
    await appendFile(this.eventsPath, `${JSON.stringify(event)}\n`);
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

export function residentRunnerConfigFromPartial(input: ResidentRunnerConfig): Required<ResidentRunnerConfig> {
  return {
    ...input,
    adapterKind: input.adapterKind ?? "smoke",
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

function buildAdapterEnvironment(): NodeJS.ProcessEnv {
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

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function adapterKindFromEnv(): ResidentAdapterKind {
  return process.env.AGENTS_RESIDENT_ADAPTER === "hermes-cli" ? "hermes-cli" : "smoke";
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
