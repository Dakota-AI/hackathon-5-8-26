import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration } from "aws-cdk-lib";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { WebSocketApi, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { StateStack } from "./state-stack.js";

export interface RealtimeApiStackProps extends AgentsCloudStackProps {
  readonly state: StateStack;
}

const thisFile = fileURLToPath(import.meta.url);
const cdkSrcDir = path.dirname(thisFile);
const repoRoot = path.resolve(cdkSrcDir, "../../../../");
const realtimeApiEntry = path.join(repoRoot, "services/realtime-api/src/handlers.ts");
const realtimeRelayEntry = path.join(repoRoot, "services/realtime-api/src/relay.ts");

export class RealtimeApiStack extends AgentsCloudStack {
  public readonly webSocketApi: WebSocketApi;
  public readonly stage: WebSocketStage;

  public constructor(scope: Construct, id: string, props: RealtimeApiStackProps) {
    super(scope, id, props);

    const commonEnvironment = {
      REALTIME_CONNECTIONS_TABLE_NAME: props.state.realtimeConnectionsTable.tableName,
      RUNS_TABLE_NAME: props.state.runsTable.tableName
    };

    const authorizerFunction = new NodejsFunction(this, "RealtimeAuthorizerFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: realtimeApiEntry,
      handler: "authorizerHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        COGNITO_USER_POOL_ID: props.config.auth.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: props.config.auth.userPoolClientId
      }
    });

    const connectFunction = new NodejsFunction(this, "RealtimeConnectFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: realtimeApiEntry,
      handler: "connectHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const disconnectFunction = new NodejsFunction(this, "RealtimeDisconnectFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: realtimeApiEntry,
      handler: "disconnectHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const defaultFunction = new NodejsFunction(this, "RealtimeDefaultFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: realtimeApiEntry,
      handler: "defaultHandler",
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: commonEnvironment
    });

    const authorizer = new WebSocketLambdaAuthorizer("RealtimeWebSocketAuthorizer", authorizerFunction, {
      identitySource: ["route.request.querystring.token"]
    });

    this.webSocketApi = new WebSocketApi(this, "RealtimeWebSocketApi", {
      apiName: logicalName(props.config, "realtime-api"),
      routeSelectionExpression: "$request.body.action",
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("RealtimeConnectIntegration", connectFunction),
        authorizer
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration("RealtimeDisconnectIntegration", disconnectFunction)
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration("RealtimeDefaultIntegration", defaultFunction)
      }
    });

    this.stage = new WebSocketStage(this, "RealtimeWebSocketStage", {
      webSocketApi: this.webSocketApi,
      stageName: props.config.envName,
      autoDeploy: true
    });

    const relayFunction = new NodejsFunction(this, "RealtimeEventRelayFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: realtimeRelayEntry,
      handler: "eventStreamRelayHandler",
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        ...commonEnvironment,
        WEBSOCKET_CALLBACK_URL: this.stage.callbackUrl
      }
    });

    relayFunction.addEventSource(
      new DynamoEventSource(props.state.eventsTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 25,
        retryAttempts: 3
      })
    );

    props.state.realtimeConnectionsTable.grantReadWriteData(connectFunction);
    props.state.realtimeConnectionsTable.grantReadWriteData(disconnectFunction);
    props.state.realtimeConnectionsTable.grantReadWriteData(defaultFunction);
    props.state.realtimeConnectionsTable.grantReadWriteData(relayFunction);
    props.state.eventsTable.grantStreamRead(relayFunction);
    props.state.runsTable.grantReadData(defaultFunction);
    this.webSocketApi.grantManageConnections(defaultFunction);
    this.webSocketApi.grantManageConnections(relayFunction);

    new CfnOutput(this, "RealtimeWebSocketUrl", {
      value: this.stage.url,
      exportName: logicalName(props.config, "realtime-websocket-url")
    });

    new CfnOutput(this, "RealtimeWebSocketCallbackUrl", {
      value: this.stage.callbackUrl,
      exportName: logicalName(props.config, "realtime-websocket-callback-url")
    });
  }
}
