import crypto from "node:crypto";
import type { APIGatewayProxyStructuredResultV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { getArtifactDownloadUrl, getRunArtifact, listRunArtifacts, listWorkItemArtifacts } from "./artifacts.js";
import { S3ArtifactPresigner } from "./s3-presigner.js";
import { approveAgentProfileVersion, createAgentProfileDraft, getAgentProfileVersion, listAgentProfiles, S3AgentProfileBundleStore } from "./agent-profiles.js";
import { createRun } from "./create-run.js";
import { DynamoControlApiStore } from "./dynamo-store.js";
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

  const result = await getRun({ store, user: userFromEvent(event), runId });
  return json(result.statusCode, result.body);
}

export async function listRunsHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const result = await listRuns({
    store,
    user: userFromEvent(event),
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
 */
export async function userEngagementHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  const routeKey = event.routeKey ?? "";
  const caller = userFromEvent(event);

  if (routeKey === "POST /user-engagement/notify") {
    const body = parseJsonBody(event.body);
    const targetUserId = stringField(body, "userId");
    const title = optionalStringField(body, "title") ?? "AI Caller";
    const messageBody = stringField(body, "body");
    const deepLink = optionalStringField(body, "deepLink");

    if (!messageBody.trim()) {
      return json(400, { error: "BadRequest", message: "body must not be empty." });
    }

    // For now: log + return 202. Next steps (TODO):
    //  1. Resolve targetUserId → APNS device tokens (USER_DEVICES table).
    //  2. Send the banner via APNS HTTP/2 (or SNS Mobile Push topic).
    //  3. Optionally write a user_engagement event to the events table so
    //     the existing realtime relay surfaces it on the user's open
    //     WebSocket session for in-app delivery.
    console.log(JSON.stringify({
      kind: "user_engagement.notify",
      caller: caller.userId,
      targetUserId,
      title,
      bodyChars: messageBody.length,
      deepLink: deepLink ?? null,
      receivedAt: new Date().toISOString()
    }));

    return json(202, {
      accepted: true,
      method: "notify",
      targetUserId,
      note: "Banner delivery wiring is pending APNS configuration."
    });
  }

  return notImplemented(`Route '${routeKey}' is not handled by user-engagement.`);
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

function notImplemented(message: string): APIGatewayProxyStructuredResultV2 {
  return json(501, {
    error: "NotImplemented",
    message
  });
}
