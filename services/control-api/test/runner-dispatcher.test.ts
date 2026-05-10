import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dispatchRunnerWake, RunnerDispatchError, type RunnerLauncher, type RunnerObserver, type RunnerWakeClient, type RunnerApiTokenProvider } from "../src/runner-dispatcher.js";
import type { AuthenticatedUser, HostNodeRecord, RunnerStateStore, UserRunnerRecord } from "../src/ports.js";

class MemoryStore implements RunnerStateStore {
  public hosts: HostNodeRecord[] = [];
  public runners: UserRunnerRecord[] = [];

  async putHostNode(item: HostNodeRecord): Promise<void> {
    const i = this.hosts.findIndex((h) => h.hostId === item.hostId && h.hostRecordType === item.hostRecordType);
    if (i >= 0) this.hosts[i] = item;
    else this.hosts.push(item);
  }
  async getHostNode(hostId: string) {
    return this.hosts.find((h) => h.hostId === hostId && h.hostRecordType === "HOST");
  }
  async listHostNodesByStatus({ statuses, limit }: { readonly statuses: readonly string[]; readonly limit?: number }) {
    return this.hosts.filter((h) => statuses.includes(h.status)).slice(0, limit ?? 50);
  }
  async putUserRunner(item: UserRunnerRecord): Promise<void> {
    const i = this.runners.findIndex((r) => r.userId === item.userId && r.runnerId === item.runnerId);
    if (i >= 0) this.runners[i] = item;
    else this.runners.push(item);
  }
  async getUserRunner(userId: string, runnerId: string) {
    return this.runners.find((r) => r.userId === userId && r.runnerId === runnerId);
  }
  async getUserRunnerByRunnerId(runnerId: string) {
    return this.runners.find((r) => r.runnerId === runnerId);
  }
  async listUserRunnersByStatus({ statuses, limit }: { readonly statuses: readonly string[]; readonly limit?: number }) {
    return this.runners.filter((r) => statuses.includes(r.status)).slice(0, limit ?? 50);
  }
}

const user: AuthenticatedUser = { userId: "user-abc", email: "abc@example.com" };
const token: RunnerApiTokenProvider = { async getToken() { return "test-token"; } };

interface CapturedWake {
  endpoint: string;
  token: string;
  request: { objective: string; runId?: string };
}

function noopSleep() { return Promise.resolve(); }

function buildExistingRunner(overrides: Partial<UserRunnerRecord> = {}): UserRunnerRecord {
  return {
    userId: user.userId,
    runnerId: "runner-existing",
    workspaceId: "workspace-default",
    status: "running",
    desiredState: "running",
    privateIp: "10.40.1.23",
    runnerEndpoint: "http://10.40.1.23:8787",
    hostStatus: "unassigned#running",
    resourceLimits: {},
    health: {},
    lastHeartbeatAt: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T11:55:00.000Z",
    updatedAt: "2026-05-10T12:00:00.000Z",
    ...overrides
  };
}

describe("dispatchRunnerWake", () => {
  it("calls /wake on an already-running runner without launching", async () => {
    const store = new MemoryStore();
    store.runners.push(buildExistingRunner());
    const captured: CapturedWake[] = [];
    const wakeClient: RunnerWakeClient = {
      async postWake(input) { captured.push(input); return { ok: true, runId: "run-x" }; }
    };
    const launcher: RunnerLauncher = {
      async launchRunner() { throw new Error("should not launch when runner is healthy"); }
    };
    const result = await dispatchRunnerWake(
      { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:01:00.000Z", newId: () => "fresh", sleep: noopSleep },
      { objective: "Plan launch" }
    );
    assert.equal(result.status, "wake_dispatched");
    assert.equal(result.runner.runnerId, "runner-existing");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].endpoint, "http://10.40.1.23:8787");
    assert.equal(captured[0].token, "test-token");
    assert.deepEqual(captured[0].request, { objective: "Plan launch" });
  });

  it("auto-creates a UserRunner row for users without one and launches it", async () => {
    const store = new MemoryStore();
    let launchCalls = 0;
    const launcher: RunnerLauncher = {
      async launchRunner({ userId, runnerId, workspaceId }) {
        launchCalls += 1;
        // Simulate the resident runner registering its IP after launch:
        const existing = await store.getUserRunner(userId, runnerId);
        if (existing) {
          await store.putUserRunner({
            ...existing,
            taskArn: "arn:aws:ecs:::task/cluster/abcd",
            privateIp: "10.40.7.42",
            runnerEndpoint: "http://10.40.7.42:8787",
            status: "running",
            hostStatus: `${existing.hostId ?? "unassigned"}#running`,
            workspaceId,
            updatedAt: "2026-05-10T12:00:05.000Z",
            lastHeartbeatAt: "2026-05-10T12:00:05.000Z"
          });
        }
        return { taskArn: "arn:aws:ecs:::task/cluster/abcd" };
      }
    };
    const wakes: CapturedWake[] = [];
    const wakeClient: RunnerWakeClient = {
      async postWake(input) { wakes.push(input); return { ok: true }; }
    };
    const result = await dispatchRunnerWake(
      { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-fresh", now: () => "2026-05-10T12:00:00.000Z", newId: () => "uuid-1", sleep: noopSleep, launchWaitMs: 5000, pollIntervalMs: 10 },
      { objective: "First objective" }
    );
    assert.equal(launchCalls, 1);
    assert.equal(result.status, "wake_dispatched");
    assert.equal(result.runner.workspaceId, "workspace-fresh");
    assert.equal(result.runner.privateIp, "10.40.7.42");
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0].endpoint, "http://10.40.7.42:8787");
    assert.equal(store.runners.length, 1);
    assert.equal(store.runners[0].taskArn, "arn:aws:ecs:::task/cluster/abcd");
  });

  it("relaunches a runner whose status is failed", async () => {
    const store = new MemoryStore();
    store.runners.push(buildExistingRunner({
      runnerId: "runner-old",
      status: "failed",
      privateIp: undefined,
      runnerEndpoint: undefined,
      lastErrorMessage: "ECS task crashed"
    }));
    const launcher: RunnerLauncher = {
      async launchRunner({ runnerId }) {
        const existing = (await store.getUserRunnerByRunnerId(runnerId))!;
        await store.putUserRunner({
          ...existing,
          status: "running",
          privateIp: "10.40.9.9",
          runnerEndpoint: "http://10.40.9.9:8787",
          taskArn: "arn:aws:ecs:::task/cluster/efgh",
          lastErrorMessage: undefined,
          updatedAt: "2026-05-10T12:00:10.000Z",
          lastHeartbeatAt: "2026-05-10T12:00:10.000Z"
        });
        return { taskArn: "arn:aws:ecs:::task/cluster/efgh" };
      }
    };
    const wakeClient: RunnerWakeClient = {
      async postWake() { return { ok: true }; }
    };
    const result = await dispatchRunnerWake(
      { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:09.000Z", newId: () => "x", sleep: noopSleep, launchWaitMs: 5000, pollIntervalMs: 10 },
      { objective: "Retry" }
    );
    assert.equal(result.runner.status, "running");
    assert.equal(result.runner.privateIp, "10.40.9.9");
  });

  it("times out when no privateIp shows up", async () => {
    const store = new MemoryStore();
    const launcher: RunnerLauncher = {
      async launchRunner() { return { taskArn: "arn:aws:ecs:::task/cluster/never" }; }
    };
    const wakeClient: RunnerWakeClient = {
      async postWake() { throw new Error("should not be called"); }
    };
    await assert.rejects(
      dispatchRunnerWake(
        { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "x", sleep: noopSleep, launchWaitMs: 50, pollIntervalMs: 10 },
        { objective: "Plan" }
      ),
      (error) => error instanceof RunnerDispatchError && error.code === "ENDPOINT_TIMEOUT"
    );
  });

  it("surfaces launch failures as LAUNCH_FAILED", async () => {
    const store = new MemoryStore();
    const launcher: RunnerLauncher = {
      async launchRunner() { throw new Error("RunTask: AccessDeniedException"); }
    };
    const wakeClient: RunnerWakeClient = {
      async postWake() { throw new Error("nope"); }
    };
    await assert.rejects(
      dispatchRunnerWake(
        { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "x", sleep: noopSleep },
        { objective: "Plan" }
      ),
      (error) => error instanceof RunnerDispatchError && error.code === "LAUNCH_FAILED"
    );
    const stored = store.runners[0];
    assert.equal(stored.status, "failed");
    assert.match(stored.lastErrorMessage ?? "", /AccessDeniedException/);
  });

  it("uses an ECS observer to discover privateIp and write it into the store", async () => {
    const store = new MemoryStore();
    const launcher: RunnerLauncher = {
      async launchRunner() { return { taskArn: "arn:aws:ecs:::task/cluster/observed" }; }
    };
    let polls = 0;
    const observer: RunnerObserver = {
      async describeRunner({ taskArn }) {
        polls += 1;
        assert.equal(taskArn, "arn:aws:ecs:::task/cluster/observed");
        if (polls < 2) return { status: "PROVISIONING" };
        return { status: "RUNNING", privateIp: "10.40.5.50" };
      }
    };
    const wakes: CapturedWake[] = [];
    const wakeClient: RunnerWakeClient = {
      async postWake(input) { wakes.push(input); return { ok: true }; }
    };
    const result = await dispatchRunnerWake(
      { store, launcher, wakeClient, tokenProvider: token, observer, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "x", sleep: noopSleep, launchWaitMs: 5000, pollIntervalMs: 10 },
      { objective: "Plan" }
    );
    assert.equal(result.runner.privateIp, "10.40.5.50");
    assert.equal(result.runner.status, "running");
    assert.ok(polls >= 2);
    assert.equal(wakes[0].endpoint, "http://10.40.5.50:8787");
  });

  it("waits for ECS RUNNING before treating a task privateIp as reachable", async () => {
    const store = new MemoryStore();
    const launcher: RunnerLauncher = {
      async launchRunner() { return { taskArn: "arn:aws:ecs:::task/cluster/pending-with-ip" }; }
    };
    let polls = 0;
    const observer: RunnerObserver = {
      async describeRunner() {
        polls += 1;
        if (polls < 2) return { status: "PENDING", privateIp: "10.40.5.51" };
        return { status: "RUNNING", privateIp: "10.40.5.51" };
      }
    };
    const wakes: CapturedWake[] = [];
    const wakeClient: RunnerWakeClient = {
      async postWake(input) { wakes.push(input); return { ok: true }; }
    };
    const result = await dispatchRunnerWake(
      { store, launcher, wakeClient, tokenProvider: token, observer, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "pending", sleep: noopSleep, launchWaitMs: 5000, pollIntervalMs: 10 },
      { objective: "Plan" }
    );
    assert.equal(result.runner.status, "running");
    assert.equal(wakes.length, 1);
    assert.equal(polls, 2);
  });

  it("marks the runner failed when the ECS observer reports STOPPED", async () => {
    const store = new MemoryStore();
    const launcher: RunnerLauncher = {
      async launchRunner() { return { taskArn: "arn:aws:ecs:::task/cluster/dead" }; }
    };
    const observer: RunnerObserver = {
      async describeRunner() { return { status: "STOPPED", error: "Essential container exited" }; }
    };
    const wakeClient: RunnerWakeClient = {
      async postWake() { throw new Error("should not be called"); }
    };
    await assert.rejects(
      dispatchRunnerWake(
        { store, launcher, wakeClient, tokenProvider: token, observer, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "x", sleep: noopSleep, launchWaitMs: 5000, pollIntervalMs: 10 },
        { objective: "Plan" }
      ),
      (error) => error instanceof RunnerDispatchError && error.code === "UNHEALTHY_RUNNER"
    );
    const stored = store.runners[0];
    assert.equal(stored.status, "failed");
    assert.match(stored.lastErrorMessage ?? "", /Essential container exited/);
  });

  it("surfaces wake failures as WAKE_FAILED", async () => {
    const store = new MemoryStore();
    store.runners.push(buildExistingRunner());
    const launcher: RunnerLauncher = {
      async launchRunner() { throw new Error("should not launch"); }
    };
    const wakeClient: RunnerWakeClient = {
      async postWake() { throw new Error("ECONNREFUSED"); }
    };
    await assert.rejects(
      dispatchRunnerWake(
        { store, launcher, wakeClient, tokenProvider: token, user, workspaceId: "workspace-default", now: () => "2026-05-10T12:00:00.000Z", newId: () => "x", sleep: noopSleep },
        { objective: "Plan" }
      ),
      (error) => error instanceof RunnerDispatchError && error.code === "WAKE_FAILED"
    );
  });
});
