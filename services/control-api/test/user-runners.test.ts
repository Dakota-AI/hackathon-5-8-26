import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUserRunner,
  getUserRunner,
  heartbeatHostNode,
  heartbeatUserRunner,
  listAdminRunnerState,
  registerHostNode,
  updateUserRunnerDesiredState
} from "../src/user-runners.js";
import type { AuthenticatedUser, HostNodeRecord, RunnerStateStore, UserRunnerRecord } from "../src/ports.js";

class MemoryStore implements RunnerStateStore {
  public hosts: HostNodeRecord[] = [];
  public runners: UserRunnerRecord[] = [];

  async putHostNode(item: HostNodeRecord): Promise<void> {
    const existing = this.hosts.findIndex((host) => host.hostId === item.hostId && host.hostRecordType === item.hostRecordType);
    if (existing >= 0) {
      this.hosts[existing] = item;
      return;
    }
    this.hosts.push(item);
  }

  async getHostNode(hostId: string): Promise<HostNodeRecord | undefined> {
    return this.hosts.find((host) => host.hostId === hostId && host.hostRecordType === "HOST");
  }

  async listHostNodesByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<HostNodeRecord[]> {
    return this.hosts
      .filter((host) => input.statuses.includes(host.status))
      .sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt))
      .slice(0, input.limit ?? 50);
  }

  async putUserRunner(item: UserRunnerRecord): Promise<void> {
    const existing = this.runners.findIndex((runner) => runner.userId === item.userId && runner.runnerId === item.runnerId);
    if (existing >= 0) {
      this.runners[existing] = item;
      return;
    }
    this.runners.push(item);
  }

  async getUserRunner(userId: string, runnerId: string): Promise<UserRunnerRecord | undefined> {
    return this.runners.find((runner) => runner.userId === userId && runner.runnerId === runnerId);
  }

  async getUserRunnerByRunnerId(runnerId: string): Promise<UserRunnerRecord | undefined> {
    return this.runners.find((runner) => runner.runnerId === runnerId);
  }

  async listUserRunnersByStatus(input: { readonly statuses: readonly string[]; readonly limit?: number }): Promise<UserRunnerRecord[]> {
    return this.runners
      .filter((runner) => input.statuses.includes(runner.status))
      .sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt))
      .slice(0, input.limit ?? 50);
  }
}

const admin: AuthenticatedUser = { userId: "admin-user", email: "seb4594@gmail.com" };
const adminByGroup: AuthenticatedUser = { userId: "admin-group", email: "admin-group@example.com", groups: ["agents-cloud-admin"] };
const suspendedAdmin: AuthenticatedUser = { userId: "admin-suspended", email: "seb4594@gmail.com", groups: ["agents-cloud-suspended"] };
const user: AuthenticatedUser = { userId: "user-123", email: "owner@example.com" };
const otherUser: AuthenticatedUser = { userId: "other-user", email: "other@example.com" };

const adminEmails = ["seb4594@gmail.com"];

describe("user runner control plane", () => {
  it("registers a HostNode only for an admin or trusted supervisor boundary", async () => {
    const store = new MemoryStore();

    const denied = await registerHostNode({
      store: store,
      user,
      adminEmails,
      now: () => "2026-05-10T10:00:00.000Z",
      request: { hostId: "host-local-1", placementTarget: "local-docker", status: "online", capacity: { maxRunners: 4, activeRunners: 1 } }
    });

    const result = await registerHostNode({
      store: store,
      user: admin,
      adminEmails,
      now: () => "2026-05-10T10:00:00.000Z",
      request: { hostId: "host-local-1", placementTarget: "local-docker", status: "online", capacity: { maxRunners: 4, activeRunners: 1 } }
    });

    assert.equal(denied.statusCode, 403);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(store.hosts[0], {
      hostId: "host-local-1",
      hostRecordType: "HOST",
      placementTarget: "local-docker",
      status: "online",
      placementTargetStatus: "local-docker#online",
      capacity: { maxRunners: 4, activeRunners: 1 },
      health: {},
      registeredByUserId: "admin-user",
      registeredByEmail: "seb4594@gmail.com",
      lastHeartbeatAt: "2026-05-10T10:00:00.000Z",
      createdAt: "2026-05-10T10:00:00.000Z",
      updatedAt: "2026-05-10T10:00:00.000Z"
    });
  });

  it("heartbeats a HostNode without losing original registration fields", async () => {
    const store = new MemoryStore();
    store.hosts.push(hostNode({ hostId: "host-local-1", registeredByUserId: "admin-user", createdAt: "2026-05-10T09:00:00.000Z" }));

    const result = await heartbeatHostNode({
      store: store,
      user: admin,
      adminEmails,
      now: () => "2026-05-10T10:05:00.000Z",
      hostId: "host-local-1",
      request: { status: "online", capacity: { maxRunners: 8, activeRunners: 2 }, health: { disk: "ok" } }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(store.hosts[0].createdAt, "2026-05-10T09:00:00.000Z");
    assert.equal(store.hosts[0].lastHeartbeatAt, "2026-05-10T10:05:00.000Z");
    assert.deepEqual(store.hosts[0].capacity, { maxRunners: 8, activeRunners: 2 });
    assert.deepEqual(store.hosts[0].health, { disk: "ok" });
  });

  it("creates, reads, updates, and heartbeats a user-owned runner without cross-user access", async () => {
    const store = new MemoryStore();

    const created = await createUserRunner({
      store: store,
      user,
      now: () => "2026-05-10T11:00:00.000Z",
      newId: () => "runner-fixed",
      request: { workspaceId: "workspace-abc", desiredState: "running", status: "starting", hostId: "host-local-1", placementTarget: "local-docker" }
    });

    const deniedRead = await getUserRunner({ store: store, user: otherUser, runnerId: "runner-runner-fixed" });
    const updated = await updateUserRunnerDesiredState({
      store: store,
      user,
      now: () => "2026-05-10T11:10:00.000Z",
      runnerId: "runner-runner-fixed",
      request: { desiredState: "paused" }
    });
    const heartbeat = await heartbeatUserRunner({
      store: store,
      user,
      now: () => "2026-05-10T11:11:00.000Z",
      runnerId: "runner-runner-fixed",
      request: { status: "online", hostId: "host-local-1", placementTarget: "local-docker", health: { loop: "ok" } }
    });

    assert.equal(created.statusCode, 201);
    assert.equal(deniedRead.statusCode, 404);
    assert.equal(updated.statusCode, 200);
    assert.equal(heartbeat.statusCode, 200);
    assert.equal(store.runners[0].userId, "user-123");
    assert.equal(store.runners[0].runnerId, "runner-runner-fixed");
    assert.equal(store.runners[0].workspaceId, "workspace-abc");
    assert.equal(store.runners[0].desiredState, "paused");
    assert.equal(store.runners[0].status, "online");
    assert.equal(store.runners[0].hostStatus, "host-local-1#online");
    assert.deepEqual(store.runners[0].health, { loop: "ok" });
  });

  it("lets an admin list bounded runner state across users", async () => {
    const store = new MemoryStore();
    store.hosts.push(hostNode({ hostId: "host-online", status: "online" }), hostNode({ hostId: "host-failed", status: "failed" }));
    store.runners.push(
      userRunner({ userId: "user-a", runnerId: "runner-a", status: "online" }),
      userRunner({ userId: "user-b", runnerId: "runner-b", status: "failed" })
    );

    const denied = await listAdminRunnerState({ store: store, user, adminEmails, limit: 10 });
    const result = await listAdminRunnerState({ store: store, user: admin, adminEmails, limit: 10 });

    assert.equal(denied.statusCode, 403);
    assert.equal(result.statusCode, 200);
    assert.deepEqual((result.body.hosts as HostNodeRecord[]).map((host) => host.hostId).sort(), ["host-failed", "host-online"]);
    assert.deepEqual((result.body.runners as UserRunnerRecord[]).map((runner) => runner.runnerId).sort(), ["runner-a", "runner-b"]);
    assert.deepEqual(result.body.totals, { hosts: 2, runners: 2, failedHosts: 1, failedRunners: 1, staleRunners: 0 });
  });

  it("allows admin access by Cognito group without allowlist fallback", async () => {
    const store = new MemoryStore();

    const result = await listAdminRunnerState({
      store: store,
      user: adminByGroup,
      adminEmails: ["seb4594@gmail.com"],
      limit: 10
    });

    assert.equal(result.statusCode, 200);
  });

  it("rejects suspended users from admin routes even if allowlist matches", async () => {
    const store = new MemoryStore();
    const result = await listAdminRunnerState({
      store: store,
      user: suspendedAdmin,
      adminEmails: ["seb4594@gmail.com"],
      limit: 10
    });

    assert.equal(result.statusCode, 403);
  });
});

function hostNode(overrides: Partial<HostNodeRecord>): HostNodeRecord {
  const status = overrides.status ?? "online";
  const placementTarget = overrides.placementTarget ?? "local-docker";
  return {
    hostId: "host-1",
    hostRecordType: "HOST",
    placementTarget,
    status,
    placementTargetStatus: `${placementTarget}#${status}`,
    capacity: { maxRunners: 2, activeRunners: 0 },
    health: {},
    registeredByUserId: "admin-user",
    registeredByEmail: "seb4594@gmail.com",
    lastHeartbeatAt: "2026-05-10T09:30:00.000Z",
    createdAt: "2026-05-10T09:00:00.000Z",
    updatedAt: "2026-05-10T09:30:00.000Z",
    ...overrides
  };
}

function userRunner(overrides: Partial<UserRunnerRecord>): UserRunnerRecord {
  const status = overrides.status ?? "online";
  const hostId = overrides.hostId ?? "host-1";
  return {
    userId: "user-123",
    runnerId: "runner-1",
    workspaceId: "workspace-abc",
    status,
    desiredState: "running",
    hostId,
    placementTarget: "local-docker",
    hostStatus: `${hostId}#${status}`,
    resourceLimits: {},
    health: {},
    lastHeartbeatAt: "2026-05-10T09:30:00.000Z",
    createdAt: "2026-05-10T09:00:00.000Z",
    updatedAt: "2026-05-10T09:30:00.000Z",
    ...overrides
  };
}
