import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ResidentRunner, type ResidentAgentProfile, type ResidentUserEngagementRequest, type ResidentWakeRequest } from "./resident-runner.js";

await bootstrapHermesHome();

const runner = ResidentRunner.fromEnvironment();

await runner.initialize(defaultProfilesFromEnvironment());

const port = Number(process.env.PORT ?? "8787");
const token = process.env.RUNNER_API_TOKEN;
if (process.env.AGENTS_RUNTIME_MODE === "ecs-resident" && !token) {
  throw new Error("RUNNER_API_TOKEN is required when AGENTS_RUNTIME_MODE=ecs-resident.");
}
if (!process.env.AGENTS_USER_ENGAGEMENT_TOKEN) {
  process.env.AGENTS_USER_ENGAGEMENT_TOKEN = `engagement-${randomUUID()}`;
}
const engagementToken = process.env.AGENTS_USER_ENGAGEMENT_TOKEN;

class HttpError extends Error {
  public constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

const MAX_JSON_BODY_BYTES = 1_048_576;

interface HermesAuthUpload {
  readonly authJson?: unknown;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (!authorize(request, url.pathname)) {
      return json(response, 401, { error: "Unauthorized" });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { status: "ok", runner: runner.getState().runner });
    }
    if (request.method === "GET" && url.pathname === "/state") {
      return json(response, 200, runner.getState());
    }
    if (request.method === "GET" && url.pathname === "/events") {
      return json(response, 200, { events: await runner.getEvents() });
    }
    if (request.method === "POST" && url.pathname === "/agents") {
      const profile = await readJson<ResidentAgentProfile>(request);
      const agent = await runner.registerAgent(profile);
      return json(response, 201, { agent });
    }
    if (request.method === "POST" && url.pathname === "/credentials/hermes-auth") {
      if (!token) {
        return json(response, 403, { error: "Forbidden", message: "RUNNER_API_TOKEN is required to upload Hermes credentials." });
      }
      await storeHermesAuth(await readJson<HermesAuthUpload>(request));
      return json(response, 200, { status: "stored" });
    }
    if (request.method === "POST" && url.pathname === "/wake") {
      const wake = await readJson<ResidentWakeRequest>(request);
      const result = await runner.wake(wake);
      return json(response, 200, result);
    }
    if (request.method === "POST" && (url.pathname === "/engagement/notify" || url.pathname === "/engagement/call")) {
      const payload = await readJson<Omit<ResidentUserEngagementRequest, "kind"> & { readonly kind?: ResidentUserEngagementRequest["kind"] }>(request);
      try {
        const result = await runner.recordUserEngagement({
          ...payload,
          kind: url.pathname.endsWith("/call") ? "call" : "notify"
        });
        return json(response, 202, result);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : String(error));
      }
    }
    if (request.method === "POST" && url.pathname === "/shutdown") {
      json(response, 202, { status: "shutting_down" });
      server.close();
      return;
    }

    return json(response, 404, { error: "NotFound" });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(response, error.statusCode, { error: error.statusCode === 400 ? "BadRequest" : "RequestRejected", message: error.message });
    }
    return json(response, 500, {
      error: "InternalError",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, "0.0.0.0");
console.log(JSON.stringify({ status: "resident-runner-listening", port, runner: runner.getState().runner }));

await once(server, "close");

function authorize(request: IncomingMessage, pathname: string): boolean {
  if (pathname === "/engagement/notify" || pathname === "/engagement/call") {
    return request.headers.authorization === `Bearer ${engagementToken}`;
  }
  if (!token) {
    return true;
  }
  return request.headers.authorization === `Bearer ${token}`;
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const contentType = request.headers["content-type"];
  if (contentType && !String(contentType).toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Expected application/json request body.");
  }
  let raw = "";
  let bytes = 0;
  for await (const chunk of request) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, "JSON request body is too large.");
    }
    raw += text;
  }
  try {
    return JSON.parse(raw || "{}") as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function storeHermesAuth(payload: HermesAuthUpload): Promise<void> {
  const serialized = serializeHermesAuth(payload.authJson);
  const hermesHome = process.env.HERMES_HOME ?? join(process.env.AGENTS_RUNNER_ROOT ?? "/runner", "hermes");
  await mkdir(hermesHome, { recursive: true });
  const authPath = join(hermesHome, "auth.json");
  await writeFile(authPath, serialized, { mode: 0o600 });
  await chmod(authPath, 0o600);
}

async function bootstrapHermesHome(): Promise<void> {
  const hermesHome = process.env.HERMES_HOME ?? join(process.env.AGENTS_RUNNER_ROOT ?? "/runner", "hermes");
  await mkdir(hermesHome, { recursive: true });
  const configPath = join(hermesHome, "config.yaml");
  await writeFile(configPath, renderDefaultHermesConfig(), { mode: 0o600 });
  await chmod(configPath, 0o600);

  if (process.env.HERMES_AUTH_JSON_BOOTSTRAP) {
    const authPath = join(hermesHome, "auth.json");
    await writeFile(authPath, serializeHermesAuth(process.env.HERMES_AUTH_JSON_BOOTSTRAP), { mode: 0o600 });
    await chmod(authPath, 0o600);
  }
}

function renderDefaultHermesConfig(): string {
  const provider = process.env.AGENTS_MODEL_PROVIDER ?? "openai-codex";
  const model = process.env.AGENTS_MODEL && process.env.AGENTS_MODEL.trim().length > 0 ? process.env.AGENTS_MODEL : "gpt-5.5";
  const maxTurns = Number(process.env.AGENTS_HERMES_MAX_TURNS ?? "8");
  const toolsets = (process.env.HERMES_TOOLSETS ?? "file,terminal,web,delegation,skills,session_search")
    .split(",")
    .map((toolset) => toolset.trim())
    .filter(Boolean);
  return [
    "model:",
    `  provider: ${yamlString(provider)}`,
    `  default: ${yamlString(model)}`,
    "delegation:",
    `  provider: ${yamlString(provider)}`,
    `  model: ${yamlString(model)}`,
    "agent:",
    `  max_turns: ${Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 8}`,
    "terminal:",
    "  backend: local",
    "approvals:",
    "  mode: manual",
    "platform_toolsets:",
    "  cli:",
    ...toolsets.map((toolset) => `    - ${yamlString(toolset)}`),
    "display:",
    "  tool_progress: false",
    "  show_cost: false",
    ""
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function serializeHermesAuth(value: unknown): string {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new HttpError(400, "authJson string must contain valid JSON.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "authJson must be a JSON object or a stringified JSON object.");
  }
  return `${JSON.stringify(parsed)}\n`;
}

function defaultProfilesFromEnvironment(): ResidentAgentProfile[] {
  if (process.env.AGENTS_RESIDENT_PROFILES_JSON) {
    return JSON.parse(process.env.AGENTS_RESIDENT_PROFILES_JSON) as ResidentAgentProfile[];
  }
  return [
    {
      agentId: process.env.AGENT_ID ?? "agent-delegator-codex-55",
      profileId: process.env.AGENT_PROFILE_ID ?? "codex-55-agent-delegator",
      profileVersion: process.env.AGENT_PROFILE_VERSION ?? "codex-55-agent-delegator-v1",
      role: process.env.AGENT_ROLE ?? "Agent Delegator",
      provider: providerFromEnv(),
      model: process.env.AGENTS_MODEL && process.env.AGENTS_MODEL.trim().length > 0 ? process.env.AGENTS_MODEL : "gpt-5.5",
      toolsets: process.env.HERMES_TOOLSETS ?? "web",
      promptTemplate: process.env.AGENT_PROMPT_TEMPLATE ?? defaultDelegatorPromptTemplate(),
      timeoutMs: positiveNumberFromEnv("AGENTS_RESIDENT_AGENT_TIMEOUT_MS"),
      tenant: {
        orgId: process.env.ORG_ID ?? "org-local-001",
        userId: process.env.USER_ID ?? "user-local-001",
        workspaceId: process.env.WORKSPACE_ID ?? "workspace-local-001"
      }
    }
  ];
}

function defaultDelegatorPromptTemplate(): string {
  return [
    "You are the user's Codex 5.5 resident Agent Delegator inside Agents Cloud.",
    "Decompose the objective, delegate focused work to specialist subagents when useful, synthesize their results, and keep the user-facing answer concise and action-oriented.",
    "When a durable new specialist is needed, describe the profile to create and register it through the platform agent APIs rather than only discussing it.",
    "Make logical agents visible as dashboard agent instances by using the resident runner agent registry and delegated-agent events.",
    "When you need to contact the user, use `agents-cloud-user notify --body \"...\"` for a notification-style message or `agents-cloud-user call --summary \"...\"` to request a phone call. Do not fake this by only mentioning that you would contact the user.",
    "Do not emit ordinary tool-call telemetry. Only when you create/delegate work, request or revise an agent profile, publish a webpage, or record review feedback, include one fenced agents-cloud-event JSON block with an allowlisted type such as agent.delegated, agent.profile.requested, agent.profile.revision_proposed, work_item.created, work_item.assigned, review.session.created, review.feedback.recorded, or webpage.published.",
    "Tenant boundary: org={{orgId}}, user={{userId}}, workspace={{workspaceId}}, runner={{runnerId}}.",
    "Objective: {{objective}}",
    "Run: {{runId}} Task: {{taskId}}"
  ].join("\n");
}

function positiveNumberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function providerFromEnv(): ResidentAgentProfile["provider"] {
  const provider = process.env.AGENTS_MODEL_PROVIDER;
  if (
    provider === "auto" ||
    provider === "openrouter" ||
    provider === "openai-codex" ||
    provider === "copilot" ||
    provider === "anthropic" ||
    provider === "nous" ||
    provider === "custom"
  ) {
    return provider;
  }
  return undefined;
}
