import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import type { MoneyLessonKey, ReadingProfile } from "@book/domain";
import { execute, query, withTransaction, txExecute } from "./lib/rds.js";
import { putJson, putBuffer } from "./lib/storage.js";
import { fileExtensionForContentType, makeId, logStructured } from "./lib/helpers.js";
import { moderateTexts } from "./lib/content-safety.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { resolveImageProvider } from "./providers/image.js";
import { resolveLlmProvider } from "./providers/llm.js";

const sqs = new SQSClient({});

interface PipelineEvent {
  action:
    | "prepare_story"
    | "generate_character_sheet"
    | "enqueue_page_images"
    | "prepare_render_input";
  bookId: string;
  orderId?: string;
}

interface BookContextRow {
  book_id: string;
  order_id: string;
  child_first_name: string;
  age_years: number;
  pronouns: string;
  reading_profile_id: ReadingProfile;
  money_lesson_key: MoneyLessonKey;
  interest_tags: string;
}

async function loadBookContext(bookId: string): Promise<BookContextRow> {
  const rows = await query<BookContextRow>(
    `
      SELECT
        b.id AS book_id,
        b.order_id,
        cp.child_first_name,
        cp.age_years,
        cp.pronouns,
        b.reading_profile_id,
        b.money_lesson_key,
        array_to_string(b.interest_tags, ',') AS interest_tags
      FROM books b
      INNER JOIN orders o ON o.id = b.order_id
      INNER JOIN child_profiles cp ON cp.id = o.child_profile_id
      WHERE b.id = CAST(:bookId AS uuid)
      LIMIT 1
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Book not found: ${bookId}`);
  }

  return row;
}

async function markBookNeedsReview(
  bookId: string,
  orderId: string,
  stage: string,
  notes: string[],
  score: Record<string, unknown> = {}
): Promise<void> {
  await execute(
    `
      UPDATE books
      SET status = 'needs_review'
      WHERE id = CAST(:bookId AS uuid)
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  await execute(
    `
      UPDATE orders
      SET status = 'needs_review'
      WHERE id = CAST(:orderId AS uuid)
    `,
    [{ name: "orderId", value: { stringValue: orderId } }]
  );

  await execute(
    `
      INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), :stage, :model, CAST(:score AS jsonb), 'needs_review', :notes)
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: bookId } },
      { name: "stage", value: { stringValue: stage } },
      { name: "model", value: { stringValue: "policy_gate" } },
      { name: "score", value: { stringValue: JSON.stringify(score) } },
      { name: "notes", value: { stringValue: notes.join(" | ").slice(0, 4096) } }
    ]
  );

  console.error(
    JSON.stringify({
      event: "BOOK_NEEDS_REVIEW",
      stage,
      bookId,
      orderId,
      notes
    })
  );
}

async function prepareStory(bookId: string): Promise<{ bookId: string; pageCount: number }> {
  const context = await loadBookContext(bookId);
  const llm = await resolveLlmProvider();
  const pageCount = Number(process.env.BOOK_DEFAULT_PAGE_COUNT ?? "12");
  const interests = (context.interest_tags ?? "").split(",").filter(Boolean);

  const beatSheet = await llm.generateBeatSheet({
    bookId,
    childFirstName: context.child_first_name,
    ageYears: Number(context.age_years),
    lesson: context.money_lesson_key,
    interests,
    profile: context.reading_profile_id,
    pageCount
  });

  let drafted = await llm.draftPages(
    {
      bookId,
      childFirstName: context.child_first_name,
      ageYears: Number(context.age_years),
      lesson: context.money_lesson_key,
      interests,
      profile: context.reading_profile_id,
      pageCount
    },
    beatSheet.beats
  );
  let story = drafted.story;

  const critiques: string[] = [];
  const providerMeta = {
    beatSheet: beatSheet.meta,
    drafts: [drafted.meta],
    critics: [] as Array<{ provider: string; model: string; latencyMs: number }>
  };

  const maxRewrites = 2;
  for (let rewriteAttempt = 0; rewriteAttempt <= maxRewrites; rewriteAttempt += 1) {
    const verdict = await llm.critic(
      {
        bookId,
        childFirstName: context.child_first_name,
        ageYears: Number(context.age_years),
        lesson: context.money_lesson_key,
        interests,
        profile: context.reading_profile_id,
        pageCount
      },
      story
    );

    providerMeta.critics.push({
      provider: verdict.meta.provider,
      model: verdict.meta.model,
      latencyMs: verdict.meta.latencyMs
    });
    critiques.push(...verdict.notes);
    if (verdict.ok) {
      break;
    }

    if (rewriteAttempt === maxRewrites) {
      break;
    }

    drafted = await llm.draftPages(
      {
        bookId,
        childFirstName: context.child_first_name,
        ageYears: Number(context.age_years),
        lesson: context.money_lesson_key,
        interests,
        profile: context.reading_profile_id,
        pageCount
      },
      beatSheet.beats
    );
    providerMeta.drafts.push(drafted.meta);
    story = drafted.story;
  }

  const moderation = await moderateTexts(
    (await getRuntimeConfig()).secrets.openaiApiKey,
    story.pages.flatMap((page) => [page.pageText, page.illustrationBrief])
  );
  if (!moderation.ok) {
    await markBookNeedsReview(bookId, context.order_id, "text_moderation", moderation.reasons, {
      mode: moderation.mode
    });
    throw new Error(`BOOK_NEEDS_REVIEW:text_moderation:${moderation.reasons[0] ?? "policy_violation"}`);
  }

  await withTransaction(async (tx) => {
    await txExecute(tx, `DELETE FROM pages WHERE book_id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: bookId } }
    ]);

    for (const page of story.pages) {
      await txExecute(
        tx,
        `
          INSERT INTO pages (id, book_id, page_index, text, illustration_brief_json, reading_checks_json, status)
          VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), :pageIndex, :text, CAST(:brief AS jsonb), CAST(:checks AS jsonb), 'pending')
        `,
        [
          { name: "id", value: { stringValue: makeId() } },
          { name: "bookId", value: { stringValue: bookId } },
          { name: "pageIndex", value: { longValue: page.pageIndex } },
          { name: "text", value: { stringValue: page.pageText } },
          { name: "brief", value: { stringValue: JSON.stringify({ illustrationBrief: page.illustrationBrief }) } },
          {
            name: "checks",
            value: {
              stringValue: JSON.stringify({
                newWordsIntroduced: page.newWordsIntroduced,
                repetitionTargets: page.repetitionTargets
              })
            }
          }
        ]
      );
    }

    const finalCritic = providerMeta.critics[providerMeta.critics.length - 1];
    const modelUsed = finalCritic ? `${finalCritic.provider}:${finalCritic.model}` : "unknown";

    await txExecute(
      tx,
      `
        INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
        VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'final_text', :modelUsed, CAST(:score AS jsonb), :verdict, :notes)
      `,
      [
        { name: "id", value: { stringValue: makeId() } },
        { name: "bookId", value: { stringValue: bookId } },
        { name: "modelUsed", value: { stringValue: modelUsed } },
        {
          name: "score",
          value: {
            stringValue: JSON.stringify({
              critiqueCount: critiques.length,
              llm: providerMeta
            })
          }
        },
        { name: "verdict", value: { stringValue: critiques.length === 0 ? "pass" : "warning" } },
        {
          name: "notes",
          value: {
            stringValue: critiques.join(" | ") || "No issues"
          }
        }
      ]
    );

    await txExecute(tx, `UPDATE books SET status = 'building' WHERE id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: bookId } }
    ]);
  });

  const promptKey = `books/${bookId}/prompt-pack.json`;
  const storyKey = `books/${bookId}/story.json`;

  await putJson(promptKey, {
    bookId,
    stylePrefix: "Muted watercolor palette, matte texture, calm composition.",
    beats: beatSheet.beats,
    generatedAt: new Date().toISOString()
  });

  await putJson(storyKey, story);

  await execute(
    `
      INSERT INTO book_artifacts (id, book_id, artifact_type, s3_url)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'prompt_pack', :s3)
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: bookId } },
      { name: "s3", value: { stringValue: `s3://${process.env.ARTIFACT_BUCKET}/${promptKey}` } }
    ]
  );

  return { bookId, pageCount: story.pages.length };
}

async function generateCharacterSheet(bookId: string): Promise<{ bookId: string; key: string }> {
  const context = await loadBookContext(bookId);
  const runtimeConfig = await getRuntimeConfig();
  const imageProvider = await resolveImageProvider();
  const image = await imageProvider.generate(
    {
      bookId,
      pageIndex: 0,
      prompt: `Character sheet for ${context.child_first_name}. Keep outfit and facial features stable.`,
      role: "character_sheet"
    },
    1
  );

  const extension = fileExtensionForContentType(image.contentType);
  const key = `books/${bookId}/images/character-sheet.${extension}`;
  const s3Url = await putBuffer(key, image.bytes, image.contentType);

  await execute(
    `
      INSERT INTO images (
        id, book_id, role, model_endpoint, prompt, seed, loras_json, fal_request_id, width, height, s3_url, qa_json, status
      ) VALUES (
        CAST(:id AS uuid), CAST(:bookId AS uuid), 'character_sheet', :endpoint, :prompt, :seed, CAST(:loras AS jsonb), :requestId, :width, :height, :s3, CAST(:qa AS jsonb), 'ready'
      )
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: bookId } },
      { name: "endpoint", value: { stringValue: image.endpoint } },
      {
        name: "prompt",
        value: {
          stringValue: `Character sheet for ${context.child_first_name}. Keep outfit colors and hair consistent.`
        }
      },
      { name: "seed", value: { longValue: image.seed } },
      {
        name: "loras",
        value: { stringValue: JSON.stringify({ styleLora: runtimeConfig.falStyleLoraUrl ?? null }) }
      },
      { name: "requestId", value: { stringValue: image.requestId ?? "" } },
      { name: "width", value: { longValue: image.width ?? 1536 } },
      { name: "height", value: { longValue: image.height ?? 1024 } },
      { name: "s3", value: { stringValue: s3Url } },
      { name: "qa", value: { stringValue: JSON.stringify(image.qa) } }
    ]
  );

  return { bookId, key };
}

interface PageRow {
  id: string;
  page_index: number;
  text: string;
  illustration_brief_json: string;
}

async function enqueuePageImages(bookId: string): Promise<{ queued: number }> {
  const queueUrl = process.env.IMAGE_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("IMAGE_QUEUE_URL is required");
  }

  const pages = await query<PageRow>(
    `
      SELECT id, page_index, text, illustration_brief_json
      FROM pages
      WHERE book_id = CAST(:bookId AS uuid)
      ORDER BY page_index
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  for (const page of pages) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          bookId,
          pageId: page.id,
          pageIndex: Number(page.page_index),
          text: page.text,
          brief: JSON.parse(page.illustration_brief_json || "{}")
        })
      })
    );
  }

  return { queued: pages.length };
}

interface PageWithImageStatus {
  id: string;
  page_index: number;
  image_status: string | null;
}

async function prepareRenderInput(bookId: string): Promise<{ renderInputKey: string; outputPdfKey: string }> {
  const context = await loadBookContext(bookId);
  const rows = await query<PageWithImageStatus>(
    `
      SELECT p.id, p.page_index, i.status as image_status
      FROM pages p
      LEFT JOIN images i ON i.page_id = p.id AND i.role = 'page'
      WHERE p.book_id = CAST(:bookId AS uuid)
      ORDER BY p.page_index
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  const pending = rows.filter((row) => row.image_status !== "ready");
  if (pending.length > 0) {
    throw new Error(`Cannot prepare render input while ${pending.length} page images are not ready.`);
  }

  const imageSafetyRows = await query<{ safety_flags: number }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(qa_json::text, '') ILIKE '%safety_flagged_prompt:%')::int AS safety_flags
      FROM images
      WHERE book_id = CAST(:bookId AS uuid) AND role = 'page'
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );
  const safetyFlags = Number(imageSafetyRows[0]?.safety_flags ?? 0);
  if (safetyFlags > 0) {
    await markBookNeedsReview(bookId, context.order_id, "image_safety", [
      `${safetyFlags} page image prompts were flagged by the safety policy`
    ]);
    throw new Error("BOOK_NEEDS_REVIEW:image_safety");
  }

  const pageData = await query<{
    page_index: number;
    text: string;
    image_url: string;
  }>(
    `
      SELECT p.page_index, p.text, i.s3_url AS image_url
      FROM pages p
      INNER JOIN images i ON i.page_id = p.id AND i.role = 'page'
      WHERE p.book_id = CAST(:bookId AS uuid)
      ORDER BY p.page_index
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  const renderInputKey = `books/${bookId}/render/render-input.json`;
  const outputPdfKey = `books/${bookId}/render/book.pdf`;

  await putJson(renderInputKey, {
    bookId,
    title: "Bitcoin Adventure",
    pages: pageData.map((row) => ({
      index: Number(row.page_index),
      text: row.text,
      imageS3Url: row.image_url
    }))
  });

  return { renderInputKey, outputPdfKey };
}

export const handler: Handler<PipelineEvent> = async (event) => {
  if (!event?.action || !event.bookId) {
    throw new Error("action and bookId are required");
  }

  logStructured("PipelineActionStart", {
    action: event.action,
    bookId: event.bookId,
    orderId: event.orderId ?? null
  });

  switch (event.action) {
    case "prepare_story":
      return prepareStory(event.bookId);
    case "generate_character_sheet":
      return generateCharacterSheet(event.bookId);
    case "enqueue_page_images":
      return enqueuePageImages(event.bookId);
    case "prepare_render_input":
      return prepareRenderInput(event.bookId);
    default:
      throw new Error(`Unsupported action ${(event as { action?: string }).action}`);
  }
};
