import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ArtifactPresigner } from "./ports.js";

export class S3ArtifactPresigner implements ArtifactPresigner {
  public constructor(private readonly client: S3Client) {}

  public static fromEnvironment(): S3ArtifactPresigner {
    return new S3ArtifactPresigner(new S3Client({}));
  }

  async presignDownload(input: { readonly bucket: string; readonly key: string; readonly expiresInSeconds: number; readonly contentType?: string; readonly fileName?: string }): Promise<{ readonly url: string; readonly expiresAt: string }> {
    const command = new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: input.fileName ? `attachment; filename="${sanitizeFileName(input.fileName)}"` : undefined
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
    return { url, expiresAt };
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\r\n"\\]/g, "_");
}
