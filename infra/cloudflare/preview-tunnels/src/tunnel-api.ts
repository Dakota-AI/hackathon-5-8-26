import { authorizeTunnelApi, signTunnelToken } from "./auth.js";
import type { CreateTunnelRequest, CreateTunnelResponse, Env, TunnelClaims, TunnelMetadata } from "./types.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};

export async function handleTunnelApi(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  try {
    if (request.method === "POST" && url.pathname === "/api/tunnels") {
      return withCors(await createTunnel(request, env));
    }
    if (request.method === "GET" && url.pathname === "/api/tunnels") {
      return withCors(await listTunnels(request, env));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/tunnels/")) {
      return withCors(await deleteTunnel(request, env, decodeURIComponent(url.pathname.split("/").pop() ?? "")));
    }
    return withCors(new Response("Not Found", { status: 404 }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal preview tunnel error";
    const status = /Missing bearer|Invalid preview/.test(message) ? 401 : 500;
    return withCors(Response.json({ error: message }, { status }));
  }
}

async function createTunnel(request: Request, env: Env): Promise<Response> {
  const subject = await authorizeTunnelApi(request, env);
  const body = await readJson<CreateTunnelRequest>(request);
  const port = normalizePort(body.port);
  const ttlMinutes = normalizeTtl(body.ttlMinutes, env);
  const tunnelId = buildTunnelId(body);
  const host = `${hostPrefix(env)}-${tunnelId}.${env.BASE_DOMAIN}`;
  const now = Date.now();
  const expiresAt = now + ttlMinutes * 60 * 1000;
  const previewUrl = `https://${host}/`;
  const metadata: TunnelMetadata = {
    tunnelId,
    previewHost: host,
    previewUrl,
    workspaceId: clean(body.workspaceId),
    runId: clean(body.runId),
    taskId: clean(body.taskId),
    agentId: clean(body.agentId),
    label: clean(body.label),
    port,
    createdAt: now,
    expiresAt,
    status: "created"
  };
  await env.TUNNEL_REGISTRY.put(registryKey(tunnelId), JSON.stringify(metadata), { expirationTtl: ttlMinutes * 60 });
  if (metadata.runId) {
    await env.TUNNEL_REGISTRY.put(runKey(metadata.runId, tunnelId), tunnelId, { expirationTtl: ttlMinutes * 60 });
  }
  const claims: TunnelClaims = {
    sub: subject,
    workspaceId: metadata.workspaceId,
    runId: metadata.runId,
    tunnelId,
    previewHost: host,
    allowedPort: port,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expiresAt / 1000)
  };
  const tunnelToken = await signTunnelToken(claims, env.TUNNEL_JWT_SECRET);
  const response: CreateTunnelResponse = {
    tunnelId,
    previewHost: host,
    previewUrl,
    connectUrl: `wss://${hostPrefix(env)}.${env.BASE_DOMAIN}/connect?tunnel_token=${encodeURIComponent(tunnelToken)}`,
    tunnelToken,
    expiresAt: new Date(expiresAt).toISOString()
  };
  return Response.json(response, { status: 201 });
}

async function listTunnels(request: Request, env: Env): Promise<Response> {
  await authorizeTunnelApi(request, env);
  const url = new URL(request.url);
  const runId = clean(url.searchParams.get("runId"));
  if (!runId) return Response.json({ tunnels: [] });
  const prefix = `run:${runId}:tunnel:`;
  const keys = await env.TUNNEL_REGISTRY.list({ prefix, limit: 50 });
  const tunnels: TunnelMetadata[] = [];
  for (const key of keys.keys) {
    const tunnelId = await env.TUNNEL_REGISTRY.get(key.name);
    if (!tunnelId) continue;
    const metadata = await readMetadata(env, tunnelId);
    if (metadata && Date.now() < metadata.expiresAt) tunnels.push(metadata);
  }
  return Response.json({ tunnels });
}

async function deleteTunnel(request: Request, env: Env, tunnelId: string): Promise<Response> {
  await authorizeTunnelApi(request, env);
  const metadata = await readMetadata(env, tunnelId);
  if (metadata?.runId) await env.TUNNEL_REGISTRY.delete(runKey(metadata.runId, tunnelId));
  await env.TUNNEL_REGISTRY.delete(registryKey(tunnelId));
  return Response.json({ deleted: true, tunnelId });
}

export async function readMetadata(env: Env, tunnelId: string): Promise<TunnelMetadata | undefined> {
  const raw = await env.TUNNEL_REGISTRY.get(registryKey(tunnelId));
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as TunnelMetadata;
  if (Date.now() > parsed.expiresAt) {
    await env.TUNNEL_REGISTRY.delete(registryKey(tunnelId));
    return undefined;
  }
  return parsed;
}

export async function updateTunnelStatus(env: Env, tunnelId: string, status: TunnelMetadata["status"]): Promise<void> {
  const metadata = await readMetadata(env, tunnelId);
  if (!metadata) return;
  await env.TUNNEL_REGISTRY.put(registryKey(tunnelId), JSON.stringify({ ...metadata, status }), {
    expirationTtl: Math.max(1, Math.floor((metadata.expiresAt - Date.now()) / 1000))
  });
}

export function extractTunnelIdFromHost(host: string, env: Pick<Env, "BASE_DOMAIN" | "HOST_PREFIX">): string | undefined {
  const normalized = host.split(":")[0]?.toLowerCase() ?? "";
  const suffix = `.${env.BASE_DOMAIN.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return undefined;
  const label = normalized.slice(0, -suffix.length);
  const prefix = `${hostPrefix(env)}-`;
  if (!label.startsWith(prefix)) return undefined;
  const tunnelId = label.slice(prefix.length);
  return /^[a-z0-9][a-z0-9-]{2,80}$/.test(tunnelId) ? tunnelId : undefined;
}

function registryKey(tunnelId: string): string {
  return `tunnel:${tunnelId}`;
}

function runKey(runId: string, tunnelId: string): string {
  return `run:${runId}:tunnel:${tunnelId}`;
}

function hostPrefix(env: Pick<Env, "HOST_PREFIX">): string {
  return (env.HOST_PREFIX?.trim() || "preview").toLowerCase();
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function normalizePort(port: unknown): number {
  const parsed = Number(port ?? 3000);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("Invalid port: must be an integer between 1 and 65535");
  }
  return parsed;
}

function normalizeTtl(ttl: unknown, env: Env): number {
  const fallback = Number(env.DEFAULT_TTL_MINUTES ?? 60);
  const max = Number(env.MAX_TTL_MINUTES ?? 180);
  const parsed = Number(ttl ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), Math.max(1, max));
}

function buildTunnelId(body: CreateTunnelRequest): string {
  const label = slug(body.label ?? body.runId ?? body.taskId ?? "app").slice(0, 32) || "app";
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${label}-${random}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
