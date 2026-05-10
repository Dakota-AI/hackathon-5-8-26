import type { AuthenticatedUser, ControlApiStore, ApprovalRecord, ApprovalStore } from "./ports.js";

export interface ApprovalResult {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

export async function createApproval(deps: {
  readonly store: ControlApiStore & ApprovalStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly newId: () => string;
  readonly request: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly taskId?: string;
    readonly workItemId?: string;
    readonly toolName: string;
    readonly risk: string;
    readonly requestedAction: string;
    readonly argumentsPreview?: Record<string, unknown>;
    readonly expiresAt?: string;
  };
}): Promise<ApprovalResult> {
  const workspaceId = cleanOptional(deps.request.workspaceId);
  const runId = cleanOptional(deps.request.runId);
  const toolName = cleanOptional(deps.request.toolName);
  const risk = cleanOptional(deps.request.risk);
  const requestedAction = cleanOptional(deps.request.requestedAction);

  if (!workspaceId) {
    return badRequest("workspaceId is required.");
  }
  if (!runId || !toolName || !risk || !requestedAction) {
    return badRequest("runId, toolName, risk, and requestedAction are required.");
  }

  if (!isKnownRisk(risk)) {
    return badRequest("risk must be one of low, medium, high, or critical.");
  }

  const run = await deps.store.getRunById(runId);
  if (!run || run.userId !== deps.user.userId || run.workspaceId !== workspaceId) {
    return notFound("Run not found.");
  }

  const now = deps.now();
  const approvalId = `approval-${deps.newId()}`;
  const record: ApprovalRecord = {
    workspaceId,
    approvalId,
    runId,
    workItemId: cleanOptional(deps.request.workItemId),
    taskId: cleanOptional(deps.request.taskId),
    userId: deps.user.userId,
    ownerEmail: deps.user.email,
    toolName,
    risk,
    requestedAction,
    status: "requested",
    requestedBy: deps.user.userId,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
    argumentsPreview: isRecord(deps.request.argumentsPreview) ? deps.request.argumentsPreview : undefined,
    expiresAt: cleanOptional(deps.request.expiresAt)
  };

  await deps.store.putApproval(record);
  return { statusCode: 201, body: { approval: record } };
}

export async function getApproval(deps: {
  readonly store: ControlApiStore & ApprovalStore;
  readonly user: AuthenticatedUser;
  readonly workspaceId: string;
  readonly approvalId: string;
}): Promise<ApprovalResult> {
  const approval = await deps.store.getApproval(deps.workspaceId, deps.approvalId);
  if (!approval || approval.userId !== deps.user.userId) {
    return notFound("Approval not found.");
  }
  return { statusCode: 200, body: { approval } };
}

export async function listApprovalsForRun(deps: {
  readonly store: ControlApiStore & ApprovalStore;
  readonly user: AuthenticatedUser;
  readonly runId: string;
  readonly limit?: number;
}): Promise<ApprovalResult> {
  const run = await deps.store.getRunById(deps.runId);
  if (!run || run.userId !== deps.user.userId) {
    return notFound("Run not found.");
  }

  const approvals = await deps.store.listApprovalsForRun({
    runId: deps.runId,
    limit: clampLimit(deps.limit)
  });
  return {
    statusCode: 200,
    body: { approvals: approvals.filter((item) => item.userId === deps.user.userId && item.workspaceId === run.workspaceId) }
  };
}

export async function decideApproval(deps: {
  readonly store: ControlApiStore & ApprovalStore;
  readonly user: AuthenticatedUser;
  readonly now: () => string;
  readonly workspaceId: string;
  readonly approvalId: string;
  readonly decision: string;
  readonly reason?: string;
}): Promise<ApprovalResult> {
  const approval = await deps.store.getApproval(deps.workspaceId, deps.approvalId);
  if (!approval || approval.userId !== deps.user.userId) {
    return notFound("Approval not found.");
  }

  const decision = cleanOptional(deps.decision);
  if (!isDecision(decision)) {
    return badRequest("decision must be one of approved or rejected.");
  }

  if (approval.decidedBy !== undefined && approval.status !== "requested") {
    return conflict("This approval has already been decided.");
  }

  const updated = await deps.store.updateApproval({
    workspaceId: deps.workspaceId,
    approvalId: deps.approvalId,
    updates: {
      decision,
      status: decision === "approved" ? "approved" : "rejected",
      decidedBy: deps.user.userId,
      decidedAt: deps.now(),
      reason: cleanOptional(deps.reason)
    }
  });

  return { statusCode: 200, body: { approval: updated ?? approval } };
}

function badRequest(message: string): ApprovalResult {
  return { statusCode: 400, body: { error: "BadRequest", message } };
}

function conflict(message: string): ApprovalResult {
  return { statusCode: 409, body: { error: "Conflict", message } };
}

function notFound(message: string): ApprovalResult {
  return { statusCode: 404, body: { error: "NotFound", message } };
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownRisk(value: string): boolean {
  return ["low", "medium", "high", "critical"].includes(value);
}

function isDecision(value: string | undefined): value is "approved" | "rejected" {
  return value === "approved" || value === "rejected";
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}
