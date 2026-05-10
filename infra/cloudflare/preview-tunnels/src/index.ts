import { validateTunnelToken } from "./auth.js";
import { extractTunnelIdFromHost, handleTunnelApi, readMetadata, updateTunnelStatus } from "./tunnel-api.js";
import { TunnelSessionDO } from "./tunnel-session.js";
import type { Env } from "./types.js";

export { TunnelSessionDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get("Host") ?? "";

    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        service: "agents-cloud-preview-tunnels",
        version: "0.1.0",
        timestamp: new Date().toISOString()
      });
    }

    if (host === `${env.HOST_PREFIX ?? "preview"}.${env.BASE_DOMAIN}` || url.pathname.startsWith("/api/")) {
      return handleTunnelApi(request, env);
    }

    if (url.pathname === "/connect") {
      return handleRunnerConnect(request, env);
    }

    const tunnelId = extractTunnelIdFromHost(host, env);
    if (tunnelId) {
      return handleViewerRequest(request, env, tunnelId);
    }

    return new Response("Not Found", { status: 404 });
  }
};

async function handleRunnerConnect(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }
  const url = new URL(request.url);
  const tunnelToken = url.searchParams.get("tunnel_token");
  if (!tunnelToken) {
    return new Response("Missing tunnel_token", { status: 400 });
  }
  let claims;
  try {
    claims = await validateTunnelToken(tunnelToken, env.TUNNEL_JWT_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid tunnel token";
    return new Response(`Unauthorized: ${message}`, { status: 401 });
  }
  const metadata = await readMetadata(env, claims.tunnelId);
  if (!metadata || metadata.previewHost !== claims.previewHost || metadata.port !== claims.allowedPort) {
    return new Response("Tunnel not found", { status: 404 });
  }
  await updateTunnelStatus(env, claims.tunnelId, "connected");
  const stub = env.TUNNEL_SESSIONS.get(env.TUNNEL_SESSIONS.idFromName(claims.tunnelId));
  const headers = new Headers(request.headers);
  headers.set("X-Connection-Type", "runner");
  headers.set("X-Tunnel-ID", claims.tunnelId);
  headers.set("X-Preview-Host", claims.previewHost);
  headers.set("X-Tunnel-Expires-At", String(claims.exp));
  return stub.fetch(new Request(request.url, { method: request.method, headers }));
}

async function handleViewerRequest(request: Request, env: Env, tunnelId: string): Promise<Response> {
  const metadata = await readMetadata(env, tunnelId);
  if (!metadata) {
    return new Response("Preview tunnel not found or expired", { status: 404 });
  }
  const stub = env.TUNNEL_SESSIONS.get(env.TUNNEL_SESSIONS.idFromName(tunnelId));
  const headers = new Headers(request.headers);
  headers.set("X-Connection-Type", "viewer");
  headers.set("X-Tunnel-ID", tunnelId);
  headers.set("X-Preview-Host", metadata.previewHost);
  return stub.fetch(new Request(request.url, { method: request.method, headers, body: request.body }));
}
