import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ResidentRunner, residentRunnerConfigFromPartial, type ResidentAdapterKind, type ResidentAgentProfile, type ResidentWakeRequest } from "./resident-runner.js";

const runner = new ResidentRunner(residentRunnerConfigFromPartial({
  rootDir: process.env.AGENTS_RUNNER_ROOT ?? "/runner",
  orgId: process.env.ORG_ID ?? "org-local-001",
  userId: process.env.USER_ID ?? "user-local-001",
  workspaceId: process.env.WORKSPACE_ID ?? "workspace-local-001",
  runnerId: process.env.RUNNER_ID ?? "runner-local-001",
  runnerSessionId: process.env.RUNNER_SESSION_ID ?? `session-${Date.now()}`,
  adapterKind: residentAdapterKindFromEnv(),
  hermesCommand: process.env.HERMES_COMMAND ?? "hermes"
}));

await runner.initialize(defaultProfilesFromEnvironment());

const port = Number(process.env.PORT ?? "8787");
const token = process.env.RUNNER_API_TOKEN;
if (process.env.AGENTS_RUNTIME_MODE === "ecs-resident" && !token) {
  throw new Error("RUNNER_API_TOKEN is required when AGENTS_RUNTIME_MODE=ecs-resident.");
}

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
    if (!authorize(request)) {
      return json(response, 401, { error: "Unauthorized" });
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
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

function authorize(request: IncomingMessage): boolean {
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
      agentId: process.env.AGENT_ID ?? "agent-default",
      profileId: process.env.AGENT_PROFILE_ID ?? "default-resident-agent",
      profileVersion: process.env.AGENT_PROFILE_VERSION ?? "local-dev",
      role: process.env.AGENT_ROLE ?? "Resident Agent",
      provider: providerFromEnv(),
      model: process.env.AGENTS_MODEL,
      toolsets: process.env.HERMES_TOOLSETS ?? "file,terminal,web",
      tenant: {
        orgId: process.env.ORG_ID ?? "org-local-001",
        userId: process.env.USER_ID ?? "user-local-001",
        workspaceId: process.env.WORKSPACE_ID ?? "workspace-local-001"
      }
    }
  ];
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

function residentAdapterKindFromEnv(): ResidentAdapterKind {
  const adapter = process.env.AGENTS_RESIDENT_ADAPTER;
  if (adapter && adapter !== "hermes-cli") {
    throw new Error(`Unsupported resident adapter: ${adapter}. Resident runners require AGENTS_RESIDENT_ADAPTER=hermes-cli.`);
  }
  return "hermes-cli";
}
