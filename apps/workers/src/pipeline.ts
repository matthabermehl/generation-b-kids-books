import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import {
  pictureBookLayoutProfileId,
  pictureBookReadingProfiles,
  type BookProductFamily,
  type MoneyLessonKey,
  type PageCompositionSpec,
  type PageTemplateId,
  type PictureBookReadingProfile,
  type ReviewStage,
  type ReadingProfile
} from "@book/domain";
import { execute, query, withTransaction, txExecute } from "./lib/rds.js";
import { putJson, putBuffer, presignGetObjectFromS3Url } from "./lib/storage.js";
import { fileExtensionForContentType, logStructured, makeId, safeJsonParse } from "./lib/helpers.js";
import { moderateTexts } from "./lib/content-safety.js";
import { buildImagePlanArtifact, buildScenePlanArtifact } from "./lib/scene-plans.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { selectPictureBookComposition } from "./lib/page-template-select.js";
import { ensurePictureBookStyleReferenceUrls } from "./lib/style-assets.js";
import { insertCurrentBookArtifact, insertCurrentImageRecord } from "./lib/records.js";
import { upsertOpenReviewCase } from "./lib/review-cases.js";
import { resolveImageProvider } from "./providers/image.js";
import { BeatPlanningError, resolveLlmProvider } from "./providers/llm.js";

const sqs = new SQSClient({});

interface PipelineEvent {
  action:
    | "prepare_story"
    | "generate_character_sheet"
    | "enqueue_page_images"
    | "enqueue_page_image"
    | "prepare_render_input";
  bookId: string;
  pageId?: string;
  orderId?: string;
  mockRunTag?: string | null;
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
  product_family: BookProductFamily;
  layout_profile_id: string | null;
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
        array_to_string(b.interest_tags, ',') AS interest_tags,
        COALESCE(b.product_family, 'picture_book_fixed_layout') AS product_family,
        b.layout_profile_id
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

function isPictureBookReadingProfile(profile: ReadingProfile): profile is PictureBookReadingProfile {
  return pictureBookReadingProfiles.includes(profile as PictureBookReadingProfile);
}

async function markBookNeedsReview(
  bookId: string,
  orderId: string,
  stage: ReviewStage,
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

  await upsertOpenReviewCase({
    bookId,
    orderId,
    stage,
    reasonSummary: notes[0] ?? `Manual review required at ${stage}`,
    reasonJson: {
      notes,
      score
    }
  });

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

async function persistBeatPlanningFailure(
  bookId: string,
  error: BeatPlanningError
): Promise<{ artifactKey: string }> {
  const artifactKey = `books/${bookId}/beat-plan-failed.json`;
  await putJson(artifactKey, {
    bookId,
    beatSheet: error.beatSheet,
    audit: error.audit,
    llmMeta: error.meta,
    generatedAt: new Date().toISOString()
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "beat_plan_failed",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${artifactKey}`
  });

  await execute(
    `
      INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'beat_plan', :modelUsed, CAST(:score AS jsonb), 'fail', :notes)
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: bookId } },
      {
        name: "modelUsed",
        value: {
          stringValue: `${error.meta.provider}:${error.meta.model}`
        }
      },
      {
        name: "score",
        value: {
          stringValue: JSON.stringify({
            rewritesApplied: error.audit.rewritesApplied,
            attempts: error.audit.attempts.length,
            passed: false,
            artifactKey,
            llm: error.meta
          })
        }
      },
      {
        name: "notes",
        value: {
          stringValue: error.audit.finalIssues.join(" | ").slice(0, 4096)
        }
      }
    ]
  );

  return { artifactKey };
}

async function persistBeatPlanningReport(
  bookId: string,
  beatPlanning: {
    beatSheet: unknown;
    audit: { softIssues: string[] };
    meta: unknown;
  }
): Promise<{ artifactKey: string } | null> {
  if (beatPlanning.audit.softIssues.length === 0) {
    return null;
  }

  const artifactKey = `books/${bookId}/beat-plan-report.json`;
  await putJson(artifactKey, {
    bookId,
    softIssues: beatPlanning.audit.softIssues,
    beatSheet: beatPlanning.beatSheet,
    llmMeta: beatPlanning.meta,
    generatedAt: new Date().toISOString()
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "beat_plan_report",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${artifactKey}`
  });

  return { artifactKey };
}

async function prepareStory(
  bookId: string,
  mockRunTag?: string | null
): Promise<{ bookId: string; pageCount: number }> {
  const context = await loadBookContext(bookId);
  const llm = await resolveLlmProvider({ mockRunTag, source: "prepare_story" });
  const pageCount = Number(process.env.BOOK_DEFAULT_PAGE_COUNT ?? "12");
  const interests = (context.interest_tags ?? "").split(",").filter(Boolean);
  const storyContext = {
    bookId,
    childFirstName: context.child_first_name,
    pronouns: context.pronouns,
    ageYears: Number(context.age_years),
    lesson: context.money_lesson_key,
    interests,
    profile: context.reading_profile_id,
    pageCount,
    mockRunTag
  } as const;

  logStructured("BeatPlanningStart", {
    bookId,
    pageCount,
    profile: context.reading_profile_id
  });
  const beatPlanningStartedAt = Date.now();
  let beatPlanning: Awaited<ReturnType<typeof llm.generateBeatSheet>>;
  try {
    beatPlanning = await llm.generateBeatSheet(storyContext);
  } catch (error) {
    if (error instanceof BeatPlanningError) {
      try {
        const persisted = await persistBeatPlanningFailure(bookId, error);
        console.error(
          JSON.stringify({
            event: "BEAT_PLAN_FAILED",
            bookId,
            artifactKey: persisted.artifactKey,
            issues: error.audit.finalIssues
          })
        );
      } catch (persistError) {
        console.error(
          JSON.stringify({
            event: "BEAT_PLAN_FAILURE_PERSIST_ERROR",
            bookId,
            message: persistError instanceof Error ? persistError.message : String(persistError)
          })
        );
      }
    }

    throw error;
  }
  logStructured("BeatPlanningComplete", {
    bookId,
    durationMs: Date.now() - beatPlanningStartedAt,
    attempts: beatPlanning.audit.attempts.length,
    rewritesApplied: beatPlanning.audit.rewritesApplied,
    provider: beatPlanning.meta.provider,
    model: beatPlanning.meta.model
  });

  logStructured("StoryDraftStart", { bookId, attempt: 0 });
  const initialDraftStartedAt = Date.now();
  let drafted = await llm.draftPages(storyContext, beatPlanning.beatSheet);
  logStructured("StoryDraftComplete", {
    bookId,
    attempt: 0,
    durationMs: Date.now() - initialDraftStartedAt,
    provider: drafted.meta.provider,
    model: drafted.meta.model
  });
  let story = drafted.story;

  const critiques: string[] = [];
  const providerMeta = {
    beatPlan: {
      planner: beatPlanning.meta,
      audit: beatPlanning.audit
    },
    drafts: [drafted.meta],
    critics: [] as Array<{ provider: string; model: string; latencyMs: number }>
  };

  logStructured("StoryCriticStart", { bookId, rewriteAttempt: 0 });
  const criticStartedAt = Date.now();
  const verdict = await llm.critic(storyContext, story);
  logStructured("StoryCriticComplete", {
    bookId,
    rewriteAttempt: 0,
    durationMs: Date.now() - criticStartedAt,
    ok: verdict.ok,
    noteCount: verdict.notes.length,
    provider: verdict.meta.provider,
    model: verdict.meta.model
  });

  providerMeta.critics.push({
    provider: verdict.meta.provider,
    model: verdict.meta.model,
    latencyMs: verdict.meta.latencyMs
  });
  critiques.push(...verdict.notes);

  logStructured("StoryModerationStart", { bookId, pageCount: story.pages.length });
  const moderationStartedAt = Date.now();
  const moderation = await moderateTexts(
    (await getRuntimeConfig()).secrets.openaiApiKey,
    story.pages.flatMap((page) => [page.pageText, page.illustrationBrief])
  );
  logStructured("StoryModerationComplete", {
    bookId,
    durationMs: Date.now() - moderationStartedAt,
    ok: moderation.ok,
    reasonCount: moderation.reasons.length,
    mode: moderation.mode
  });
  if (!moderation.ok) {
    await markBookNeedsReview(bookId, context.order_id, "text_moderation", moderation.reasons, {
      mode: moderation.mode
    });
    throw new Error(`BOOK_NEEDS_REVIEW:text_moderation:${moderation.reasons[0] ?? "policy_violation"}`);
  }

  const beatPlanKey = `books/${bookId}/beat-plan.json`;
  await putJson(beatPlanKey, {
    bookId,
    beatSheet: beatPlanning.beatSheet,
    audit: beatPlanning.audit,
    llmMeta: beatPlanning.meta,
    generatedAt: new Date().toISOString()
  });

  await insertCurrentBookArtifact({
    bookId,
    artifactType: "beat_plan",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${beatPlanKey}`
  });

  const beatPlanReport = await persistBeatPlanningReport(bookId, beatPlanning);

  await execute(
    `
      INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'beat_plan', :modelUsed, CAST(:score AS jsonb), :verdict, :notes)
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: bookId } },
      {
        name: "modelUsed",
        value: {
          stringValue: `${beatPlanning.meta.provider}:${beatPlanning.meta.model}`
        }
      },
      {
        name: "score",
        value: {
          stringValue: JSON.stringify({
            rewritesApplied: beatPlanning.audit.rewritesApplied,
            attempts: beatPlanning.audit.attempts.length,
            passed: beatPlanning.audit.passed,
            softIssueCount: beatPlanning.audit.softIssues.length,
            reportArtifactKey: beatPlanReport?.artifactKey ?? null,
            llm: beatPlanning.meta
          })
        }
      },
      {
        name: "verdict",
        value: {
          stringValue: beatPlanning.audit.softIssues.length > 0 ? "warning" : "pass"
        }
      },
      {
        name: "notes",
        value: {
          stringValue: beatPlanning.audit.softIssues.join(" | ") || "Beat plan approved"
        }
      }
    ]
  );

  const persistedPages: PreparedStoryPageRow[] = story.pages.map((page) => ({
    id: makeId(),
    pageIndex: page.pageIndex,
    pageText: page.pageText,
    illustrationBrief: page.illustrationBrief,
    sceneId: page.sceneId,
    sceneVisualDescription: page.sceneVisualDescription,
    newWordsIntroduced: page.newWordsIntroduced,
    repetitionTargets: page.repetitionTargets
  }));

  await withTransaction(async (tx) => {
    await txExecute(tx, `DELETE FROM pages WHERE book_id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: bookId } }
    ]);

    for (const page of persistedPages) {
      await txExecute(
        tx,
        `
          INSERT INTO pages (id, book_id, page_index, text, illustration_brief_json, reading_checks_json, composition_json, status)
          VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), :pageIndex, :text, CAST(:brief AS jsonb), CAST(:checks AS jsonb), '{}'::jsonb, 'pending')
        `,
        [
          { name: "id", value: { stringValue: page.id } },
          { name: "bookId", value: { stringValue: bookId } },
          { name: "pageIndex", value: { longValue: page.pageIndex } },
          { name: "text", value: { stringValue: page.pageText } },
          {
            name: "brief",
            value: {
              stringValue: JSON.stringify({
                illustrationBrief: page.illustrationBrief,
                sceneId: page.sceneId,
                sceneVisualDescription: page.sceneVisualDescription
              })
            }
          },
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
              beatPlanArtifactKey: beatPlanKey,
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
  const scenePlanKey = `books/${bookId}/scene-plan.json`;
  const imagePlanKey = `books/${bookId}/image-plan.json`;
  const generatedAt = new Date().toISOString();

  await putJson(promptKey, {
    bookId,
    stylePrefix: "Muted watercolor palette, matte texture, calm composition.",
    beats: beatPlanning.beatSheet.beats,
    generatedAt
  });

  await putJson(storyKey, story);
  await putJson(
    scenePlanKey,
    buildScenePlanArtifact({
      bookId,
      title: story.title,
      beatSheet: beatPlanning.beatSheet,
      pages: story.pages,
      generatedAt
    })
  );
  await putJson(
    imagePlanKey,
    buildImagePlanArtifact({
      bookId,
      title: story.title,
      pages: persistedPages,
      generatedAt
    })
  );

  await insertCurrentBookArtifact({
    bookId,
    artifactType: "prompt_pack",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${promptKey}`
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "scene_plan",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${scenePlanKey}`
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "image_plan",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${imagePlanKey}`
  });

  return { bookId, pageCount: story.pages.length };
}

async function generateCharacterSheet(
  bookId: string,
  mockRunTag?: string | null
): Promise<{ bookId: string; key: string }> {
  const context = await loadBookContext(bookId);
  const runtimeConfig = await getRuntimeConfig();
  const imageProvider = await resolveImageProvider({
    mockRunTag,
    source: "generate_character_sheet"
  });
  const image = await imageProvider.generate(
    {
      bookId,
      pageIndex: 0,
      prompt: `Character sheet for ${context.child_first_name}. Keep outfit colors, facial features, and proportions consistent.`,
      role: "character_sheet"
    },
    1
  );

  const extension = fileExtensionForContentType(image.contentType);
  const key = `books/${bookId}/images/character-sheet.${extension}`;
  const s3Url = await putBuffer(key, image.bytes, image.contentType);

  await insertCurrentImageRecord({
    bookId,
    role: "character_sheet",
    endpoint: image.endpoint,
    prompt: `Character sheet for ${context.child_first_name}. Keep outfit colors, hair, and proportions consistent.`,
    seed: image.seed,
    requestId: image.requestId,
    width: image.width ?? 1536,
    height: image.height ?? 1024,
    s3Url,
    qaJson: image.qa,
    status: "ready",
    inputAssets: { styleLora: runtimeConfig.falStyleLoraUrl ?? null }
  });

  return { bookId, key };
}

interface PageRow {
  id: string;
  page_index: number;
  text: string;
  illustration_brief_json: string;
  composition_json?: string;
}

interface CharacterSheetRow {
  prompt: string | null;
  s3_url: string | null;
}

interface PreparedStoryPageRow {
  id: string;
  pageIndex: number;
  pageText: string;
  illustrationBrief: string;
  sceneId: string;
  sceneVisualDescription: string;
  newWordsIntroduced: string[];
  repetitionTargets: string[];
}

function legacyStyleAnchor(context: BookContextRow): string {
  return [
    "Children's picture-book illustration in muted watercolor with matte texture and soft natural lighting.",
    `Use the attached character sheet for ${context.child_first_name}'s hair, face shape, skin tone, outfit colors, and proportions.`,
    "Keep a calm, uncluttered composition suitable for a child-friendly storybook."
  ].join(" ");
}

function scenePrompt(sceneBrief: string): string {
  return [
    sceneBrief,
    "Watercolor on white paper.",
    "Soft matte texture and calm children's picture-book illustration style.",
    "Leave surrounding paper feeling airy and clean."
  ].join(" ");
}

async function enqueuePageImages(
  bookId: string,
  mockRunTag?: string | null,
  onlyPageId?: string
): Promise<{ queued: number; productFamily: BookProductFamily }> {
  const queueUrl = process.env.IMAGE_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("IMAGE_QUEUE_URL is required");
  }

  const runtimeConfig = await getRuntimeConfig();
  const context = await loadBookContext(bookId);
  const usePictureBookPipeline =
    runtimeConfig.featureFlags.enablePictureBookPipeline &&
    context.product_family === "picture_book_fixed_layout" &&
    isPictureBookReadingProfile(context.reading_profile_id);

  const characterSheetRows = await query<CharacterSheetRow>(
    `
      SELECT prompt, s3_url
      FROM images
      WHERE book_id = CAST(:bookId AS uuid) AND role = 'character_sheet' AND is_current = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );
  const characterSheet = characterSheetRows[0] ?? { prompt: null, s3_url: null };
  const characterSheetReferenceUrl = characterSheet.s3_url
    ? await presignGetObjectFromS3Url(characterSheet.s3_url)
    : null;

  const pages = await query<PageRow>(
    `
      SELECT id, page_index, text, illustration_brief_json, composition_json
      FROM pages
      WHERE book_id = CAST(:bookId AS uuid)
        ${onlyPageId ? "AND id = CAST(:pageId AS uuid)" : ""}
      ORDER BY page_index
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      ...(onlyPageId ? [{ name: "pageId", value: { stringValue: onlyPageId } }] : [])
    ]
  );

  const styleReferences = usePictureBookPipeline ? await ensurePictureBookStyleReferenceUrls() : null;
  let previousTemplateId: PageTemplateId | null = null;
  const pictureBookProfile = isPictureBookReadingProfile(context.reading_profile_id)
    ? context.reading_profile_id
    : null;

  for (const page of pages) {
    const brief = safeJsonParse<Record<string, unknown>>(page.illustration_brief_json ?? "{}", {});
    if (usePictureBookPipeline) {
      const composition = selectPictureBookComposition({
        bookId,
        pageIndex: Number(page.page_index),
        text: page.text,
        readingProfileId: pictureBookProfile ?? "early_decoder_5_7",
        previousTemplateId
      });
      previousTemplateId = composition.templateId;

      await execute(
        `UPDATE pages SET composition_json = CAST(:composition AS jsonb) WHERE id = CAST(:pageId AS uuid)`,
        [
          { name: "composition", value: { stringValue: JSON.stringify(composition) } },
          { name: "pageId", value: { stringValue: page.id } }
        ]
      );

      logStructured("PictureBookTemplateSelected", {
        bookId,
        pageId: page.id,
        pageIndex: Number(page.page_index),
        templateId: composition.templateId
      });

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            mode: "picture_book_fixed_layout",
            productFamily: context.product_family,
            bookId,
            mockRunTag: mockRunTag ?? null,
            pageId: page.id,
            pageIndex: Number(page.page_index),
            text: page.text,
            composition,
            brief: {
              illustrationBrief: String(brief.illustrationBrief ?? `Calm watercolor scene for ${context.child_first_name}`),
              characterSheetS3Url: characterSheet.s3_url,
              characterSheetReferenceUrl,
              styleBoardS3Url: styleReferences?.styleBoardS3Url ?? null,
              styleBoardReferenceUrl: styleReferences?.styleBoardReferenceUrl ?? null,
              paperTextureS3Url: styleReferences?.paperTextureS3Url ?? null,
              paperTextureReferenceUrl: styleReferences?.paperTextureReferenceUrl ?? null,
              scenePrompt: scenePrompt(String(brief.illustrationBrief ?? `Calm watercolor scene for ${context.child_first_name}`))
            }
          })
        })
      );
      continue;
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          mode: "legacy",
          bookId,
          mockRunTag: mockRunTag ?? null,
          pageId: page.id,
          pageIndex: Number(page.page_index),
          text: page.text,
          brief: {
            ...brief,
            styleAnchor: legacyStyleAnchor(context),
            characterAnchor:
              characterSheet.prompt ??
              `Use the attached character sheet for ${context.child_first_name}'s stable clothing and facial features.`,
            characterSheetS3Url: characterSheet.s3_url,
            characterSheetReferenceUrl
          }
        })
      })
    );
  }

  return { queued: pages.length, productFamily: context.product_family };
}

interface PageWithImageStatus {
  id: string;
  page_index: number;
  image_status: string | null;
}

async function upsertPagePreviewRecord(bookId: string, pageId: string, pageIndex: number, previewS3Url: string): Promise<void> {
  await insertCurrentImageRecord({
    bookId,
    pageId,
    role: "page_preview",
    endpoint: "renderer-preview",
    prompt: `fixed layout page preview ${pageIndex + 1}`,
    seed: 0,
    width: 2048,
    height: 2048,
    s3Url: previewS3Url,
    qaJson: {},
    status: "pending",
    inputAssets: { pageIndex }
  });
}

async function prepareRenderInput(bookId: string): Promise<{ renderInputKey: string; outputPdfKey: string }> {
  const runtimeConfig = await getRuntimeConfig();
  const context = await loadBookContext(bookId);
  const usePictureBookPipeline =
    runtimeConfig.featureFlags.enablePictureBookPipeline &&
    context.product_family === "picture_book_fixed_layout" &&
    isPictureBookReadingProfile(context.reading_profile_id);

  const imageRole = usePictureBookPipeline ? "page_fill" : "page";
  const rows = await query<PageWithImageStatus>(
    `
      SELECT p.id, p.page_index, i.status as image_status
      FROM pages p
      LEFT JOIN images i ON i.page_id = p.id AND i.role = :role AND i.is_current = TRUE
      WHERE p.book_id = CAST(:bookId AS uuid)
      ORDER BY p.page_index
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      { name: "role", value: { stringValue: imageRole } }
    ]
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
      WHERE book_id = CAST(:bookId AS uuid) AND role = :role AND is_current = TRUE
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      { name: "role", value: { stringValue: imageRole } }
    ]
  );
  const safetyFlags = Number(imageSafetyRows[0]?.safety_flags ?? 0);
  if (safetyFlags > 0) {
    await markBookNeedsReview(bookId, context.order_id, "image_safety", [
      `${safetyFlags} page image prompts were flagged by the safety policy`
    ]);
    throw new Error("BOOK_NEEDS_REVIEW:image_safety");
  }

  if (!usePictureBookPipeline) {
    const pageData = await query<{
      page_index: number;
      text: string;
      image_url: string;
    }>(
      `
        SELECT p.page_index, p.text, i.s3_url AS image_url
        FROM pages p
        INNER JOIN images i ON i.page_id = p.id AND i.role = 'page' AND i.is_current = TRUE
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

  const pageData = await query<{
    page_id: string;
    page_index: number;
    text: string;
    image_url: string;
    composition_json: string;
  }>(
    `
      SELECT p.id::text AS page_id, p.page_index, p.text, p.composition_json::text AS composition_json, i.s3_url AS image_url
      FROM pages p
      INNER JOIN images i ON i.page_id = p.id AND i.role = 'page_fill' AND i.is_current = TRUE
      WHERE p.book_id = CAST(:bookId AS uuid)
      ORDER BY p.page_index
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  const renderInputKey = `books/${bookId}/render/render-input.json`;
  const outputPdfKey = `books/${bookId}/render/book.pdf`;
  const title = `${context.child_first_name}'s Bitcoin Adventure`;
  const pictureBookReadingProfile = isPictureBookReadingProfile(context.reading_profile_id)
    ? context.reading_profile_id
    : "early_decoder_5_7";

  const renderPages = [] as Array<{
    index: number;
    text: string;
    composition: PageCompositionSpec;
    artImageS3Url: string;
    previewOutputKey: string;
  }>;

  for (const row of pageData) {
    const composition = safeJsonParse<PageCompositionSpec>(row.composition_json ?? "{}", {
      layoutProfileId: pictureBookLayoutProfileId(),
      templateId: "corner_ul_ellipse",
      canvas: { width: 2048, height: 2048 },
      textBox: { x: 0.08, y: 0.08, width: 0.34, height: 0.25 },
      artBox: { x: 0.40, y: 0.18, width: 0.52, height: 0.62 },
      maskBox: { x: 0.36, y: 0.14, width: 0.58, height: 0.68 },
      fade: { shape: "ellipse", featherPx: 120 },
      textStyle: {
        readingProfileId: pictureBookReadingProfile,
        preferredFontPx: 64,
        minFontPx: 52,
        lineHeight: 1.2,
        align: "left"
      }
    });
    const previewOutputKey = `books/${bookId}/render/previews/page-${Number(row.page_index) + 1}.png`;
    await upsertPagePreviewRecord(bookId, row.page_id, Number(row.page_index), `s3://${process.env.ARTIFACT_BUCKET}/${previewOutputKey}`);
    renderPages.push({
      index: Number(row.page_index),
      text: row.text,
      composition,
      artImageS3Url: row.image_url,
      previewOutputKey
    });
  }

  await putJson(renderInputKey, {
    bookId,
    title,
    productFamily: context.product_family,
    layoutProfileId: context.layout_profile_id ?? pictureBookLayoutProfileId(),
    pages: renderPages
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
    orderId: event.orderId ?? null,
    mockRunTagPresent: Boolean(event.mockRunTag && event.mockRunTag.trim().length > 0)
  });

  switch (event.action) {
    case "prepare_story":
      return prepareStory(event.bookId, event.mockRunTag);
    case "generate_character_sheet":
      return generateCharacterSheet(event.bookId, event.mockRunTag);
    case "enqueue_page_images":
      return enqueuePageImages(event.bookId, event.mockRunTag);
    case "enqueue_page_image":
      if (!event.pageId) {
        throw new Error("pageId is required for enqueue_page_image");
      }
      return enqueuePageImages(event.bookId, event.mockRunTag, event.pageId);
    case "prepare_render_input":
      return prepareRenderInput(event.bookId);
    default:
      throw new Error(`Unsupported action ${(event as { action?: string }).action}`);
  }
};
