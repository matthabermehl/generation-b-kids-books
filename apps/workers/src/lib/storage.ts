import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});

export function artifactBucket(): string {
  const bucket = process.env.ARTIFACT_BUCKET;
  if (!bucket) {
    throw new Error("ARTIFACT_BUCKET is required");
  }

  return bucket;
}

export async function putJson(key: string, data: unknown): Promise<string> {
  const bucket = artifactBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json"
    })
  );

  return `s3://${bucket}/${key}`;
}

export async function putBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = artifactBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  return `s3://${bucket}/${key}`;
}

export async function getJson<T>(key: string): Promise<T> {
  const bucket = artifactBucket();
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const payload = await response.Body?.transformToString();

  if (!payload) {
    throw new Error(`No S3 object body for ${bucket}/${key}`);
  }

  return JSON.parse(payload) as T;
}

export function parseS3Url(url: string): { bucket: string; key: string } | null {
  if (!url.startsWith("s3://")) {
    return null;
  }

  const value = url.slice("s3://".length);
  const slash = value.indexOf("/");
  if (slash < 1) {
    return null;
  }

  return {
    bucket: value.slice(0, slash),
    key: value.slice(slash + 1)
  };
}

export async function presignGetObjectFromS3Url(url: string, expiresInSeconds = 21_600): Promise<string | null> {
  const parsed = parseS3Url(url);
  if (!parsed) {
    return null;
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key
    }),
    {
      expiresIn: expiresInSeconds
    }
  );
}
