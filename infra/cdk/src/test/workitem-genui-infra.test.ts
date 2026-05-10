import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { App, RemovalPolicy } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import type { AgentsCloudConfig } from "../config/environments.js";
import { ClusterStack } from "../stacks/cluster-stack.js";
import { ControlApiStack } from "../stacks/control-api-stack.js";
import { NetworkStack } from "../stacks/network-stack.js";
import { OrchestrationStack } from "../stacks/orchestration-stack.js";
import { RuntimeStack } from "../stacks/runtime-stack.js";
import { StateStack } from "../stacks/state-stack.js";
import { StorageStack } from "../stacks/storage-stack.js";

const testEnv = { account: "111111111111", region: "us-east-1" };

function testConfig(): AgentsCloudConfig {
  return {
    appName: "agents-cloud",
    envName: "dev",
    awsRegion: "us-east-1",
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    network: { maxAzs: 2, natGateways: 1 },
    previewIngress: { enabled: false },
    auth: {
      userPoolId: "us-east-1_example",
      userPoolClientId: "example-client-id"
    },
    tags: {
      Application: "agents-cloud",
      Environment: "dev",
      ManagedBy: "aws-cdk",
      Repository: "agents-cloud"
    }
  };
}

function synthState() {
  const app = new App();
  const config = testConfig();
  const state = new StateStack(app, "StateUnderTest", { config, env: testEnv });
  return Template.fromStack(state);
}

function synthPlatform() {
  const app = new App();
  const config = testConfig();
  const network = new NetworkStack(app, "NetworkUnderTest", { config, env: testEnv });
  const storage = new StorageStack(app, "StorageUnderTest", { config, env: testEnv });
  const state = new StateStack(app, "StateUnderTest", { config, env: testEnv });
  const cluster = new ClusterStack(app, "ClusterUnderTest", { config, env: testEnv, network });
  const runtime = new RuntimeStack(app, "RuntimeUnderTest", { config, env: testEnv, cluster, storage, state });
  const orchestration = new OrchestrationStack(app, "OrchestrationUnderTest", { config, env: testEnv, cluster, network });
  const controlApi = new ControlApiStack(app, "ControlApiUnderTest", { config, env: testEnv, state, storage, orchestration });

  return {
    state: Template.fromStack(state),
    runtime: Template.fromStack(runtime),
    orchestration: Template.fromStack(orchestration),
    controlApi: Template.fromStack(controlApi)
  };
}

describe("WorkItem/GenUI infrastructure", () => {
  it("creates WorkItems, DataSources, and Surfaces tables with required access indexes", () => {
    const template = synthState();

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "workspaceId", KeyType: "HASH" },
        { AttributeName: "workItemId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-user-created-at" }),
        Match.objectLike({ IndexName: "by-status-updated-at" }),
        Match.objectLike({ IndexName: "by-idempotency-scope" })
      ])
    });

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "workspaceId", KeyType: "HASH" },
        { AttributeName: "dataSourceId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-workitem-created-at" }),
        Match.objectLike({ IndexName: "by-run-created-at" }),
        Match.objectLike({ IndexName: "by-artifact-id" })
      ])
    });

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "workspaceId", KeyType: "HASH" },
        { AttributeName: "surfaceId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-workitem-updated-at" }),
        Match.objectLike({ IndexName: "by-run-updated-at" }),
        Match.objectLike({ IndexName: "by-status-updated-at" })
      ])
    });
  });

  it("adds WorkItem lookup indexes to existing Run and Artifact tables", () => {
    const template = synthState();

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "workspaceId", KeyType: "HASH" },
        { AttributeName: "runId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: "by-workitem-created-at" })])
    });

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "runId", KeyType: "HASH" },
        { AttributeName: "artifactId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: "by-workitem-created-at" })])
    });
  });

  it("injects WorkItem/GenUI table names into Control API Lambdas and exposes product routes", () => {
    const { controlApi } = synthPlatform();

    controlApi.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          WORK_ITEMS_TABLE_NAME: Match.anyValue(),
          ARTIFACTS_TABLE_NAME: Match.anyValue(),
          DATA_SOURCES_TABLE_NAME: Match.anyValue(),
          SURFACES_TABLE_NAME: Match.anyValue(),
          APPROVALS_TABLE_NAME: Match.anyValue(),
          HOST_NODES_TABLE_NAME: Match.anyValue(),
          USER_RUNNERS_TABLE_NAME: Match.anyValue(),
          AGENT_PROFILES_TABLE_NAME: Match.anyValue(),
          PROFILE_BUNDLES_BUCKET_NAME: Match.anyValue()
        })
      }
    });

    for (const routeKey of [
      "GET /runs",
      "POST /work-items",
      "GET /work-items",
      "GET /work-items/{workItemId}",
      "PATCH /work-items/{workItemId}",
      "POST /work-items/{workItemId}/status",
      "POST /work-items/{workItemId}/runs",
      "GET /work-items/{workItemId}/runs",
      "GET /work-items/{workItemId}/events",
      "GET /work-items/{workItemId}/artifacts",
      "GET /runs/{runId}/artifacts",
      "GET /runs/{runId}/artifacts/{artifactId}",
      "GET /runs/{runId}/artifacts/{artifactId}/download",
      "POST /data-source-refs",
      "GET /data-source-refs/{dataSourceId}",
      "GET /work-items/{workItemId}/data-source-refs",
      "GET /runs/{runId}/data-source-refs",
      "POST /surfaces",
      "GET /surfaces/{surfaceId}",
      "GET /work-items/{workItemId}/surfaces",
      "GET /runs/{runId}/surfaces",
      "PATCH /surfaces/{surfaceId}",
      "POST /surfaces/{surfaceId}/publish",
      "POST /approvals",
      "GET /approvals/{approvalId}",
      "GET /runs/{runId}/approvals",
      "POST /approvals/{approvalId}/decision",
      "POST /runner-hosts",
      "POST /runner-hosts/{hostId}/heartbeat",
      "POST /user-runners",
      "GET /user-runners/{runnerId}",
      "PATCH /user-runners/{runnerId}",
      "POST /user-runners/{runnerId}/heartbeat",
      "GET /admin/runners",
      "POST /agent-profiles/drafts",
      "GET /agent-profiles",
      "GET /agent-profiles/{profileId}/versions/{version}",
      "POST /agent-profiles/{profileId}/versions/{version}/approve"
    ]) {
      controlApi.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey });
    }
  });

  it("passes optional WorkItem IDs through orchestration to the runtime container", () => {
    const { orchestration } = synthPlatform();

    const stateMachines = orchestration.findResources("AWS::StepFunctions::StateMachine");
    const definition = JSON.stringify(Object.values(stateMachines)[0]?.Properties?.DefinitionString ?? {});
    assert.match(definition, /WORK_ITEM_ID/);
    assert.match(definition, /\$\.workItemId/);
  });

  it("makes WorkItem/GenUI table names available to the ECS runtime task", () => {
    const { runtime } = synthPlatform();

    runtime.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: "agent-runtime",
          Environment: Match.arrayWith([
            Match.objectLike({ Name: "WORK_ITEMS_TABLE_NAME" }),
            Match.objectLike({ Name: "DATA_SOURCES_TABLE_NAME" }),
            Match.objectLike({ Name: "SURFACES_TABLE_NAME" })
          ])
        })
      ])
    });
  });

  it("defines a separate resident user-runner ECS task with runner state dependencies", () => {
    const { runtime } = synthPlatform();

    runtime.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: "resident-runner",
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: "RUNNER_API_TOKEN" }),
            Match.objectLike({ Name: "HERMES_AUTH_JSON_BOOTSTRAP" })
          ]),
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 8787 })]),
          Environment: Match.arrayWith([
            Match.objectLike({ Name: "AGENTS_RUNTIME_MODE", Value: "ecs-resident" }),
            Match.objectLike({ Name: "AGENTS_RESIDENT_ADAPTER", Value: "hermes-cli" }),
            Match.objectLike({ Name: "AGENTS_MODEL_PROVIDER", Value: "openai-codex" }),
            Match.objectLike({ Name: "HERMES_COMMAND", Value: "/opt/hermes/.venv/bin/hermes" }),
            Match.objectLike({ Name: "EVENTS_TABLE_NAME" }),
            Match.objectLike({ Name: "HOST_NODES_TABLE_NAME" }),
            Match.objectLike({ Name: "USER_RUNNERS_TABLE_NAME" }),
            Match.objectLike({ Name: "RUNNER_SNAPSHOTS_TABLE_NAME" }),
            Match.objectLike({ Name: "AGENT_INSTANCES_TABLE_NAME" }),
            Match.objectLike({ Name: "AGENT_PROFILES_TABLE_NAME" }),
            Match.objectLike({ Name: "ARTIFACTS_BUCKET_NAME" })
          ])
        })
      ])
    });
  });
});
