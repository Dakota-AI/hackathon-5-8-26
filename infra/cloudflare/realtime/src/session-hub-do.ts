import { parseRealtimeEvent, serializeEvent } from "./protocol.js";
import type { ClientSocketAttachment, Env, RealtimeEvent } from "./types.js";

export class SessionHubDO {
  private readonly sockets = new Set<WebSocket>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    void this.env;
    for (const socket of this.state.getWebSockets()) {
      this.sockets.add(socket);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      return this.acceptWebSocket(request);
    }

    if (request.method === "POST" && url.pathname === "/events") {
      const event = parseRealtimeEvent(await request.json());
      this.broadcast(event);
      return Response.json({ delivered: this.sockets.size });
    }

    return Response.json({ error: "expected_websocket_or_event" }, { status: 426 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      return;
    }

    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === "ping") {
        socket.send(JSON.stringify({ event_type: "pong", createdAt: new Date().toISOString() }));
      }
    } catch {
      socket.send(JSON.stringify({ event_type: "error", payload: { code: "invalid_json" } }));
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  private acceptWebSocket(request: Request): Response {
    const userId = request.headers.get("x-agents-cloud-user-id") ?? "";
    const workspaceId = request.headers.get("x-agents-cloud-workspace-id") ?? "";
    const runId = request.headers.get("x-agents-cloud-run-id") ?? undefined;
    const client = request.headers.get("x-agents-cloud-client") ?? "web";

    if (!userId || !workspaceId) {
      return Response.json({ error: "missing_session_metadata" }, { status: 400 });
    }

    const pair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(pair) as [WebSocket, WebSocket];

    this.state.acceptWebSocket(serverSocket);
    const attachment: ClientSocketAttachment = {
      userId,
      workspaceId,
      runId,
      client: client === "desktop" || client === "mobile" ? client : "web",
      connectedAt: new Date().toISOString()
    };
    serverSocket.serializeAttachment(attachment);
    this.sockets.add(serverSocket);
    serverSocket.send(JSON.stringify({ event_type: "connection_state", payload: { connected: true, runId } }));

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  private broadcast(event: RealtimeEvent): void {
    const serialized = serializeEvent(event);
    for (const socket of this.sockets) {
      try {
        socket.send(serialized);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}
