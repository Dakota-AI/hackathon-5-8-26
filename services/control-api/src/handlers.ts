import crypto from "node:crypto";
import type { APIGatewayProxyStructuredResultV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { getRunArtifact, listRunArtifacts, listWorkItemArtifacts } from "./artifacts.js";
import { approveAgentProfileVersion, createAgentProfileDraft, getAgentProfileVersion, listAgentProfiles, S3AgentProfileBundleStore } from "./agent-profiles.js";
import { createRun } from "./create-run.js";
import { DynamoControlApiStore } from "./dynamo-store.js";
import { getRun, listAdminRunEvents, listAdminRuns, listRunEvents } from "./query-runs.js";
import { StepFunctionsExecutionStarter } from "./step-functions.js";
import { createWorkItem, createWorkItemRun, getWorkItem, listWorkItemEvents, listWorkItemRuns, listWorkItems, updateWorkItemStatus } from "./work-items.js";
import { createUserRunner, getUserRunner, heartbeatHostNode, heartbeatUserRunner, listAdminRunnerState, registerHostNode, updateUserRunnerDesiredState } from "./user-runners.js";
import type { AuthenticatedUser } from "./ports.js";

const store = DynamoControlApiStore.fromEnvironment();
const executions = StepFunctionsExecutionStarter.fromEnvironment();
const profileBundles = S3AgentProfileBundleStore.fromEnvironment();

export async function createRunHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const body = parseJsonBody(event.body);
  const result = await createRun({
    store,
    executions,
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
    user,
    request: {
      workspaceId: stringField(body, "workspaceId"),
      objective: stringField(body, "objective"),
      idempotencyKey: optionalStringField(body, "idempotencyKey")
    }
  });
  return json(result.statusCode, result.body);
}

export async function getRunHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) {
    return json(400, { error: "BadRequest", message: "runId path parameter is required." });
  }

  const result = await getRun({ store, user: userFromEvent(event), runId });
  return json(result.statusCode, result.body);
}

export async function listRunEventsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) {
    return json(400, { error: "BadRequest", message: "runId path parameter is required." });
  }

  const result = await listRunEvents({
    store,
    user: userFromEvent(event),
    runId,
    afterSeq: parseOptionalInteger(event.queryStringParameters?.afterSeq),
    limit: parseOptionalInteger(event.queryStringParameters?.limit)
  });
  return json(result.statusCode, result.body);
}

export async function listAdminRunsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const result = await listAdminRuns({
    store,
    user: userFromEvent(event),
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    limit: parseOptionalInteger(event.queryStringParameters?.limit)
  });
  return json(result.statusCode, result.body);
}

export async function listAdminRunEventsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) {
    return json(400, { error: "BadRequest", message: "runId path parameter is required." });
  }

  const result = await listAdminRunEvents({
    store,
    user: userFromEvent(event),
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    runId,
    afterSeq: parseOptionalInteger(event.queryStringParameters?.afterSeq),
    limit: parseOptionalInteger(event.queryStringParameters?.limit)
  });
  return json(result.statusCode, result.body);
}

export async function runnerStateHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  const routeKey = event.routeKey;

  if (routeKey === "POST /runner-hosts") {
    const body = parseJsonBody(event.body);
    const result = await registerHostNode({
      store,
      user,
      adminEmails,
      now: () => new Date().toISOString(),
      request: {
        hostId: stringField(body, "hostId"),
        placementTarget: stringField(body, "placementTarget"),
        status: optionalStringField(body, "status"),
        capacity: optionalRecordField(body, "capacity"),
        health: optionalRecordField(body, "health")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /runner-hosts/{hostId}/heartbeat") {
    const hostId = event.pathParameters?.hostId;
    if (!hostId) {
      return json(400, { error: "BadRequest", message: "hostId path parameter is required." });
    }
    const body = parseJsonBody(event.body);
    const result = await heartbeatHostNode({
      store,
      user,
      adminEmails,
      now: () => new Date().toISOString(),
      hostId,
      request: {
        status: optionalStringField(body, "status"),
        capacity: optionalRecordField(body, "capacity"),
        health: optionalRecordField(body, "health")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /user-runners") {
    const body = parseJsonBody(event.body);
    const result = await createUserRunner({
      store,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      request: {
        workspaceId: stringField(body, "workspaceId"),
        runnerId: optionalStringField(body, "runnerId"),
        status: optionalStringField(body, "status"),
        desiredState: optionalStringField(body, "desiredState"),
        hostId: optionalStringField(body, "hostId"),
        placementTarget: optionalStringField(body, "placementTarget"),
        resourceLimits: optionalRecordField(body, "resourceLimits"),
        health: optionalRecordField(body, "health")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /user-runners/{runnerId}") {
    const runnerId = event.pathParameters?.runnerId;
    if (!runnerId) {
      return json(400, { error: "BadRequest", message: "runnerId path parameter is required." });
    }
    const result = await getUserRunner({ store, user, runnerId });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "PATCH /user-runners/{runnerId}") {
    const runnerId = event.pathParameters?.runnerId;
    if (!runnerId) {
      return json(400, { error: "BadRequest", message: "runnerId path parameter is required." });
    }
    const body = parseJsonBody(event.body);
    const result = await updateUserRunnerDesiredState({
      store,
      user,
      now: () => new Date().toISOString(),
      runnerId,
      request: {
        desiredState: stringField(body, "desiredState"),
        resourceLimits: optionalRecordField(body, "resourceLimits")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /user-runners/{runnerId}/heartbeat") {
    const runnerId = event.pathParameters?.runnerId;
    if (!runnerId) {
      return json(400, { error: "BadRequest", message: "runnerId path parameter is required." });
    }
    const body = parseJsonBody(event.body);
    const result = await heartbeatUserRunner({
      store,
      user,
      now: () => new Date().toISOString(),
      runnerId,
      request: {
        status: optionalStringField(body, "status"),
        hostId: optionalStringField(body, "hostId"),
        placementTarget: optionalStringField(body, "placementTarget"),
        health: optionalRecordField(body, "health")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /admin/runners") {
    const result = await listAdminRunnerState({
      store,
      user,
      adminEmails,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  return notImplemented("Runner state route is provisioned in infrastructure and will be implemented in the next Control API phase.");
}

export async function workItemsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const routeKey = event.routeKey;

  if (routeKey === "POST /work-items") {
    const body = parseJsonBody(event.body);
    const result = await createWorkItem({
      store,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      request: {
        workspaceId: stringField(body, "workspaceId"),
        title: optionalStringField(body, "title"),
        objective: stringField(body, "objective"),
        priority: optionalStringField(body, "priority"),
        idempotencyKey: optionalStringField(body, "idempotencyKey")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /work-items") {
    const result = await listWorkItems({
      store,
      user,
      workspaceId: event.queryStringParameters?.workspaceId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /work-items/{workItemId}") {
    const workItemId = event.pathParameters?.workItemId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and workItemId path parameter are required." });
    }
    const result = await getWorkItem({ store, user, workspaceId, workItemId });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "PATCH /work-items/{workItemId}" || routeKey === "POST /work-items/{workItemId}/status") {
    const workItemId = event.pathParameters?.workItemId;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId and workItemId are required." });
    }
    const result = await updateWorkItemStatus({
      store,
      user,
      workspaceId,
      workItemId,
      status: stringField(body, "status"),
      now: () => new Date().toISOString()
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /work-items/{workItemId}/runs") {
    const workItemId = event.pathParameters?.workItemId;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId and workItemId are required." });
    }
    const result = await createWorkItemRun({
      store,
      executions,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      workspaceId,
      workItemId,
      objective: stringField(body, "objective"),
      idempotencyKey: optionalStringField(body, "idempotencyKey")
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /work-items/{workItemId}/runs" || routeKey === "GET /work-items/{workItemId}/events") {
    const workItemId = event.pathParameters?.workItemId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and workItemId path parameter are required." });
    }
    const args = {
      store,
      user,
      workspaceId,
      workItemId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    };
    const result = routeKey === "GET /work-items/{workItemId}/runs" ? await listWorkItemRuns(args) : await listWorkItemEvents(args);
    return json(result.statusCode, result.body);
  }

  return notImplemented("This WorkItem route is provisioned in infrastructure and will be implemented in the next Control API phase.");
}

export async function agentProfilesHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const routeKey = event.routeKey;

  if (routeKey === "POST /agent-profiles/drafts") {
    const body = parseJsonBody(event.body);
    const result = await createAgentProfileDraft({
      store,
      bundles: profileBundles,
      user,
      now: () => new Date().toISOString(),
      request: {
        workspaceId: stringField(body, "workspaceId"),
        profile: recordField(body, "profile") as never
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /agent-profiles") {
    const result = await listAgentProfiles({
      store,
      user,
      workspaceId: event.queryStringParameters?.workspaceId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /agent-profiles/{profileId}/versions/{version}") {
    const profileId = event.pathParameters?.profileId;
    const version = event.pathParameters?.version;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workspaceId || !profileId || !version) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter, profileId path parameter, and version path parameter are required." });
    }
    const result = await getAgentProfileVersion({ store, user, workspaceId, profileId, version });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /agent-profiles/{profileId}/versions/{version}/approve") {
    const profileId = event.pathParameters?.profileId;
    const version = event.pathParameters?.version;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!workspaceId || !profileId || !version) {
      return json(400, { error: "BadRequest", message: "workspaceId, profileId, and version are required." });
    }
    const result = await approveAgentProfileVersion({
      store,
      bundles: profileBundles,
      user,
      now: () => new Date().toISOString(),
      workspaceId,
      profileId,
      version,
      notes: optionalStringField(body, "notes")
    });
    return json(result.statusCode, result.body);
  }

  return notImplemented("This AgentProfile route is provisioned in infrastructure and will be implemented in the next Control API phase.");
}

export async function artifactsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const routeKey = event.routeKey;

  if (routeKey === "GET /work-items/{workItemId}/artifacts") {
    const workItemId = event.pathParameters?.workItemId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and workItemId path parameter are required." });
    }
    const result = await listWorkItemArtifacts({
      store,
      user,
      workspaceId,
      workItemId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /runs/{runId}/artifacts") {
    const runId = event.pathParameters?.runId;
    if (!runId) {
      return json(400, { error: "BadRequest", message: "runId path parameter is required." });
    }
    const result = await listRunArtifacts({
      store,
      user,
      runId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /runs/{runId}/artifacts/{artifactId}") {
    const runId = event.pathParameters?.runId;
    const artifactId = event.pathParameters?.artifactId;
    if (!runId || !artifactId) {
      return json(400, { error: "BadRequest", message: "runId and artifactId path parameters are required." });
    }
    const result = await getRunArtifact({ store, user, runId, artifactId });
    return json(result.statusCode, result.body);
  }

  return notImplemented("This Artifact route is provisioned in infrastructure but does not yet have a handler implementation.");
}

export async function notImplementedDataSourceRefsHandler(): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented("DataSourceRef API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

export async function notImplementedSurfacesHandler(): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented("Surface API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

function userFromEvent(event: APIGatewayProxyEventV2WithJWTAuthorizer): AuthenticatedUser {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = String(claims.sub ?? "");
  if (!userId) {
    throw new Error("Authenticated request is missing Cognito subject claim.");
  }

  const emailClaim = claims.email;
  return {
    userId,
    email: typeof emailClaim === "string" ? emailClaim : undefined
  };
}

function parseJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body) {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function optionalStringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalRecordField(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = body[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function recordField(body: Record<string, unknown>, key: string): Record<string, unknown> {
  return optionalRecordField(body, key) ?? {};
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAdminEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function json(statusCode: number, body: Record<string, unknown>): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function notImplemented(message: string): APIGatewayProxyStructuredResultV2 {
  return json(501, {
    error: "NotImplemented",
    message
  });
}
