import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildArtifactCreatedEvent,
  buildRunStatusEvent,
  buildToolApprovalEvent,
  type ArtifactKind,
  type CanonicalEventEnvelope,
  type RunStatus,
  type ToolApprovalPayload,
  type ToolApprovalRisk
} from "@agents-cloud/protocol";

export type LocalApprovalDecision = "approved" | "rejected" | "pending";

export interface LocalHarnessOptions {
  readonly rootDir: string;
  readonly objective: string;
  readonly agentRole?: string;
  readonly userAnswer?: string;
  readonly previewDecision?: LocalApprovalDecision;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly orgId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly runnerId?: string;
  readonly now?: () => string;
}

export interface LocalHarnessArtifact {
  readonly artifactId: string;
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly path: string;
  readonly uri: string;
  readonly previewUrl?: string;
}

export interface LocalHarnessState {
  readonly schemaVersion: "local-harness.v1";
  readonly runner: {
    readonly runnerId: string;
    readonly mode: "resident-dev";
    readonly status: "ready" | "waiting" | "completed";
    readonly lastHeartbeatAt: string;
  };
  readonly run: {
    readonly runId: string;
    readonly taskId: string;
    readonly status: RunStatus;
    readonly objective: string;
  };
  readonly agents: Array<{
    readonly agentInstanceId: string;
    readonly role: string;
    readonly profileId: string;
    readonly profileVersion: string;
    readonly status: "idle" | "planning" | "running" | "waiting_for_approval" | "succeeded";
    readonly activeTaskIds: string[];
  }>;
  readonly tasks: Array<{
    readonly taskId: string;
    readonly assignedAgentInstanceId: string;
    readonly title: string;
    readonly status: "planning" | "running" | "waiting_for_approval" | "succeeded";
  }>;
  readonly tools: LocalToolExecution[];
  readonly approvals: LocalApprovalRecord[];
  readonly waitStates: Array<{
    readonly waitStateId: string;
    readonly kind: "approval";
    readonly approvalId: string;
    readonly toolName: string;
    readonly createdAt: string;
  }>;
  readonly artifacts: LocalHarnessArtifact[];
  readonly eventCursor: number;
}

export interface LocalHarnessResult {
  readonly status: RunStatus;
  readonly rootDir: string;
  readonly eventsPath: string;
  readonly statePath: string;
  readonly transcriptPath: string;
  readonly artifacts: LocalHarnessArtifact[];
  readonly approvals: LocalApprovalRecord[];
  readonly eventCount: number;
}

interface LocalToolDescriptor {
  readonly toolId: string;
  readonly displayName: string;
  readonly risk: ToolApprovalRisk;
  readonly sideEffects: string[];
  readonly approvalRequired: boolean;
}

interface LocalToolExecution {
  readonly toolId: string;
  readonly status: "allowed" | "approval_required" | "approved" | "rejected" | "completed";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly approvalId?: string;
}

interface LocalApprovalRecord {
  readonly approvalId: string;
  readonly toolName: string;
  readonly risk: ToolApprovalRisk;
  readonly requestedAction: string;
  readonly decision: LocalApprovalDecision;
}

interface LocalHarnessContext {
  readonly rootDir: string;
  readonly eventsPath: string;
  readonly statePath: string;
  readonly transcriptPath: string;
  readonly artifactsDir: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly orgId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly runnerId: string;
  readonly objective: string;
  readonly agentRole: string;
  readonly userAnswer: string;
  readonly previewDecision: LocalApprovalDecision;
  readonly now: () => string;
  seq: number;
}

const LOCAL_SOURCE = { kind: "worker" as const, name: "agent-runtime.local-harness", version: "0.1.0" };

const LOCAL_TOOLS: readonly LocalToolDescriptor[] = [
  {
    toolId: "communication.ask_user_question",
    displayName: "Ask user question",
    risk: "low",
    sideEffects: ["contact_user"],
    approvalRequired: false
  },
  {
    toolId: "artifact.create",
    displayName: "Create artifact",
    risk: "low",
    sideEffects: ["write"],
    approvalRequired: false
  },
  {
    toolId: "preview.register_static_site",
    displayName: "Register static preview site",
    risk: "medium",
    sideEffects: ["publish", "write"],
    approvalRequired: true
  }
];

export async function runLocalHarnessScenario(options: LocalHarnessOptions): Promise<LocalHarnessResult> {
  const context = buildContext(options);
  await prepareRoot(context);

  const managerAgentId = "agent-manager-001";
  const specialistAgentId = `agent-${slugify(context.agentRole)}-001`;
  const approvalId = `approval-${context.runId}-preview-001`;
  const createdAt = context.now();
  const tools: LocalToolExecution[] = [];
  const approvals: LocalApprovalRecord[] = [];
  const waitStates: LocalHarnessState["waitStates"] = [];
  const artifacts: LocalHarnessArtifact[] = [];

  await transcript(context, `User objective: ${context.objective}`);
  await transcript(context, `Runner ${context.runnerId} booted in resident-dev mode for ${context.workspaceId}.`);
  await putStatus(context, "planning", "Manager agent is decomposing the objective.", 0.1);

  await transcript(context, "Manager agent: I will create a specialist, confirm constraints, and produce a report plus preview artifact if approved.");
  await transcript(context, `${context.agentRole}: What constraints should I follow before publishing anything user-visible?`);
  tools.push({
    toolId: "communication.ask_user_question",
    status: "completed",
    startedAt: createdAt,
    completedAt: context.now()
  });
  await transcript(context, `User answer: ${context.userAnswer}`);

  await putStatus(context, "running", `${context.agentRole} is preparing the workspace plan and artifacts.`, 0.35);

  const previewTool = requireTool("preview.register_static_site");
  tools.push({
    toolId: previewTool.toolId,
    status: "approval_required",
    startedAt: context.now(),
    approvalId
  });
  approvals.push({
    approvalId,
    toolName: previewTool.toolId,
    risk: previewTool.risk,
    requestedAction: "Publish a local static website artifact and reserve a preview subdomain label.",
    decision: context.previewDecision
  });

  await putStatus(context, "waiting_for_approval", "Preview publishing requires approval before registration.", 0.5);
  await putApprovalRequest(context, approvalId);

  if (context.previewDecision === "pending") {
    waitStates.push({
      waitStateId: `wait-${approvalId}`,
      kind: "approval",
      approvalId,
      toolName: previewTool.toolId,
      createdAt: context.now()
    });
    await transcript(context, "Runner entered an approval wait state. No preview or artifact publish occurred yet.");
    const state = buildState(context, "waiting_for_approval", managerAgentId, specialistAgentId, tools, approvals, waitStates, artifacts);
    await writeState(context, state);
    return buildResult(context, state);
  }

  await putApprovalDecision(context, approvalId, context.previewDecision);

  const previewExecution = tools.find((tool) => tool.approvalId === approvalId);
  if (previewExecution) {
    tools[tools.indexOf(previewExecution)] = {
      ...previewExecution,
      status: context.previewDecision === "approved" ? "approved" : "rejected",
      completedAt: context.now()
    };
  }

  await putStatus(context, "running", "Approval decision received; creating permitted artifacts.", 0.65);

  const reportArtifact = await writeReportArtifact(context, context.previewDecision);
  artifacts.push(reportArtifact);
  tools.push({
    toolId: "artifact.create",
    status: "completed",
    startedAt: context.now(),
    completedAt: context.now()
  });
  await putArtifactEvent(context, reportArtifact);

  if (context.previewDecision === "approved") {
    const siteArtifact = await writeWebsiteArtifact(context);
    artifacts.push(siteArtifact);
    await putArtifactEvent(context, siteArtifact);
    await transcript(context, `${context.agentRole}: Preview published at ${siteArtifact.previewUrl}.`);
  } else {
    await transcript(context, `${context.agentRole}: Preview publishing was rejected, so I produced the report artifact only.`);
  }

  await putStatus(context, "archiving", "Artifacts and local runner state are being finalized.", 0.9);
  await putStatus(context, "succeeded", "Local resident-runner scenario completed.", 1);
  await transcript(context, "Manager agent: Work complete. The run state, events, transcript, and artifacts are available for inspection.");

  const state = buildState(context, "succeeded", managerAgentId, specialistAgentId, tools, approvals, waitStates, artifacts);
  await writeState(context, state);
  return buildResult(context, state);
}

export async function inspectLocalHarness(rootDir: string): Promise<{
  readonly state: LocalHarnessState;
  readonly events: CanonicalEventEnvelope[];
}> {
  const absoluteRoot = resolve(rootDir);
  const state = JSON.parse(await readFile(join(absoluteRoot, "runner-state.json"), "utf8")) as LocalHarnessState;
  const rawEvents = await readFile(join(absoluteRoot, "events.ndjson"), "utf8");
  const events = rawEvents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CanonicalEventEnvelope);
  return { state, events };
}

function buildContext(options: LocalHarnessOptions): LocalHarnessContext {
  const runId = options.runId ?? `run-local-${Date.now()}`;
  const rootDir = resolve(options.rootDir);
  const agentRole = options.agentRole ?? "Product Builder Agent";
  return {
    rootDir,
    eventsPath: join(rootDir, "events.ndjson"),
    statePath: join(rootDir, "runner-state.json"),
    transcriptPath: join(rootDir, "transcript.md"),
    artifactsDir: join(rootDir, "artifacts"),
    userId: options.userId ?? "user-local-001",
    workspaceId: options.workspaceId ?? "workspace-local-001",
    orgId: options.orgId ?? "org-local-001",
    runId,
    taskId: options.taskId ?? `task-${runId}`,
    runnerId: options.runnerId ?? "runner-local-001",
    objective: options.objective,
    agentRole,
    userAnswer: options.userAnswer ?? "Use approved public information, keep the update concise, and ask before publishing.",
    previewDecision: options.previewDecision ?? "approved",
    now: options.now ?? (() => new Date().toISOString()),
    seq: 0
  };
}

async function prepareRoot(context: LocalHarnessContext): Promise<void> {
  await mkdir(context.rootDir, { recursive: true });
  await mkdir(context.artifactsDir, { recursive: true });
  await writeFile(context.eventsPath, "");
  await writeFile(context.transcriptPath, `# Local Agent Harness Transcript\n\nRun: ${context.runId}\n\n`);
}

async function putStatus(
  context: LocalHarnessContext,
  status: RunStatus,
  message: string,
  progress: number
): Promise<void> {
  await putEvent(context, buildRunStatusEvent({
    id: eventId(context, nextSeq(context)),
    seq: context.seq,
    createdAt: context.now(),
    orgId: context.orgId,
    userId: context.userId,
    workspaceId: context.workspaceId,
    runId: context.runId,
    taskId: context.taskId,
    source: LOCAL_SOURCE,
    status,
    workerClass: "agent-code",
    message,
    progress
  }));
}

async function putApprovalRequest(context: LocalHarnessContext, approvalId: string): Promise<void> {
  await putEvent(context, buildToolApprovalEvent({
    ...baseEventInput(context),
    id: eventId(context, nextSeq(context)),
    seq: context.seq,
    approvalId,
    kind: "request",
    toolName: "preview.register_static_site",
    risk: "medium",
    requestedAction: "Publish a static website preview artifact and reserve a preview URL.",
    argumentsPreview: {
      requestedLabel: previewLabel(context.objective),
      workspaceId: context.workspaceId,
      artifactKind: "website"
    },
    expiresAt: addMinutes(context.now(), 15)
  }));
}

async function putApprovalDecision(
  context: LocalHarnessContext,
  approvalId: string,
  decision: Exclude<LocalApprovalDecision, "pending">
): Promise<void> {
  await putEvent(context, buildToolApprovalEvent({
    ...baseEventInput(context),
    id: eventId(context, nextSeq(context)),
    seq: context.seq,
    approvalId,
    kind: "decision",
    decision,
    decidedBy: context.userId,
    decidedAt: context.now(),
    reason: decision === "approved" ? "Approved by local harness user." : "Rejected by local harness user."
  }));
}

async function putArtifactEvent(context: LocalHarnessContext, artifact: LocalHarnessArtifact): Promise<void> {
  await putEvent(context, buildArtifactCreatedEvent({
    ...baseEventInput(context),
    id: eventId(context, nextSeq(context)),
    seq: context.seq,
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    name: artifact.name,
    uri: artifact.uri,
    contentType: artifact.kind === "website" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
    previewUrl: artifact.previewUrl,
    metadata: {
      localPath: artifact.path,
      runnerMode: "resident-dev"
    }
  }));
}

async function putEvent(context: LocalHarnessContext, event: CanonicalEventEnvelope): Promise<void> {
  await appendFile(context.eventsPath, `${JSON.stringify(event)}\n`);
}

function baseEventInput(context: LocalHarnessContext): {
  readonly createdAt: string;
  readonly orgId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly source: typeof LOCAL_SOURCE;
} {
  return {
    createdAt: context.now(),
    orgId: context.orgId,
    userId: context.userId,
    workspaceId: context.workspaceId,
    runId: context.runId,
    taskId: context.taskId,
    source: LOCAL_SOURCE
  };
}

async function writeReportArtifact(
  context: LocalHarnessContext,
  previewDecision: LocalApprovalDecision
): Promise<LocalHarnessArtifact> {
  const artifactId = `artifact-${context.taskId}-report`;
  const path = join(context.artifactsDir, artifactId, "report.md");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [
    "# Local Agent Harness Report",
    "",
    `Objective: ${context.objective}`,
    `Agent role: ${context.agentRole}`,
    `User constraints: ${context.userAnswer}`,
    `Preview decision: ${previewDecision}`,
    "",
    "## Work Performed",
    "",
    "- Booted a local resident user runner.",
    "- Registered manager and specialist logical agents.",
    "- Asked the user a constraint question.",
    "- Required approval before preview publishing.",
    "- Emitted canonical run, approval, and artifact events.",
    "",
    "## Next Runtime Work",
    "",
    "- Replace deterministic tool implementations with policy-gated adapters.",
    "- Add real inbox/wake timer processing.",
    "- Add snapshot restore and duplicate-event replay tests.",
    ""
  ].join("\n"));
  return {
    artifactId,
    kind: "report",
    name: "Local agent harness report",
    path,
    uri: pathToFileURL(path).toString()
  };
}

async function writeWebsiteArtifact(context: LocalHarnessContext): Promise<LocalHarnessArtifact> {
  const label = previewLabel(context.objective);
  const artifactId = `artifact-${context.taskId}-preview`;
  const path = join(context.artifactsDir, artifactId, "index.html");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `  <title>${escapeHtml(context.agentRole)} Preview</title>`,
    "  <style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.5;color:#111}main{max-width:760px}code{background:#eee;padding:2px 4px}</style>",
    "</head>",
    "<body>",
    "  <main>",
    `    <h1>${escapeHtml(context.agentRole)} Preview</h1>`,
    `    <p>${escapeHtml(context.objective)}</p>`,
    "    <p>This local artifact proves the runner can create a website artifact after an approval gate.</p>",
    `    <p>Requested label: <code>${escapeHtml(label)}</code></p>`,
    "  </main>",
    "</body>",
    "</html>",
    ""
  ].join("\n"));
  return {
    artifactId,
    kind: "website",
    name: `${context.agentRole} preview site`,
    path,
    uri: pathToFileURL(path).toString(),
    previewUrl: `https://${label}.preview.solo-ceo.ai`
  };
}

function buildState(
  context: LocalHarnessContext,
  status: RunStatus,
  managerAgentId: string,
  specialistAgentId: string,
  tools: LocalToolExecution[],
  approvals: LocalApprovalRecord[],
  waitStates: LocalHarnessState["waitStates"],
  artifacts: LocalHarnessArtifact[]
): LocalHarnessState {
  const waiting = status === "waiting_for_approval";
  const taskStatus = waiting ? "waiting_for_approval" : status === "succeeded" ? "succeeded" : "running";
  return {
    schemaVersion: "local-harness.v1",
    runner: {
      runnerId: context.runnerId,
      mode: "resident-dev",
      status: waiting ? "waiting" : status === "succeeded" ? "completed" : "ready",
      lastHeartbeatAt: context.now()
    },
    run: {
      runId: context.runId,
      taskId: context.taskId,
      status,
      objective: context.objective
    },
    agents: [
      {
        agentInstanceId: managerAgentId,
        role: "Manager Agent",
        profileId: "manager-agent",
        profileVersion: "local-dev",
        status: status === "succeeded" ? "succeeded" : waiting ? "waiting_for_approval" : "running",
        activeTaskIds: [context.taskId]
      },
      {
        agentInstanceId: specialistAgentId,
        role: context.agentRole,
        profileId: slugify(context.agentRole),
        profileVersion: "local-dev",
        status: status === "succeeded" ? "succeeded" : waiting ? "waiting_for_approval" : "running",
        activeTaskIds: [context.taskId]
      }
    ],
    tasks: [
      {
        taskId: context.taskId,
        assignedAgentInstanceId: specialistAgentId,
        title: context.objective,
        status: taskStatus
      }
    ],
    tools,
    approvals,
    waitStates,
    artifacts,
    eventCursor: context.seq
  };
}

async function writeState(context: LocalHarnessContext, state: LocalHarnessState): Promise<void> {
  await writeFile(context.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function buildResult(context: LocalHarnessContext, state: LocalHarnessState): LocalHarnessResult {
  return {
    status: state.run.status,
    rootDir: context.rootDir,
    eventsPath: context.eventsPath,
    statePath: context.statePath,
    transcriptPath: context.transcriptPath,
    artifacts: state.artifacts,
    approvals: state.approvals,
    eventCount: state.eventCursor
  };
}

async function transcript(context: LocalHarnessContext, line: string): Promise<void> {
  await appendFile(context.transcriptPath, `- ${line}\n`);
}

function nextSeq(context: LocalHarnessContext): number {
  context.seq += 1;
  return context.seq;
}

function eventId(context: LocalHarnessContext, seq: number): string {
  return `evt-${context.runId}-${String(seq).padStart(6, "0")}`;
}

function requireTool(toolId: string): LocalToolDescriptor {
  const tool = LOCAL_TOOLS.find((item) => item.toolId === toolId);
  if (!tool) {
    throw new Error(`Unknown local tool: ${toolId}`);
  }
  return tool;
}

function previewLabel(objective: string): string {
  const slug = slugify(objective)
    .split("-")
    .filter((part) => part.length > 2)
    .slice(0, 4)
    .join("-");
  return slug || "agent-preview";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "agent";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function addMinutes(isoDate: string, minutes: number): string {
  const millis = Date.parse(isoDate);
  if (Number.isNaN(millis)) {
    return isoDate;
  }
  return new Date(millis + minutes * 60_000).toISOString();
}

export function renderLocalHarnessSummary(result: LocalHarnessResult): string {
  return [
    `status=${result.status}`,
    `root=${result.rootDir}`,
    `events=${result.eventsPath}`,
    `state=${result.statePath}`,
    `transcript=${result.transcriptPath}`,
    `artifacts=${result.artifacts.length}`,
    `approvals=${result.approvals.map((approval) => `${approval.approvalId}:${approval.decision}`).join(",") || "none"}`
  ].join("\n");
}

export function renderInspection(state: LocalHarnessState, events: CanonicalEventEnvelope[]): string {
  return [
    `runner=${state.runner.runnerId}`,
    `runnerStatus=${state.runner.status}`,
    `run=${state.run.runId}`,
    `runStatus=${state.run.status}`,
    `agents=${state.agents.length}`,
    `tasks=${state.tasks.length}`,
    `waitStates=${state.waitStates.length}`,
    `artifacts=${state.artifacts.length}`,
    `events=${events.length}`,
    `eventTypes=${[...new Set(events.map((event) => event.type))].join(",")}`
  ].join("\n");
}
