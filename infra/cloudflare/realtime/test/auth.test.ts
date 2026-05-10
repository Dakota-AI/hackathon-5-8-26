import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBearerToken, requireRelaySecret } from "../src/auth.js";

describe("realtime auth helpers", () => {
  it("extracts WebSocket bearer tokens from either query string or Authorization header", () => {
    const queryRequest = new Request("https://realtime.solo-ceo.ai/ws?token=query-token");
    const headerRequest = new Request("https://realtime.solo-ceo.ai/ws", {
      headers: { Authorization: "Bearer header-token" }
    });

    assert.equal(extractBearerToken(queryRequest), "query-token");
    assert.equal(extractBearerToken(headerRequest), "header-token");
  });

  it("requires the AWS event relay shared secret for internal event ingestion", () => {
    assert.equal(
      requireRelaySecret(
        new Request("https://realtime.solo-ceo.ai/internal/events", {
          method: "POST",
          headers: { "x-agents-cloud-relay-secret": "secret-1" }
        }),
        "secret-1"
      ),
      true
    );

    assert.equal(
      requireRelaySecret(
        new Request("https://realtime.solo-ceo.ai/internal/events", {
          method: "POST",
          headers: { "x-agents-cloud-relay-secret": "wrong" }
        }),
        "secret-1"
      ),
      false
    );
  });
});
