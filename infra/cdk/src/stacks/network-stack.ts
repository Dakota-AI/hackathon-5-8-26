import { CfnOutput } from "aws-cdk-lib";
import { GatewayVpcEndpointAwsService, IpAddresses, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";

export class NetworkStack extends AgentsCloudStack {
  public readonly vpc: Vpc;
  public readonly workerSecurityGroup: SecurityGroup;

  public constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr("10.40.0.0/16"),
      maxAzs: props.config.network.maxAzs,
      natGateways: props.config.network.natGateways,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: "private-egress",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24
        },
        {
          name: "isolated",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    });

    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3
    });

    this.vpc.addGatewayEndpoint("DynamoDbEndpoint", {
      service: GatewayVpcEndpointAwsService.DYNAMODB
    });

    this.workerSecurityGroup = new SecurityGroup(this, "WorkerSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: "Default security group for future ECS agent workers."
    });

    new CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      exportName: logicalName(props.config, "vpc-id")
    });

    new CfnOutput(this, "WorkerSecurityGroupId", {
      value: this.workerSecurityGroup.securityGroupId,
      exportName: logicalName(props.config, "worker-security-group-id")
    });
  }
}
