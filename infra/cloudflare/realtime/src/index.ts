import { extractBearerToken, requireRelaySecret, validateCognitoJWT } from "./auth.js";
import { SessionHubDO } from "./session-hub-do.js";
import { UserHubDO } from "./user-hub-do.js";
import { WorkspaceHubDO } from "./workspace-hub-do.js";
import { parseRealtimeEvent } from "./protocol.js";
import type { ClientKind, Env, HealthResponse } from "./types.js";

export { SessionHubDO, UserHubDO, WorkspaceHubDO };

const VERSION = "0.1.0";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return healthResponse();
    }

    if (request.method === "GET" && url.pathname === "/ws") {
      return handleWebSocket(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/internal/events") {
      return handleInternalEvent(request, env);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
};

function healthResponse(): Response {
  const body: HealthResponse = {
    status: "healthy",
    service: "agents-cloud-realtime",
    version: VERSION,
    timestamp: new Date().toISOString()
  };

  return Response.json(body, {
    headers: { "Cache-Control": "no-cache" }
  });
}

async function handleWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return Response.json({ error: "expected_websocket_upgrade" }, { status: 426 });
  }

  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ error: "missing_token" }, { status: 401 });
  }

  let user;
  try {
    user = await validateCognitoJWT(token, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token validation failed";
    return Response.json({ error: "unauthorized", message }, { status: 401 });
  }

  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return Response.json({ error: "workspaceId_required" }, { status: 400 });
  }

  const client = parseClient(url.searchParams.get("client"));
  const runId = url.searchParams.get("runId") ?? undefined;
  const namespace = runId ? env.SESSION_HUBS : env.USER_HUBS;
  const objectName = runId ? sessionObjectName(workspaceId, runId) : userObjectName(user.userId);
  const stub = namespace.get(namespace.idFromName(objectName));

  const headers = new Headers(request.headers);
  headers.set("x-agents-cloud-user-id", user.userId);
  headers.set("x-agents-cloud-user-email", user.email ?? "");
  headers.set("x-agents-cloud-workspace-id", workspaceId);
  headers.set("x-agents-cloud-client", client);
  if (runId) {
    headers.set("x-agents-cloud-run-id", runId);
  }

  return stub.fetch(new Request(request.url, { method: request.method, headers }));
}

async function handleInternalEvent(request: Request, env: Env): Promise<Response> {
  if (!requireRelaySecret(request, env.RELAY_SHARED_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let event;
  try {
    event = parseRealtimeEvent(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid event";
    return Response.json({ error: "invalid_event", message }, { status: 400 });
  }

  const objectName = sessionObjectName(event.workspaceId, event.runId);
  const stub = env.SESSION_HUBS.get(env.SESSION_HUBS.idFromName(objectName));
  return stub.fetch(
    new Request("https://session-hub.internal/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    })
  );
}

function parseClient(value: string | null): ClientKind {
  if (value === "web" || value === "desktop" || value === "mobile") {
    return value;
  }

  return "web";
}

function sessionObjectName(workspaceId: string, runId: string): string {
  return `${workspaceId}:${runId}`;
}

function userObjectName(userId: string): string {
  return `user:${userId}`;
}
