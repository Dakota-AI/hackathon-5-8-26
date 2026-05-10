import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkshopPlan,
  evaluateProfileDraft,
  renderDraftProfile,
  runWorkshopSimulation,
  type AgentWorkshopRequest,
} from "../src/index.js";

const request: AgentWorkshopRequest = {
  workspaceId: "workspace-demo",
  requestedByUserId: "user-demo",
  requestedRole: "Marketing Strategist",
  projectContext: {
    name: "Solo CEO launch",
    goals: ["Create a launch plan", "Research channels before recommending paid tools"],
    constraints: ["Avoid expensive APIs without approval", "Ask before sending email or posting publicly"],
  },
  userPreferences: {
    communicationCadence: "end_of_day_report",
    reportStyle: "concise_pdf_brief",
    verbosity: "concise",
    approvalPreference: "ask_before_expensive_or_external_side_effects",
  },
  feedback: [
    {
      source: "user",
      message:
        "The agent should not call me all the time. It should batch non-critical updates into the end of day report.",
    },
    {
      source: "user",
      message: "If information is out of date, research first and explain source quality.",
    },
  ],
  candidateTools: [
    {
      id: "apify.search-actors",
      name: "Apify Actor Search",
      category: "research",
      risk: "low",
      description: "Search Apify Store for actors without running them.",
    },
    {
      id: "apify.call-actor",
      name: "Apify Actor Run",
      category: "external_action",
      risk: "high",
      description: "Run selected Apify actors and spend credits.",
    },
    {
      id: "email.send",
      name: "Send Email",
      category: "external_action",
      risk: "high",
      description: "Send emails to external recipients.",
    },
  ],
};

test("workshop plan asks targeted questions and requests permissioned research before building an expert", () => {
  const plan = createWorkshopPlan(request);

  assert.equal(plan.status, "needs_discovery");
  assert.ok(plan.discoveryQuestions.some((question) => question.toLowerCase().includes("success")));
  assert.ok(plan.discoveryQuestions.some((question) => question.toLowerCase().includes("sources")));
  assert.deepEqual(
    plan.resourceRequests.map((resource) => resource.kind),
    ["web_research", "tool_catalog_search"],
  );
  assert.ok(plan.phases.includes("quarantine_eval"));
});

test("draft profile converts user preferences and feedback into tunable behavior and tool policy", () => {
  const draft = renderDraftProfile(request);

  assert.equal(draft.role, "Marketing Strategist");
  assert.equal(draft.lifecycleState, "draft");
  assert.equal(draft.behavior.communicationCadence, "end_of_day_report");
  assert.equal(draft.behavior.preferencePolicy.verbosity, "concise");
  assert.ok(draft.behavior.feedbackAdaptations.some((adaptation) => adaptation.includes("batch")));
  assert.equal(draft.toolPolicy.allowedTools.some((tool) => tool.toolId === "apify.search-actors"), true);
  assert.equal(draft.toolPolicy.approvalRequiredTools.some((tool) => tool.toolId === "apify.call-actor"), true);
  assert.equal(draft.toolPolicy.approvalRequiredTools.some((tool) => tool.toolId === "email.send"), true);
  assert.ok(draft.evalPack.scenarios.some((scenario) => scenario.name.includes("source quality")));
});

test("scorecard blocks promotion until profile has evals, approval gates, and change evidence", () => {
  const draft = renderDraftProfile(request);
  const scorecard = evaluateProfileDraft(draft);

  assert.equal(scorecard.readyForUserReview, true);
  assert.equal(scorecard.readyForPromotion, false);
  assert.ok(scorecard.requiredBeforePromotion.includes("Run quarantine eval scenarios with deterministic tool mocks."));
  assert.ok(scorecard.metrics.policyCoverage >= 0.75);
  assert.ok(scorecard.findings.some((finding) => finding.severity === "info" && finding.message.includes("review")));
});

test("simulation returns a testing interface payload with profile, plan, scorecard, and demo transcript", () => {
  const result = runWorkshopSimulation(request);

  assert.equal(result.kind, "agent_creator_workshop_simulation");
  assert.equal(result.profile.role, "Marketing Strategist");
  assert.ok(result.auditTrail.some((step) => step.step === "profile_validation" && step.status === "passed"));
  assert.ok(result.demoTranscript.some((line) => line.actor === "workshop" && line.message.includes("quarantine")));
  assert.ok(result.nextActions.includes("Ask user to approve discovery resources or answer open questions."));
});
