import crypto from "node:crypto";
import type { AuthenticatedUser, HostNodeRecord, RunnerStateStore, UserRunnerRecord } from "./ports.js";
import { isAdminUser } from "./access-control.js";

const ADMIN_RUNNER_STATUSES = ["online", "starting", "stale", "failed", "offline", "draining", "restoring"];

type Result = { readonly statusCode: number; readonly body: Record<string, unknown> };

export async function registerHostNode(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly adminEmails: readonly string[];
  readonly now: () => string;
  readonly request: { readonly hostId: string; readonly placementTarget: string; readonly status?: string; readonly capacity?: Record<string, unknown>; readonly health?: Record<string, unknown> };
}): Promise<Result> {
  if (!isAdminUser(input.user, input.adminEmails)) {
    return forbidden();
  }
  const hostId = input.request.hostId.trim();
  const placementTarget = input.request.placementTarget.trim();
  if (!hostId || !placementTarget) {
    return badRequest("hostId and placementTarget are required.");
  }
  const now = input.now();
  const existing = await input.store.getHostNode(hostId);
  const status = clean(input.request.status) ?? existing?.status ?? "online";
  const record: HostNodeRecord = {
    hostId,
    hostRecordType: "HOST",
    placementTarget,
    status,
    placementTargetStatus: `${placementTarget}#${status}`,
    capacity: input.request.capacity ?? existing?.capacity ?? {},
    health: input.request.health ?? existing?.health ?? {},
    registeredByUserId: existing?.registeredByUserId ?? input.user.userId,
    registeredByEmail: existing?.registeredByEmail ?? input.user.email,
    lastHeartbeatAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await input.store.putHostNode(record);
  return { statusCode: existing ? 200 : 200, body: { host: record } };
}

export async function heartbeatHostNode(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly adminEmails: readonly string[];
  readonly now: () => string;
  readonly hostId: string;
  readonly request: { readonly status?: string; readonly capacity?: Record<string, unknown>; readonly health?: Record<string, unknown> };
}): Promise<Result> {
  if (!isAdminUser(input.user, input.adminEmails)) {
    return forbidden();
  }
  const existing = await input.store.getHostNode(input.hostId);
  if (!existing) {
    return notFound("HostNode was not found.");
  }
  const now = input.now();
  const status = clean(input.request.status) ?? existing.status;
  const record: HostNodeRecord = {
    ...existing,
    status,
    placementTargetStatus: `${existing.placementTarget}#${status}`,
    capacity: input.request.capacity ?? existing.capacity,
    health: input.request.health ?? existing.health,
    lastHeartbeatAt: now,
    updatedAt: now
  };
  await input.store.putHostNode(record);
  return { statusCode: 200, body: { host: record } };
}

export async function createUserRunner(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly newId: () => string;
  readonly request: {
    readonly workspaceId: string;
    readonly runnerId?: string;
    readonly status?: string;
    readonly desiredState?: string;
    readonly hostId?: string;
    readonly placementTarget?: string;
    readonly resourceLimits?: Record<string, unknown>;
    readonly health?: Record<string, unknown>;
  };
}): Promise<Result> {
  const workspaceId = input.request.workspaceId.trim();
  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }
  const runnerId = clean(input.request.runnerId) ?? `runner-${stableId(input.newId())}`;
  const existing = await input.store.getUserRunner(input.user.userId, runnerId);
  const now = input.now();
  const status = clean(input.request.status) ?? existing?.status ?? "starting";
  const desiredState = clean(input.request.desiredState) ?? existing?.desiredState ?? "running";
  const hostId = clean(input.request.hostId) ?? existing?.hostId;
  const placementTarget = clean(input.request.placementTarget) ?? existing?.placementTarget;
  const record: UserRunnerRecord = withoutUndefined({
    userId: input.user.userId,
    runnerId,
    workspaceId,
    status,
    desiredState,
    hostId,
    placementTarget,
    hostStatus: `${hostId ?? "unassigned"}#${status}`,
    resourceLimits: input.request.resourceLimits ?? existing?.resourceLimits ?? {},
    health: input.request.health ?? existing?.health ?? {},
    lastHeartbeatAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  await input.store.putUserRunner(record);
  return { statusCode: existing ? 200 : 201, body: { runner: record, runnerId } };
}

export async function getUserRunner(input: { readonly store: RunnerStateStore; readonly user: AuthenticatedUser; readonly runnerId: string }): Promise<Result> {
  const runner = await input.store.getUserRunner(input.user.userId, input.runnerId);
  if (!runner) {
    return notFound("UserRunner was not found.");
  }
  return { statusCode: 200, body: { runner } };
}

export async function updateUserRunnerDesiredState(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly runnerId: string;
  readonly request: { readonly desiredState: string; readonly resourceLimits?: Record<string, unknown> };
}): Promise<Result> {
  const existing = await input.store.getUserRunner(input.user.userId, input.runnerId);
  if (!existing) {
    return notFound("UserRunner was not found.");
  }
  const desiredState = input.request.desiredState.trim();
  if (!desiredState) {
    return badRequest("desiredState is required.");
  }
  const record: UserRunnerRecord = {
    ...existing,
    desiredState,
    resourceLimits: input.request.resourceLimits ?? existing.resourceLimits,
    updatedAt: input.now()
  };
  await input.store.putUserRunner(record);
  return { statusCode: 200, body: { runner: record } };
}

export async function heartbeatUserRunner(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly runnerId: string;
  readonly request: {
    readonly status?: string;
    readonly hostId?: string;
    readonly placementTarget?: string;
    readonly health?: Record<string, unknown>;
    readonly privateIp?: string;
    readonly runnerEndpoint?: string;
    readonly taskArn?: string;
  };
}): Promise<Result> {
  const existing = await input.store.getUserRunner(input.user.userId, input.runnerId);
  if (!existing) {
    return notFound("UserRunner was not found.");
  }
  const now = input.now();
  const status = clean(input.request.status) ?? existing.status;
  const hostId = clean(input.request.hostId) ?? existing.hostId;
  const placementTarget = clean(input.request.placementTarget) ?? existing.placementTarget;
  const privateIp = clean(input.request.privateIp) ?? existing.privateIp;
  const runnerEndpoint = clean(input.request.runnerEndpoint) ?? existing.runnerEndpoint ?? (privateIp ? `http://${privateIp}:8787` : undefined);
  const taskArn = clean(input.request.taskArn) ?? existing.taskArn;
  const record: UserRunnerRecord = withoutUndefined({
    ...existing,
    status,
    hostId,
    placementTarget,
    hostStatus: `${hostId ?? "unassigned"}#${status}`,
    health: input.request.health ?? existing.health,
    privateIp,
    runnerEndpoint,
    taskArn,
    lastHeartbeatAt: now,
    updatedAt: now
  });
  await input.store.putUserRunner(record);
  return { statusCode: 200, body: { runner: record } };
}

export async function listAdminRunnerState(input: {
  readonly store: RunnerStateStore;
  readonly user: AuthenticatedUser;
  readonly adminEmails: readonly string[];
  readonly limit?: number;
}): Promise<Result> {
  if (!isAdminUser(input.user, input.adminEmails)) {
    return forbidden();
  }
  const limit = clampLimit(input.limit, 100);
  const [hosts, runners] = await Promise.all([
    input.store.listHostNodesByStatus({ statuses: ADMIN_RUNNER_STATUSES, limit }),
    input.store.listUserRunnersByStatus({ statuses: ADMIN_RUNNER_STATUSES, limit })
  ]);
  return {
    statusCode: 200,
    body: {
      hosts,
      runners,
      totals: {
        hosts: hosts.length,
        runners: runners.length,
        failedHosts: hosts.filter((host) => host.status === "failed").length,
        failedRunners: runners.filter((runner) => runner.status === "failed").length,
        staleRunners: runners.filter((runner) => runner.status === "stale").length
      }
    }
  };
}

function clean(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stableId(seed: string): string {
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,}$/.test(seed)) {
    return seed;
  }
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(limit ?? fallback, 1), 100);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function badRequest(message: string): Result {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function forbidden(): Result {
  return { statusCode: 403, body: { error: "Forbidden", message: "Admin or trusted runner authorization is required." } };
}

function notFound(message: string): Result {
  return { statusCode: 404, body: { error: "NotFound", message } };
}
