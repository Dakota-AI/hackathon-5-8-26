import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ArtifactSink } from "./ports.js";

export class AwsArtifactSink implements ArtifactSink {
  public constructor(
    private readonly s3: S3Client,
    private readonly dynamo: DynamoDBDocumentClient,
    private readonly config: {
      readonly artifactsBucketName: string;
      readonly artifactsTableName: string;
    }
  ) {}

  public static fromEnvironment(): AwsArtifactSink {
    return new AwsArtifactSink(new S3Client({}), DynamoDBDocumentClient.from(new DynamoDBClient({})), {
      artifactsBucketName: mustEnv("ARTIFACTS_BUCKET_NAME"),
      artifactsTableName: mustEnv("ARTIFACTS_TABLE_NAME")
    });
  }

  async putArtifact(input: { readonly key: string; readonly body: string; readonly contentType: string }): Promise<{ bucket: string; key: string; uri: string }> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.config.artifactsBucketName,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    }));
    return {
      bucket: this.config.artifactsBucketName,
      key: input.key,
      uri: `s3://${this.config.artifactsBucketName}/${input.key}`
    };
  }

  async putArtifactRecord(record: Record<string, unknown>): Promise<void> {
    await this.dynamo.send(new PutCommand({
      TableName: this.config.artifactsTableName,
      Item: record,
      ConditionExpression: "attribute_not_exists(runId) AND attribute_not_exists(artifactId)"
    }));
  }
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
