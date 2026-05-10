import type { AgentWorkshopRequest } from "./types.js";

export interface InteractiveAnswers {
  workspaceId?: string;
  userId?: string;
  role: string;
  projectName: string;
  goals: string;
  constraints: string;
  communicationCadence?: string;
  reportStyle?: string;
  verbosity?: string;
  feedback?: string;
}

export function createRequestFromInteractiveAnswers(answers: InteractiveAnswers): AgentWorkshopRequest {
  return {
    workspaceId: normalizeOptional(answers.workspaceId, "workspace-local-test"),
    requestedByUserId: normalizeOptional(answers.userId, "user-local-test"),
    requestedRole: normalizeRequired(answers.role, "Specialist Agent"),
    projectContext: {
      name: normalizeRequired(answers.projectName, "Untitled project"),
      goals: splitList(answers.goals),
      constraints: splitList(answers.constraints),
    },
    userPreferences: {
      communicationCadence: normalizeOptional(answers.communicationCadence, "end_of_day_report"),
      reportStyle: normalizeOptional(answers.reportStyle, "concise_pdf_brief"),
      verbosity: normalizeOptional(answers.verbosity, "concise"),
      approvalPreference: "ask_before_expensive_or_external_side_effects",
    },
    feedback: [
      {
        source: "user",
        message: normalizeOptional(
          answers.feedback,
          "Prefer concise updates, ask before expensive or external actions, and explain uncertainty when sources may be stale.",
        ),
      },
    ],
    candidateTools: defaultCandidateTools(),
  };
}

export function defaultCandidateTools(): AgentWorkshopRequest["candidateTools"] {
  return [
    {
      id: "apify.search-actors",
      name: "Apify Actor Search",
      category: "research",
      risk: "low",
      description: "Search Apify Store for actors without running them.",
      source: "apify",
    },
    {
      id: "apify.call-actor",
      name: "Apify Actor Run",
      category: "external_action",
      risk: "high",
      description: "Run selected Apify actors and spend credits.",
      source: "apify",
    },
    {
      id: "email.send",
      name: "Send Email",
      category: "external_action",
      risk: "high",
      description: "Send emails to external recipients.",
      source: "platform",
    },
    {
      id: "workspace.report.write",
      name: "Write Workspace Report",
      category: "artifact",
      risk: "low",
      description: "Create a local/report artifact for user review.",
      source: "platform",
    },
  ];
}

function splitList(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOptional(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeRequired(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}
