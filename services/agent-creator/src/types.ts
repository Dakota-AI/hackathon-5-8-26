import type { AgentProfileScorecard, AgentProfileVersion, CandidateTool, ToolRisk } from "@agents-cloud/agent-profile";

export type { AgentProfileScorecard, AgentProfileVersion, CandidateTool, ToolRisk } from "@agents-cloud/agent-profile";

export interface AgentWorkshopRequest {
  workspaceId: string;
  requestedByUserId: string;
  requestedRole: string;
  projectContext: {
    name: string;
    goals: string[];
    constraints: string[];
  };
  userPreferences: {
    communicationCadence?: string;
    reportStyle?: string;
    verbosity?: string;
    approvalPreference?: string;
  };
  feedback: Array<{
    source: "user" | "agent" | "evaluator" | "system";
    message: string;
  }>;
  candidateTools: CandidateTool[];
}

export interface WorkshopPlan {
  status: "needs_discovery" | "ready_to_draft";
  phases: string[];
  discoveryQuestions: string[];
  resourceRequests: Array<{
    kind: "web_research" | "tool_catalog_search" | "project_context" | "user_interview";
    reason: string;
    requiresUserApproval: boolean;
  }>;
}

export interface WorkshopSimulationResult {
  kind: "agent_creator_workshop_simulation";
  plan: WorkshopPlan;
  profile: AgentProfileVersion;
  scorecard: AgentProfileScorecard;
  auditTrail: Array<{
    step: string;
    status: "passed" | "blocked" | "needs_user";
    evidence: string[];
  }>;
  demoTranscript: Array<{
    actor: "user" | "workshop" | "agent_candidate" | "evaluator";
    message: string;
  }>;
  nextActions: string[];
}
