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

const mockRuns = new Map<string, { createdAt: number; objective: string; workspaceId: string; taskId: string }>();

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
