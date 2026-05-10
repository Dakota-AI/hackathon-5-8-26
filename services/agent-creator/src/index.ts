import { readFile } from "node:fs/promises";

import { runWorkshopSimulation } from "./workshop.js";
import type {
  AgentProfileScorecard,
  AgentProfileVersion,
  AgentWorkshopRequest,
  CandidateTool,
  ToolRisk,
  WorkshopPlan,
  WorkshopSimulationResult,
} from "./types.js";

export { createRequestFromInteractiveAnswers, defaultCandidateTools } from "./interactive.js";
export { writeProfileBundle } from "./profile-bundle.js";
export type { WrittenProfileBundle } from "./profile-bundle.js";
export { createWorkshopPlan, evaluateProfileDraft, renderDraftProfile, runWorkshopSimulation } from "./workshop.js";
export type { InteractiveAnswers } from "./interactive.js";
export type {
  AgentProfileScorecard,
  AgentProfileVersion,
  AgentWorkshopRequest,
  CandidateTool,
  ToolRisk,
  WorkshopPlan,
  WorkshopSimulationResult,
} from "./types.js";

export async function runScenarioFile(path: string): Promise<WorkshopSimulationResult> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as AgentWorkshopRequest;
  return runWorkshopSimulation(parsed);
}
