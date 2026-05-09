import { CfnOutput } from "aws-cdk-lib";
import { Certificate, CertificateValidation, type ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { HostedZone, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";
import type { ClusterStack } from "./cluster-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { StateStack } from "./state-stack.js";
import type { StorageStack } from "./storage-stack.js";

export interface PreviewIngressStackProps extends AgentsCloudStackProps {
  readonly network: NetworkStack;
  readonly cluster: ClusterStack;
  readonly storage: StorageStack;
  readonly state: StateStack;
}

export class PreviewIngressStack extends AgentsCloudStack {
  public readonly previewRouterService: ApplicationLoadBalancedFargateService;

  public constructor(scope: Construct, id: string, props: PreviewIngressStackProps) {
    super(scope, id, props);

    const previewBaseDomain = props.config.previewIngress.baseDomain;
    const certificateArn = props.config.previewIngress.certificateArn;
    const hostedZoneId = props.config.previewIngress.hostedZoneId;
    const hostedZoneName = props.config.previewIngress.hostedZoneName;

    if (!previewBaseDomain) {
      throw new Error(
        "Preview ingress is enabled but AGENTS_CLOUD_PREVIEW_BASE_DOMAIN is not set."
      );
    }

    const hostedZone = hostedZoneId && hostedZoneName
      ? HostedZone.fromHostedZoneAttributes(this, "PreviewHostedZone", {
          hostedZoneId,
          zoneName: hostedZoneName
        })
      : undefined;

    const certificate: ICertificate = certificateArn
      ? Certificate.fromCertificateArn(this, "PreviewWildcardCertificate", certificateArn)
      : hostedZone
        ? new Certificate(this, "PreviewWildcardCertificate", {
            domainName: previewBaseDomain,
            subjectAlternativeNames: [`*.${previewBaseDomain}`],
            validation: CertificateValidation.fromDns(hostedZone)
          })
        : (() => {
            throw new Error(
              "Preview ingress with external DNS requires AGENTS_CLOUD_PREVIEW_CERTIFICATE_ARN. " +
                "For Cloudflare-managed domains, request/validate an ACM certificate for the preview base domain and wildcard first, then pass its ARN."
            );
          })();

    const previewRouterSecurityGroup = new SecurityGroup(this, "PreviewRouterSecurityGroup", {
      vpc: props.network.vpc,
      allowAllOutbound: true,
      description: "Security group for the wildcard preview-router ECS service."
    });

    this.previewRouterService = new ApplicationLoadBalancedFargateService(this, "PreviewRouterService", {
      cluster: props.cluster.cluster,
      serviceName: logicalName(props.config, "preview-router"),
      publicLoadBalancer: true,
      assignPublicIp: false,
      desiredCount: 1,
      cpu: 256,
      memoryLimitMiB: 512,
      certificate,
      redirectHTTP: true,
      securityGroups: [previewRouterSecurityGroup],
      taskImageOptions: {
        containerName: "preview-router",
        image: ContainerImage.fromRegistry("public.ecr.aws/nginx/nginx:1.27-alpine"),
        containerPort: 80,
        environment: {
          AGENTS_CLOUD_ENV: props.config.envName,
          AGENTS_CLOUD_PREVIEW_BASE_DOMAIN: previewBaseDomain,
          AGENTS_CLOUD_PREVIEW_STATIC_BUCKET: props.storage.previewStaticBucket.bucketName,
          AGENTS_CLOUD_PREVIEW_DEPLOYMENTS_TABLE: props.state.previewDeploymentsTable.tableName
        }
      }
    });

    this.previewRouterService.targetGroup.configureHealthCheck({
      path: "/",
      healthyHttpCodes: "200-399"
    });

    this.previewRouterService.service.connections.allowFrom(
      this.previewRouterService.loadBalancer,
      Port.tcp(80),
      "Allow the public ALB to reach the preview-router task."
    );

    props.storage.previewStaticBucket.grantRead(this.previewRouterService.taskDefinition.taskRole);
    props.state.previewDeploymentsTable.grantReadData(this.previewRouterService.taskDefinition.taskRole);
    this.previewRouterService.taskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "cloudwatch:namespace": `${props.config.appName}/${props.config.envName}`
          }
        }
      })
    );

    if (hostedZone) {
      new ARecord(this, "PreviewWildcardAliasRecord", {
        zone: hostedZone,
        recordName: `*.${previewBaseDomain}`,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(this.previewRouterService.loadBalancer))
      });

      new ARecord(this, "PreviewBaseAliasRecord", {
        zone: hostedZone,
        recordName: previewBaseDomain,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(this.previewRouterService.loadBalancer))
      });
    }

    new CfnOutput(this, "PreviewBaseDomain", {
      value: previewBaseDomain,
      exportName: logicalName(props.config, "preview-base-domain")
    });

    new CfnOutput(this, "PreviewWildcardDomain", {
      value: `*.${previewBaseDomain}`,
      exportName: logicalName(props.config, "preview-wildcard-domain")
    });

    new CfnOutput(this, "PreviewRouterLoadBalancerDnsName", {
      value: this.previewRouterService.loadBalancer.loadBalancerDnsName,
      exportName: logicalName(props.config, "preview-router-lb-dns-name")
    });

    new CfnOutput(this, "PreviewRouterServiceName", {
      value: this.previewRouterService.service.serviceName,
      exportName: logicalName(props.config, "preview-router-service-name")
    });
  }
}
