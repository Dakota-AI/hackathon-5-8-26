import { CfnOutput } from "aws-cdk-lib";
import { AwsLogDriver, ContainerDefinition, ContainerImage, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { StateStack } from "./state-stack.js";
import type { StorageStack } from "./storage-stack.js";

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

    this.agentRuntimeContainer = this.agentRuntimeTaskDefinition.addContainer("agent-runtime", {
      image: ContainerImage.fromRegistry("public.ecr.aws/docker/library/alpine:3.20"),
      logging: new AwsLogDriver({
        streamPrefix: "agent-runtime",
        logGroup: props.cluster.agentRuntimeLogGroup
      }),
      environment: {
        AGENTS_CLOUD_ENV: props.config.envName,
        AGENTS_CLOUD_WORKER_KIND: "agent-runtime-placeholder"
      },
      command: [
        "sh",
        "-c",
        "echo agents-cloud placeholder worker started; echo RUN_ID=$RUN_ID TASK_ID=$TASK_ID WORKSPACE_ID=$WORKSPACE_ID; echo placeholder worker complete"
      ]
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
