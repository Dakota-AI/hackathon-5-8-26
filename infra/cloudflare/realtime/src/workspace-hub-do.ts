import type { Env } from "./types.js";

export class WorkspaceHubDO {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return Response.json({ status: "ready", scope: "workspace" });
    }

    return Response.json({ error: "not_implemented" }, { status: 501 });
  }
}
