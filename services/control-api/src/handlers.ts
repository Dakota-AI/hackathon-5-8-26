import crypto from "node:crypto";
import type { APIGatewayProxyStructuredResultV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { createRun } from "./create-run.js";
import { DynamoControlApiStore } from "./dynamo-store.js";
import { getRun, listAdminRunEvents, listAdminRuns, listRunEvents } from "./query-runs.js";
import { StepFunctionsExecutionStarter } from "./step-functions.js";
import type { AuthenticatedUser } from "./ports.js";

const store = DynamoControlApiStore.fromEnvironment();
const executions = StepFunctionsExecutionStarter.fromEnvironment();

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

export async function notImplementedWorkItemsHandler(): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented("WorkItem API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

export async function notImplementedArtifactsHandler(): Promise<APIGatewayProxyStructuredResultV2> {
  return notImplemented("Artifact API is provisioned in infrastructure and will be implemented in the Control API phase.");
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
