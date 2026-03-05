import type { SQSHandler } from "aws-lambda";
import { execute, query } from "./lib/rds.js";
import { putBuffer } from "./lib/storage.js";
import { fileExtensionForContentType, logStructured, makeId } from "./lib/helpers.js";
import { runImageGenerationAttempts } from "./lib/image-attempts.js";
import { resolveImageProvider } from "./providers/image.js";

interface JobPayload {
  bookId: string;
  pageId: string;
  pageIndex: number;
  text: string;
  brief: {
    illustrationBrief?: string;
  };
}

interface ImageRow {
  id: string;
  status: string;
}

function imagePrompt(job: JobPayload): string {
  return (
    job.brief.illustrationBrief ??
    `Page ${job.pageIndex + 1}: calm illustration of ${job.text.slice(0, 120)}`
  );
}

async function generatePageImage(job: JobPayload): Promise<void> {
  const provider = await resolveImageProvider();
  const prompt = imagePrompt(job);
  const attemptResult = await runImageGenerationAttempts(provider, {
    bookId: job.bookId,
    pageIndex: job.pageIndex,
    prompt,
    role: "page"
  });

  const { generated, generatedKey } = attemptResult;
  const extension = fileExtensionForContentType(generated.contentType);
  const keyWithExtension = `${generatedKey}.${extension}`;
  await putBuffer(keyWithExtension, generated.bytes, generated.contentType);

  const s3Url = `s3://${process.env.ARTIFACT_BUCKET}/${keyWithExtension}`;
  const existing = await query<ImageRow>(
    `SELECT id, status FROM images WHERE page_id = CAST(:pageId AS uuid) AND role = 'page' LIMIT 1`,
    [{ name: "pageId", value: { stringValue: job.pageId } }]
  );

  if (existing[0]) {
    await execute(
      `
        UPDATE images
        SET model_endpoint = :endpoint,
            prompt = :prompt,
            seed = :seed,
            fal_request_id = :requestId,
            width = :width,
            height = :height,
            s3_url = :s3,
            qa_json = CAST(:qa AS jsonb),
            status = :status
        WHERE id = CAST(:id AS uuid)
      `,
      [
        { name: "endpoint", value: { stringValue: generated.endpoint } },
        {
          name: "prompt",
          value: { stringValue: prompt }
        },
        { name: "seed", value: { longValue: generated.seed } },
        { name: "requestId", value: { stringValue: generated.requestId ?? "" } },
        { name: "width", value: { longValue: generated.width ?? 1536 } },
        { name: "height", value: { longValue: generated.height ?? 1024 } },
        { name: "s3", value: { stringValue: s3Url } },
        { name: "qa", value: { stringValue: JSON.stringify(generated.qa) } },
        { name: "status", value: { stringValue: generated.qa.passed ? "ready" : "failed" } },
        { name: "id", value: { stringValue: existing[0].id } }
      ]
    );
  } else {
    await execute(
      `
        INSERT INTO images (
          id, book_id, page_id, role, model_endpoint, prompt, seed, fal_request_id, width, height, s3_url, qa_json, status
        ) VALUES (
          CAST(:id AS uuid), CAST(:bookId AS uuid), CAST(:pageId AS uuid), 'page', :endpoint, :prompt, :seed, :requestId, :width, :height, :s3, CAST(:qa AS jsonb), :status
        )
      `,
      [
        { name: "id", value: { stringValue: makeId() } },
        { name: "bookId", value: { stringValue: job.bookId } },
        { name: "pageId", value: { stringValue: job.pageId } },
        { name: "endpoint", value: { stringValue: generated.endpoint } },
        { name: "prompt", value: { stringValue: prompt } },
        { name: "seed", value: { longValue: generated.seed } },
        { name: "requestId", value: { stringValue: generated.requestId ?? "" } },
        { name: "width", value: { longValue: generated.width ?? 1536 } },
        { name: "height", value: { longValue: generated.height ?? 1024 } },
        { name: "s3", value: { stringValue: s3Url } },
        { name: "qa", value: { stringValue: JSON.stringify(generated.qa) } },
        { name: "status", value: { stringValue: generated.qa.passed ? "ready" : "failed" } }
      ]
    );
  }

  await execute(`UPDATE pages SET status = :status WHERE id = CAST(:pageId AS uuid)`, [
    { name: "status", value: { stringValue: generated.qa.passed ? "ready" : "failed" } },
    { name: "pageId", value: { stringValue: job.pageId } }
  ]);
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const payload = JSON.parse(record.body) as JobPayload;
    logStructured("ImageWorkerJobStart", {
      bookId: payload.bookId,
      pageId: payload.pageId,
      pageIndex: payload.pageIndex
    });
    await generatePageImage(payload);
  }
};
