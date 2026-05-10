import { createMarketingStrategistFixture, type AgentProfileVersion, type ProfileLifecycleState, type ValidationResult } from "@agents-cloud/agent-profile";

export type AgentWorkshopStageStatus = "live" | "partial" | "next";

export type AgentWorkshopStage = {
  id: string;
  title: string;
  status: AgentWorkshopStageStatus;
  operatorSummary: string;
  durableEvidence: string[];
};

export type DraftProfileInput = {
  workspaceId: string;
  userId: string;
  role: string;
  projectContext: string;
  goals: string[];
  constraints: string[];
};

export type AgentProfileRegistryRecord = {
  profileId: string;
  version: string;
  lifecycleState: ProfileLifecycleState;
  role: string;
  profile?: AgentProfileVersion;
  validationSummary?: ValidationResult["summary"];
  updatedAt?: string;
  artifactKey?: string;
};

export type AgentProfileDisplaySummary = {
  id: string;
  title: string;
  subtitle: string;
  lifecycleState: ProfileLifecycleState;
  reviewReady: boolean;
  promotionReady: boolean;
  toolPosture: string[];
  updatedAt?: string;
};

export function agentWorkshopLifecycle(): AgentWorkshopStage[] {
  return [
    {
      id: "intake",
      title: "1. Intake and role design",
      status: "partial",
      operatorSummary:
        "The admin playground can turn a role, goals, constraints, and workspace context into a governed specialist profile. The conversational interview loop is still being productized.",
      durableEvidence: ["Admin form input", "profile mission", "behavior policy", "change log evidence"]
    },
    {
      id: "draft",
      title: "2. Draft profile assembly",
      status: "live",
      operatorSummary:
        "Control API accepts an AgentProfileVersion draft, validates the shared schema, stores registry metadata in DynamoDB, and writes the materialized profile artifact to S3.",
      durableEvidence: ["POST /agent-profiles/drafts", "AgentProfiles DynamoDB row", "S3 profile.json bundle"]
    },
    {
      id: "policy_validation",
      title: "3. Policy and tool audit",
      status: "live",
      operatorSummary:
        "The profile validator fails closed on missing evals, high-risk tools without approval gates, unpinned MCP surfaces, dynamic MCP allowlists, promotion without approval, and secret-like content.",
      durableEvidence: ["validation summary", "allowed/approval-required/denied tools", "MCP pinning policy"]
    },
    {
      id: "artifact_registry",
      title: "4. Artifact registry",
      status: "live",
      operatorSummary:
        "Each version is kept as a durable profile artifact so admins can review exactly what will later be sent to the Hermes/ECS worker boundary.",
      durableEvidence: ["profile artifact key", "profile hash/bundle hash", "schema version"]
    },
    {
      id: "review_approval",
      title: "5. Human review and approval",
      status: "live",
      operatorSummary:
        "The admin can approve a draft version. Approval records who approved it, when, and why, then rewrites the durable profile artifact with approval metadata.",
      durableEvidence: ["POST /agent-profiles/{id}/versions/{version}/approve", "approval evidence", "lifecycleState=approved"]
    },
    {
      id: "quarantine_eval",
      title: "6. Quarantine eval run",
      status: "next",
      operatorSummary:
        "The eval pack is part of the profile now. The automated runner that executes those scenarios with mocked/approved tools and stores scorecard evidence is the next backend slice.",
      durableEvidence: ["evalPack scenarios exist today", "future eval run", "future scorecard artifact"]
    },
    {
      id: "promotion_runtime",
      title: "7. Promotion to runtime",
      status: "next",
      operatorSummary:
        "Approved profiles are not yet automatically injected into long-lived Hermes/ECS resident runners. Promotion gates will require passing eval evidence plus explicit approval.",
      durableEvidence: ["future lifecycleState=promoted", "future runner context binding", "future runtime policy snapshot"]
    }
  ];
}

export function summarizeLifecycleReadiness(stages: AgentWorkshopStage[] = agentWorkshopLifecycle()): string {
  const liveStages = stages.filter((stage) => stage.status === "live").length;
  const nextStages = stages.filter((stage) => stage.status === "next").length;
  return `Agent Workshop is live through approval: ${liveStages} production-backed stages are wired, with ${nextStages} promotion/eval stages next.`;
}

export function buildAgentWorkshopDraftProfile(input: DraftProfileInput): AgentProfileVersion {
  const base = createMarketingStrategistFixture();
  const slug = slugify(input.role || "specialist-agent");
  const goals = input.goals.filter(Boolean);
  const constraints = input.constraints.filter(Boolean);
  const now = new Date().toISOString();

  return {
    ...base,
    profileId: `${slug}-${stableHash(`${input.workspaceId}:${input.userId}:${input.projectContext}:${input.role}`).slice(0, 8)}`,
    version: "0.1.0-draft",
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    role: input.role.trim() || "Specialist Agent",
    lifecycleState: "draft",
    mission: `Act as a ${input.role.trim() || "Specialist Agent"}. Primary goals: ${goals.length ? goals.join("; ") : "help the operator execute delegated work safely"}.`,
    projectContextSummary: `${input.projectContext.trim() || "No project context provided."} Constraints: ${constraints.length ? constraints.join("; ") : "use platform defaults and ask before high-risk actions"}.`,
    behavior: {
      ...base.behavior,
      instructions: [
        `Operate as a ${input.role.trim() || "Specialist Agent"} for this workspace.`,
        ...goals.map((goal) => `Goal: ${goal}`),
        ...constraints.map((constraint) => `Constraint: ${constraint}`),
        ...base.behavior.instructions
      ].slice(0, 10)
    },
    evalPack: {
      ...base.evalPack,
      version: `${slug}-evals/v1`,
      scenarios: base.evalPack.scenarios.map((scenario) => ({
        ...scenario,
        prompt: `${scenario.prompt}\n\nRole context: ${input.role}. Project context: ${input.projectContext}.`
      }))
    },
    changeLog: [
      {
        version: "0.1.0-draft",
        summary: `Initial ${input.role.trim() || "Specialist Agent"} draft generated from admin playground input.`,
        evidence: [
          `Generated at ${now}.`,
          `${goals.length} goals mapped into behavior instructions.`,
          `${constraints.length} constraints mapped into escalation/tool policy.`
        ]
      }
    ]
  };
}

export function summarizeAgentProfileRecord(record: AgentProfileRegistryRecord): AgentProfileDisplaySummary {
  const profile = record.profile;
  const summary = record.validationSummary;
  const role = profile?.role || record.role || record.profileId;
  const allowedToolCount = summary?.allowedToolCount ?? profile?.toolPolicy.allowedTools.length ?? 0;
  const approvalToolCount = summary?.approvalRequiredToolCount ?? profile?.toolPolicy.approvalRequiredTools.length ?? 0;
  const mcpServerCount = summary?.mcpServerCount ?? profile?.mcpPolicy.allowedServers.length ?? 0;
  const evalCount = summary?.evalScenarioCount ?? profile?.evalPack.scenarios.length ?? 0;

  return {
    id: `${record.profileId}@${record.version}`,
    title: role,
    subtitle: `${evalCount} eval scenarios · ${record.lifecycleState}`,
    lifecycleState: record.lifecycleState,
    reviewReady: Boolean(profile?.scorecard?.readyForUserReview ?? evalCount > 0),
    promotionReady: record.lifecycleState === "approved" || record.lifecycleState === "promoted" || Boolean(profile?.scorecard?.readyForPromotion),
    toolPosture: [
      `${allowedToolCount} read-only/low-risk tools`,
      `${approvalToolCount} approval-gated risky tools`,
      `${mcpServerCount} pinned MCP surfaces`
    ],
    updatedAt: record.updatedAt
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "specialist-agent";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
