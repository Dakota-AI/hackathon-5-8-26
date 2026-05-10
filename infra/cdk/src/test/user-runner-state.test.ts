import { describe, it } from "node:test";
import { App, RemovalPolicy } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import type { AgentsCloudConfig } from "../config/environments.js";
import { StateStack } from "../stacks/state-stack.js";

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

describe("User runner state infrastructure", () => {
  it("creates HostNodes and UserRunners tables with placement and heartbeat access indexes", () => {
    const template = synthState();

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "hostId", KeyType: "HASH" },
        { AttributeName: "hostRecordType", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-status-last-heartbeat" }),
        Match.objectLike({ IndexName: "by-placement-target-status" })
      ])
    });

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "userId", KeyType: "HASH" },
        { AttributeName: "runnerId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-runner-id" }),
        Match.objectLike({ IndexName: "by-host-status" }),
        Match.objectLike({ IndexName: "by-status-last-heartbeat" }),
        Match.objectLike({ IndexName: "by-desired-state-updated-at" })
      ])
    });
  });

  it("creates RunnerSnapshots and AgentInstances tables for resident runner recovery and logical agents", () => {
    const template = synthState();

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "runnerId", KeyType: "HASH" },
        { AttributeName: "snapshotId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-user-created-at" }),
        Match.objectLike({ IndexName: "by-workspace-created-at" })
      ])
    });

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "runnerId", KeyType: "HASH" },
        { AttributeName: "agentId", KeyType: "RANGE" }
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "by-user-status-updated-at" }),
        Match.objectLike({ IndexName: "by-next-wake-at" })
      ])
    });
  });

  it("exports user-runner table names for future Control API and runner wiring", () => {
    const template = synthState();

    for (const outputName of ["HostNodesTableName", "UserRunnersTableName", "RunnerSnapshotsTableName", "AgentInstancesTableName"]) {
      template.hasOutput(outputName, {
        Export: {
          Name: Match.stringLikeRegexp(`agents-cloud-dev-.*`)
        }
      });
    }
  });
});
