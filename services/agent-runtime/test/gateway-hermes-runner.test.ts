import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GatewayHermesRunner } from "../src/gateway-hermes-runner.js";

describe("GatewayHermesRunner", () => {
  it("posts to /v1/chat/completions with bearer auth and returns the assistant content", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "First line\nSecond line" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const runner = new GatewayHermesRunner({
      url: "http://localhost:8642",
      apiKey: "test-token",
      model: "hermes-agent",
      timeoutMs: 5000,
      fetch: fakeFetch
    });

    const result = await runner.run("Tell me about agents.");

    assert.equal(result.mode, "hermes-gateway");
    assert.equal(result.summary, "First line");
    assert.equal(result.rawOutput, "First line\nSecond line");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://localhost:8642/v1/chat/completions");
    assert.equal(calls[0]?.init.method, "POST");
    const headers = calls[0]?.init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers.Authorization, "Bearer test-token");
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.model, "hermes-agent");
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [{ role: "user", content: "Tell me about agents." }]);
  });

  it("throws when the gateway returns a non-2xx", async () => {
    const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
    const runner = new GatewayHermesRunner({
      url: "http://localhost:8642",
      apiKey: "test-token",
      model: "hermes-agent",
      timeoutMs: 5000,
      fetch: fakeFetch
    });

    await assert.rejects(() => runner.run("ping"), /Hermes gateway returned 500/);
  });

  it("throws when the response is missing content", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

    const runner = new GatewayHermesRunner({
      url: "http://localhost:8642",
      apiKey: "test-token",
      model: "hermes-agent",
      timeoutMs: 5000,
      fetch: fakeFetch
    });

    await assert.rejects(() => runner.run("ping"), /missing choices\[0\]\.message\.content/);
  });

  it("requires HERMES_GATEWAY_API_KEY when constructed from environment", () => {
    const original = { ...process.env };
    delete process.env.HERMES_GATEWAY_API_KEY;
    delete process.env.API_SERVER_KEY;
    try {
      assert.throws(() => GatewayHermesRunner.fromEnvironment(), /Missing required HERMES_GATEWAY_API_KEY/);
    } finally {
      Object.assign(process.env, original);
    }
  });
});
