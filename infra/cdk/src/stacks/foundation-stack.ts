import { CfnOutput } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";

export class FoundationStack extends AgentsCloudStack {
  public constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);

    const prefix = `/${props.config.appName}/${props.config.envName}`;

    new StringParameter(this, "AppNameParameter", {
      parameterName: `${prefix}/app-name`,
      stringValue: props.config.appName,
      description: "Agents Cloud application name."
    });

    new StringParameter(this, "EnvironmentNameParameter", {
      parameterName: `${prefix}/environment`,
      stringValue: props.config.envName,
      description: "Agents Cloud environment name."
    });

    new StringParameter(this, "AwsRegionParameter", {
      parameterName: `${prefix}/aws-region`,
      stringValue: props.config.awsRegion,
      description: "Agents Cloud target AWS region."
    });

    new CfnOutput(this, "AppName", {
      value: props.config.appName,
      exportName: logicalName(props.config, "app-name")
    });

    new CfnOutput(this, "EnvironmentName", {
      value: props.config.envName,
      exportName: logicalName(props.config, "environment-name")
    });
  }
}
