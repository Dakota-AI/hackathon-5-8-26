import { request as httpRequest, type IncomingHttpHeaders } from "node:http";

export interface PreviewTunnelCreateInput {
  readonly apiUrl: string;
  readonly apiToken: string;
  readonly port: number;
  readonly label?: string;
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly ttlMinutes?: number;
}

export interface PreviewTunnelCreateResult {
  readonly tunnelId: string;
  readonly previewHost: string;
  readonly previewUrl: string;
  readonly connectUrl: string;
  readonly tunnelToken: string;
  readonly expiresAt: string;
}

export interface PreviewTunnelAgentOptions {
  readonly connectUrl: string;
  readonly port: number;
  readonly host?: string;
  readonly log?: (message: string) => void;
}

interface Frame {
  readonly type: string;
  readonly stream_id?: number;
  readonly method?: string;
  readonly path?: string;
  readonly query?: string;
  readonly headers?: Record<string, string>;
  readonly chunk_b64?: string;
  readonly last?: boolean;
}

type RuntimeWebSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "close" | "error" | "message", listener: (event: { data?: unknown }) => void, options?: { once?: boolean }): void;
};

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

export async function createPreviewTunnel(input: PreviewTunnelCreateInput): Promise<PreviewTunnelCreateResult> {
  const response = await fetch(input.apiUrl.replace(/\/$/, "") + "/api/tunnels", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      runId: input.runId,
      taskId: input.taskId,
      agentId: input.agentId,
      label: input.label,
      port: input.port,
      ttlMinutes: input.ttlMinutes
    })
  });
  if (!response.ok) {
    throw new Error(`Preview tunnel create failed (${response.status}): ${await response.text()}`);
  }
  return await response.json() as PreviewTunnelCreateResult;
}

export async function runPreviewTunnelAgent(options: PreviewTunnelAgentOptions): Promise<void> {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: RuntimeWebSocketConstructor }).WebSocket;
  if (!WebSocketCtor) throw new Error("Global WebSocket is not available. Run with Node 22+.");
  const targetHost = options.host ?? "127.0.0.1";
  if (targetHost !== "127.0.0.1" && targetHost !== "localhost") {
    throw new Error("Preview tunnel agent only allows 127.0.0.1/localhost targets.");
  }

  const ws = new WebSocketCtor(options.connectUrl);
  const streamHeads = new Map<number, Frame>();
  const pendingBodies = new Map<number, Buffer[]>();

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      options.log?.(`connected ${redactToken(options.connectUrl)}`);
      resolve();
    }, { once: true });
    ws.addEventListener("error", () => reject(new Error("Preview tunnel WebSocket connection failed")), { once: true });
  });

  ws.addEventListener("message", (event) => {
    void handleFrame(ws, parseFrame(event.data), streamHeads, pendingBodies, options.port, targetHost, options.log).catch((error) => {
      options.log?.(`preview tunnel frame error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  await new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
}

async function handleFrame(
  ws: RuntimeWebSocket,
  frame: Frame,
  streamHeads: Map<number, Frame>,
  pendingBodies: Map<number, Buffer[]>,
  port: number,
  host: string,
  log?: (message: string) => void
): Promise<void> {
  const streamId = frame.stream_id;
  if (!streamId) return;
  if (frame.type === "req_head") {
    streamHeads.set(streamId, frame);
    pendingBodies.set(streamId, []);
    if (frame.method === "GET" || frame.method === "HEAD") {
      await proxyRequest(ws, frame, Buffer.alloc(0), port, host);
      streamHeads.delete(streamId);
      pendingBodies.delete(streamId);
    }
    return;
  }
  if (frame.type !== "req_body") return;
  const chunks = pendingBodies.get(streamId) ?? [];
  if (frame.chunk_b64) chunks.push(Buffer.from(frame.chunk_b64, "base64"));
  pendingBodies.set(streamId, chunks);
  if (!frame.last) return;
  const head = streamHeads.get(streamId);
  if (!head) {
    sendError(ws, streamId, "Missing request head");
    return;
  }
  const body = Buffer.concat(chunks);
  log?.(`${head.method ?? "GET"} ${head.path ?? "/"} -> 127.0.0.1:${port}`);
  await proxyRequest(ws, head, body, port, host);
  streamHeads.delete(streamId);
  pendingBodies.delete(streamId);
}

async function proxyRequest(ws: RuntimeWebSocket, frame: Frame, body: Buffer, port: number, host: string): Promise<void> {
  const streamId = frame.stream_id;
  if (!streamId) return;
  try {
    const path = `${frame.path || "/"}${frame.query ? `?${frame.query}` : ""}`;
    const headers = sanitizeHeaders(frame.headers ?? {}, host, port);
    const response = await requestLocal({ method: frame.method ?? "GET", host, port, path, headers, body });
    ws.send(JSON.stringify({ type: "res_head", stream_id: streamId, status: response.status, headers: response.headers }));
    ws.send(JSON.stringify({ type: "res_body", stream_id: streamId, chunk_b64: response.body.toString("base64"), last: true }));
  } catch (error) {
    sendError(ws, streamId, error instanceof Error ? error.message : "Local preview request failed");
  }
}

function requestLocal(input: { method: string; host: string; port: number; path: string; headers: Record<string, string>; body: Buffer }): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: input.host, port: input.port, path: input.path, method: input.method, headers: input.headers, timeout: 30_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 200, headers: flattenHeaders(res.headers), body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Local preview request timed out")));
    if (input.body.length > 0) req.write(input.body);
    req.end();
  });
}

function sanitizeHeaders(headers: Record<string, string>, host: string, port: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"].includes(lower)) continue;
    if (lower === "authorization" || lower === "cookie") continue;
    out[key] = value;
  }
  out.host = `${host}:${port}`;
  return out;
}

function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value || ["connection", "keep-alive", "transfer-encoding", "upgrade"].includes(key.toLowerCase())) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

function parseFrame(data: unknown): Frame {
  if (typeof data === "string") return JSON.parse(data) as Frame;
  if (data instanceof ArrayBuffer) return JSON.parse(Buffer.from(data).toString("utf8")) as Frame;
  if (ArrayBuffer.isView(data)) return JSON.parse(Buffer.from(data.buffer).toString("utf8")) as Frame;
  throw new Error("Unsupported WebSocket message payload");
}

function sendError(ws: RuntimeWebSocket, streamId: number, message: string): void {
  ws.send(JSON.stringify({ type: "error", stream_id: streamId, message }));
}

function redactToken(url: string): string {
  return url.replace(/tunnel_token=[^&]+/, "tunnel_token=[REDACTED]");
}
