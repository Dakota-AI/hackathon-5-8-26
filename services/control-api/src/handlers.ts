import crypto from "node:crypto";
import type { APIGatewayProxyStructuredResultV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { buildCanonicalEvent } from "@agents-cloud/protocol";
import { getArtifactDownloadUrl, getRunArtifact, listRunArtifacts, listWorkItemArtifacts } from "./artifacts.js";
import { S3ArtifactPresigner } from "./s3-presigner.js";
import { approveAgentProfileVersion, createAgentProfileDraft, getAgentProfileVersion, listAgentProfiles, S3AgentProfileBundleStore } from "./agent-profiles.js";
import { createRun } from "./create-run.js";
import { DynamoControlApiStore } from "./dynamo-store.js";
import { hasProductAccessGroup, parseAuthenticatedUser } from "./access-control.js";
import { getRun, listAdminRunEvents, listAdminRuns, listRunEvents, listRuns } from "./query-runs.js";
import { createDataSourceRef, getDataSourceRef, listDataSourceRefsForRun, listDataSourceRefsForWorkItem } from "./data-source-refs.js";
import { StepFunctionsExecutionStarter } from "./step-functions.js";
import { createWorkItem, createWorkItemRun, getWorkItem, listWorkItemEvents, listWorkItemRuns, listWorkItems, updateWorkItemStatus } from "./work-items.js";
import { createUserRunner, getUserRunner, heartbeatHostNode, heartbeatUserRunner, listAdminRunnerState, registerHostNode, updateUserRunnerDesiredState } from "./user-runners.js";
import { createApproval, decideApproval, getApproval, listApprovalsForRun } from "./approvals.js";
import { createSurface, getSurface, listSurfacesForRun, listSurfacesForWorkItem, publishSurface, updateSurface } from "./surfaces.js";
import { LambdaAsyncExecutionStarter } from "./lambda-async-execution.js";
import { DispatcherExecutionStarter } from "./runner-dispatcher-aws.js";
import type { AuthenticatedUser, ExecutionStarter } from "./ports.js";

const store = DynamoControlApiStore.fromEnvironment();
const residentDispatcherExecutions: ExecutionStarter | undefined = DispatcherExecutionStarter.isConfigured()
  ? DispatcherExecutionStarter.fromEnvironment({
      store,
      resolveUser: ({ userId }) => ({ userId })
    })
  : undefined;
// Prefer an async Lambda handoff for the public create-run path when resident
// dispatch is configured. The background handler can spend minutes launching
// ECS and waiting for Hermes, while POST /runs returns a durable 202 quickly.
const executions: ExecutionStarter = LambdaAsyncExecutionStarter.isConfigured()
  ? LambdaAsyncExecutionStarter.fromEnvironment()
  : residentDispatcherExecutions ?? StepFunctionsExecutionStarter.fromEnvironment();
const profileBundles = S3AgentProfileBundleStore.fromEnvironment();
const artifactPresigner = S3ArtifactPresigner.fromEnvironment();

export async function createRunHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
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

export async function dispatchRunHandler(event: unknown): Promise<void> {
  if (!residentDispatcherExecutions) {
    throw new Error("Resident dispatcher is not configured for dispatchRunHandler.");
  }
  const payload = parseDispatchPayload(event);
  const execution = await residentDispatcherExecutions.startExecution(payload);
  await store.updateRunExecution({
    workspaceId: payload.workspaceId,
    runId: payload.runId,
    executionArn: execution.executionArn,
    updatedAt: new Date().toISOString()
  });
}

export async function getRunHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) {
    return json(400, { error: "BadRequest", message: "runId path parameter is required." });
  }
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }

  const result = await getRun({ store, user, runId });
  return json(result.statusCode, result.body);
}

export async function listRunsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }

  const result = await listRuns({
    store,
    user,
    workspaceId: event.queryStringParameters?.workspaceId,
    limit: parseOptionalInteger(event.queryStringParameters?.limit)
  });
  return json(result.statusCode, result.body);
}

export async function listRunEventsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const runId = event.pathParameters?.runId;
  if (!runId) {
    return json(400, { error: "BadRequest", message: "runId path parameter is required." });
  }
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }

  const result = await listRunEvents({
    store,
    user,
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
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
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
        health: optionalRecordField(body, "health"),
        privateIp: optionalStringField(body, "privateIp"),
        runnerEndpoint: optionalStringField(body, "runnerEndpoint"),
        taskArn: optionalStringField(body, "taskArn")
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
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
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
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
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
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
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

  if (routeKey === "GET /runs/{runId}/artifacts/{artifactId}/download") {
    const runId = event.pathParameters?.runId;
    const artifactId = event.pathParameters?.artifactId;
    if (!runId || !artifactId) {
      return json(400, { error: "BadRequest", message: "runId and artifactId path parameters are required." });
    }
    const result = await getArtifactDownloadUrl({
      store,
      presigner: artifactPresigner,
      user,
      runId,
      artifactId,
      expiresInSeconds: parseOptionalInteger(event.queryStringParameters?.expiresIn)
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

export async function dataSourceRefsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
  const routeKey = event.routeKey;

  if (routeKey === "POST /data-source-refs") {
    const body = parseJsonBody(event.body);
    const result = await createDataSourceRef({
      store,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      request: {
        workspaceId: stringField(body, "workspaceId"),
        runId: optionalStringField(body, "runId"),
        workItemId: optionalStringField(body, "workItemId"),
        artifactId: optionalStringField(body, "artifactId"),
        sourceKind: stringField(body, "sourceKind"),
        source: stringField(body, "source"),
        displayName: optionalStringField(body, "displayName"),
        status: optionalStringField(body, "status"),
        metadata: optionalRecordField(body, "metadata")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /data-source-refs/{dataSourceId}") {
    const dataSourceId = event.pathParameters?.dataSourceId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!dataSourceId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and dataSourceId path parameter are required." });
    }
    const result = await getDataSourceRef({ store, user, workspaceId, dataSourceId });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /work-items/{workItemId}/data-source-refs") {
    const workItemId = event.pathParameters?.workItemId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and workItemId path parameter are required." });
    }
    const result = await listDataSourceRefsForWorkItem({
      store,
      user,
      workspaceId,
      workItemId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /runs/{runId}/data-source-refs") {
    const runId = event.pathParameters?.runId;
    if (!runId) {
      return json(400, { error: "BadRequest", message: "runId path parameter is required." });
    }
    const result = await listDataSourceRefsForRun({
      store,
      user,
      runId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  return notImplemented("DataSourceRef API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

export async function surfacesHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
  const routeKey = event.routeKey;

  if (routeKey === "POST /surfaces") {
    const body = parseJsonBody(event.body);
    const workspaceId = stringField(body, "workspaceId");
    const result = await createSurface({
      store,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      request: {
        workspaceId,
        runId: optionalStringField(body, "runId"),
        workItemId: optionalStringField(body, "workItemId"),
        surfaceType: stringField(body, "surfaceType"),
        name: stringField(body, "name"),
        definition: optionalRecordField(body, "definition") ?? {},
        status: optionalStringField(body, "status"),
        publishedUrl: optionalStringField(body, "publishedUrl")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /surfaces/{surfaceId}") {
    const surfaceId = event.pathParameters?.surfaceId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!surfaceId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and surfaceId path parameter are required." });
    }
    const result = await getSurface({ store, user, workspaceId, surfaceId });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "PATCH /surfaces/{surfaceId}") {
    const surfaceId = event.pathParameters?.surfaceId;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!surfaceId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId and surfaceId are required." });
    }
    const result = await updateSurface({
      store,
      user,
      now: () => new Date().toISOString(),
      workspaceId,
      surfaceId,
      updates: {
        name: optionalStringField(body, "name"),
        status: optionalStringField(body, "status"),
        definition: optionalRecordField(body, "definition")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /surfaces/{surfaceId}/publish") {
    const surfaceId = event.pathParameters?.surfaceId;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!surfaceId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId and surfaceId are required." });
    }
    const result = await publishSurface({
      store,
      user,
      now: () => new Date().toISOString(),
      workspaceId,
      surfaceId,
      publishedUrl: optionalStringField(body, "publishedUrl")
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /work-items/{workItemId}/surfaces") {
    const workItemId = event.pathParameters?.workItemId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!workItemId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and workItemId path parameter are required." });
    }
    const result = await listSurfacesForWorkItem({
      store,
      user,
      workspaceId,
      workItemId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /runs/{runId}/surfaces") {
    const runId = event.pathParameters?.runId;
    if (!runId) {
      return json(400, { error: "BadRequest", message: "runId path parameter is required." });
    }
    const result = await listSurfacesForRun({
      store,
      user,
      runId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  return notImplemented("Surface API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

export async function approvalsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const user = userFromEvent(event);
  const productAccessError = requireProductAccess(user);
  if (productAccessError) {
    return productAccessError;
  }
  const routeKey = event.routeKey;

  if (routeKey === "POST /approvals") {
    const body = parseJsonBody(event.body);
    const result = await createApproval({
      store,
      user,
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
      request: {
        workspaceId: stringField(body, "workspaceId"),
        runId: stringField(body, "runId"),
        taskId: optionalStringField(body, "taskId"),
        workItemId: optionalStringField(body, "workItemId"),
        toolName: stringField(body, "toolName"),
        risk: stringField(body, "risk"),
        requestedAction: stringField(body, "requestedAction"),
        argumentsPreview: optionalRecordField(body, "argumentsPreview"),
        expiresAt: optionalStringField(body, "expiresAt")
      }
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /approvals/{approvalId}") {
    const approvalId = event.pathParameters?.approvalId;
    const workspaceId = event.queryStringParameters?.workspaceId;
    if (!approvalId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId query parameter and approvalId path parameter are required." });
    }
    const result = await getApproval({ store, user, workspaceId, approvalId });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "GET /runs/{runId}/approvals") {
    const runId = event.pathParameters?.runId;
    if (!runId) {
      return json(400, { error: "BadRequest", message: "runId path parameter is required." });
    }
    const result = await listApprovalsForRun({
      store,
      user,
      runId,
      limit: parseOptionalInteger(event.queryStringParameters?.limit)
    });
    return json(result.statusCode, result.body);
  }

  if (routeKey === "POST /approvals/{approvalId}/decision") {
    const approvalId = event.pathParameters?.approvalId;
    const body = parseJsonBody(event.body);
    const workspaceId = optionalStringField(body, "workspaceId") ?? event.queryStringParameters?.workspaceId;
    if (!approvalId || !workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId and approvalId are required." });
    }
    const result = await decideApproval({
      store,
      user,
      now: () => new Date().toISOString(),
      workspaceId,
      approvalId,
      decision: stringField(body, "decision"),
      reason: optionalStringField(body, "reason")
    });
    return json(result.statusCode, result.body);
  }

  return notImplemented("Approvals API is provisioned in infrastructure and will be implemented in the Control API phase.");
}

/**
 * Receives proactive engagement requests from the Hermes agent (via the
 * `phone_user` tool). Today this validates + logs and returns 202; the
 * real delivery (APNS push, fan-out to user-scoped WebSocket via the
 * Cloudflare Durable Object hub) is wired in a follow-up.
 *
 * Routes covered:
 *   POST /user-engagement/notify
 *   POST /user-engagement/call
 */
export async function userEngagementHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const routeKey = event.routeKey ?? "";
  const caller = userFromEvent(event);
  const productAccessError = requireProductAccess(caller);
  if (productAccessError) {
    return productAccessError;
  }

  if (routeKey === "POST /user-engagement/notify" || routeKey === "POST /user-engagement/call") {
    const isCall = routeKey === "POST /user-engagement/call";
    const body = parseJsonBody(event.body);
    const runId = stringField(body, "runId");
    const workspaceId = optionalStringField(body, "workspaceId");
    const taskId = optionalStringField(body, "taskId");
    const idempotencyKey = optionalStringField(body, "idempotencyKey");
    const targetUserId = optionalStringField(body, "targetUserId") ?? optionalStringField(body, "userId") ?? caller.userId;
    const title = optionalStringField(body, "title") ?? (isCall ? "Incoming call" : "AI update");
    const messageBody = isCall ? optionalStringField(body, "summary") ?? stringField(body, "body") : stringField(body, "body");
    const deepLink = optionalStringField(body, "deepLink");
    const urgency = optionalStringField(body, "urgency") ?? "normal";
    if (!workspaceId) {
      return json(400, { error: "BadRequest", message: "workspaceId is required." });
    }
    if (!runId) {
      return json(400, { error: "BadRequest", message: "runId is required." });
    }
    if (!targetUserId || targetUserId !== caller.userId) {
      return json(403, { error: "Forbidden", message: "targetUserId can only target the authenticated user." });
    }
    const run = await store.getRunById(runId);
    if (!run || run.userId !== caller.userId || run.workspaceId !== workspaceId) {
      return json(404, { error: "NotFound", message: "Run not found." });
    }

    if (urgency !== "low" && urgency !== "normal" && urgency !== "high") {
      return json(400, { error: "BadRequest", message: "urgency must be one of low, normal, high." });
    }
    if (!messageBody.trim()) {
      return json(400, { error: "BadRequest", message: isCall ? "summary is required." : "body is required." });
    }

    const nextSeq = (await nextEventSeq(store, runId)) + 1;
    const eventId = userEventId(runId, nextSeq);
    const eventType = isCall ? "user.call.requested" : "user.notification.requested";
    const engagementEvent = buildCanonicalEvent({
      id: eventId,
      seq: nextSeq,
      createdAt: new Date().toISOString(),
      userId: run.userId,
      workspaceId: run.workspaceId,
      runId,
      taskId,
      idempotencyKey,
      source: {
        kind: "control-api",
        name: "control-api.user-engagement"
      },
      type: eventType,
      payload: compactRecord({
        kind: isCall ? "call" : "notify",
        targetUserId,
        title,
        body: isCall ? undefined : messageBody,
        summary: isCall ? messageBody : undefined,
        urgency,
        deepLink,
        deliveryStatus: "requested"
      })
    });
    await store.putEvent(engagementEvent);
    void emitUserEngagementNotification({
      type: engagementEvent.type,
      targetUserId,
      runId,
      workspaceId: run.workspaceId,
      eventId,
      title,
      message: messageBody,
      deepLink,
      urgency
    });

    return json(202, {
      accepted: true,
      type: eventType,
      eventId,
      targetUserId,
      runId,
      taskId,
      seq: nextSeq,
      deliveryStatus: "event_recorded"
    });
  }

  return notImplemented(`Route '${routeKey}' is not handled by user-engagement.`);
}

function userFromEvent(event: APIGatewayProxyEventV2WithJWTAuthorizer): AuthenticatedUser {
  return parseAuthenticatedUser(event.requestContext.authorizer.jwt.claims);
}

function parseJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body) {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function parseDispatchPayload(event: unknown): {
  readonly runId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly workItemId?: string;
  readonly userId: string;
  readonly objective: string;
} {
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    throw new Error("Dispatch payload must be an object.");
  }
  const body = event as Record<string, unknown>;
  const required = (key: string): string => {
    const value = body[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Dispatch payload is missing ${key}.`);
    }
    return value;
  };
  return {
    runId: required("runId"),
    taskId: required("taskId"),
    workspaceId: required("workspaceId"),
    workItemId: optionalStringField(body, "workItemId"),
    userId: required("userId"),
    objective: required("objective")
  };
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

async function nextEventSeq(inputStore: { readonly listEvents: (runId: string, options?: { readonly afterSeq?: number; readonly limit?: number }) => Promise<readonly { readonly seq: number }[]> }, runId: string): Promise<number> {
  let latest = 0;
  let afterSeq: number | undefined;

  while (true) {
    const events = await inputStore.listEvents(runId, {
      afterSeq,
      limit: 100
    });
    if (events.length === 0) {
      break;
    }
    latest = events[events.length - 1]?.seq ?? latest;
    afterSeq = latest;
    if (events.length < 100) {
      break;
    }
  }
  return latest;
}

function userEventId(runId: string, seq: number): string {
  return `evt-${runId}-${String(seq).padStart(6, "0")}`;
}

async function emitUserEngagementNotification(input: {
  readonly type: string;
  readonly targetUserId: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly eventId: string;
  readonly title?: string;
  readonly message: string;
  readonly deepLink?: string;
  readonly urgency: string;
}): Promise<void> {
  const webhookUrl = process.env.USER_ENGAGEMENT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const webhookToken = process.env.USER_ENGAGEMENT_WEBHOOK_TOKEN;
  if (webhookToken) {
    headers.authorization = `Bearer ${webhookToken}`;
  }
  const controller = new AbortController();
  const timeoutMs = Number.parseInt(process.env.USER_ENGAGEMENT_WEBHOOK_TIMEOUT_MS ?? "1500", 10);
  const timeout = setTimeout(() => {
    controller.abort();
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal
    });
  } catch (error) {
    console.warn(JSON.stringify({
      kind: "user_engagement_webhook_error",
      workspaceId: input.workspaceId,
      runId: input.runId,
      targetUserId: input.targetUserId,
      type: input.type,
      error: String(error)
    }));
  } finally {
    clearTimeout(timeout);
  }
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requireProductAccess(user: AuthenticatedUser): APIGatewayProxyStructuredResultV2 | undefined {
  if (!hasProductAccessGroup(user)) {
    return json(403, {
      error: "Forbidden",
      message: "Active Agents Cloud user access is required."
    });
  }
  return undefined;
}

function notImplemented(message: string): APIGatewayProxyStructuredResultV2 {
  return json(501, {
    error: "NotImplemented",
    message
  });
}
