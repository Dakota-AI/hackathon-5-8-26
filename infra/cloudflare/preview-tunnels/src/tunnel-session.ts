import { DurableObject } from "cloudflare:workers";
import { updateTunnelStatus } from "./tunnel-api.js";
import type { DesktopAttachment, Env, Frame, PendingStream } from "./types.js";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_STREAMS = 100;

export class TunnelSessionDO extends DurableObject<Env> {
  private runnerWs: WebSocket | null = null;
  private readonly streams = new Map<number, PendingStream>();
  private nextStreamId = 1;
  private tunnelId = "";
  private previewHost = "";
  private expiresAt = 0;

  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as DesktopAttachment | null;
      if (attachment?.type === "runner") {
        this.runnerWs = ws;
        this.tunnelId = attachment.tunnelId;
        this.previewHost = attachment.previewHost;
        this.expiresAt = attachment.expiresAt;
      }
    }
  }

  public async fetch(request: Request): Promise<Response> {
    const connectionType = request.headers.get("X-Connection-Type");
    if (connectionType === "runner") return this.handleRunnerConnection(request);
    if (connectionType === "viewer") return this.handleViewerRequest(request);
    return new Response("Invalid tunnel connection type", { status: 400 });
  }

  private handleRunnerConnection(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    this.tunnelId = request.headers.get("X-Tunnel-ID") ?? "";
    this.previewHost = request.headers.get("X-Preview-Host") ?? "";
    this.expiresAt = Number(request.headers.get("X-Tunnel-Expires-At") ?? "0") * 1000;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      type: "runner",
      tunnelId: this.tunnelId,
      previewHost: this.previewHost,
      expiresAt: this.expiresAt
    } satisfies DesktopAttachment);
    if (this.runnerWs) {
      try { this.runnerWs.close(1000, "Replaced by newer runner connection"); } catch {}
    }
    this.runnerWs = server;
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleViewerRequest(request: Request): Promise<Response> {
    if (!this.runnerWs) return new Response("Preview tunnel offline", { status: 502 });
    if (Date.now() > this.expiresAt) return new Response("Preview tunnel expired", { status: 410 });
    if (this.streams.size >= MAX_CONCURRENT_STREAMS) return new Response("Too many concurrent preview requests", { status: 503 });
    if (request.headers.get("Upgrade") === "websocket") {
      return new Response("Preview WebSocket upgrades are not enabled in v0", { status: 501 });
    }
    return this.proxyHttpRequest(request);
  }

  private async proxyHttpRequest(request: Request): Promise<Response> {
    const streamId = this.nextStreamId++;
    const url = new URL(request.url);
    const responsePromise = new Promise<Response>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.streams.delete(streamId);
        reject(new Error("Preview request timeout"));
      }, REQUEST_TIMEOUT_MS);
      this.streams.set(streamId, { id: streamId, resolve, reject, chunks: [], timeout });
    });
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!isHopByHopHeader(key)) headers[key] = value;
    });
    headers["x-agents-cloud-preview-host"] = request.headers.get("Host") ?? "";
    const reqHead: Frame = {
      type: "req_head",
      stream_id: streamId,
      method: request.method,
      path: url.pathname,
      query: url.search.slice(1),
      headers
    };
    try {
      this.runnerWs!.send(JSON.stringify(reqHead));
      if (request.body) {
        const reader = request.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          this.runnerWs!.send(JSON.stringify({
            type: "req_body",
            stream_id: streamId,
            chunk_b64: done ? "" : base64Encode(value),
            last: done
          } satisfies Frame));
          if (done) break;
        }
      } else {
        this.runnerWs!.send(JSON.stringify({ type: "req_body", stream_id: streamId, chunk_b64: "", last: true } satisfies Frame));
      }
    } catch (error) {
      this.streams.delete(streamId);
      return new Response("Preview runner connection failed", { status: 502 });
    }
    try {
      return await responsePromise;
    } catch (error) {
      this.streams.delete(streamId);
      return new Response(error instanceof Error ? error.message : "Preview request failed", { status: 504 });
    }
  }

  public async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let frame: Frame;
    try {
      frame = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    const streamId = frame.stream_id;
    if (!streamId) return;
    if (frame.type === "res_head") this.handleResponseHead(streamId, frame);
    if (frame.type === "res_body") this.handleResponseBody(streamId, frame);
    if (frame.type === "error") this.handleErrorFrame(streamId, frame);
  }

  public async webSocketClose(): Promise<void> {
    this.runnerWs = null;
    if (this.tunnelId) await updateTunnelStatus(this.env, this.tunnelId, "disconnected");
    for (const stream of this.streams.values()) {
      if (stream.timeout) clearTimeout(stream.timeout);
      stream.reject(new Error("Preview runner disconnected"));
    }
    this.streams.clear();
  }

  private handleResponseHead(streamId: number, frame: Frame): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.status = frame.status ?? 200;
    const headers = new Headers();
    for (const [key, value] of Object.entries(frame.headers ?? {})) {
      if (!isHopByHopHeader(key)) headers.set(key, value);
    }
    stream.headers = headers;
  }

  private handleResponseBody(streamId: number, frame: Frame): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    if (frame.chunk_b64) stream.chunks.push(base64Decode(frame.chunk_b64));
    if (!frame.last) return;
    if (stream.timeout) clearTimeout(stream.timeout);
    const body = concat(stream.chunks);
    stream.resolve(new Response(body, { status: stream.status ?? 200, headers: stream.headers }));
    this.streams.delete(streamId);
  }

  private handleErrorFrame(streamId: number, frame: Frame): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    if (stream.timeout) clearTimeout(stream.timeout);
    stream.resolve(new Response(frame.message ?? "Preview runner error", { status: 502 }));
    this.streams.delete(streamId);
  }
}

function isHopByHopHeader(name: string): boolean {
  return new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]).has(name.toLowerCase());
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
