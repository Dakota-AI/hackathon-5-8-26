import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "../src/index.js";
import type { Env } from "../src/types.js";

class StubDurableObjectNamespace {
  public readonly names: string[] = [];

  idFromName(name: string): DurableObjectId {
    this.names.push(name);
    return { toString: () => name } as DurableObjectId;
  }

  get(): DurableObjectStub {
    return {
      fetch: async () => Response.json({ routed: true })
    } as unknown as DurableObjectStub;
  }
}

function env(): Env {
  return {
    COGNITO_ISS: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example",
    COGNITO_AUD: "client-id",
    COGNITO_JWKS_URL: "https://example.com/jwks.json",
    RELAY_SHARED_SECRET: "relay-secret",
    LOG_LEVEL: "DEBUG",
    USER_HUBS: new StubDurableObjectNamespace() as unknown as DurableObjectNamespace,
    WORKSPACE_HUBS: new StubDurableObjectNamespace() as unknown as DurableObjectNamespace,
    SESSION_HUBS: new StubDurableObjectNamespace() as unknown as DurableObjectNamespace
  };
}

describe("realtime worker routes", () => {
  it("returns a no-cache health response", async () => {
    const response = await worker.fetch(new Request("https://realtime.solo-ceo.ai/health"), env());
    const body = (await response.json()) as { status: string; service: string };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(body.status, "healthy");
    assert.equal(body.service, "agents-cloud-realtime");
  });

  it("rejects internal relay calls without the shared secret", async () => {
    const response = await worker.fetch(
      new Request("https://realtime.solo-ceo.ai/internal/events", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env()
    );

    assert.equal(response.status, 401);
  });

  it("routes valid internal relay events to the run-scoped SessionHub Durable Object", async () => {
    const testEnv = env();
    const sessions = testEnv.SESSION_HUBS as unknown as StubDurableObjectNamespace;
    const response = await worker.fetch(
      new Request("https://realtime.solo-ceo.ai/internal/events", {
        method: "POST",
        headers: { "x-agents-cloud-relay-secret": "relay-secret" },
        body: JSON.stringify({
          eventId: "evt-1",
          runId: "run-123",
          workspaceId: "workspace-abc",
          seq: 1,
          type: "run.status",
          payload: { status: "running" },
          createdAt: "2026-05-10T00:00:00.000Z"
        })
      }),
      testEnv
    );

    assert.equal(response.status, 200);
    assert.deepEqual(sessions.names, ["workspace-abc:run-123"]);
  });
});
