import assert from "node:assert/strict";
import test from "node:test";

import {
  createMarketingStrategistFixture,
  validateAgentProfileVersion,
  type AgentProfileVersion,
} from "../src/index.js";

test("valid fixture passes shared profile validation", () => {
  const profile = createMarketingStrategistFixture();
  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.approvalRequiredToolCount, 2);
  assert.equal(result.summary.evalScenarioCount, 3);
});

test("validator rejects high-risk tools without approval gates", () => {
  const profile = createMarketingStrategistFixture();
  profile.toolPolicy.allowedTools.push({
    toolId: "apify.call-actor",
    name: "Apify Actor Run",
    category: "external_action",
    risk: "high",
    description: "Run selected Apify actors and spend credits.",
    source: "apify",
    requiresApproval: false,
  });

  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "HIGH_RISK_TOOL_WITHOUT_APPROVAL"));
});

test("validator rejects missing eval packs before review or promotion", () => {
  const profile = createMarketingStrategistFixture();
  profile.evalPack.scenarios = [];

  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "MISSING_EVAL_SCENARIOS"));
});

test("validator rejects obvious secrets anywhere in profile artifact", () => {
  const profile = createMarketingStrategistFixture();
  profile.behavior.instructions.push("Use sk-test-1234567890abcdef as the model key.");

  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "SECRET_PATTERN"));
});

test("validator rejects unpinned MCP servers", () => {
  const profile = createMarketingStrategistFixture();
  profile.mcpPolicy.allowedServers.push({
    id: "untrusted-dynamic",
    serverUrl: "https://example.com/mcp",
    description: "Unpinned dynamic MCP server",
    trustLevel: "untrusted",
  });

  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "UNPINNED_MCP_SERVER"));
});

test("validator rejects promoted profiles without approval evidence", () => {
  const profile: AgentProfileVersion = {
    ...createMarketingStrategistFixture(),
    lifecycleState: "promoted",
    approval: undefined,
  };

  const result = validateAgentProfileVersion(profile);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "PROMOTION_WITHOUT_APPROVAL"));
});
