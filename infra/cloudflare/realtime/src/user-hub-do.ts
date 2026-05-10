import type { ClientSocketAttachment, Env } from "./types.js";

export class UserHubDO {
  private readonly sockets = new Set<WebSocket>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    void this.env;
    for (const socket of this.state.getWebSockets()) {
      this.sockets.add(socket);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ error: "expected_websocket_upgrade" }, { status: 426 });
    }

    const userId = request.headers.get("x-agents-cloud-user-id") ?? "";
    const workspaceId = request.headers.get("x-agents-cloud-workspace-id") ?? "";
    const client = request.headers.get("x-agents-cloud-client") ?? "web";

    if (!userId || !workspaceId) {
      return Response.json({ error: "missing_user_metadata" }, { status: 400 });
    }

    const pair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(serverSocket);
    const attachment: ClientSocketAttachment = {
      userId,
      workspaceId,
      client: client === "desktop" || client === "mobile" ? client : "web",
      connectedAt: new Date().toISOString()
    };
    serverSocket.serializeAttachment(attachment);
    this.sockets.add(serverSocket);
    serverSocket.send(JSON.stringify({ event_type: "connection_state", payload: { connected: true } }));

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  webSocketClose(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.sockets.delete(socket);
  }
}
