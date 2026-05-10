import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, CorsHttpMethod, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Port, SubnetType } from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { OrchestrationStack } from "./orchestration-stack.js";
import type { RuntimeStack } from "./runtime-stack.js";
import type { StateStack } from "./state-stack.js";
import type { StorageStack } from "./storage-stack.js";

export interface ControlApiStackProps extends AgentsCloudStackProps {
  readonly state: StateStack;
  readonly storage: StorageStack;
  readonly orchestration: OrchestrationStack;
  /** When provided, wires the createRunFunction to dispatch to the resident runner instead of the SFN smoke worker. */
  readonly residentDispatch?: {
    readonly cluster: ClusterStack;
    readonly network: NetworkStack;
    readonly runtime: RuntimeStack;
  };
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
      APPROVALS_TABLE_NAME: props.state.approvalsTable.tableName,
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
      timeout: props.residentDispatch ? Duration.seconds(30) : Duration.seconds(15),
      memorySize: 256,
      environment: commonEnvironment,
      ...(props.residentDispatch ? {
        vpc: props.residentDispatch.network.vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [props.residentDispatch.network.workerSecurityGroup]
      } : {})
    });

    const dispatchRunFunction = props.residentDispatch ? new NodejsFunction(this, "DispatchRunFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "dispatchRunHandler",
      timeout: Duration.seconds(900),
      memorySize: 256,
      environment: commonEnvironment,
      vpc: props.residentDispatch.network.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.residentDispatch.network.workerSecurityGroup]
    }) : undefined;

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

    const listRunsFunction = new NodejsFunction(this, "ListRunsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "listRunsHandler",
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
      handler: "dataSourceRefsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const surfacesFunction = new NodejsFunction(this, "SurfacesFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "surfacesHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const approvalsFunction = new NodejsFunction(this, "ApprovalsFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "approvalsHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    // Receives proactive engagement requests from Hermes (phone_user tool).
    // Currently logs + returns 202; APNS push delivery is the follow-up.
    const userEngagementFunction = new NodejsFunction(this, "UserEngagementFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: controlApiEntry,
      handler: "userEngagementHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    props.state.workItemsTable.grantReadWriteData(createRunFunction);
    props.state.runsTable.grantReadWriteData(createRunFunction);
    props.state.tasksTable.grantReadWriteData(createRunFunction);
    props.state.eventsTable.grantReadWriteData(createRunFunction);
    props.orchestration.simpleRunStateMachine.grantStartExecution(createRunFunction);
    if (dispatchRunFunction) {
      props.state.workItemsTable.grantReadWriteData(dispatchRunFunction);
      props.state.runsTable.grantReadWriteData(dispatchRunFunction);
      props.state.tasksTable.grantReadWriteData(dispatchRunFunction);
      props.state.eventsTable.grantReadWriteData(dispatchRunFunction);
      props.state.userRunnersTable.grantReadWriteData(dispatchRunFunction);
      props.state.hostNodesTable.grantReadData(dispatchRunFunction);
      createRunFunction.addEnvironment("DISPATCH_RUN_FUNCTION_NAME", dispatchRunFunction.functionName);
      workItemsFunction.addEnvironment("DISPATCH_RUN_FUNCTION_NAME", dispatchRunFunction.functionName);
      dispatchRunFunction.grantInvoke(createRunFunction);
      dispatchRunFunction.grantInvoke(workItemsFunction);
    }

    // Resident-runner dispatcher: env vars, IAM, and secret access. When
    // residentDispatch is set, the createRun Lambda boots a per-user resident
    // runner via ecs:RunTask instead of starting the SFN smoke worker.
    if (props.residentDispatch) {
      const { cluster, network, runtime } = props.residentDispatch;
      network.workerSecurityGroup.addIngressRule(
        network.workerSecurityGroup,
        Port.tcp(8787),
        "Allow the VPC-attached Control API dispatcher to wake resident runner tasks."
      );
      props.state.userRunnersTable.grantReadWriteData(createRunFunction);
      props.state.hostNodesTable.grantReadData(createRunFunction);
      if (dispatchRunFunction) {
        props.state.userRunnersTable.grantReadWriteData(dispatchRunFunction);
        props.state.hostNodesTable.grantReadData(dispatchRunFunction);
      }

      for (const fn of [createRunFunction, ...(dispatchRunFunction ? [dispatchRunFunction] : [])]) {
        fn.addEnvironment("RESIDENT_RUNNER_TASK_DEFINITION_ARN", logicalName(props.config, "resident-runner"));
        fn.addEnvironment("RESIDENT_RUNNER_CONTAINER_NAME", runtime.residentRunnerContainerName);
        fn.addEnvironment("RESIDENT_RUNNER_CLUSTER_ARN", cluster.cluster.clusterArn);
        fn.addEnvironment(
          "RESIDENT_RUNNER_SUBNET_IDS",
          network.vpc.privateSubnets.map((subnet) => subnet.subnetId).join(",")
        );
        fn.addEnvironment("RESIDENT_RUNNER_SECURITY_GROUP_ID", network.workerSecurityGroup.securityGroupId);
        fn.addEnvironment("RESIDENT_RUNNER_API_TOKEN_SECRET_ARN", runtime.residentRunnerApiToken.secretArn);
        fn.addEnvironment("RESIDENT_RUNNER_LAUNCH_WAIT_MS", "150000");
      }

      // ecs:RunTask scoped to the resident family (revision wildcard).
      const residentFamilyArn = `arn:${Stack.of(this).partition}:ecs:${Stack.of(this).region}:${Stack.of(this).account}:task-definition/${logicalName(props.config, "resident-runner")}:*`;
      for (const fn of [createRunFunction, ...(dispatchRunFunction ? [dispatchRunFunction] : [])]) {
        fn.addToRolePolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ecs:RunTask"],
          resources: [residentFamilyArn]
        }));
        fn.addToRolePolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ecs:DescribeTasks", "ecs:StopTask"],
          resources: ["*"]
        }));
      }
      // PassRole for both task role and execution role.
      const passRoleArns: string[] = [];
      if (runtime.residentRunnerTaskDefinition.taskRole) {
        passRoleArns.push(runtime.residentRunnerTaskDefinition.taskRole.roleArn);
      }
      const executionRole = (runtime.residentRunnerTaskDefinition as { executionRole?: { readonly roleArn: string } }).executionRole;
      if (executionRole) {
        passRoleArns.push(executionRole.roleArn);
      }
      if (passRoleArns.length > 0) {
        for (const fn of [createRunFunction, ...(dispatchRunFunction ? [dispatchRunFunction] : [])]) {
          fn.addToRolePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["iam:PassRole"],
            resources: passRoleArns,
            conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } }
          }));
        }
      }
      for (const fn of [createRunFunction, ...(dispatchRunFunction ? [dispatchRunFunction] : [])]) {
        runtime.residentRunnerApiToken.grantRead(fn);
      }
    }

    props.state.runsTable.grantReadData(getRunFunction);
    props.state.runsTable.grantReadData(listRunEventsFunction);
    props.state.eventsTable.grantReadData(listRunEventsFunction);
    props.state.runsTable.grantReadData(listRunsFunction);
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
    props.storage.workspaceLiveArtifactsBucket.grantRead(artifactsFunction);

    props.state.workItemsTable.grantReadData(dataSourceRefsFunction);
    props.state.runsTable.grantReadData(dataSourceRefsFunction);
    props.state.dataSourcesTable.grantReadWriteData(dataSourceRefsFunction);

    props.state.workItemsTable.grantReadData(surfacesFunction);
    props.state.runsTable.grantReadData(surfacesFunction);
    props.state.artifactsTable.grantReadData(surfacesFunction);
    props.state.surfacesTable.grantReadWriteData(surfacesFunction);

    props.state.runsTable.grantReadData(approvalsFunction);
    props.state.approvalsTable.grantReadWriteData(approvalsFunction);

    this.api.addRoutes({
      path: "/runs",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("CreateRunIntegration", createRunFunction),
      authorizer
    });
    this.api.addRoutes({
      path: "/runs",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListRunsIntegration", listRunsFunction),
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
      { path: "/runs/{runId}/artifacts/{artifactId}", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/artifacts/{artifactId}/download", methods: [HttpMethod.GET] }
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

    for (const route of [
      { path: "/approvals", methods: [HttpMethod.POST] },
      { path: "/approvals/{approvalId}", methods: [HttpMethod.GET] },
      { path: "/runs/{runId}/approvals", methods: [HttpMethod.GET] },
      { path: "/approvals/{approvalId}/decision", methods: [HttpMethod.POST] }
    ]) {
      this.api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration: new HttpLambdaIntegration(`ApprovalsIntegration${route.path.replace(/[^A-Za-z0-9]/g, "")}${route.methods.join("")}`, approvalsFunction),
        authorizer
      });
    }

    // Hermes calls POST /user-engagement/notify via the `phone_user` tool
    // when the agent wants to ping the user proactively (banner / inline reply).
    this.api.addRoutes({
      path: "/user-engagement/notify",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "UserEngagementNotifyIntegration",
        userEngagementFunction
      ),
      authorizer
    });

    new CfnOutput(this, "ControlApiUrl", {
      value: this.api.apiEndpoint,
      exportName: logicalName(props.config, "control-api-url")
    });
  }
}
