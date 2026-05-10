import assert from "node:assert/strict";
import { test } from "node:test";
import { extractToken, websocketAuthorizerResponse } from "../src/auth.js";

test("extractToken reads Authorization bearer header first", () => {
  const token = extractToken({
    headers: { authorization: "Bearer header-token" },
    queryStringParameters: { token: "query-token" }
  });

  assert.equal(token, "header-token");
});

test("extractToken falls back to token query parameter", () => {
  const token = extractToken({
    headers: {},
    queryStringParameters: { token: "query-token" }
  });

  assert.equal(token, "query-token");
});

test("websocketAuthorizerResponse returns policy context for allowed user", () => {
  const response = websocketAuthorizerResponse({
    effect: "Allow",
    methodArn: "arn:aws:execute-api:us-east-1:123456789012:api/dev/$connect",
    userId: "user-1",
    email: "user@example.com"
  });

  assert.equal(response.policyDocument.Statement[0].Effect, "Allow");
  assert.equal(response.context.userId, "user-1");
  assert.equal(response.context.email, "user@example.com");
});
