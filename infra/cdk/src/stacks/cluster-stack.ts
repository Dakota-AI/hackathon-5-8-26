import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { NetworkStack } from "./network-stack.js";

export interface ClusterStackProps extends AgentsCloudStackProps {
  readonly network: NetworkStack;
}

export class ClusterStack extends AgentsCloudStack {
  public readonly cluster: Cluster;
  public readonly agentRuntimeLogGroup: LogGroup;

  public constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props);

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.network.vpc,
      clusterName: logicalName(props.config, "cluster")
    });

    this.agentRuntimeLogGroup = new LogGroup(this, "AgentRuntimeLogGroup", {
      logGroupName: `/aws/${props.config.appName}/${props.config.envName}/ecs/agent-runtime`,
      retention: props.config.envName === "prod" ? RetentionDays.THREE_MONTHS : RetentionDays.ONE_MONTH,
      removalPolicy: props.config.envName === "prod" ? RemovalPolicy.RETAIN : props.config.removalPolicy
    });

    new CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      exportName: logicalName(props.config, "cluster-name")
    });

    new CfnOutput(this, "AgentRuntimeLogGroupName", {
      value: this.agentRuntimeLogGroup.logGroupName,
      exportName: logicalName(props.config, "agent-runtime-log-group-name")
    });
  }
}
