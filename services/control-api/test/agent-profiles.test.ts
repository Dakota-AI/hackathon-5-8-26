import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMarketingStrategistFixture } from "@agents-cloud/agent-profile";
import { approveAgentProfileVersion, createAgentProfileDraft, getAgentProfileVersion, listAgentProfiles } from "../src/agent-profiles.js";
import type { AgentProfileRecord, AgentProfileRegistryStore, AgentProfileBundleStore, AuthenticatedUser } from "../src/ports.js";

class MemoryProfileStore implements AgentProfileRegistryStore {
  public profiles: AgentProfileRecord[] = [];

  async putAgentProfileVersion(record: AgentProfileRecord): Promise<void> {
    this.profiles.push(record);
  }

  async getAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string }): Promise<AgentProfileRecord | undefined> {
    return this.profiles.find((profile) => profile.workspaceId === input.workspaceId && profile.profileId === input.profileId && profile.version === input.version);
  }

  async listAgentProfilesForUser(input: { readonly userId: string; readonly workspaceId?: string; readonly limit?: number }): Promise<AgentProfileRecord[]> {
    return this.profiles
      .filter((profile) => profile.userId === input.userId)
      .filter((profile) => input.workspaceId === undefined || profile.workspaceId === input.workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 50);
  }

  async updateAgentProfileVersion(input: { readonly workspaceId: string; readonly profileId: string; readonly version: string; readonly updates: Partial<AgentProfileRecord> }): Promise<AgentProfileRecord | undefined> {
    const record = await this.getAgentProfileVersion(input);
    if (!record) {
      return undefined;
    }
    Object.assign(record, input.updates);
    return record;
  }
}

class MemoryBundleStore implements AgentProfileBundleStore {
  public writes: Array<{ key: string; body: string }> = [];

  async putAgentProfileArtifact(input: { readonly key: string; readonly body: string; readonly contentType: string }): Promise<{ s3Uri: string }> {
    assert.equal(input.contentType, "application/json");
    this.writes.push({ key: input.key, body: input.body });
    return { s3Uri: `s3://profile-bundles/${input.key}` };
  }
}

const user: AuthenticatedUser = { userId: "user-123", email: "owner@example.com" };

describe("agent profile registry", () => {
  it("creates a validated draft owned by the authenticated user and writes a profile artifact", async () => {
    const store = new MemoryProfileStore();
    const bundles = new MemoryBundleStore();
    const profile = marketingProfile();

    const result = await createAgentProfileDraft({
      store,
      bundles,
      user,
      now: () => "2026-05-10T08:00:00.000Z",
      request: { workspaceId: "workspace-abc", profile }
    });

    assert.equal(result.statusCode, 201);
    assert.equal(result.body.profileId, "marketing-strategist");
    assert.equal(result.body.version, "0.1.0-draft");
    assert.equal(store.profiles.length, 1);
    assert.equal(store.profiles[0].userId, "user-123");
    assert.equal(store.profiles[0].profileVersionKey, "marketing-strategist#0.1.0-draft");
    assert.equal(store.profiles[0].lifecycleState, "draft");
    assert.equal(store.profiles[0].artifactS3Uri, "s3://profile-bundles/workspaces/workspace-abc/agent-profiles/marketing-strategist/versions/0.1.0-draft/profile.json");
    assert.equal(bundles.writes[0].key, "workspaces/workspace-abc/agent-profiles/marketing-strategist/versions/0.1.0-draft/profile.json");
    assert.match(bundles.writes[0].body, /Marketing Strategist/);
  });

  it("rejects drafts that fail shared profile validation before writing", async () => {
    const store = new MemoryProfileStore();
    const bundles = new MemoryBundleStore();
    const profile = marketingProfile();
    profile.evalPack.scenarios = [];

    const result = await createAgentProfileDraft({
      store,
      bundles,
      user,
      now: () => "2026-05-10T08:00:00.000Z",
      request: { workspaceId: "workspace-abc", profile }
    });

    assert.equal(result.statusCode, 400);
    assert.equal(store.profiles.length, 0);
    assert.equal(bundles.writes.length, 0);
  });

  it("rejects malformed or unsafe draft profile shapes before writing state", async () => {
    const store = new MemoryProfileStore();
    const bundles = new MemoryBundleStore();
    const malformed = { ...marketingProfile(), toolPolicy: undefined } as unknown as ReturnType<typeof createMarketingStrategistFixture>;
    const unsafe = { ...marketingProfile(), profileId: "../escape" };

    const malformedResult = await createAgentProfileDraft({
      store,
      bundles,
      user,
      now: () => "2026-05-10T08:00:00.000Z",
      request: { workspaceId: "workspace-abc", profile: malformed }
    });
    const unsafeResult = await createAgentProfileDraft({
      store,
      bundles,
      user,
      now: () => "2026-05-10T08:00:00.000Z",
      request: { workspaceId: "workspace-abc", profile: unsafe }
    });

    assert.equal(malformedResult.statusCode, 400);
    assert.equal(unsafeResult.statusCode, 400);
    assert.equal(store.profiles.length, 0);
    assert.equal(bundles.writes.length, 0);
  });

  it("lists and gets only profile versions owned by the authenticated user", async () => {
    const store = new MemoryProfileStore();
    const profile = marketingProfile();
    store.profiles.push(
      profileRecord({ profile, userId: "user-123", createdAt: "2026-05-10T08:00:00.000Z" }),
      profileRecord({ profile: { ...profile, profileId: "other-owned" }, userId: "user-123", createdAt: "2026-05-10T09:00:00.000Z" }),
      profileRecord({ profile: { ...profile, profileId: "not-owned" }, userId: "other-user", createdAt: "2026-05-10T10:00:00.000Z" })
    );

    const listed = await listAgentProfiles({ store, user, workspaceId: "workspace-abc", limit: 10 });
    const fetched = await getAgentProfileVersion({ store, user, workspaceId: "workspace-abc", profileId: "marketing-strategist", version: "0.1.0-draft" });
    const forbidden = await getAgentProfileVersion({ store, user, workspaceId: "workspace-abc", profileId: "not-owned", version: "0.1.0-draft" });

    assert.deepEqual((listed.body.profiles as AgentProfileRecord[]).map((record) => record.profileId), ["other-owned", "marketing-strategist"]);
    assert.equal((fetched.body.profile as AgentProfileRecord).profileId, "marketing-strategist");
    assert.equal(forbidden.statusCode, 404);
  });

  it("approves an owned profile version and rewrites the immutable profile artifact with approval evidence", async () => {
    const store = new MemoryProfileStore();
    const bundles = new MemoryBundleStore();
    const profile = marketingProfile();
    store.profiles.push(profileRecord({ profile, userId: "user-123" }));

    const result = await approveAgentProfileVersion({
      store,
      bundles,
      user,
      now: () => "2026-05-10T11:00:00.000Z",
      workspaceId: "workspace-abc",
      profileId: "marketing-strategist",
      version: "0.1.0-draft",
      notes: "Approved for sandbox review."
    });

    assert.equal(result.statusCode, 200);
    assert.equal((result.body.profile as AgentProfileRecord).lifecycleState, "approved");
    assert.equal((result.body.profile as AgentProfileRecord).profile.approval?.approvedByUserId, "user-123");
    assert.match(bundles.writes[0].body, /Approved for sandbox review/);
  });
});

function marketingProfile(): ReturnType<typeof createMarketingStrategistFixture> {
  return {
    ...createMarketingStrategistFixture(),
    workspaceId: "workspace-abc",
    createdByUserId: "user-123"
  };
}

function profileRecord(input: { profile: ReturnType<typeof createMarketingStrategistFixture>; userId: string; createdAt?: string }): AgentProfileRecord {
  return {
    workspaceId: input.profile.workspaceId,
    profileVersionKey: `${input.profile.profileId}#${input.profile.version}`,
    profileId: input.profile.profileId,
    version: input.profile.version,
    userId: input.userId,
    ownerEmail: "owner@example.com",
    lifecycleState: input.profile.lifecycleState,
    role: input.profile.role,
    artifactS3Uri: `s3://profile-bundles/workspaces/${input.profile.workspaceId}/agent-profiles/${input.profile.profileId}/versions/${input.profile.version}/profile.json`,
    profile: input.profile,
    validationSummary: {
      allowedToolCount: 1,
      approvalRequiredToolCount: 2,
      evalScenarioCount: 3,
      mcpServerCount: 1
    },
    createdAt: input.createdAt ?? "2026-05-10T08:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-05-10T08:00:00.000Z"
  };
}
