import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput } from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { AwsLogDriver, ContainerDefinition, ContainerImage, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { StateStack } from "./state-stack.js";
import type { StorageStack } from "./storage-stack.js";

const thisFile = fileURLToPath(import.meta.url);
const cdkSrcDir = path.dirname(thisFile);
const repoRoot = path.resolve(cdkSrcDir, "../../../../");

export interface RuntimeStackProps extends AgentsCloudStackProps {
  readonly cluster: ClusterStack;
  readonly storage: StorageStack;
  readonly state: StateStack;
}

export class RuntimeStack extends AgentsCloudStack {
  public readonly agentRuntimeTaskDefinition: FargateTaskDefinition;
  public readonly agentRuntimeContainer: ContainerDefinition;

  public constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    this.agentRuntimeTaskDefinition = new FargateTaskDefinition(this, "AgentRuntimeTaskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      family: logicalName(props.config, "agent-runtime")
    });

    const agentRuntimeImage = new DockerImageAsset(this, "AgentRuntimeImage", {
      directory: repoRoot,
      file: "services/agent-runtime/Dockerfile",
      platform: Platform.LINUX_AMD64,
      exclude: [
        ".git",
        "AGENTS.md",
        "README.md",
        "apps",
        "docs",
        "infra",
        "services/control-api",
        "services/agent-runtime/README.md",
        "services/agent-runtime/dist",
        "services/agent-runtime/test",
        "tools"
      ]
    });

    this.agentRuntimeContainer = this.agentRuntimeTaskDefinition.addContainer("agent-runtime", {
      image: ContainerImage.fromDockerImageAsset(agentRuntimeImage),
      logging: new AwsLogDriver({
        streamPrefix: "agent-runtime",
        logGroup: props.cluster.agentRuntimeLogGroup
      }),
      environment: {
        AGENTS_CLOUD_ENV: props.config.envName,
        AGENTS_CLOUD_WORKER_KIND: "agent-runtime-hermes",
        HERMES_RUNNER_MODE: process.env.AGENTS_CLOUD_HERMES_RUNNER_MODE ?? "smoke",
        RUNS_TABLE_NAME: props.state.runsTable.tableName,
        TASKS_TABLE_NAME: props.state.tasksTable.tableName,
        EVENTS_TABLE_NAME: props.state.eventsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.state.artifactsTable.tableName,
        ARTIFACTS_BUCKET_NAME: props.storage.workspaceLiveArtifactsBucket.bucketName
      }
    });

    props.storage.workspaceLiveArtifactsBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.workspaceAuditLogBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.previewStaticBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.researchDatasetsBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);

    props.state.runsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.tasksTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.eventsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.artifactsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.approvalsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.previewDeploymentsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);

    this.agentRuntimeTaskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "cloudwatch:namespace": `${props.config.appName}/${props.config.envName}`
          }
        }
      })
    );

    new CfnOutput(this, "AgentRuntimeTaskDefinitionArn", {
      value: this.agentRuntimeTaskDefinition.taskDefinitionArn,
      exportName: logicalName(props.config, "agent-runtime-task-definition-arn")
    });

    new CfnOutput(this, "AgentRuntimeContainerName", {
      value: this.agentRuntimeContainer.containerName,
      exportName: logicalName(props.config, "agent-runtime-container-name")
    });
  }
}
