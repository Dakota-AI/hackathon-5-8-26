import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership, StorageClass } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";

export class StorageStack extends AgentsCloudStack {
  public readonly workspaceLiveArtifactsBucket: Bucket;
  public readonly workspaceAuditLogBucket: Bucket;
  public readonly previewStaticBucket: Bucket;
  public readonly researchDatasetsBucket: Bucket;

  public constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);

    this.workspaceLiveArtifactsBucket = this.createStandardBucket("WorkspaceLiveArtifactsBucket", "workspace-live-artifacts", props, {
      transitionToInfrequentAccessAfterDays: 30,
      expireNoncurrentVersionsAfterDays: 90
    });

    this.workspaceAuditLogBucket = new Bucket(this, "WorkspaceAuditLogBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectLockEnabled: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: "retain-audit-noncurrent-versions",
          noncurrentVersionTransitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(90)
            }
          ]
        }
      ]
    });

    this.previewStaticBucket = this.createStandardBucket("PreviewStaticBucket", "preview-static", props, {
      transitionToInfrequentAccessAfterDays: 30,
      expireNoncurrentVersionsAfterDays: 31
    });

    this.researchDatasetsBucket = this.createStandardBucket("ResearchDatasetsBucket", "research-datasets", props, {
      transitionToInfrequentAccessAfterDays: 60,
      expireNoncurrentVersionsAfterDays: 180
    });

    this.outputBucket("WorkspaceLiveArtifactsBucketName", "workspace-live-artifacts-bucket-name", this.workspaceLiveArtifactsBucket, props);
    this.outputBucket("WorkspaceAuditLogBucketName", "workspace-audit-log-bucket-name", this.workspaceAuditLogBucket, props);
    this.outputBucket("PreviewStaticBucketName", "preview-static-bucket-name", this.previewStaticBucket, props);
    this.outputBucket("ResearchDatasetsBucketName", "research-datasets-bucket-name", this.researchDatasetsBucket, props);
  }

  private createStandardBucket(
    id: string,
    lifecycleId: string,
    props: AgentsCloudStackProps,
    lifecycle: { readonly transitionToInfrequentAccessAfterDays: number; readonly expireNoncurrentVersionsAfterDays: number }
  ): Bucket {
    return new Bucket(this, id, {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: props.config.removalPolicy,
      autoDeleteObjects: props.config.autoDeleteObjects,
      lifecycleRules: [
        {
          id: lifecycleId,
          noncurrentVersionTransitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(lifecycle.transitionToInfrequentAccessAfterDays)
            }
          ],
          noncurrentVersionExpiration: Duration.days(lifecycle.expireNoncurrentVersionsAfterDays)
        }
      ]
    });
  }

  private outputBucket(id: string, exportSuffix: string, bucket: Bucket, props: AgentsCloudStackProps): void {
    new CfnOutput(this, id, {
      value: bucket.bucketName,
      exportName: logicalName(props.config, exportSuffix)
    });
  }
}
