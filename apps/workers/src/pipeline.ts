import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import type { MoneyLessonKey, ReadingProfile } from "@book/domain";
import { execute, query, withTransaction, txExecute } from "./lib/rds.js";
import { putJson, putBuffer } from "./lib/storage.js";
import { makeId } from "./lib/helpers.js";
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

async function prepareStory(bookId: string): Promise<{ bookId: string; pageCount: number }> {
  const context = await loadBookContext(bookId);
  const llm = resolveLlmProvider();
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

  let story = await llm.draftPages(
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

  const critiques: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
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

    critiques.push(...verdict.notes);
    if (verdict.ok) {
      break;
    }

    story = await llm.draftPages(
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

    await txExecute(
      tx,
      `
        INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
        VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'final_text', 'mock-llm', CAST(:score AS jsonb), :verdict, :notes)
      `,
      [
        { name: "id", value: { stringValue: makeId() } },
        { name: "bookId", value: { stringValue: bookId } },
        { name: "score", value: { stringValue: JSON.stringify({ critiqueCount: critiques.length }) } },
        { name: "verdict", value: { stringValue: critiques.length === 0 ? "pass" : "warning" } },
        { name: "notes", value: { stringValue: critiques.join(" | ") || "No issues" } }
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
  const imageProvider = resolveImageProvider();
  const image = await imageProvider.generate(
    {
      bookId,
      pageIndex: 0,
      prompt: `Character sheet for ${context.child_first_name}. Keep outfit and facial features stable.`,
      role: "character_sheet"
    },
    1
  );

  const key = `books/${bookId}/images/character-sheet.svg`;
  const s3Url = await putBuffer(key, image.bytes, image.contentType);

  await execute(
    `
      INSERT INTO images (
        id, book_id, role, model_endpoint, prompt, seed, loras_json, s3_url, qa_json, status
      ) VALUES (
        CAST(:id AS uuid), CAST(:bookId AS uuid), 'character_sheet', :endpoint, :prompt, :seed, CAST(:loras AS jsonb), :s3, CAST(:qa AS jsonb), 'ready'
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
      { name: "loras", value: { stringValue: JSON.stringify({ styleLora: process.env.FAL_STYLE_LORA_URL ?? null }) } },
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
