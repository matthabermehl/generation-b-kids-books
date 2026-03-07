import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { optionalEnv, requiredEnv } from "./env.js";

const s3 = new S3Client({});

export function publicArtifactUrl(s3Url: string | null): string | null {
  if (!s3Url) {
    return null;
  }

  const base = optionalEnv("ARTIFACT_PUBLIC_BASE_URL", "");
  if (!base || !s3Url.startsWith("s3://")) {
    return s3Url;
  }

  const stripped = s3Url.slice("s3://".length);
  const firstSlash = stripped.indexOf("/");
  const key = firstSlash >= 0 ? stripped.slice(firstSlash + 1) : stripped;
  return `${base.replace(/\/$/, "")}/${key}`;
}

export async function signPdfDownload(objectKey: string): Promise<string> {
  const bucket = requiredEnv("ARTIFACT_BUCKET");
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  });

  return getSignedUrl(s3, command, { expiresIn: 900 });
}
