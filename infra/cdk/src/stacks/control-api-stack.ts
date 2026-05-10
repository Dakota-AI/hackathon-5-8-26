import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, CorsHttpMethod, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { OrchestrationStack } from "./orchestration-stack.js";
import type { StateStack } from "./state-stack.js";
import type { StorageStack } from "./storage-stack.js";

export interface ControlApiStackProps extends AgentsCloudStackProps {
  readonly state: StateStack;
  readonly storage: StorageStack;
  readonly orchestration: OrchestrationStack;
}

const thisFile = fileURLToPath(import.meta.url);
const cdkSrcDir = path.dirname(thisFile);
const repoRoot = path.resolve(cdkSrcDir, "../../../../");
const controlApiEntry = path.join(repoRoot, "services/control-api/src/handlers.ts");

export class ControlApiStack extends AgentsCloudStack {
  public readonly api: HttpApi;

  public constructor(scope: Construct, id: string, props: ControlApiStackProps) {
    super(scope, id, props);

    const userPool = UserPool.fromUserPoolId(this, "AmplifyUserPool", props.config.auth.userPoolId);
    const authorizer = new HttpJwtAuthorizer("AmplifyJwtAuthorizer", `https://cognito-idp.${props.config.awsRegion}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [props.config.auth.userPoolClientId]
    });

    this.api = new HttpApi(this, "ControlApi", {
      apiName: logicalName(props.config, "control-api"),
      corsPreflight: {
        allowHeaders: ["authorization", "content-type", "x-idempotency-key"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH, CorsHttpMethod.OPTIONS],
        allowOrigins: ["*"],
        maxAge: Duration.days(1)
      }
    });

    const commonEnvironment = {
      WORK_ITEMS_TABLE_NAME: props.state.workItemsTable.tableName,
      RUNS_TABLE_NAME: props.state.runsTable.tableName,
      TASKS_TABLE_NAME: props.state.tasksTable.tableName,
      EVENTS_TABLE_NAME: props.state.eventsTable.tableName,
      ARTIFACTS_TABLE_NAME: props.state.artifactsTable.tableName,
      DATA_SOURCES_TABLE_NAME: props.state.dataSourcesTable.tableName,
      SURFACES_TABLE_NAME: props.state.surfacesTable.tableName,
      HOST_NODES_TABLE_NAME: props.state.hostNodesTable.tableName,
      USER_RUNNERS_TABLE_NAME: props.state.userRunnersTable.tableName,
      AGENT_PROFILES_TABLE_NAME: props.state.agentProfilesTable.tableName,
      PROFILE_BUNDLES_BUCKET_NAME: props.storage.workspaceLiveArtifactsBucket.bucketName,
      STATE_MACHINE_ARN: props.orchestration.simpleRunStateMachine.stateMachineArn,
      ADMIN_EMAILS: "seb4594@gmail.com"
    };

    const createRunFunction = new NodejsFunction(this, "CreateRunFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "createRunHandler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment
    });

    const getRunFunction = new NodejsFunction(this, "GetRunFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "getRunHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const listRunEventsFunction = new NodejsFunction(this, "ListRunEventsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "listRunEventsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const listAdminRunsFunction = new NodejsFunction(this, "ListAdminRunsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "listAdminRunsHandler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment
    });

    const listAdminRunEventsFunction = new NodejsFunction(this, "ListAdminRunEventsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "listAdminRunEventsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const workItemsFunction = new NodejsFunction(this, "WorkItemsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "workItemsHandler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment
    });

    const runnerStateFunction = new NodejsFunction(this, "RunnerStateFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "runnerStateHandler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment
    });

    const agentProfilesFunction = new NodejsFunction(this, "AgentProfilesFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "agentProfilesHandler",
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment
    });

    const artifactsFunction = new NodejsFunction(this, "ArtifactsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "artifactsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const dataSourceRefsFunction = new NodejsFunction(this, "DataSourceRefsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "notImplementedDataSourceRefsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const surfacesFunction = new NodejsFunction(this, "SurfacesFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "notImplementedSurfacesHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    props.state.workItemsTable.grantReadWriteData(createRunFunction);
    props.state.runsTable.grantReadWriteData(createRunFunction);
    props.state.tasksTable.grantReadWriteData(createRunFunction);
    props.state.eventsTable.grantReadWriteData(createRunFunction);
    props.orchestration.simpleRunStateMachine.grantStartExecution(createRunFunction);

    props.state.runsTable.grantReadData(getRunFunction);
    props.state.runsTable.grantReadData(listRunEventsFunction);
    props.state.eventsTable.grantReadData(listRunEventsFunction);
    props.state.runsTable.grantReadData(listAdminRunsFunction);
    props.state.eventsTable.grantReadData(listAdminRunsFunction);
    props.state.runsTable.grantReadData(listAdminRunEventsFunction);
    props.state.eventsTable.grantReadData(listAdminRunEventsFunction);

    props.state.workItemsTable.grantReadWriteData(workItemsFunction);
    props.state.runsTable.grantReadWriteData(workItemsFunction);
    props.state.tasksTable.grantReadWriteData(workItemsFunction);
    props.state.eventsTable.grantReadWriteData(workItemsFunction);
    props.state.artifactsTable.grantReadData(workItemsFunction);
    props.orchestration.simpleRunStateMachine.grantStartExecution(workItemsFunction);

    props.state.hostNodesTable.grantReadWriteData(runnerStateFunction);
    props.state.userRunnersTable.grantReadWriteData(runnerStateFunction);

    props.state.agentProfilesTable.grantReadWriteData(agentProfilesFunction);
    props.storage.workspaceLiveArtifactsBucket.grantReadWrite(agentProfilesFunction);

    props.state.workItemsTable.grantReadData(artifactsFunction);
    props.state.runsTable.grantReadData(artifactsFunction);
    props.state.artifactsTable.grantReadData(artifactsFunction);

    props.state.workItemsTable.grantReadData(dataSourceRefsFunction);
    props.state.runsTable.grantReadData(dataSourceRefsFunction);
    props.state.artifactsTable.grantReadData(dataSourceRefsFunction);
    props.state.dataSourcesTable.grantReadWriteData(dataSourceRefsFunction);

    props.state.workItemsTable.grantReadData(surfacesFunction);
    props.state.runsTable.grantReadData(surfacesFunction);
    props.state.dataSourcesTable.grantReadData(surfacesFunction);
    props.state.surfacesTable.grantReadWriteData(surfacesFunction);

    this.api.addRoutes({
      path: "/runs",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("CreateRunIntegration", createRunFunction),
      authorizer
    });
    this.api.addRoutes({
      path: "/runs/{runId}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetRunIntegration", getRunFunction),
      authorizer
    });
    this.api.addRoutes({
      path: "/runs/{runId}/events",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListRunEventsIntegration", listRunEventsFunction),
      authorizer
    });
    this.api.addRoutes({
      path: "/admin/runs",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListAdminRunsIntegration", listAdminRunsFunction),
      authorizer
    });
    this.api.addRoutes({
      path: "/admin/runs/{runId}/events",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListAdminRunEventsIntegration", listAdminRunEventsFunction),
      authorizer
    });

    for (const route of [
      { path: "/work-items", methods: [HttpMethod.POST, HttpMethod.GET] },
      { path: "/work-items/{workItemId}", methods: [HttpMethod.GET, HttpMethod.PATCH] },
      { path: "/work-items/{workItemId}/status", methods: [HttpMethod.POST] },
      { path: "/work-items/{workItemId}/runs", methods: [HttpMethod.POST, HttpMethod.GET] },
      { path: "/work-items/{workItemId}/events", methods: [HttpMethod.GET] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`WorkItemsIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, workItemsFunction),
        authorizer
      });
    }

    for (const route of [
      { path: "/runner-hosts", methods: [HttpMethod.POST] },
      { path: "/runner-hosts/{hostId}/heartbeat", methods: [HttpMethod.POST] },
      { path: "/user-runners", methods: [HttpMethod.POST] },
      { path: "/user-runners/{runnerId}", methods: [HttpMethod.GET, HttpMethod.PATCH] },
      { path: "/user-runners/{runnerId}/heartbeat", methods: [HttpMethod.POST] },
      { path: "/admin/runners", methods: [HttpMethod.GET] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`RunnerStateIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, runnerStateFunction),
        authorizer
      });
    }

    for (const route of [
      { path: "/agent-profiles/drafts", methods: [HttpMethod.POST] },
      { path: "/agent-profiles", methods: [HttpMethod.GET] },
      { path: "/agent-profiles/{profileId}/versions/{version}", methods: [HttpMethod.GET] },
      { path: "/agent-profiles/{profileId}/versions/{version}/approve", methods: [HttpMethod.POST] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`AgentProfilesIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, agentProfilesFunction),
        authorizer
      });
    }

    for (const route of [
      { path: "/work-items/{workItemId}/artifacts", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/artifacts", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/artifacts/{artifactId}", methods: [HttpMethod.GET] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`ArtifactsIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}`, artifactsFunction),
        authorizer
      });
    }

    for (const route of [
      { path: "/data-source-refs", methods: [HttpMethod.POST] },
      { path: "/data-source-refs/{dataSourceId}", methods: [HttpMethod.GET] },
      { path: "/work-items/{workItemId}/data-source-refs", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/data-source-refs", methods: [HttpMethod.GET] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`DataSourceRefsIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, dataSourceRefsFunction),
        authorizer
      });
    }

    for (const route of [
      { path: "/surfaces", methods: [HttpMethod.POST] },
      { path: "/surfaces/{surfaceId}", methods: [HttpMethod.GET, HttpMethod.PATCH] },
      { path: "/work-items/{workItemId}/surfaces", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/surfaces", methods: [HttpMethod.GET] },
      { path: "/surfaces/{surfaceId}/publish", methods: [HttpMethod.POST] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`SurfacesIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, surfacesFunction),
        authorizer
      });
    }

    new CfnOutput(this, "ControlApiUrl", {
      value: this.api.apiEndpoint,
      exportName: logicalName(props.config, "control-api-url")
    });
  }
}
