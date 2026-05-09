import { RemovalPolicy } from "aws-cdk-lib";

export type AgentsCloudEnvironmentName = "dev" | "staging" | "prod";

export interface AgentsCloudConfig {
  readonly appName: string;
  readonly envName: AgentsCloudEnvironmentName;
  readonly awsRegion: string;
  readonly removalPolicy: RemovalPolicy;
  readonly autoDeleteObjects: boolean;
  readonly network: {
    readonly maxAzs: number;
    readonly natGateways: number;
  };
  readonly previewIngress: {
    readonly enabled: boolean;
    readonly baseDomain?: string;
    readonly hostedZoneId?: string;
    readonly hostedZoneName?: string;
  };
  readonly tags: Record<string, string>;
}

function parseEnvName(value: string | undefined): AgentsCloudEnvironmentName {
  if (value === "dev" || value === "staging" || value === "prod") {
    return value;
  }

  return "dev";
}

export function loadConfig(): AgentsCloudConfig {
  const envName = parseEnvName(process.env.AGENTS_CLOUD_ENV);
  const appName = process.env.AGENTS_CLOUD_APP_NAME ?? "agents-cloud";
  const awsRegion = process.env.AGENTS_CLOUD_AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
  const isProd = envName === "prod";

  return {
    appName,
    envName,
    awsRegion,
    removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    autoDeleteObjects: !isProd,
    network: {
      maxAzs: Number(process.env.AGENTS_CLOUD_MAX_AZS ?? "2"),
      natGateways: Number(process.env.AGENTS_CLOUD_NAT_GATEWAYS ?? (isProd ? "2" : "1"))
    },
    previewIngress: {
      enabled: process.env.AGENTS_CLOUD_PREVIEW_INGRESS_ENABLED === "true",
      baseDomain: process.env.AGENTS_CLOUD_PREVIEW_BASE_DOMAIN,
      hostedZoneId: process.env.AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_ID,
      hostedZoneName: process.env.AGENTS_CLOUD_PREVIEW_HOSTED_ZONE_NAME ?? process.env.AGENTS_CLOUD_PREVIEW_BASE_DOMAIN
    },
    tags: {
      Application: appName,
      Environment: envName,
      ManagedBy: "aws-cdk",
      Repository: "agents-cloud"
    }
  };
}

export function stackName(config: AgentsCloudConfig, suffix: string): string {
  return `${config.appName}-${config.envName}-${suffix}`;
}

export function logicalName(config: AgentsCloudConfig, name: string): string {
  return `${config.appName}-${config.envName}-${name}`;
}
