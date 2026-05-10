import type { AuthenticatedUser, RunnerStateStore, UserRunnerRecord } from "./ports.js";

/**
 * RunnerDispatcher: given a userId, ensure a resident runner is reachable and
 * forward a wake call. Built around injectable ports so it can be unit-tested
 * without AWS or HTTP — see test/runner-dispatcher.test.ts.
 *
 * Runtime wiring lives in handlers.ts (uses EcsRunTaskClient + FetchRunnerWakeClient).
 */

const DEFAULT_RUNNER_ENDPOINT_PORT = 8787;
const DEFAULT_LAUNCH_WAIT_MS = 150_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const HEALTHY_RUNNER_STATUSES = new Set(["running", "online", "ready"]);
const UNHEALTHY_RUNNER_STATUSES = new Set(["failed", "stopped", "offline", "drained"]);

export interface DispatcherWakeRequest {
  readonly objective: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly wakeReason?: string;
}

export interface DispatcherWakeResult {
  readonly runner: UserRunnerRecord;
  readonly status: "wake_dispatched" | "wake_skipped";
  readonly wakeResponse?: unknown;
}

export interface RunnerLauncher {
  /**
   * Boot a resident runner for the given identity. Implementations call ECS RunTask
   * and persist the resulting taskArn on the UserRunner record.
   */
  launchRunner(input: {
    readonly userId: string;
    readonly runnerId: string;
    readonly workspaceId: string;
  }): Promise<{ readonly taskArn: string }>;
}

export type RunnerLifecycleStatus = "PROVISIONING" | "PENDING" | "RUNNING" | "STOPPED";

export interface RunnerObserver {
  /**
   * Look up the live placement of an ECS task. Used by the dispatcher to discover
   * the resident container's private IP without requiring the runner itself to call
   * back into the Control API.
   */
  describeRunner(input: { readonly taskArn: string }): Promise<{
    readonly status: RunnerLifecycleStatus;
    readonly privateIp?: string;
    readonly error?: string;
  }>;
}

export interface RunnerWakeClient {
  postWake(input: {
    readonly endpoint: string;
    readonly token: string;
    readonly request: DispatcherWakeRequest;
  }): Promise<unknown>;
}

export interface RunnerApiTokenProvider {
  getToken(): Promise<string>;
}

export interface RunnerDispatcherDeps {
  readonly store: RunnerStateStore;
  readonly launcher: RunnerLauncher;
  readonly wakeClient: RunnerWakeClient;
  readonly tokenProvider: RunnerApiTokenProvider;
  /**
   * Optional. When provided, the dispatcher uses ECS DescribeTasks (not the runner
   * itself) as the source of truth for privateIp. In tests we omit it and let the
   * launcher mock write privateIp into the store directly.
   */
  readonly observer?: RunnerObserver;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly now: () => string;
  readonly newId: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly launchWaitMs?: number;
  readonly pollIntervalMs?: number;
  readonly endpointPort?: number;
}

export class RunnerDispatchError extends Error {
  public constructor(
    public readonly code: "LAUNCH_FAILED" | "ENDPOINT_TIMEOUT" | "WAKE_FAILED" | "UNHEALTHY_RUNNER",
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RunnerDispatchError";
  }
}

/**
 * Look up (or auto-create + launch) a runner for the user, then wake it with
 * the given objective. Returns the latest UserRunner record + the runner's
 * /wake response (opaque — typically the wake plan).
 */
export async function dispatchRunnerWake(
  deps: RunnerDispatcherDeps,
  request: DispatcherWakeRequest
): Promise<DispatcherWakeResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const launchWaitMs = deps.launchWaitMs ?? DEFAULT_LAUNCH_WAIT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const endpointPort = deps.endpointPort ?? DEFAULT_RUNNER_ENDPOINT_PORT;
  const userId = deps.user.userId;

  let runner = await ensureRunnerRow({ deps, userId });

  if (UNHEALTHY_RUNNER_STATUSES.has(runner.status) || runner.desiredState === "stopped") {
    runner = await markRunnerStarting({ deps, runner });
  }

  if (!isReachable(runner) || !HEALTHY_RUNNER_STATUSES.has(runner.status)) {
    runner = await launchAndAwait({
      deps,
      runner,
      launchWaitMs,
      pollIntervalMs,
      sleep
    });
  }

  if (!isReachable(runner)) {
    throw new RunnerDispatchError(
      "ENDPOINT_TIMEOUT",
      `Resident runner ${runner.runnerId} did not register a privateIp within ${launchWaitMs}ms.`
    );
  }

  const endpoint = resolveEndpoint(runner, endpointPort);
  const token = await deps.tokenProvider.getToken();

  let wakeResponse: unknown;
  try {
    wakeResponse = await deps.wakeClient.postWake({ endpoint, token, request });
  } catch (error) {
    throw new RunnerDispatchError(
      "WAKE_FAILED",
      `POST ${endpoint}/wake failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  return { runner, status: "wake_dispatched", wakeResponse };
}

async function ensureRunnerRow(input: { readonly deps: RunnerDispatcherDeps; readonly userId: string }): Promise<UserRunnerRecord> {
  const { deps, userId } = input;
  const existing = await findRunnerForUser(deps.store, userId);
  if (existing) {
    return existing;
  }
  const now = deps.now();
  const runnerId = `runner-${stableId(deps.newId())}`;
  const record: UserRunnerRecord = {
    userId,
    runnerId,
    workspaceId: deps.workspaceId,
    status: "starting",
    desiredState: "running",
    hostStatus: `unassigned#starting`,
    placementTarget: "ecs-fargate",
    resourceLimits: {},
    health: {},
    lastHeartbeatAt: now,
    createdAt: now,
    updatedAt: now,
    launchedAt: now
  };
  await deps.store.putUserRunner(record);
  return record;
}

async function markRunnerStarting(input: { readonly deps: RunnerDispatcherDeps; readonly runner: UserRunnerRecord }): Promise<UserRunnerRecord> {
  const now = input.deps.now();
  const runner: UserRunnerRecord = {
    ...input.runner,
    status: "starting",
    desiredState: "running",
    hostStatus: `${input.runner.hostId ?? "unassigned"}#starting`,
    privateIp: undefined,
    runnerEndpoint: undefined,
    lastErrorMessage: undefined,
    updatedAt: now
  };
  await input.deps.store.putUserRunner(runner);
  return runner;
}

async function launchAndAwait(input: {
  readonly deps: RunnerDispatcherDeps;
  readonly runner: UserRunnerRecord;
  readonly launchWaitMs: number;
  readonly pollIntervalMs: number;
  readonly sleep: (ms: number) => Promise<void>;
}): Promise<UserRunnerRecord> {
  const { deps, runner, launchWaitMs, pollIntervalMs, sleep } = input;

  let launched = runner;
  try {
    const result = await deps.launcher.launchRunner({
      userId: runner.userId,
      runnerId: runner.runnerId,
      workspaceId: runner.workspaceId
    });
    // The launcher (or the resident container booting on ECS) may have already
    // written a heartbeat that registered a privateIp + status=running. Refetch
    // before merging so we don't clobber those side effects.
    const latest = (await deps.store.getUserRunner(runner.userId, runner.runnerId)) ?? launched;
    const now = deps.now();
    launched = {
      ...latest,
      taskArn: result.taskArn,
      launchedAt: now,
      updatedAt: now,
      lastErrorMessage: undefined
    };
    await deps.store.putUserRunner(launched);
  } catch (error) {
    const now = deps.now();
    const failed: UserRunnerRecord = {
      ...launched,
      status: "failed",
      hostStatus: `${launched.hostId ?? "unassigned"}#failed`,
      lastErrorMessage: error instanceof Error ? error.message : String(error),
      updatedAt: now
    };
    await deps.store.putUserRunner(failed);
    throw new RunnerDispatchError(
      "LAUNCH_FAILED",
      `Failed to launch resident runner ${runner.runnerId} for user ${runner.userId}: ${failed.lastErrorMessage}`,
      error
    );
  }

  const deadline = Date.now() + launchWaitMs;
  while (Date.now() < deadline) {
    // If we have an ECS observer, use DescribeTasks as the source of truth for
    // the container's network placement and write any new info back to the store.
    if (deps.observer && launched.taskArn) {
      try {
        const obs = await deps.observer.describeRunner({ taskArn: launched.taskArn });
        if (obs.status === "STOPPED") {
          const now = deps.now();
          const failed: UserRunnerRecord = {
            ...launched,
            status: "failed",
            hostStatus: `${launched.hostId ?? "unassigned"}#failed`,
            lastErrorMessage: obs.error ?? "ECS task stopped before becoming RUNNING.",
            updatedAt: now
          };
          await deps.store.putUserRunner(failed);
          throw new RunnerDispatchError(
            "UNHEALTHY_RUNNER",
            `Resident runner task ${launched.taskArn} stopped: ${failed.lastErrorMessage}`
          );
        }
        if (obs.status === "RUNNING" && obs.privateIp && (!launched.privateIp || launched.privateIp !== obs.privateIp)) {
          const now = deps.now();
          const reachable: UserRunnerRecord = {
            ...launched,
            status: "running",
            privateIp: obs.privateIp,
            runnerEndpoint: `http://${obs.privateIp}:${input.deps.endpointPort ?? DEFAULT_RUNNER_ENDPOINT_PORT}`,
            hostStatus: `${launched.hostId ?? "unassigned"}#running`,
            lastHeartbeatAt: now,
            updatedAt: now
          };
          await deps.store.putUserRunner(reachable);
          launched = reachable;
        }
      } catch (error) {
        if (error instanceof RunnerDispatchError) throw error;
        // DescribeTasks transient error — keep polling.
      }
    }

    const next = await deps.store.getUserRunner(runner.userId, runner.runnerId);
    if (next && isReachable(next) && HEALTHY_RUNNER_STATUSES.has(next.status)) {
      return next;
    }
    if (next && next.status === "failed") {
      throw new RunnerDispatchError(
        "UNHEALTHY_RUNNER",
        `Runner ${runner.runnerId} entered status "failed": ${next.lastErrorMessage ?? "no error reported"}`
      );
    }
    await sleep(pollIntervalMs);
  }
  return (await deps.store.getUserRunner(runner.userId, runner.runnerId)) ?? launched;
}

async function findRunnerForUser(store: RunnerStateStore, userId: string): Promise<UserRunnerRecord | undefined> {
  const all = await store.listUserRunnersByStatus({
    statuses: ["online", "starting", "stale", "failed", "offline", "draining", "restoring", "ready", "running"],
    limit: 50
  });
  return all.find((runner) => runner.userId === userId);
}

function isReachable(runner: UserRunnerRecord): boolean {
  if (runner.runnerEndpoint && runner.runnerEndpoint.length > 0) {
    return true;
  }
  return Boolean(runner.privateIp && runner.privateIp.length > 0);
}

function resolveEndpoint(runner: UserRunnerRecord, defaultPort: number): string {
  if (runner.runnerEndpoint && runner.runnerEndpoint.length > 0) {
    return runner.runnerEndpoint.replace(/\/+$/, "");
  }
  return `http://${runner.privateIp}:${defaultPort}`;
}

function stableId(seed: string): string {
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,}$/.test(seed)) {
    return seed;
  }
  return seed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || `id-${Date.now().toString(36)}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
