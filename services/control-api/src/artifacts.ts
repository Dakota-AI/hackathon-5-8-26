import type { ArtifactPresigner, ArtifactRecord, ArtifactStore, AuthenticatedUser, ControlApiStore } from "./ports.js";

export interface ArtifactResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export type ArtifactReadStore = ControlApiStore & ArtifactStore;

export async function listRunArtifacts(deps: {
  readonly store: ArtifactReadStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly limit?: number;
}): Promise<ArtifactResult> {
  const runId = deps.runId.trim();
  if (!runId) {
    return badRequest("runId is required.");
  }

  const run = await deps.store.getRunById(runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const artifacts = (await deps.store.listArtifactsForRun({ runId, limit: clampLimit(deps.limit) }))
    .filter((artifact) => artifact.userId === deps.user.userId && artifact.workspaceId === run.workspaceId);
  return { statusCode: 200, body: { artifacts } };
}

export async function getRunArtifact(deps: {
  readonly store: ArtifactReadStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly artifactId: string;
}): Promise<ArtifactResult> {
  const runId = deps.runId.trim();
  const artifactId = deps.artifactId.trim();
  if (!runId || !artifactId) {
    return badRequest("runId and artifactId are required.");
  }

  const run = await deps.store.getRunById(runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const artifact = await deps.store.getArtifact({ runId, artifactId });
  if (!artifact || artifact.userId !== deps.user.userId || artifact.workspaceId !== run.workspaceId) {
    return notFound("Artifact not found.");
  }
  return { statusCode: 200, body: { artifact } };
}

export async function listWorkItemArtifacts(deps: {
  readonly store: ArtifactReadStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly workItemId: string;
  readonly limit?: number;
}): Promise<ArtifactResult> {
  const workspaceId = deps.workspaceId.trim();
  const workItemId = deps.workItemId.trim();
  if (!workspaceId || !workItemId) {
    return badRequest("workspaceId and workItemId are required.");
  }

  const item = await deps.store.getWorkItem(workspaceId, workItemId);
  if (!item || item.userId !== deps.user.userId) {
    return notFound("WorkItem not found.");
  }

  const artifacts = (await deps.store.listArtifactsForWorkItem({ workItemId, limit: clampLimit(deps.limit) }))
    .filter((artifact: ArtifactRecord) => artifact.userId === deps.user.userId && artifact.workspaceId === workspaceId);
  return { statusCode: 200, body: { artifacts } };
}

function badRequest(message: string): ArtifactResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function notFound(message: string): ArtifactResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 50;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

const DEFAULT_PRESIGN_SECONDS = 300;
const MAX_PRESIGN_SECONDS = 900;

export async function getArtifactDownloadUrl(deps: {
  readonly store: ArtifactReadStore;
  readonly presigner: ArtifactPresigner;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly artifactId: string;
  readonly expiresInSeconds?: number;
}): Promise<ArtifactResult> {
  const runId = deps.runId.trim();
  const artifactId = deps.artifactId.trim();
  if (!runId || !artifactId) {
    return badRequest("runId and artifactId are required.");
  }

  const run = await deps.store.getRunById(runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const artifact = await deps.store.getArtifact({ runId, artifactId });
  if (!artifact || artifact.userId !== deps.user.userId || artifact.workspaceId !== run.workspaceId) {
    return notFound("Artifact not found.");
  }

  if (!artifact.bucket || !artifact.key) {
    return { statusCode: 422, body: { error: "Unprocessable", message: "Artifact has no S3 location." } };
  }

  const expiresInSeconds = clampPresignSeconds(deps.expiresInSeconds);
  const fileName = deriveFileName(artifact);
  const presigned = await deps.presigner.presignDownload({
    bucket: artifact.bucket,
    key: artifact.key,
    expiresInSeconds,
    contentType: artifact.contentType,
    fileName
  });

  return {
    statusCode: 200,
    body: {
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      expiresInSeconds,
      artifact: {
        runId: artifact.runId,
        artifactId: artifact.artifactId,
        name: artifact.name,
        kind: artifact.kind,
        contentType: artifact.contentType
      }
    }
  };
}

function clampPresignSeconds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_PRESIGN_SECONDS;
  }
  return Math.min(Math.max(Math.trunc(value), 30), MAX_PRESIGN_SECONDS);
}

function deriveFileName(artifact: ArtifactRecord): string {
  const lastSegment = artifact.key.split("/").pop();
  if (lastSegment) {
    return lastSegment;
  }
  return `${artifact.artifactId}.bin`;
}
