import test from "node:test";
import assert from "node:assert/strict";
import { extractTunnelIdFromHost } from "../src/tunnel-api.js";
import { signTunnelToken, validateTunnelToken } from "../src/auth.js";

test("extracts preview tunnel ids from wildcard solo-ceo hosts", () => {
  assert.equal(extractTunnelIdFromHost("preview-app-abc123.solo-ceo.ai", { BASE_DOMAIN: "solo-ceo.ai", HOST_PREFIX: "preview" }), "app-abc123");
  assert.equal(extractTunnelIdFromHost("preview-app-abc123.solo-ceo.ai:443", { BASE_DOMAIN: "solo-ceo.ai", HOST_PREFIX: "preview" }), "app-abc123");
  assert.equal(extractTunnelIdFromHost("not-preview.solo-ceo.ai", { BASE_DOMAIN: "solo-ceo.ai", HOST_PREFIX: "preview" }), undefined);
});

test("signs and validates tunnel tokens", async () => {
  const token = await signTunnelToken({
    sub: "runner",
    tunnelId: "app-abc123",
    previewHost: "preview-app-abc123.solo-ceo.ai",
    allowedPort: 3000,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60
  }, "test-secret");
  const claims = await validateTunnelToken(token, "test-secret");
  assert.equal(claims.tunnelId, "app-abc123");
  assert.equal(claims.allowedPort, 3000);
  await assert.rejects(validateTunnelToken(token, "wrong-secret"), /Invalid tunnel token signature/);
});
