import assert from "node:assert/strict";
import test from "node:test";
import {
  agentWorkshopLifecycle,
  buildAgentWorkshopDraftProfile,
  summarizeAgentProfileRecord,
  summarizeLifecycleReadiness
} from "../lib/agent-workshop.ts";

test("buildAgentWorkshopDraftProfile creates a governed draft with approval-gated risky tools", () => {
  const profile = buildAgentWorkshopDraftProfile({
    workspaceId: "workspace-admin-playground",
    userId: "admin-user",
    role: "Research Analyst",
    projectContext: "Solo CEO launch planning",
    goals: ["compare channels", "write an executive brief"],
    constraints: ["ask before paid APIs", "cite sources"]
  });

  assert.equal(profile.lifecycleState, "draft");
  assert.equal(profile.workspaceId, "workspace-admin-playground");
  assert.equal(profile.createdByUserId, "admin-user");
  assert.equal(profile.toolPolicy.allowedTools.some((tool) => tool.toolId === "apify.search-actors"), true);
  assert.equal(profile.toolPolicy.approvalRequiredTools.every((tool) => tool.requiresApproval), true);
  assert.equal(profile.mcpPolicy.allowDynamicServers, false);
  assert.equal(profile.evalPack.scenarios.length, 3);
});

test("agentWorkshopLifecycle clearly separates live stages from pending stages", () => {
  const stages = agentWorkshopLifecycle();

  assert.deepEqual(stages.map((stage) => stage.id), [
    "intake",
    "draft",
    "policy_validation",
    "artifact_registry",
    "review_approval",
    "quarantine_eval",
    "promotion_runtime"
  ]);
  assert.equal(stages.find((stage) => stage.id === "policy_validation")?.status, "live");
  assert.equal(stages.find((stage) => stage.id === "quarantine_eval")?.status, "next");
  assert.match(summarizeLifecycleReadiness(stages), /live through approval/i);
});

test("summarizeAgentProfileRecord reports review and promotion readiness without exposing raw internals", () => {
  const profile = buildAgentWorkshopDraftProfile({
    workspaceId: "workspace-admin-playground",
    userId: "admin-user",
    role: "Research Analyst",
    projectContext: "Solo CEO launch planning",
    goals: ["compare channels"],
    constraints: ["ask before paid APIs"]
  });

  const summary = summarizeAgentProfileRecord({
    profileId: profile.profileId,
    version: profile.version,
    lifecycleState: "draft",
    role: profile.role,
    profile,
    validationSummary: {
      allowedToolCount: 1,
      approvalRequiredToolCount: 2,
      evalScenarioCount: 3,
      mcpServerCount: 1
    },
    updatedAt: "2026-05-10T12:00:00.000Z"
  });

  assert.equal(summary.title, "Research Analyst");
  assert.equal(summary.reviewReady, true);
  assert.equal(summary.promotionReady, false);
  assert.deepEqual(summary.toolPosture, ["1 read-only/low-risk tools", "2 approval-gated risky tools", "1 pinned MCP surfaces"]);
});
