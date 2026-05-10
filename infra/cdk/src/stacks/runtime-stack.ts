import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput } from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { AwsLogDriver, ContainerDefinition, ContainerImage, FargateTaskDefinition, Secret as EcsSecret } from "aws-cdk-lib/aws-ecs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
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
  public readonly residentRunnerTaskDefinition: FargateTaskDefinition;
  public readonly residentRunnerContainer: ContainerDefinition;

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
        ".agent.md",
        ".amplify",
        ".amplify/**",
        ".dockerignore",
        ".DS_Store",
        ".env",
        ".env.*",
        ".git",
        ".git/**",
        ".nvmrc",
        "AGENTS.md",
        "README.md",
        "amplify.yml",
        "apps",
        "apps/**",
        "coverage",
        "coverage/**",
        "dist",
        "dist/**",
        "docs",
        "docs/**",
        "infra",
        "infra/**",
        "node_modules",
        "node_modules/**",
        ".pnpm-store",
        ".pnpm-store/**",
        ".research",
        ".research/**",
        ".turbo",
        ".turbo/**",
        ".vibecode",
        ".vibecode/**",
        "services/control-api",
        "services/control-api/**",
        "services/agent-runtime/README.md",
        "services/agent-runtime/dist",
        "services/agent-runtime/dist/**",
        "services/agent-runtime/test",
        "services/agent-runtime/test/**",
        "services/realtime-api",
        "services/realtime-api/**",
        "scripts",
        "scripts/**",
        "tests",
        "tests/**",
        "tools",
        "tools/**",
        "**/.DS_Store",
        "**/.env",
        "**/.env.*",
        "**/.next",
        "**/.next/**",
        "**/cdk.out",
        "**/cdk.out/**",
        "**/coverage",
        "**/coverage/**",
        "**/dist",
        "**/dist/**",
        "**/node_modules",
        "**/node_modules/**",
        "**/out",
        "**/out/**"
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
        WORK_ITEMS_TABLE_NAME: props.state.workItemsTable.tableName,
        RUNS_TABLE_NAME: props.state.runsTable.tableName,
        TASKS_TABLE_NAME: props.state.tasksTable.tableName,
        EVENTS_TABLE_NAME: props.state.eventsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.state.artifactsTable.tableName,
        DATA_SOURCES_TABLE_NAME: props.state.dataSourcesTable.tableName,
        SURFACES_TABLE_NAME: props.state.surfacesTable.tableName,
        ARTIFACTS_BUCKET_NAME: props.storage.workspaceLiveArtifactsBucket.bucketName
      }
    });

    this.residentRunnerTaskDefinition = new FargateTaskDefinition(this, "ResidentRunnerTaskDefinition", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      family: logicalName(props.config, "resident-runner")
    });

    const residentRunnerImage = new DockerImageAsset(this, "ResidentRunnerImage", {
      directory: repoRoot,
      file: "services/agent-runtime/Dockerfile.resident",
      platform: Platform.LINUX_AMD64,
      exclude: [
        ".agent.md",
        ".amplify",
        ".amplify/**",
        ".dockerignore",
        ".DS_Store",
        ".env",
        ".env.*",
        ".git",
        ".git/**",
        ".nvmrc",
        "AGENTS.md",
        "README.md",
        "amplify.yml",
        "apps",
        "apps/**",
        "coverage",
        "coverage/**",
        "dist",
        "dist/**",
        "docs",
        "docs/**",
        "infra",
        "infra/**",
        "node_modules",
        "node_modules/**",
        ".pnpm-store",
        ".pnpm-store/**",
        ".research",
        ".research/**",
        ".turbo",
        ".turbo/**",
        ".vibecode",
        ".vibecode/**",
        "services/control-api",
        "services/control-api/**",
        "services/agent-runtime/README.md",
        "services/agent-runtime/dist",
        "services/agent-runtime/dist/**",
        "services/agent-runtime/test",
        "services/agent-runtime/test/**",
        "services/realtime-api",
        "services/realtime-api/**",
        "scripts",
        "scripts/**",
        "tests",
        "tests/**",
        "tools",
        "tools/**",
        "**/.DS_Store",
        "**/.env",
        "**/.env.*",
        "**/.next",
        "**/.next/**",
        "**/cdk.out",
        "**/cdk.out/**",
        "**/coverage",
        "**/coverage/**",
        "**/dist",
        "**/dist/**",
        "**/node_modules",
        "**/node_modules/**",
        "**/out",
        "**/out/**"
      ]
    });

    const residentRunnerApiToken = new Secret(this, "ResidentRunnerApiToken", {
      description: "Bearer token placeholder for the Agents Cloud resident runner HTTP API. Replace with brokered supervisor tokens before public launch.",
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 48
      }
    });

    this.residentRunnerContainer = this.residentRunnerTaskDefinition.addContainer("resident-runner", {
      image: ContainerImage.fromDockerImageAsset(residentRunnerImage),
      logging: new AwsLogDriver({
        streamPrefix: "resident-runner",
        logGroup: props.cluster.agentRuntimeLogGroup
      }),
      secrets: {
        RUNNER_API_TOKEN: EcsSecret.fromSecretsManager(residentRunnerApiToken)
      },
      portMappings: [{ containerPort: 8787 }],
      environment: {
        AGENTS_CLOUD_ENV: props.config.envName,
        AGENTS_RUNTIME_MODE: "ecs-resident",
        AGENTS_RESIDENT_ADAPTER: process.env.AGENTS_CLOUD_RESIDENT_ADAPTER ?? "smoke",
        AGENTS_RUNNER_ROOT: "/runner",
        HERMES_HOME: "/runner/hermes",
        PORT: "8787",
        WORK_ITEMS_TABLE_NAME: props.state.workItemsTable.tableName,
        RUNS_TABLE_NAME: props.state.runsTable.tableName,
        TASKS_TABLE_NAME: props.state.tasksTable.tableName,
        EVENTS_TABLE_NAME: props.state.eventsTable.tableName,
        ARTIFACTS_TABLE_NAME: props.state.artifactsTable.tableName,
        DATA_SOURCES_TABLE_NAME: props.state.dataSourcesTable.tableName,
        SURFACES_TABLE_NAME: props.state.surfacesTable.tableName,
        APPROVALS_TABLE_NAME: props.state.approvalsTable.tableName,
        PREVIEW_DEPLOYMENTS_TABLE_NAME: props.state.previewDeploymentsTable.tableName,
        HOST_NODES_TABLE_NAME: props.state.hostNodesTable.tableName,
        USER_RUNNERS_TABLE_NAME: props.state.userRunnersTable.tableName,
        RUNNER_SNAPSHOTS_TABLE_NAME: props.state.runnerSnapshotsTable.tableName,
        AGENT_INSTANCES_TABLE_NAME: props.state.agentInstancesTable.tableName,
        AGENT_PROFILES_TABLE_NAME: props.state.agentProfilesTable.tableName,
        ARTIFACTS_BUCKET_NAME: props.storage.workspaceLiveArtifactsBucket.bucketName
      }
    });

    props.storage.workspaceLiveArtifactsBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.workspaceAuditLogBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.previewStaticBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.researchDatasetsBucket.grantReadWrite(this.agentRuntimeTaskDefinition.taskRole);
    props.storage.workspaceLiveArtifactsBucket.grantReadWrite(this.residentRunnerTaskDefinition.taskRole);
    props.storage.workspaceAuditLogBucket.grantReadWrite(this.residentRunnerTaskDefinition.taskRole);
    props.storage.previewStaticBucket.grantReadWrite(this.residentRunnerTaskDefinition.taskRole);
    props.storage.researchDatasetsBucket.grantReadWrite(this.residentRunnerTaskDefinition.taskRole);

    props.state.workItemsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.runsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.tasksTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.eventsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.artifactsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.dataSourcesTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.surfacesTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.approvalsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.previewDeploymentsTable.grantReadWriteData(this.agentRuntimeTaskDefinition.taskRole);
    props.state.workItemsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.runsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.tasksTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.eventsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.artifactsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.dataSourcesTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.surfacesTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.approvalsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.previewDeploymentsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.hostNodesTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.userRunnersTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.runnerSnapshotsTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.agentInstancesTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);
    props.state.agentProfilesTable.grantReadWriteData(this.residentRunnerTaskDefinition.taskRole);

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
    this.residentRunnerTaskDefinition.taskRole.addToPrincipalPolicy(
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

    new CfnOutput(this, "ResidentRunnerTaskDefinitionArn", {
      value: this.residentRunnerTaskDefinition.taskDefinitionArn,
      exportName: logicalName(props.config, "resident-runner-task-definition-arn")
    });

    new CfnOutput(this, "ResidentRunnerContainerName", {
      value: this.residentRunnerContainer.containerName,
      exportName: logicalName(props.config, "resident-runner-container-name")
    });
  }
}
