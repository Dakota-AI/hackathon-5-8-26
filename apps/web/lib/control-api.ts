import type { AgentProfileVersion, ProfileLifecycleState, ValidationResult } from "@agents-cloud/agent-profile";
import { fetchAuthSession } from "aws-amplify/auth";

export type ControlApiHealth = {
  configured: boolean;
  baseUrl?: string;
  mockMode: boolean;
};

export type CreatedRun = {
  runId: string;
  workspaceId: string;
  taskId: string;
  status: string;
  executionArn?: string;
};

export type RunSummary = {
  runId: string;
  workspaceId: string;
  taskId?: string;
  status: string;
  objective?: string;
  createdAt?: string;
  updatedAt?: string;
  executionArn?: string;
};

export type RunEvent = {
  id?: string;
  runId: string;
  seq: number;
  type: string;
  createdAt: string;
  source?: string | { kind?: string; name?: string; version?: string };
  payload?: Record<string, unknown>;
};

export type AdminRunSummary = {
  runId: string;
  workspaceId: string;
  userId: string;
  ownerEmail?: string;
  objective?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  executionArn?: string;
  eventCount: number;
  latestEventType?: string;
  latestEventAt?: string;
  artifactCount: number;
  failureCount: number;
  lastFailure?: Record<string, unknown>;
};

export type AdminRunsResponse = {
  runs: AdminRunSummary[];
  totals: {
    totalRuns: number;
    failedRuns: number;
    runningRuns: number;
    succeededRuns: number;
  };
};

export type AdminRunEventsResponse = {
  run: AdminRunSummary;
  events: RunEvent[];
  nextSeq?: number;
};

export type AdminHostNodeRecord = {
  hostId: string;
  hostRecordType: "HOST";
  placementTarget: string;
  status: string;
  placementTargetStatus: string;
  capacity?: Record<string, unknown>;
  health?: Record<string, unknown>;
  registeredByUserId?: string;
  registeredByEmail?: string;
  lastHeartbeatAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminRunnerRecord = {
  userId: string;
  runnerId: string;
  workspaceId: string;
  status: string;
  desiredState: string;
  hostId?: string;
  placementTarget?: string;
  hostStatus: string;
  resourceLimits?: Record<string, unknown>;
  health?: Record<string, unknown>;
  lastHeartbeatAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminRunnerTotals = {
  hosts: number;
  runners: number;
  failedHosts: number;
  failedRunners: number;
  staleRunners: number;
};

export type AdminRunnersResponse = {
  hosts: AdminHostNodeRecord[];
  runners: AdminRunnerRecord[];
  totals: AdminRunnerTotals;
};

export type AgentProfileRegistryRecord = {
  workspaceId: string;
  profileVersionKey?: string;
  profileId: string;
  version: string;
  userId?: string;
  ownerEmail?: string;
  lifecycleState: ProfileLifecycleState;
  role: string;
  artifactS3Uri?: string;
  profile: AgentProfileVersion;
  validationSummary?: ValidationResult["summary"];
  createdAt?: string;
  updatedAt?: string;
};

export type AgentProfilesResponse = {
  profiles: AgentProfileRegistryRecord[];
};

export type AgentProfileResponse = {
  profile: AgentProfileRegistryRecord;
  profileId?: string;
  version?: string;
};

const mockRuns = new Map<string, { createdAt: number; objective: string; workspaceId: string; taskId: string }>();
const mockAgentProfiles = new Map<string, AgentProfileRegistryRecord>();

export function getControlApiHealth(): ControlApiHealth {
  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL;
  const mockMode = isMockMode();
  return {
    configured: mockMode || Boolean(baseUrl),
    baseUrl: baseUrl || undefined,
    mockMode
  };
}

export async function createControlApiRun(input: {
  workspaceId: string;
  objective: string;
}): Promise<CreatedRun> {
  if (isMockMode()) {
    return createMockRun(input);
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();

  const response = await fetch(`${baseUrl}/runs`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      objective: input.objective,
      idempotencyKey: stableBrowserIdempotencyKey(input.workspaceId, input.objective)
    })
  });

  return parseJsonResponse<CreatedRun>(response);
}

export async function getControlApiRun(runId: string): Promise<RunSummary> {
  if (isMockMode()) {
    const run = requireMockRun(runId);
    const events = await listMockRunEvents(runId);
    const latestStatus = [...events].reverse().find((event) => event.type === "run.status")?.payload?.status;
    return {
      runId,
      workspaceId: run.workspaceId,
      taskId: run.taskId,
      status: typeof latestStatus === "string" ? latestStatus : "queued",
      objective: run.objective,
      createdAt: new Date(run.createdAt).toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();

  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  const body = await parseJsonResponse<RunSummary | { run: RunSummary }>(response);
  return "run" in body ? body.run : body;
}

export async function listControlApiRunEvents(
  runId: string,
  options: { afterSeq?: number; limit?: number } = {}
): Promise<RunEvent[]> {
  if (isMockMode()) {
    const events = await listMockRunEvents(runId);
    return events.filter((event) => event.seq > (options.afterSeq ?? 0)).slice(0, options.limit ?? 25);
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ limit: String(options.limit ?? 25) });
  if (options.afterSeq && options.afterSeq > 0) {
    params.set("afterSeq", String(options.afterSeq));
  }

  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/events?${params.toString()}`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  const body = await parseJsonResponse<{ events: RunEvent[] }>(response);
  return body.events;
}

export async function listControlApiAdminRuns(options: { limit?: number } = {}): Promise<AdminRunsResponse> {
  if (isMockMode()) {
    const runs = await Promise.all(
      [...mockRuns.entries()].map(async ([runId, run]) => {
        const events = await listMockRunEvents(runId);
        return {
          runId,
          workspaceId: run.workspaceId,
          userId: "local-user",
          ownerEmail: "local@example.com",
          objective: run.objective,
          status: String([...events].reverse().find((event) => event.type === "run.status")?.payload?.status ?? "queued"),
          createdAt: new Date(run.createdAt).toISOString(),
          updatedAt: new Date().toISOString(),
          eventCount: events.length,
          latestEventType: events.at(-1)?.type,
          latestEventAt: events.at(-1)?.createdAt,
          artifactCount: events.filter((event) => event.type === "artifact.created").length,
          failureCount: 0
        } satisfies AdminRunSummary;
      })
    );
    return {
      runs: runs.slice(0, options.limit ?? 50),
      totals: {
        totalRuns: runs.length,
        failedRuns: runs.filter((run) => run.status === "failed").length,
        runningRuns: runs.filter((run) => run.status === "running").length,
        succeededRuns: runs.filter((run) => run.status === "succeeded").length
      }
    };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  const response = await fetch(`${baseUrl}/admin/runs?${params.toString()}`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  return parseJsonResponse<AdminRunsResponse>(response);
}

export async function listControlApiAdminRunners(options: { limit?: number } = {}): Promise<AdminRunnersResponse> {
  if (isMockMode()) {
    const now = new Date().toISOString();
    return {
      hosts: [
        {
          hostId: "local-host",
          hostRecordType: "HOST",
          placementTarget: "local-docker",
          status: "online",
          placementTargetStatus: "local-docker#online",
          lastHeartbeatAt: now,
          updatedAt: now
        }
      ],
      runners: [
        {
          userId: "local-user",
          runnerId: "local-runner",
          workspaceId: "local-workspace",
          status: "online",
          desiredState: "running",
          hostId: "local-host",
          placementTarget: "local-docker",
          hostStatus: "local-host#online",
          lastHeartbeatAt: now,
          updatedAt: now
        }
      ],
      totals: { hosts: 1, runners: 1, failedHosts: 0, failedRunners: 0, staleRunners: 0 }
    };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  const response = await fetch(`${baseUrl}/admin/runners?${params.toString()}`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  return parseJsonResponse<AdminRunnersResponse>(response);
}

export async function listControlApiAdminRunEvents(runId: string, options: { limit?: number } = {}): Promise<AdminRunEventsResponse> {
  if (isMockMode()) {
    const run = requireMockRun(runId);
    const events = await listMockRunEvents(runId);
    return {
      run: {
        runId,
        workspaceId: run.workspaceId,
        userId: "local-user",
        ownerEmail: "local@example.com",
        objective: run.objective,
        status: String([...events].reverse().find((event) => event.type === "run.status")?.payload?.status ?? "queued"),
        createdAt: new Date(run.createdAt).toISOString(),
        updatedAt: new Date().toISOString(),
        eventCount: events.length,
        latestEventType: events.at(-1)?.type,
        latestEventAt: events.at(-1)?.createdAt,
        artifactCount: events.filter((event) => event.type === "artifact.created").length,
        failureCount: 0
      },
      events: events.slice(0, options.limit ?? 100),
      nextSeq: events.at(-1)?.seq
    };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ limit: String(options.limit ?? 100) });
  const response = await fetch(`${baseUrl}/admin/runs/${encodeURIComponent(runId)}/events?${params.toString()}`, {
    headers: {
      "authorization": `Bearer ${token}`
    }
  });

  return parseJsonResponse<AdminRunEventsResponse>(response);
}

export async function createControlApiAgentProfileDraft(input: {
  workspaceId: string;
  profile: AgentProfileVersion;
}): Promise<AgentProfileResponse> {
  if (isMockMode()) {
    const now = new Date().toISOString();
    const record: AgentProfileRegistryRecord = {
      workspaceId: input.workspaceId,
      profileVersionKey: `${input.profile.profileId}#${input.profile.version}`,
      profileId: input.profile.profileId,
      version: input.profile.version,
      userId: "local-user",
      ownerEmail: "local@example.com",
      lifecycleState: input.profile.lifecycleState,
      role: input.profile.role,
      artifactS3Uri: `s3://mock-agents-cloud-artifacts/workspaces/${input.workspaceId}/agent-profiles/${input.profile.profileId}/versions/${input.profile.version}/profile.json`,
      profile: input.profile,
      validationSummary: {
        allowedToolCount: input.profile.toolPolicy.allowedTools.length,
        approvalRequiredToolCount: input.profile.toolPolicy.approvalRequiredTools.length,
        evalScenarioCount: input.profile.evalPack.scenarios.length,
        mcpServerCount: input.profile.mcpPolicy.allowedServers.length
      },
      createdAt: now,
      updatedAt: now
    };
    mockAgentProfiles.set(profileMapKey(record.workspaceId, record.profileId, record.version), record);
    return { profile: record, profileId: record.profileId, version: record.version };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(`${baseUrl}/agent-profiles/drafts`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ workspaceId: input.workspaceId, profile: input.profile })
  });
  return parseJsonResponse<AgentProfileResponse>(response);
}

export async function listControlApiAgentProfiles(options: { workspaceId?: string; limit?: number } = {}): Promise<AgentProfilesResponse> {
  if (isMockMode()) {
    const profiles = [...mockAgentProfiles.values()]
      .filter((profile) => !options.workspaceId || profile.workspaceId === options.workspaceId)
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
      .slice(0, options.limit ?? 50);
    return { profiles };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.workspaceId) {
    params.set("workspaceId", options.workspaceId);
  }
  const response = await fetch(`${baseUrl}/agent-profiles?${params.toString()}`, {
    headers: { "authorization": `Bearer ${token}` }
  });
  return parseJsonResponse<AgentProfilesResponse>(response);
}

export async function getControlApiAgentProfile(input: { workspaceId: string; profileId: string; version: string }): Promise<AgentProfileResponse> {
  if (isMockMode()) {
    const profile = mockAgentProfiles.get(profileMapKey(input.workspaceId, input.profileId, input.version));
    if (!profile) {
      throw new Error(`Mock profile ${input.profileId}@${input.version} was not found.`);
    }
    return { profile };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(`${baseUrl}/agent-profiles/${encodeURIComponent(input.profileId)}/versions/${encodeURIComponent(input.version)}?${params.toString()}`, {
    headers: { "authorization": `Bearer ${token}` }
  });
  return parseJsonResponse<AgentProfileResponse>(response);
}

export async function approveControlApiAgentProfile(input: {
  workspaceId: string;
  profileId: string;
  version: string;
  notes?: string;
}): Promise<AgentProfileResponse> {
  if (isMockMode()) {
    const key = profileMapKey(input.workspaceId, input.profileId, input.version);
    const current = mockAgentProfiles.get(key);
    if (!current) {
      throw new Error(`Mock profile ${input.profileId}@${input.version} was not found.`);
    }
    const approvedAt = new Date().toISOString();
    const approvedProfile: AgentProfileVersion = {
      ...current.profile,
      lifecycleState: "approved",
      approval: {
        approvedByUserId: "local-user",
        approvedAt,
        approvalEventId: `approval-${Date.now().toString(36)}`,
        notes: input.notes
      }
    };
    const updated = { ...current, lifecycleState: "approved" as const, profile: approvedProfile, updatedAt: approvedAt };
    mockAgentProfiles.set(key, updated);
    return { profile: updated };
  }

  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(`${baseUrl}/agent-profiles/${encodeURIComponent(input.profileId)}/versions/${encodeURIComponent(input.version)}/approve?${params.toString()}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ notes: input.notes })
  });
  return parseJsonResponse<AgentProfileResponse>(response);
}

// ---- Work items ---------------------------------------------------------

export type WorkItemRecord = {
  workspaceId: string;
  workItemId: string;
  userId?: string;
  ownerEmail?: string;
  title?: string;
  objective: string;
  status: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkItemRunRecord = {
  runId: string;
  workItemId?: string;
  workspaceId: string;
  status: string;
  objective?: string;
  createdAt?: string;
  updatedAt?: string;
  executionArn?: string;
};

export type WorkItemArtifactRecord = {
  artifactId: string;
  runId?: string;
  workItemId?: string;
  name?: string;
  kind?: string;
  state?: string;
  s3Uri?: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkItemSurfaceRecord = {
  surfaceId: string;
  workItemId?: string;
  runId?: string;
  title?: string;
  kind?: string;
  validation: "server-validated" | "unvalidated" | string;
  componentCount?: number;
  componentTree?: GenUiComponent;
  components?: GenUiComponent[];
  dataSources?: string[];
  updatedAt?: string;
};

export type GenUiComponent = {
  type: string;
  props?: Record<string, unknown>;
  children?: GenUiComponent[];
  // common props (shorthand)
  text?: string;
  label?: string;
  value?: string | number;
  hint?: string;
  items?: Array<string | GenUiComponent>;
  rows?: Array<Record<string, string | number>>;
  columns?: string[];
  data?: Array<{ label: string; value: number }>;
};

export async function listControlApiWorkItems(options: {
  workspaceId?: string;
  limit?: number;
} = {}): Promise<{ workItems: WorkItemRecord[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options.limit) params.set("limit", String(options.limit));
  const url = `${baseUrl}/work-items${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return parseJsonResponse<{ workItems: WorkItemRecord[] }>(response);
}

export async function createControlApiWorkItem(input: {
  workspaceId: string;
  objective: string;
  title?: string;
  priority?: string;
}): Promise<{ workItem: WorkItemRecord; workItemId: string; status: string }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(`${baseUrl}/work-items`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      objective: input.objective,
      title: input.title,
      priority: input.priority,
      idempotencyKey: stableBrowserIdempotencyKey(input.workspaceId, input.objective)
    })
  });
  return parseJsonResponse(response);
}

export async function getControlApiWorkItem(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<{ workItem: WorkItemRecord }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

export async function updateControlApiWorkItemStatus(input: {
  workspaceId: string;
  workItemId: string;
  status: string;
}): Promise<{ workItem: WorkItemRecord }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/status?${params.toString()}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: input.status })
    }
  );
  return parseJsonResponse(response);
}

export async function startControlApiWorkItemRun(input: {
  workspaceId: string;
  workItemId: string;
  objective?: string;
}): Promise<{ run: WorkItemRunRecord }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/runs`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: input.workspaceId,
        objective: input.objective,
        idempotencyKey: stableBrowserIdempotencyKey(input.workspaceId, input.objective ?? input.workItemId)
      })
    }
  );
  return parseJsonResponse(response);
}

export async function listControlApiWorkItemRuns(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<{ runs: WorkItemRunRecord[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/runs?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

export async function listControlApiWorkItemEvents(input: {
  workspaceId: string;
  workItemId: string;
  limit?: number;
}): Promise<{ events: RunEvent[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  if (input.limit) params.set("limit", String(input.limit));
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/events?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

export async function listControlApiWorkItemArtifacts(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<{ artifacts: WorkItemArtifactRecord[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/artifacts?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

export async function listControlApiWorkItemSurfaces(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<{ surfaces: WorkItemSurfaceRecord[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/work-items/${encodeURIComponent(input.workItemId)}/surfaces?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

export async function listControlApiRunArtifacts(runId: string): Promise<{
  artifacts: WorkItemArtifactRecord[];
}> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/artifacts`, {
    headers: { authorization: `Bearer ${token}` }
  });
  return parseJsonResponse(response);
}

export async function getControlApiArtifactDownloadUrl(input: {
  runId: string;
  artifactId: string;
}): Promise<{ url: string; expiresAt?: string }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(
    `${baseUrl}/runs/${encodeURIComponent(input.runId)}/artifacts/${encodeURIComponent(input.artifactId)}/download`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return parseJsonResponse(response);
}

// ---- Approvals ----------------------------------------------------------

export type ApprovalRecord = {
  workspaceId: string;
  approvalId: string;
  runId: string;
  workItemId?: string;
  taskId?: string;
  userId?: string;
  ownerEmail?: string;
  toolName: string;
  risk: "low" | "medium" | "high" | "critical" | string;
  requestedAction: string;
  status: "requested" | "approved" | "rejected" | string;
  decision?: "approved" | "rejected" | string;
  reason?: string;
  argumentsPreview?: Record<string, unknown>;
  decidedBy?: string;
  decidedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export async function listControlApiRunApprovals(runId: string): Promise<{ approvals: ApprovalRecord[] }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/approvals`, {
    headers: { authorization: `Bearer ${token}` }
  });
  return parseJsonResponse(response);
}

export async function decideControlApiApproval(input: {
  workspaceId: string;
  approvalId: string;
  decision: "approved" | "rejected";
  reason?: string;
}): Promise<{ approval: ApprovalRecord }> {
  const baseUrl = requireControlApiBaseUrl();
  const token = await requireIdToken();
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  const response = await fetch(
    `${baseUrl}/approvals/${encodeURIComponent(input.approvalId)}/decision?${params.toString()}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ decision: input.decision, reason: input.reason })
    }
  );
  return parseJsonResponse(response);
}

export async function requireIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error("Sign in before creating an Agents Cloud run.");
  }
  return token;
}

function requireControlApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AGENTS_CLOUD_API_URL is not configured.");
  }
  return baseUrl.replace(/\/$/, "");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(body.message || body.error || `Control API request failed with HTTP ${response.status}.`);
  }
  return body;
}

function stableBrowserIdempotencyKey(workspaceId: string, objective: string): string {
  const normalized = `${workspaceId}:${objective.trim().slice(0, 96)}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return `web-${Date.now().toString(36)}-${hash.toString(36)}`;
}

function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_MOCK === "1";
}

function createMockRun(input: { workspaceId: string; objective: string }): CreatedRun {
  const suffix = stableBrowserIdempotencyKey(input.workspaceId, input.objective).replace(/^web-/, "");
  const runId = `run-web-self-test-${suffix}`;
  const taskId = `task-web-self-test-${suffix}`;
  mockRuns.set(runId, { createdAt: Date.now(), objective: input.objective, workspaceId: input.workspaceId, taskId });
  return {
    runId,
    workspaceId: input.workspaceId,
    taskId,
    status: "queued"
  };
}

function profileMapKey(workspaceId: string, profileId: string, version: string): string {
  return `${workspaceId}#${profileId}#${version}`;
}

function requireMockRun(runId: string) {
  const run = mockRuns.get(runId);
  if (!run) {
    throw new Error(`Mock run ${runId} was not found.`);
  }
  return run;
}

async function listMockRunEvents(runId: string): Promise<RunEvent[]> {
  const run = requireMockRun(runId);
  const elapsed = Date.now() - run.createdAt;
  const createdAt = (offsetMs: number) => new Date(run.createdAt + offsetMs).toISOString();
  const baseEvents: RunEvent[] = [
    {
      id: `${runId}-event-1`,
      runId,
      seq: 1,
      type: "run.status",
      source: "control-api.mock",
      createdAt: createdAt(0),
      payload: { status: "queued" }
    }
  ];

  if (elapsed >= 700) {
    baseEvents.push({
      id: `${runId}-event-2`,
      runId,
      seq: 2,
      type: "run.status",
      source: "worker.mock",
      createdAt: createdAt(700),
      payload: { status: "running" }
    });
  }

  if (elapsed >= 1400) {
    baseEvents.push({
      id: `${runId}-event-3`,
      runId,
      seq: 3,
      type: "artifact.created",
      source: "worker.mock",
      createdAt: createdAt(1400),
      payload: {
        artifactId: `artifact-${run.taskId}-0001`,
        kind: "report",
        name: "Hermes smoke report",
        uri: `s3://mock-agents-cloud-artifacts/workspaces/${run.workspaceId}/runs/${runId}/artifacts/artifact-${run.taskId}-0001/hermes-report.md`
      }
    });
  }

  if (elapsed >= 2100) {
    baseEvents.push({
      id: `${runId}-event-4`,
      runId,
      seq: 4,
      type: "run.status",
      source: "worker.mock",
      createdAt: createdAt(2100),
      payload: { status: "succeeded" }
    });
  }

  return baseEvents;
}
