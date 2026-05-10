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

export interface ControlApiStackProps extends AgentsCloudStackProps {
  readonly state: StateStack;
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
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowOrigins: ["*"],
        maxAge: Duration.days(1)
      }
    });

    const commonEnvironment = {
      RUNS_TABLE_NAME: props.state.runsTable.tableName,
      TASKS_TABLE_NAME: props.state.tasksTable.tableName,
      EVENTS_TABLE_NAME: props.state.eventsTable.tableName,
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

    props.state.runsTable.grantReadWriteData(createRunFunction);
    props.state.tasksTable.grantReadWriteData(createRunFunction);
    props.state.eventsTable.grantReadWriteData(createRunFunction);
    props.orchestration.simpleRunStateMachine.grantStartExecution(createRunFunction);

    props.state.runsTable.grantReadData(getRunFunction);
    props.state.runsTable.grantReadData(listRunEventsFunction);
    props.state.eventsTable.grantReadData(listRunEventsFunction);
    props.state.runsTable.grantReadData(listAdminRunsFunction);
    props.state.eventsTable.grantReadData(listAdminRunsFunction);

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

    new CfnOutput(this, "ControlApiUrl", {
      value: this.api.apiEndpoint,
      exportName: logicalName(props.config, "control-api-url")
    });
  }
}
