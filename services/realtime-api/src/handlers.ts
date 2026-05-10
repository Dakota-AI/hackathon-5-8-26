import type { RealtimeSubscriptionStore } from "./ports.js";
import { DynamoRealtimeStore } from "./subscriptions.js";
export { authorizerHandler } from "./auth.js";

interface WebSocketEvent {
  readonly body?: string | null;
  readonly requestContext: {
    readonly connectionId?: string;
    readonly domainName?: string;
    readonly stage?: string;
    readonly routeKey?: string;
    readonly authorizer?: Record<string, unknown>;
  };
}

interface WebSocketResponse {
  readonly statusCode: number;
  readonly body?: string;
}

export async function connectHandler(event: WebSocketEvent): Promise<WebSocketResponse> {
  return handleConnect(event, DynamoRealtimeStore.fromEnvironment(), () => new Date().toISOString());
}

export async function disconnectHandler(event: WebSocketEvent): Promise<WebSocketResponse> {
  return handleDisconnect(event, DynamoRealtimeStore.fromEnvironment());
}

export async function defaultHandler(event: WebSocketEvent): Promise<WebSocketResponse> {
  return handleDefault(event, DynamoRealtimeStore.fromEnvironment());
}

export async function handleConnect(event: WebSocketEvent, store: RealtimeSubscriptionStore, now: () => string): Promise<WebSocketResponse> {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const userId = stringContext(event, "userId");
  const email = stringContext(event, "email");

  if (!connectionId || !domainName || !stage || !userId) {
    return json(401, { error: "unauthorized" });
  }

  await store.saveConnection({ connectionId, userId, email, domainName, stage, connectedAt: now() });
  return json(200, { ok: true, connectionId });
}

export async function handleDisconnect(event: WebSocketEvent, store: RealtimeSubscriptionStore): Promise<WebSocketResponse> {
  const connectionId = event.requestContext.connectionId;
  if (connectionId) {
    await store.deleteConnection(connectionId);
  }
  return json(200, { ok: true });
}

export async function handleDefault(event: WebSocketEvent, store: RealtimeSubscriptionStore): Promise<WebSocketResponse> {
  const connectionId = event.requestContext.connectionId;
  const userId = stringContext(event, "userId");
  if (!connectionId || !userId) {
    return json(401, { error: "unauthorized" });
  }

  let message: Record<string, unknown>;
  try {
    message = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = message.action;
  if (action === "ping") {
    return json(200, { type: "pong" });
  }

  if (action === "subscribeRun") {
    const workspaceId = requiredString(message.workspaceId);
    const runId = requiredString(message.runId);
    if (!workspaceId || !runId) {
      return json(400, { error: "workspaceId_and_runId_required" });
    }
    await store.subscribeRun({ connectionId, workspaceId, runId, userId });
    return json(200, { ok: true, subscribed: { workspaceId, runId } });
  }

  if (action === "unsubscribeRun") {
    const workspaceId = requiredString(message.workspaceId);
    const runId = requiredString(message.runId);
    if (!workspaceId || !runId) {
      return json(400, { error: "workspaceId_and_runId_required" });
    }
    await store.unsubscribeRun({ connectionId, workspaceId, runId });
    return json(200, { ok: true, unsubscribed: { workspaceId, runId } });
  }

  return json(400, { error: "unsupported_action", action });
}

function stringContext(event: WebSocketEvent, name: string): string | undefined {
  const value = event.requestContext.authorizer?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function json(statusCode: number, body: unknown): WebSocketResponse {
  return { statusCode, body: JSON.stringify(body) };
}
