export type EventSourceKind = "control-api" | "agent-manager" | "worker" | "cloudflare" | "client" | "system";

export type RunStatus =
  | "queued"
  | "planning"
  | "waiting_for_approval"
  | "running"
  | "testing"
  | "archiving"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ArtifactKind = "document" | "website" | "dataset" | "report" | "diff" | "miro-board" | "log" | "trace" | "other";

export type ToolApprovalRisk = "low" | "medium" | "high" | "critical";

export interface ToolApprovalRequestPayload extends Record<string, unknown> {
  readonly approvalId: string;
  readonly kind: "request";
  readonly toolName: string;
  readonly risk: ToolApprovalRisk;
  readonly requestedAction: string;
  readonly argumentsPreview?: Record<string, unknown>;
  readonly expiresAt?: string;
}

export interface ToolApprovalDecisionPayload extends Record<string, unknown> {
  readonly approvalId: string;
  readonly kind: "decision";
  readonly decision: "approved" | "rejected";
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly reason?: string;
}

export type ToolApprovalPayload = ToolApprovalRequestPayload | ToolApprovalDecisionPayload;

export interface CanonicalEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly type: string;
  readonly seq: number;
  readonly createdAt: string;
  readonly orgId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
  readonly source: {
    readonly kind: EventSourceKind;
    readonly name: string;
    readonly version?: string;
  };
  readonly payloadRef?: {
    readonly uri: string;
    readonly contentType: string;
    readonly sha256?: string;
    readonly bytes?: number;
  };
  readonly payload: TPayload;
}

export interface CanonicalEventBaseInput {
  readonly id: string;
  readonly seq: number;
  readonly createdAt: string;
  readonly orgId?: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
  readonly source: CanonicalEventEnvelope["source"];
}

export interface RunStatusPayload extends Record<string, unknown> {
  readonly runId: string;
  readonly taskId?: string;
  readonly status: RunStatus;
  readonly message?: string;
  readonly progress?: number;
  readonly workerClass?: "agent-light" | "agent-code" | "agent-builder-heavy" | "agent-eval" | "preview-app";
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable?: boolean;
  };
}

export interface ArtifactCreatedPayload extends Record<string, unknown> {
  readonly artifactId: string;
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly uri: string;
  readonly contentType: string;
  readonly previewUrl?: string;
  readonly sha256?: string;
  readonly bytes?: number;
  readonly metadata?: Record<string, unknown>;
}

export function buildCanonicalEvent<TPayload extends Record<string, unknown>>(input: CanonicalEventBaseInput & {
  readonly type: string;
  readonly payload: TPayload;
  readonly payloadRef?: CanonicalEventEnvelope["payloadRef"];
}): CanonicalEventEnvelope<TPayload> {
  assertNonEmpty(input.id, "id");
  assertEventType(input.type);
  assertPositiveInteger(input.seq, "seq");
  assertNonEmpty(input.createdAt, "createdAt");
  assertNonEmpty(input.userId, "userId");
  assertNonEmpty(input.workspaceId, "workspaceId");
  assertNonEmpty(input.runId, "runId");
  assertNonEmpty(input.source.name, "source.name");

  return withoutUndefined({
    id: input.id,
    type: input.type,
    seq: input.seq,
    createdAt: input.createdAt,
    orgId: input.orgId ?? `org:${input.userId}`,
    userId: input.userId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    runId: input.runId,
    taskId: input.taskId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: withoutUndefined(input.source),
    payloadRef: input.payloadRef,
    payload: input.payload
  });
}

export function buildRunStatusEvent(input: CanonicalEventBaseInput & {
  readonly status: RunStatus;
  readonly message?: string;
  readonly progress?: number;
  readonly workerClass?: RunStatusPayload["workerClass"];
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: RunStatusPayload["error"];
}): CanonicalEventEnvelope<RunStatusPayload> {
  return buildCanonicalEvent({
    ...input,
    type: "run.status",
    payload: withoutUndefined({
      runId: input.runId,
      taskId: input.taskId,
      status: input.status,
      message: input.message,
      progress: input.progress,
      workerClass: input.workerClass,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      error: input.error
    })
  });
}

export function buildArtifactCreatedEvent(input: CanonicalEventBaseInput & ArtifactCreatedPayload): CanonicalEventEnvelope<ArtifactCreatedPayload> {
  return buildCanonicalEvent({
    ...input,
    type: "artifact.created",
    payload: withoutUndefined({
      artifactId: input.artifactId,
      kind: input.kind,
      name: input.name,
      uri: input.uri,
      contentType: input.contentType,
      previewUrl: input.previewUrl,
      sha256: input.sha256,
      bytes: input.bytes,
      metadata: input.metadata
    })
  });
}

export function buildToolApprovalEvent(input: CanonicalEventBaseInput & ToolApprovalPayload): CanonicalEventEnvelope<ToolApprovalPayload> {
  const payload: ToolApprovalPayload = input.kind === "request"
    ? withoutUndefined({
      approvalId: input.approvalId,
      kind: input.kind,
      toolName: input.toolName,
      risk: input.risk,
      requestedAction: input.requestedAction,
      argumentsPreview: input.argumentsPreview,
      expiresAt: input.expiresAt
    })
    : withoutUndefined({
      approvalId: input.approvalId,
      kind: input.kind,
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      reason: input.reason
    });

  return buildCanonicalEvent({
    ...input,
    type: "tool.approval",
    payload
  });
}

function assertEventType(type: string): void {
  assertNonEmpty(type, "type");
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(type)) {
    throw new Error(`Invalid canonical event type: ${type}`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertNonEmpty(value: string | undefined, name: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
