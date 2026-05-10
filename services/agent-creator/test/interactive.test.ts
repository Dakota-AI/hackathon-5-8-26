import assert from "node:assert/strict";
import test from "node:test";

import { createRequestFromInteractiveAnswers } from "../src/interactive.js";

test("interactive answers become an auditable workshop request", () => {
  const request = createRequestFromInteractiveAnswers({
    workspaceId: "workspace-demo",
    userId: "user-demo",
    role: "Research Analyst",
    projectName: "Market map",
    goals: "Find competitors; summarize risks",
    constraints: "Ask before paid APIs; cite sources",
    communicationCadence: "daily",
    reportStyle: "markdown",
    verbosity: "concise",
    feedback: "Do not interrupt unless blocked. Information must be fresh.",
  });

  assert.equal(request.requestedRole, "Research Analyst");
  assert.deepEqual(request.projectContext.goals, ["Find competitors", "summarize risks"]);
  assert.deepEqual(request.projectContext.constraints, ["Ask before paid APIs", "cite sources"]);
  assert.equal(request.userPreferences.verbosity, "concise");
  assert.equal(request.feedback[0].source, "user");
  assert.ok(request.candidateTools.some((tool) => tool.id === "apify.search-actors"));
  assert.ok(request.candidateTools.some((tool) => tool.id === "email.send" && tool.risk === "high"));
});
