import type { SQSHandler } from "aws-lambda";
import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { execute } from "./lib/rds.js";

interface PrivacyPurgeMessage {
  privacyEventId: string;
  userId: string;
  childProfileId: string;
  s3Urls: string[];
}

const s3 = new S3Client({});

function parseS3Url(url: string): { bucket: string; key: string } | null {
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

async function purgeArtifacts(urls: string[]): Promise<{ deleted: number; invalid: number }> {
  const byBucket = new Map<string, string[]>();
  let invalid = 0;

  for (const url of urls) {
    const parsed = parseS3Url(url);
    if (!parsed) {
      invalid += 1;
      continue;
    }

    const existing = byBucket.get(parsed.bucket) ?? [];
    existing.push(parsed.key);
    byBucket.set(parsed.bucket, existing);
  }

  let deleted = 0;
  for (const [bucket, keys] of byBucket.entries()) {
    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);
      const response = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true
          }
        })
      );
      deleted += (response.Deleted ?? []).length;
    }
  }

  return { deleted, invalid };
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const payload = JSON.parse(record.body) as PrivacyPurgeMessage;
    const startedAt = Date.now();

    try {
      const { deleted, invalid } = await purgeArtifacts(payload.s3Urls ?? []);
      await execute(
        `
          UPDATE privacy_events
          SET status = 'completed',
              payload_json = jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{result}', CAST(:result AS jsonb), true),
              completed_at = NOW()
          WHERE id = CAST(:eventId AS uuid)
        `,
        [
          { name: "eventId", value: { stringValue: payload.privacyEventId } },
          {
            name: "result",
            value: {
              stringValue: JSON.stringify({
                deleted,
                invalid,
                durationMs: Date.now() - startedAt
              })
            }
          }
        ]
      );
      console.log(
        JSON.stringify({
          event: "PRIVACY_PURGE_COMPLETED",
          privacyEventId: payload.privacyEventId,
          userId: payload.userId,
          childProfileId: payload.childProfileId,
          deleted,
          invalid
        })
      );
    } catch (error) {
      await execute(
        `
          UPDATE privacy_events
          SET status = 'failed',
              payload_json = jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{error}', CAST(:error AS jsonb), true),
              completed_at = NOW()
          WHERE id = CAST(:eventId AS uuid)
        `,
        [
          { name: "eventId", value: { stringValue: payload.privacyEventId } },
          {
            name: "error",
            value: {
              stringValue: JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              })
            }
          }
        ]
      );
      console.error(
        JSON.stringify({
          event: "PRIVACY_PURGE_FAILED",
          privacyEventId: payload.privacyEventId,
          message: error instanceof Error ? error.message : String(error)
        })
      );
      throw error;
    }
  }
};
