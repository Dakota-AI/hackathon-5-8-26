import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validateAgentProfileVersion } from "@agents-cloud/agent-profile";
import type { AgentProfileVersion } from "@agents-cloud/agent-profile";
import type { AgentProfileBundleStore, AgentProfileRecord, AgentProfileRegistryStore, AuthenticatedUser } from "./ports.js";

export interface AgentProfileResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createAgentProfileDraft(deps: {
  readonly store: AgentProfileRegistryStore;
  readonly bundles: AgentProfileBundleStore;
  readonly user: AuthenticatedUser;
  readonly request: { readonly workspaceId: string; readonly profile: AgentProfileVersion };
  readonly now: () => string;
}): Promise<AgentProfileResult> {
  const workspaceId = cleanRequired(deps.request.workspaceId);
  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }

  const profile = normalizeDraftProfile(deps.request.profile, workspaceId, deps.user.userId);
  if (profile.workspaceId !== workspaceId) {
    return badRequest("profile.workspaceId must match workspaceId.");
  }
  if (profile.createdByUserId !== deps.user.userId) {
    return badRequest("profile.createdByUserId must match the authenticated user.");
  }

  const validation = safeValidateAgentProfile(profile);
  if (!validation.valid) {
    return { statusCode: 400, body: { error: "InvalidAgentProfile", validation } };
  }

  const now = deps.now();
  const artifactKey = profileArtifactKey(profile);
  const artifact = await deps.bundles.putAgentProfileArtifact({
    key: artifactKey,
    body: stableJson(profile),
    contentType: "application/json"
  });

  const record: AgentProfileRecord = withoutUndefined({
    workspaceId,
    profileVersionKey: profileVersionKey(profile.profileId, profile.version),
    profileId: safeToken(profile.profileId, "profileId"),
    version: safeToken(profile.version, "version"),
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    lifecycleState: profile.lifecycleState,
    role: profile.role,
    artifactS3Uri: artifact.s3Uri,
    profile,
    validationSummary: validation.summary,
    createdAt: now,
    updatedAt: now
  });

  await deps.store.putAgentProfileVersion(record);
  return { statusCode: 201, body: { profile: record, profileId: record.profileId, version: record.version } };
}

export async function listAgentProfiles(deps: {
  readonly store: AgentProfileRegistryStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId?: string;
  readonly limit?: number;
}): Promise<AgentProfileResult> {
  const profiles = await deps.store.listAgentProfilesForUser({
    userId: deps.user.userId,
    workspaceId: cleanOptional(deps.workspaceId),
    limit: clampLimit(deps.limit)
  });
  return { statusCode: 200, body: { profiles } };
}

export async function getAgentProfileVersion(deps: {
  readonly store: AgentProfileRegistryStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly profileId: string;
  readonly version: string;
}): Promise<AgentProfileResult> {
  const record = await requireOwnedProfile(deps);
  if (!record) {
    return notFound("Agent profile version not found.");
  }
  return { statusCode: 200, body: { profile: record } };
}

export async function approveAgentProfileVersion(deps: {
  readonly store: AgentProfileRegistryStore;
  readonly bundles: AgentProfileBundleStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly profileId: string;
  readonly version: string;
  readonly notes?: string;
  readonly now: () => string;
}): Promise<AgentProfileResult> {
  const current = await requireOwnedProfile(deps);
  if (!current) {
    return notFound("Agent profile version not found.");
  }

  const approvedAt = deps.now();
  const approvedProfile: AgentProfileVersion = {
    ...current.profile,
    lifecycleState: "approved",
    approval: {
      approvedByUserId: deps.user.userId,
      approvedAt,
      approvalEventId: `approval-${hashId(`${deps.user.userId}#${current.workspaceId}#${current.profileId}#${current.version}#${approvedAt}`)}`,
      notes: cleanOptional(deps.notes)
    },
    changeLog: [
      ...current.profile.changeLog,
      {
        version: current.version,
        summary: "Profile approved by user for sandbox review.",
        evidence: [cleanOptional(deps.notes) ?? "User approval recorded through Control API."]
      }
    ]
  };

  const validation = safeValidateAgentProfile(approvedProfile);
  if (!validation.valid) {
    return { statusCode: 400, body: { error: "InvalidAgentProfile", validation } };
  }

  const artifact = await deps.bundles.putAgentProfileArtifact({
    key: profileArtifactKey(approvedProfile),
    body: stableJson(approvedProfile),
    contentType: "application/json"
  });

  const updated = await deps.store.updateAgentProfileVersion({
    workspaceId: current.workspaceId,
    profileId: current.profileId,
    version: current.version,
    updates: {
      lifecycleState: "approved",
      artifactS3Uri: artifact.s3Uri,
      profile: approvedProfile,
      validationSummary: validation.summary,
      updatedAt: approvedAt
    }
  });

  return { statusCode: 200, body: { profile: updated ?? { ...current, lifecycleState: "approved", profile: approvedProfile, artifactS3Uri: artifact.s3Uri, updatedAt: approvedAt } } };
}

export class S3AgentProfileBundleStore implements AgentProfileBundleStore {
  public constructor(
    private readonly client: S3Client,
    private readonly bucketName: string
  ) {}

  public static fromEnvironment(): S3AgentProfileBundleStore {
    const bucketName = process.env.PROFILE_BUNDLES_BUCKET_NAME ?? process.env.WORKSPACE_LIVE_ARTIFACTS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("Missing required environment variable PROFILE_BUNDLES_BUCKET_NAME or WORKSPACE_LIVE_ARTIFACTS_BUCKET_NAME");
    }
    return new S3AgentProfileBundleStore(new S3Client({}), bucketName);
  }

  async putAgentProfileArtifact(input: { readonly key: string; readonly body: string; readonly contentType: string }): Promise<{ readonly s3Uri: string }> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ServerSideEncryption: "AES256"
    }));
    return { s3Uri: `s3://${this.bucketName}/${input.key}` };
  }
}

function safeValidateAgentProfile(profile: AgentProfileVersion) {
  try {
    const validation = validateAgentProfileVersion(profile);
    const idErrors = [
      safeTokenError(profile.workspaceId, "workspaceId"),
      safeTokenError(profile.profileId, "profileId"),
      safeTokenError(profile.version, "version")
    ].filter((error): error is { code: string; path: string; message: string } => Boolean(error));
    return {
      ...validation,
      valid: validation.valid && idErrors.length === 0,
      errors: [...validation.errors, ...idErrors]
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{
        code: "INVALID_PROFILE_SHAPE",
        path: "$",
        message: error instanceof Error ? error.message : "Agent profile has an invalid structure."
      }],
      warnings: [],
      summary: {
        allowedToolCount: 0,
        approvalRequiredToolCount: 0,
        evalScenarioCount: 0,
        mcpServerCount: 0
      }
    };
  }
}

function normalizeDraftProfile(profile: AgentProfileVersion, workspaceId: string, userId: string): AgentProfileVersion {
  return {
    ...profile,
    workspaceId,
    createdByUserId: userId,
    lifecycleState: profile.lifecycleState === "draft" ? "draft" : profile.lifecycleState
  };
}

async function requireOwnedProfile(deps: {
  readonly store: AgentProfileRegistryStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly profileId: string;
  readonly version: string;
}): Promise<AgentProfileRecord | undefined> {
  const record = await deps.store.getAgentProfileVersion({ workspaceId: deps.workspaceId, profileId: deps.profileId, version: deps.version });
  if (!record || record.userId !== deps.user.userId) {
    return undefined;
  }
  return record;
}

function profileArtifactKey(profile: Pick<AgentProfileVersion, "workspaceId" | "profileId" | "version">): string {
  return `workspaces/${safeToken(profile.workspaceId, "workspaceId")}/agent-profiles/${safeToken(profile.profileId, "profileId")}/versions/${safeToken(profile.version, "version")}/profile.json`;
}

function profileVersionKey(profileId: string, version: string): string {
  return `${safeToken(profileId, "profileId")}#${safeToken(version, "version")}`;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cleanRequired(value: string): string {
  return value.trim();
}

function cleanOptional(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeTokenError(value: string, label: string): { code: string; path: string; message: string } | undefined {
  const cleaned = value.trim();
  if (!cleaned || /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(cleaned)) {
    return undefined;
  }
  return {
    code: "UNSAFE_IDENTIFIER",
    path: label,
    message: `${label} must be a safe identifier for DynamoDB keys and S3 artifact paths.`
  };
}

function safeToken(value: string, label: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    return cleaned;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(cleaned)) {
    throw new Error(`${label} must be a safe identifier.`);
  }
  return cleaned;
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

function badRequest(message: string): AgentProfileResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function notFound(message: string): AgentProfileResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function hashId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
