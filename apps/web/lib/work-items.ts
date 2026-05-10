export type WorkItemStatus = "new" | "planning" | "running" | "needs_review" | "blocked" | "done";
export type WorkItemPriority = "low" | "normal" | "high" | "urgent";
export type WorkRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type SurfaceValidation = "server-validated" | "unvalidated";

export type WorkRun = {
  id: string;
  title: string;
  status: WorkRunStatus;
  owner: string;
  updatedAt: string;
};

export type WorkEvent = {
  id: string;
  label: string;
  detail: string;
  at: string;
  tone: "neutral" | "active" | "success" | "warning" | "danger";
};

export type WorkArtifact = {
  id: string;
  name: string;
  kind: "report" | "dashboard" | "preview" | "dataset" | "document";
  state: "ready" | "draft" | "blocked";
  updatedAt: string;
};

export type WorkApproval = {
  id: string;
  title: string;
  decision: "pending" | "approved" | "rejected";
  owner: string;
  dueLabel: string;
};

export type WorkSurface = {
  id: string;
  title: string;
  kind: "dashboard" | "report" | "tracker" | "table";
  validation: SurfaceValidation;
  componentCount: number;
  dataSources: string[];
  lastUpdated: string;
};

export type WorkItem = {
  id: string;
  title: string;
  objective: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  owner: string;
  updatedAt: string;
  nextAction: string;
  freshness: "live" | "recent" | "stale";
  runs: WorkRun[];
  events: WorkEvent[];
  artifacts: WorkArtifact[];
  approvals: WorkApproval[];
  surfaces: WorkSurface[];
};

export type WorkItemSummary = {
  id: string;
  title: string;
  objective: string;
  primaryStatusLabel: string;
  priorityLabel: string;
  owner: string;
  updatedAt: string;
  nextAction: string;
  runSummary: string;
  artifactSummary: string;
  surfaceSummary: string;
  approvalSummary: string;
  freshnessLabel: string;
};

export type WorkItemDetail = WorkItemSummary & {
  sections: {
    runs: WorkRun[];
    events: WorkEvent[];
    artifacts: WorkArtifact[];
    approvals: WorkApproval[];
    surfaces: WorkSurface[];
  };
};

export type WorkItemsState =
  | { kind: "loading" }
  | { kind: "ready"; items: WorkItem[] }
  | { kind: "denied"; message: string }
  | { kind: "offline" }
  | { kind: "stale"; items: WorkItem[]; lastUpdatedLabel: string };

export type WorkItemsViewState = {
  mode: "loading" | "empty" | "ready" | "denied" | "offline" | "stale";
  statusText: string;
  items: WorkItem[];
};

const statusLabels: Record<WorkItemStatus, string> = {
  new: "Intake",
  planning: "Planning",
  running: "In progress",
  needs_review: "Needs review",
  blocked: "Blocked",
  done: "Done"
};

const priorityRank: Record<WorkItemPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

const statusRank: Record<WorkItemStatus, number> = {
  needs_review: 0,
  blocked: 1,
  running: 2,
  planning: 3,
  new: 4,
  done: 5
};

const fixtureWorkItems: WorkItem[] = [
  {
    id: "work_competitor_pricing",
    title: "Track competitor pricing",
    objective: "Monitor three competitors weekly, summarize pricing changes, and generate a review-ready dashboard.",
    status: "needs_review",
    priority: "urgent",
    owner: "Executive agent",
    updatedAt: "4 min ago",
    nextAction: "Review dashboard and approve weekly monitoring",
    freshness: "live",
    runs: [
      { id: "run_pricing_003", title: "Generate latest pricing dashboard", status: "running", owner: "Research + Builder", updatedAt: "4 min ago" },
      { id: "run_pricing_002", title: "Normalize competitor price table", status: "succeeded", owner: "Research", updatedAt: "22 min ago" },
      { id: "run_pricing_001", title: "Collect competitor pages", status: "succeeded", owner: "Research", updatedAt: "41 min ago" }
    ],
    events: [
      { id: "evt_dashboard", label: "Dashboard generated", detail: "The tracker surface has cards for price deltas, source links, and anomalies.", at: "4 min ago", tone: "success" },
      { id: "evt_approval", label: "Approval requested", detail: "Weekly monitoring needs confirmation before recurring checks are enabled.", at: "5 min ago", tone: "warning" },
      { id: "evt_dataset", label: "Data normalized", detail: "24 price points mapped across plan, SKU, market, and source URL.", at: "22 min ago", tone: "active" }
    ],
    artifacts: [
      { id: "artifact_pricing_report", name: "Competitor pricing report", kind: "report", state: "ready", updatedAt: "4 min ago" },
      { id: "artifact_pricing_dashboard", name: "Pricing monitor dashboard", kind: "dashboard", state: "ready", updatedAt: "4 min ago" },
      { id: "artifact_pricing_dataset", name: "Normalized price table", kind: "dataset", state: "ready", updatedAt: "22 min ago" },
      { id: "artifact_pricing_sources", name: "Source capture bundle", kind: "document", state: "ready", updatedAt: "41 min ago" }
    ],
    approvals: [
      { id: "approval_monitoring", title: "Enable weekly monitoring", decision: "pending", owner: "CEO", dueLabel: "Today" }
    ],
    surfaces: [
      { id: "surface_pricing_dashboard", title: "Pricing monitor", kind: "dashboard", validation: "server-validated", componentCount: 8, dataSources: ["artifact-ref", "inline-data"], lastUpdated: "4 min ago" },
      { id: "surface_pricing_table", title: "Competitor table", kind: "table", validation: "server-validated", componentCount: 3, dataSources: ["artifact-ref"], lastUpdated: "22 min ago" }
    ]
  },
  {
    id: "work_launch_preview",
    title: "Prepare launch preview site",
    objective: "Create a stakeholder-ready launch preview with product narrative, screenshots, and a review checklist.",
    status: "running",
    priority: "high",
    owner: "Builder agent",
    updatedAt: "12 min ago",
    nextAction: "Wait for preview artifact and copy review",
    freshness: "recent",
    runs: [
      { id: "run_preview_002", title: "Build static preview", status: "running", owner: "Builder", updatedAt: "12 min ago" },
      { id: "run_preview_001", title: "Draft launch narrative", status: "succeeded", owner: "Writer", updatedAt: "35 min ago" }
    ],
    events: [
      { id: "evt_preview_build", label: "Preview build started", detail: "Builder is assembling static pages and artifact metadata.", at: "12 min ago", tone: "active" },
      { id: "evt_copy_ready", label: "Narrative draft ready", detail: "Messaging has first-pass positioning and user outcomes.", at: "35 min ago", tone: "success" }
    ],
    artifacts: [
      { id: "artifact_launch_copy", name: "Launch narrative", kind: "document", state: "ready", updatedAt: "35 min ago" },
      { id: "artifact_preview_site", name: "Preview website", kind: "preview", state: "draft", updatedAt: "12 min ago" }
    ],
    approvals: [],
    surfaces: [
      { id: "surface_launch_review", title: "Launch review checklist", kind: "report", validation: "server-validated", componentCount: 4, dataSources: ["inline-data"], lastUpdated: "35 min ago" }
    ]
  },
  {
    id: "work_miro_research",
    title: "Research Miro collaboration surface",
    objective: "Assess collaboration options and recommend safe integration boundaries for external board workflows.",
    status: "blocked",
    priority: "normal",
    owner: "Product agent",
    updatedAt: "28 min ago",
    nextAction: "Confirm credential policy before OAuth/MCP integration",
    freshness: "recent",
    runs: [
      { id: "run_miro_001", title: "Audit Miro integration paths", status: "succeeded", owner: "Research", updatedAt: "28 min ago" }
    ],
    events: [
      { id: "evt_miro_policy", label: "Credential decision needed", detail: "Research recommends brokered scoped auth before any live integration.", at: "28 min ago", tone: "warning" }
    ],
    artifacts: [
      { id: "artifact_miro_audit", name: "Miro integration audit", kind: "report", state: "ready", updatedAt: "28 min ago" }
    ],
    approvals: [
      { id: "approval_miro_scope", title: "Approve Miro auth policy", decision: "pending", owner: "Platform owner", dueLabel: "Before integration" }
    ],
    surfaces: []
  },
  {
    id: "work_runtime_hardening",
    title: "Harden worker runtime policy",
    objective: "Define runtime guardrails, artifact persistence boundaries, and provider credential handling.",
    status: "planning",
    priority: "normal",
    owner: "Agent harness",
    updatedAt: "1 hr ago",
    nextAction: "Split plan into runtime and client-visible status slices",
    freshness: "stale",
    runs: [],
    events: [
      { id: "evt_runtime_plan", label: "Planning queued", detail: "This item has no execution run yet; it is ready for scoping.", at: "1 hr ago", tone: "neutral" }
    ],
    artifacts: [],
    approvals: [],
    surfaces: []
  }
];

export function normalizeWorkItemState(status: WorkItemStatus): string {
  return statusLabels[status];
}

export function listFixtureWorkItems(): WorkItem[] {
  return [...fixtureWorkItems].sort((left, right) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const statusDelta = statusRank[left.status] - statusRank[right.status];
    if (statusDelta !== 0) return statusDelta;
    return left.title.localeCompare(right.title);
  });
}

export function getPrimaryWorkItem(): WorkItem {
  return listFixtureWorkItems()[0]!;
}

export function deriveWorkItemSummary(item: WorkItem): WorkItemSummary {
  const activeRuns = item.runs.filter((run) => run.status === "queued" || run.status === "running").length;
  const pendingApprovals = item.approvals.filter((approval) => approval.decision === "pending").length;
  return {
    id: item.id,
    title: item.title,
    objective: item.objective,
    primaryStatusLabel: normalizeWorkItemState(item.status),
    priorityLabel: item.priority === "urgent" ? "Urgent" : item.priority === "high" ? "High" : item.priority === "normal" ? "Normal" : "Low",
    owner: item.owner,
    updatedAt: item.updatedAt,
    nextAction: item.nextAction,
    runSummary: `${activeRuns} active / ${item.runs.length} total`,
    artifactSummary: `${item.artifacts.length} ${item.artifacts.length === 1 ? "artifact" : "artifacts"}`,
    surfaceSummary: `${item.surfaces.length} generated ${item.surfaces.length === 1 ? "surface" : "surfaces"}`,
    approvalSummary: pendingApprovals === 0 ? "No approvals pending" : `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} pending`,
    freshnessLabel: item.freshness === "live" ? "Live" : item.freshness === "recent" ? "Recent" : "Stale"
  };
}

export function buildWorkItemDetailView(item: WorkItem): WorkItemDetail {
  return {
    ...deriveWorkItemSummary(item),
    sections: {
      runs: [...item.runs],
      events: [...item.events],
      artifacts: [...item.artifacts],
      approvals: [...item.approvals],
      surfaces: item.surfaces.filter((surface) => !rejectUnsafeSurfacePayload(surface))
    }
  };
}

export function filterWorkItemsByState(state: WorkItemsState): WorkItemsViewState {
  switch (state.kind) {
    case "loading":
      return { mode: "loading", statusText: "Loading work items…", items: [] };
    case "denied":
      return { mode: "denied", statusText: state.message, items: [] };
    case "offline":
      return { mode: "offline", statusText: "Control API is not configured. Showing local work fixtures only.", items: [] };
    case "stale":
      return { mode: "stale", statusText: `Last saved update was ${state.lastUpdatedLabel}`, items: listFixtureWorkItemsFrom(state.items) };
    case "ready": {
      const items = listFixtureWorkItemsFrom(state.items);
      return items.length === 0
        ? { mode: "empty", statusText: "No delegated work yet.", items }
        : { mode: "ready", statusText: "Work ledger ready", items };
    }
  }
}

export function rejectUnsafeSurfacePayload(surface: WorkSurface | undefined): boolean {
  if (!surface) return true;
  return surface.validation !== "server-validated";
}

function listFixtureWorkItemsFrom(items: WorkItem[]): WorkItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return listFixtureWorkItems()
    .filter((fixture) => byId.has(fixture.id))
    .map((fixture) => byId.get(fixture.id)!);
}
