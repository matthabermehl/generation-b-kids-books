import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
