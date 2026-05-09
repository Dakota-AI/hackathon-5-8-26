import { CfnOutput, Duration } from "aws-cdk-lib";
import { JsonPath, StateMachine, DefinitionBody, IntegrationPattern } from "aws-cdk-lib/aws-stepfunctions";
import { EcsFargateLaunchTarget, EcsRunTask } from "aws-cdk-lib/aws-stepfunctions-tasks";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { RuntimeStack } from "./runtime-stack.js";

export interface OrchestrationStackProps extends AgentsCloudStackProps {
  readonly cluster: ClusterStack;
  readonly network: NetworkStack;
  readonly runtime: RuntimeStack;
}

export class OrchestrationStack extends AgentsCloudStack {
  public readonly simpleRunStateMachine: StateMachine;

  public constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    const runPlaceholderWorker = new EcsRunTask(this, "RunPlaceholderAgentRuntimeWorker", {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: props.cluster.cluster,
      taskDefinition: props.runtime.agentRuntimeTaskDefinition,
      launchTarget: new EcsFargateLaunchTarget(),
      assignPublicIp: false,
      securityGroups: [props.network.workerSecurityGroup],
      subnets: {
        subnets: props.network.vpc.privateSubnets
      },
      containerOverrides: [
        {
          containerDefinition: props.runtime.agentRuntimeContainer,
          environment: [
            {
              name: "RUN_ID",
              value: JsonPath.stringAt("$.runId")
            },
            {
              name: "TASK_ID",
              value: JsonPath.stringAt("$.taskId")
            },
            {
              name: "WORKSPACE_ID",
              value: JsonPath.stringAt("$.workspaceId")
            }
          ]
        }
      ],
      resultPath: "$.ecs"
    });

    this.simpleRunStateMachine = new StateMachine(this, "SimpleRunStateMachine", {
      stateMachineName: logicalName(props.config, "simple-run"),
      definitionBody: DefinitionBody.fromChainable(runPlaceholderWorker),
      timeout: Duration.hours(2)
    });

    new CfnOutput(this, "SimpleRunStateMachineArn", {
      value: this.simpleRunStateMachine.stateMachineArn,
      exportName: logicalName(props.config, "simple-run-state-machine-arn")
    });
  }
}
