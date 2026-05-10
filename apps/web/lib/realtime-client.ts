import type { RunEvent } from "./control-api";

export type RealtimeApiHealth = {
  configured: boolean;
  url?: string;
  mockMode: boolean;
};

export type RealtimeHealthInput = {
  realtimeUrl?: string;
  mockMode?: boolean;
};

export type RunSubscriptionInput = {
  workspaceId: string;
  runId: string;
};

export type RealtimeRunEvent = RunEvent & {
  workspaceId?: string;
};

export function getRealtimeApiHealth(input: RealtimeHealthInput = {}): RealtimeApiHealth {
  const mockMode = input.mockMode ?? process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK === "1";
  const realtimeUrl = input.realtimeUrl ?? process.env.NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL;

  return {
    configured: !mockMode && Boolean(realtimeUrl),
    url: realtimeUrl || undefined,
    mockMode
  };
}

export function requireRealtimeApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_AGENTS_CLOUD_REALTIME_URL is not configured.");
  }
  return url;
}

export function buildRealtimeWebSocketUrl(realtimeUrl: string, idToken: string): string {
  const url = new URL(realtimeUrl);
  url.searchParams.set("token", idToken);
  return url.toString();
}

export function serializeSubscribeRunMessage(input: RunSubscriptionInput): string {
  return JSON.stringify({ action: "subscribeRun", workspaceId: input.workspaceId, runId: input.runId });
}

export function serializeUnsubscribeRunMessage(input: RunSubscriptionInput): string {
  return JSON.stringify({ action: "unsubscribeRun", workspaceId: input.workspaceId, runId: input.runId });
}

export function parseRealtimeRunEvent(message: string): RealtimeRunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const runId = readString(value, "runId");
  const seq = value.seq;
  const type = readString(value, "type");
  const createdAt = readString(value, "createdAt");
  if (!runId || typeof seq !== "number" || !type || !createdAt) {
    return null;
  }

  const event: RealtimeRunEvent = {
    runId,
    seq,
    type,
    createdAt
  };
  const id = readString(value, "eventId") || readString(value, "id");
  const workspaceId = readString(value, "workspaceId");
  const source = readString(value, "source");
  if (id) {
    event.id = id;
  }
  if (workspaceId) {
    event.workspaceId = workspaceId;
  }
  if (source) {
    event.source = source;
  }
  if (isRecord(value.payload)) {
    event.payload = value.payload;
  }
  return event;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
