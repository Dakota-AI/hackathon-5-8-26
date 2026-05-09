export type RunStatus = "queued" | "planning" | "running" | "awaiting_approval" | "complete";

export type AgentRun = {
  id: string;
  title: string;
  owner: string;
  status: RunStatus;
  updatedAt: string;
  summary: string;
};

export type PlatformMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AgentTeam = {
  name: string;
  role: string;
  state: string;
};

export type Artifact = {
  name: string;
  type: string;
  state: string;
};

export const metrics: PlatformMetric[] = [
  { label: "Durable plane", value: "AWS", detail: "DynamoDB, S3, Step Functions, ECS" },
  { label: "Realtime", value: "Next", detail: "Cloudflare Durable Objects planned" },
  { label: "Generated UI", value: "A2UI", detail: "Server-validated GenUI patches planned" },
  { label: "Clients", value: "2", detail: "desktop/mobile now, web scaffold here" }
];

export const runs: AgentRun[] = [
  {
    id: "run_1001",
    title: "Build investor-grade preview site",
    owner: "CEO command",
    status: "running",
    updatedAt: "2 min ago",
    summary: "Manager agent delegated design, copy, and deployment prep to specialist workers."
  },
  {
    id: "run_1000",
    title: "Research Miro collaboration surface",
    owner: "Product team",
    status: "awaiting_approval",
    updatedAt: "18 min ago",
    summary: "Needs approval before connecting OAuth/MCP broker credentials."
  },
  {
    id: "run_0999",
    title: "Draft Control API endpoint test matrix",
    owner: "Platform team",
    status: "complete",
    updatedAt: "1 hr ago",
    summary: "Request validation, JWT claims, idempotency, DynamoDB shapes, and event ordering."
  }
];

export const teams: AgentTeam[] = [
  { name: "Executive", role: "Plan and delegate", state: "Ready" },
  { name: "Builder", role: "Code, test, commit", state: "Waiting for runtime" },
  { name: "Research", role: "Deep research and reports", state: "Waiting for runtime" },
  { name: "Design", role: "GenUI, previews, Miro", state: "Planned" }
];

export const artifacts: Artifact[] = [
  { name: "Wildcard preview registry", type: "DynamoDB", state: "Live" },
  { name: "Desktop/mobile app", type: "Flutter", state: "Scaffolded" },
  { name: "Web command center", type: "Next.js", state: "Scaffolded" },
  { name: "Preview router", type: "ECS", state: "Placeholder" }
];
