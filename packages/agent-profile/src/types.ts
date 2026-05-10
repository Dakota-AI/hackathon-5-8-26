export type ToolRisk = "low" | "medium" | "high";
export type ProfileLifecycleState = "draft" | "review" | "approved" | "promoted" | "retired";
export type PreferenceScope = "platform" | "org" | "user" | "workspace" | "project" | "agent" | "task";
export type McpTrustLevel = "trusted" | "reviewed" | "untrusted";

export interface CandidateTool {
  id: string;
  name: string;
  category: string;
  risk: ToolRisk;
  description: string;
  source?: "platform" | "mcp" | "apify" | "internal" | "user_connected";
  catalogHash?: string;
}

export interface AgentPreferencePolicy {
  scope: PreferenceScope;
  verbosity: "concise" | "balanced" | "detailed";
  interruptionTolerance: "low" | "normal" | "high";
  reportCadence: "on_completion" | "end_of_day" | "daily" | "weekly" | "custom_cron";
  reportFormat: "chat_summary" | "pdf_brief" | "markdown" | "email" | "genui_workspace";
  expensiveToolPolicy: "never" | "ask" | "budgeted" | "autonomous";
  externalActionPolicy: "ask" | "allowed_for_approved_recipients" | "never";
  sourcePolicy: "verified_first" | "broad_research" | "internal_only";
}

export interface AgentBehaviorPolicy {
  instructions: string[];
  communicationCadence: string;
  reportStyle: string;
  escalationPolicy: string;
  feedbackAdaptations: string[];
  preferencePolicy: AgentPreferencePolicy;
}

export interface AgentToolPolicyEntry {
  toolId: string;
  name: string;
  category: string;
  risk: ToolRisk;
  description: string;
  source: "platform" | "mcp" | "apify" | "internal" | "user_connected";
  requiresApproval: boolean;
  catalogHash?: string;
  budget?: {
    maxCallsPerRun?: number;
    maxCostUsdPerRun?: number;
  };
}

export interface AgentToolPolicy {
  allowedTools: AgentToolPolicyEntry[];
  approvalRequiredTools: AgentToolPolicyEntry[];
  deniedTools: AgentToolPolicyEntry[];
  notes: string[];
}

export interface AgentMcpServerPolicy {
  id: string;
  serverUrl: string;
  description: string;
  trustLevel: McpTrustLevel;
  pinnedDefinitionHash?: string;
  allowedToolIds?: string[];
}

export interface AgentMcpPolicy {
  allowDynamicServers: boolean;
  allowedServers: AgentMcpServerPolicy[];
  responseInspectionRequired: boolean;
}

export interface AgentEvalScenario {
  id: string;
  name: string;
  prompt: string;
  passCriteria: string[];
  requiredToolBehavior?: string[];
}

export interface AgentEvalPack {
  version: string;
  scenarios: AgentEvalScenario[];
}

export interface AgentProfileScorecard {
  readyForUserReview: boolean;
  readyForPromotion: boolean;
  metrics: {
    policyCoverage: number;
    evalScenarioCount: number;
    approvalGateCount: number;
  };
  requiredBeforePromotion: string[];
  findings: Array<{
    severity: "info" | "warning" | "blocker";
    message: string;
  }>;
}

export interface AgentProfileApproval {
  approvedByUserId: string;
  approvedAt: string;
  approvalEventId: string;
  notes?: string;
}

export interface AgentProfileChangeLogEntry {
  version: string;
  summary: string;
  evidence: string[];
}

export interface AgentProfileManifest {
  schemaVersion: "agent-profile/v1";
  profileHash?: string;
  bundleHash?: string;
  generatedAt: string;
  files: Array<{
    path: string;
    sha256: string;
  }>;
}

export interface AgentProfileVersion {
  schemaVersion: "agent-profile/v1";
  profileId: string;
  version: string;
  workspaceId: string;
  createdByUserId: string;
  role: string;
  lifecycleState: ProfileLifecycleState;
  mission: string;
  projectContextSummary: string;
  behavior: AgentBehaviorPolicy;
  toolPolicy: AgentToolPolicy;
  mcpPolicy: AgentMcpPolicy;
  evalPack: AgentEvalPack;
  scorecard?: AgentProfileScorecard;
  approval?: AgentProfileApproval;
  changeLog: AgentProfileChangeLogEntry[];
  manifest?: AgentProfileManifest;
}

export interface AgentProfileChangeRequest {
  changeRequestId: string;
  profileId: string;
  workspaceId: string;
  requestedByUserId: string;
  changeType:
    | "behavior.preference"
    | "communication.cadence"
    | "tool.cost_policy"
    | "tool.add"
    | "tool.remove"
    | "eval.add"
    | "reporting.change"
    | "source_policy.change";
  target: string;
  requestedValue: string;
  evidence: string[];
  requiresEval: boolean;
}

export interface AgentProfileLineageEvent {
  eventId: string;
  workspaceId: string;
  profileId: string;
  version: string;
  type:
    | "agent.profile.draft.created"
    | "agent.profile.validated"
    | "agent.profile.eval.completed"
    | "agent.profile.approved"
    | "agent.profile.promoted"
    | "agent.profile.revision.requested"
    | "agent.profile.retired";
  createdAt: string;
  actorUserId?: string;
  summary: string;
}

export interface ValidationError {
  code:
    | "MISSING_REQUIRED_FIELD"
    | "MISSING_EVAL_SCENARIOS"
    | "HIGH_RISK_TOOL_WITHOUT_APPROVAL"
    | "SECRET_PATTERN"
    | "UNPINNED_MCP_SERVER"
    | "DYNAMIC_MCP_WITHOUT_ALLOWLIST"
    | "PROMOTION_WITHOUT_APPROVAL"
    | "MISSING_CHANGELOG"
    | "TOOL_POLICY_CONFLICT";
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    allowedToolCount: number;
    approvalRequiredToolCount: number;
    evalScenarioCount: number;
    mcpServerCount: number;
  };
}
