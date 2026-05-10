import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { CustomState, StateMachine, DefinitionBody } from "aws-cdk-lib/aws-stepfunctions";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { NetworkStack } from "./network-stack.js";

export interface OrchestrationStackProps extends AgentsCloudStackProps {
  readonly cluster: ClusterStack;
  readonly network: NetworkStack;
}

export class OrchestrationStack extends AgentsCloudStack {
  public readonly simpleRunStateMachine: StateMachine;

  public constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    const taskFamily = logicalName(props.config, "agent-runtime");
    const containerName = "agent-runtime";
    const stack = Stack.of(this);

    const runHermesWorker = new CustomState(this, "RunHermesAgentRuntimeWorker", {
      stateJson: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.sync",
        Parameters: {
          Cluster: props.cluster.cluster.clusterArn,
          TaskDefinition: taskFamily,
          LaunchType: "FARGATE",
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              AssignPublicIp: "DISABLED",
              SecurityGroups: [props.network.workerSecurityGroup.securityGroupId],
              Subnets: props.network.vpc.privateSubnets.map((subnet) => subnet.subnetId)
            }
          },
          Overrides: {
            ContainerOverrides: [
              {
                Name: containerName,
                Environment: [
                  { Name: "RUN_ID", "Value.$": "$.runId" },
                  { Name: "TASK_ID", "Value.$": "$.taskId" },
                  { Name: "WORKSPACE_ID", "Value.$": "$.workspaceId" },
                  { Name: "USER_ID", "Value.$": "$.userId" },
                  { Name: "OBJECTIVE", "Value.$": "$.objective" }
                ]
              }
            ]
          }
        },
        ResultPath: "$.ecs"
      }
    });

    this.simpleRunStateMachine = new StateMachine(this, "SimpleRunStateMachine", {
      stateMachineName: logicalName(props.config, "simple-run"),
      definitionBody: DefinitionBody.fromChainable(runHermesWorker),
      timeout: Duration.hours(2)
    });

    this.simpleRunStateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecs:RunTask"],
        resources: [`arn:${stack.partition}:ecs:${stack.region}:${stack.account}:task-definition/${taskFamily}:*`]
      })
    );
    this.simpleRunStateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecs:StopTask", "ecs:DescribeTasks"],
        resources: ["*"]
      })
    );
    this.simpleRunStateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: [`arn:${stack.partition}:iam::${stack.account}:role/*`],
        conditions: {
          StringEquals: {
            "iam:PassedToService": "ecs-tasks.amazonaws.com"
          }
        }
      })
    );
    this.simpleRunStateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["events:PutTargets", "events:PutRule", "events:DescribeRule"],
        resources: [`arn:${stack.partition}:events:${stack.region}:${stack.account}:rule/StepFunctionsGetEventsForECSTaskRule`]
      })
    );

    new CfnOutput(this, "SimpleRunStateMachineArn", {
      value: this.simpleRunStateMachine.stateMachineArn,
      exportName: logicalName(props.config, "simple-run-state-machine-arn")
    });
  }
}
