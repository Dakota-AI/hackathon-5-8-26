import { Stack, Tags } from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { AgentsCloudConfig } from "../config/environments.js";

export interface AgentsCloudStackProps extends StackProps {
  readonly config: AgentsCloudConfig;
}

export abstract class AgentsCloudStack extends Stack {
  protected readonly config: AgentsCloudConfig;

  protected constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);
    this.config = props.config;

    for (const [key, value] of Object.entries(props.config.tags)) {
      Tags.of(this).add(key, value);
    }
  }
}
