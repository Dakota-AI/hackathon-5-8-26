import { fetchAuthSession } from "aws-amplify/auth";

export type ControlApiHealth = {
  configured: boolean;
  baseUrl?: string;
};

export type CreatedRun = {
  runId: string;
  workspaceId: string;
  taskId: string;
  status: string;
  executionArn?: string;
};

export type RunEvent = {
  runId: string;
  seq: number;
  type: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export function getControlApiHealth(): ControlApiHealth {
  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL;
  return {
    configured: Boolean(baseUrl),
    baseUrl: baseUrl || undefined
  };
}

export async function createControlApiRun(input: {
  workspaceId: string;
  objective: string;
}): Promise<CreatedRun> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();

  const response = await fetch(`${baseUrl}/runs`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      objective: input.objective,
      idempotencyKey: stableBrowserIdempotencyKey(input.workspaceId, input.objective)
    })
  });

  return parseJsonResponse<CreatedRun>(response);
}

export async function listControlApiRunEvents(runId: string): Promise<RunEvent[]> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();

  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/events?limit=25`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  const body = await parseJsonResponse<{ events: RunEvent[] }>(response);
  return body.events;
}

async function requireIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error("Sign in before creating an Agents Cloud run.");
  }
  return token;
}

function requireControlApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AGENTS_CLOUD_API_URL is not configured.");
  }
  return baseUrl.replace(/\/$/, "");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(body.message || body.error || `Control API request failed with HTTP ${response.status}.`);
  }
  return body;
}

function stableBrowserIdempotencyKey(workspaceId: string, objective: string): string {
  const normalized = `${workspaceId}:${objective.trim().slice(0, 96)}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return `web-${Date.now().toString(36)}-${hash.toString(36)}`;
}
