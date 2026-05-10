import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasProductAccessGroup, isAdminUser, parseAuthenticatedUser } from "../src/access-control.js";

describe("access-control", () => {
  it("parses Cognito groups from arrays and parses JSON array claim strings", () => {
    const claims = {
      sub: "user-1",
      "cognito:groups": "[\"agents-cloud-user\", \"other\"]"
    };
    const user = parseAuthenticatedUser(claims);
    assert.equal(user.groups?.includes("agents-cloud-user"), true);
    assert.equal(user.groups?.includes("other"), true);
  });

  it("parses comma-delimited Cognito group strings", () => {
    const user = parseAuthenticatedUser({
      sub: "user-2",
      "cognito:groups": "agents-cloud-user, agents-cloud-admin"
    });

    assert.deepEqual(user.groups, ["agents-cloud-admin", "agents-cloud-user"]);
  });

  it("parses API Gateway stringified Cognito group arrays", () => {
    const user = parseAuthenticatedUser({
      sub: "user-api-gateway",
      "cognito:groups": "[agents-cloud-user agents-cloud-admin]"
    });

    assert.deepEqual(user.groups, ["agents-cloud-admin", "agents-cloud-user"]);
  });

  it("requires a Cognito sub claim", () => {
    assert.throws(() => {
      parseAuthenticatedUser({});
    }, /Authenticated request is missing Cognito subject claim/);
  });

  it("enforces product access for user or admin members only", () => {
    assert.equal(
      hasProductAccessGroup({
        userId: "user-3",
        groups: ["agents-cloud-user"]
      }),
      true
    );
    assert.equal(
      hasProductAccessGroup({
        userId: "user-4",
        groups: ["agents-cloud-admin"]
      }),
      true
    );
    assert.equal(
      hasProductAccessGroup({
        userId: "user-5",
        groups: ["other-group"]
      }),
      false
    );
  });

  it("requires explicit group membership and blocks suspended users", () => {
    const adminEmail = ["admin@example.com"];
    assert.equal(
      isAdminUser({
        userId: "admin",
        email: "admin@example.com",
        groups: ["agents-cloud-suspended"]
      }, adminEmail),
      false
    );
    assert.equal(
      isAdminUser({
        userId: "admin",
        email: "admin@example.com",
        groups: ["agents-cloud-admin"]
      }, adminEmail),
      true
    );
  });
});
