import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requiredEnv } from "./env.js";

const s3 = new S3Client({});

export async function signPdfDownload(objectKey: string): Promise<string> {
  const bucket = requiredEnv("ARTIFACT_BUCKET");
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  });

  return getSignedUrl(s3, command, { expiresIn: 900 });
}
