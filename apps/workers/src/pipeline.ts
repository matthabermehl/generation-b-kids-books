import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import {
  buildPageArtVisualGuidance,
  compositionForTemplate,
  pictureBookLayoutProfileId,
  pictureBookReadingProfiles,
  buildPageArtPrompt,
  type BookProductFamily,
  type MoneyLessonKey,
  type PageArtVisualGuidance,
  type PageCompositionSpec,
  type PictureBookReadingProfile,
  type ReviewStage,
  type ReadingProfile,
  type StoryCriticVerdict,
  type StoryPackage,
  type StoryRewriteTurn,
  type VisualPageContract,
  type VisualStoryBible
} from "@book/domain";
import { execute, query, withTransaction, txExecute } from "./lib/rds.js";
import { getJson, putBuffer, putJson, presignGetObjectFromS3Url } from "./lib/storage.js";
import { logStructured, makeId, safeJsonParse } from "./lib/helpers.js";
import { moderateTexts } from "./lib/content-safety.js";
import { buildImagePlanArtifact, buildScenePlanArtifact } from "./lib/scene-plans.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { selectPictureBookComposition } from "./lib/page-template-select.js";
import { insertCurrentBookArtifact, insertCurrentImageRecord } from "./lib/records.js";
import { upsertOpenReviewCase } from "./lib/review-cases.js";
import { renderStoryProofPdf } from "./lib/story-proof.js";
import {
  ensureSupportingCharacterReferences,
  loadVisualStoryBible,
  prepareRecurringSupportingCharacterReferences,
  persistVisualStoryBibleArtifact
} from "./lib/visual-continuity.js";
import { BeatPlanningError, resolveLlmProvider } from "./providers/llm.js";

const sqs = new SQSClient({});

interface PipelineEvent {
  action:
    | "prepare_story"
    | "resume_after_story_review"
    | "enqueue_next_page_image"
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

function parseNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
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

async function persistStoryQaReport(
  bookId: string,
  payload: {
    concept: unknown;
    story: unknown;
    verdict: unknown;
    llmMeta: unknown;
    storyAudit?: unknown;
    finalStatus?: string;
  }
): Promise<{ artifactKey: string }> {
  const artifactKey = `books/${bookId}/story-qa-report.json`;
  await putJson(artifactKey, {
    bookId,
    ...payload,
    generatedAt: new Date().toISOString()
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "story_qa_report",
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
  const pageCount = Number(process.env.BOOK_DEFAULT_SPREAD_COUNT ?? process.env.BOOK_DEFAULT_PAGE_COUNT ?? "12");
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

  logStructured("StoryConceptStart", {
    bookId,
    pageCount,
    profile: context.reading_profile_id
  });
  const storyConceptStartedAt = Date.now();
  const conceptResult = await llm.generateStoryConcept(storyContext);
  const storyConcept = conceptResult.concept;
  logStructured("StoryConceptComplete", {
    bookId,
    durationMs: Date.now() - storyConceptStartedAt,
    provider: conceptResult.meta.provider,
    model: conceptResult.meta.model,
    caregiverLabel: storyConcept.caregiverLabel,
    deadlineEvent: storyConcept.deadlineEvent
  });

  logStructured("BeatPlanningStart", {
    bookId,
    pageCount,
    profile: context.reading_profile_id
  });
  const beatPlanningStartedAt = Date.now();
  let beatPlanning: Awaited<ReturnType<typeof llm.generateBeatSheet>>;
  try {
    beatPlanning = await llm.generateBeatSheet(storyContext, storyConcept);
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

  type StoryAttemptAudit = {
    attempt: number;
    draftMeta: unknown;
    criticMeta?: unknown;
    criticVerdict?: StoryCriticVerdict;
    rewriteInstructions: string;
    rewriteAction: "none" | "page" | "beat";
    status: "passed" | "rewritten" | "needs_review";
    hardIssueCount: number;
  };

  const maxStoryRewrites = parseNonNegativeIntEnv("STORY_MAX_REWRITES", 2);
  const rewriteHistory: StoryRewriteTurn[] = [];
  const storyAttempts: StoryAttemptAudit[] = [];
  let story: StoryPackage | null = null;
  let verdict: { verdict: StoryCriticVerdict; meta: { provider: string; model: string; latencyMs: number } } | null =
    null;

  const providerMeta = {
    concept: conceptResult.meta,
    beatPlan: {
      planner: beatPlanning.meta,
      audit: beatPlanning.audit
    },
    drafts: [] as unknown[],
    critics: [] as Array<{ provider: string; model: string; latencyMs: number; issueCount: number }>,
    pageRewriteApplied: false,
    beatRewriteApplied: false,
    rewriteBudget: maxStoryRewrites,
    attempts: storyAttempts,
    finalStatus: "passed" as "passed" | "needs_review"
  };

  const runStoryCritic = async (rewriteAttempt: number, currentStory: StoryPackage) => {
    logStructured("StoryCriticStart", { bookId, rewriteAttempt });
    const criticStartedAt = Date.now();
    const verdictResult = await llm.critic(storyContext, storyConcept, currentStory);
    const hardIssueCount = verdictResult.verdict.issues.filter((issue) => issue.severity === "hard").length;
    logStructured("StoryCriticComplete", {
      bookId,
      rewriteAttempt,
      durationMs: Date.now() - criticStartedAt,
      ok: verdictResult.verdict.ok,
      issueCount: verdictResult.verdict.issues.length,
      hardIssueCount,
      provider: verdictResult.meta.provider,
      model: verdictResult.meta.model
    });

    providerMeta.critics.push({
      provider: verdictResult.meta.provider,
      model: verdictResult.meta.model,
      latencyMs: verdictResult.meta.latencyMs,
      issueCount: verdictResult.verdict.issues.length
    });

    return verdictResult;
  };

  for (let attempt = 0; attempt <= maxStoryRewrites; attempt += 1) {
    logStructured("StoryDraftStart", { bookId, attempt });
    const draftStartedAt = Date.now();
    const drafted = await llm.draftPages(storyContext, storyConcept, beatPlanning.beatSheet, {
      rewriteHistory
    });
    logStructured("StoryDraftComplete", {
      bookId,
      attempt,
      durationMs: Date.now() - draftStartedAt,
      provider: drafted.meta.provider,
      model: drafted.meta.model
    });

    providerMeta.drafts.push(drafted.meta);
    story = drafted.story;

    const attemptAudit: StoryAttemptAudit = {
      attempt,
      draftMeta: drafted.meta,
      rewriteInstructions: "",
      rewriteAction: "none",
      status: "passed",
      hardIssueCount: 0
    };
    storyAttempts.push(attemptAudit);

    verdict = await runStoryCritic(attempt, story);
    const hardIssues = verdict.verdict.issues.filter((issue) => issue.severity === "hard");
    attemptAudit.criticMeta = verdict.meta;
    attemptAudit.criticVerdict = verdict.verdict;
    attemptAudit.rewriteInstructions = verdict.verdict.rewriteInstructions;
    attemptAudit.hardIssueCount = hardIssues.length;

    if (hardIssues.length === 0) {
      attemptAudit.status = "passed";
      break;
    }

    if (attempt >= maxStoryRewrites) {
      attemptAudit.status = "needs_review";
      break;
    }

    rewriteHistory.push({
      story,
      criticVerdict: verdict.verdict
    });

    const requiresBeatRewrite = hardIssues.some(
      (issue) => issue.rewriteTarget === "beat" || issue.rewriteTarget === "concept"
    );

    if (requiresBeatRewrite) {
      providerMeta.beatRewriteApplied = true;
      attemptAudit.rewriteAction = "beat";
      attemptAudit.status = "rewritten";
      const revisedBeatSheet = await llm.reviseBeatSheet(
        storyContext,
        storyConcept,
        beatPlanning.beatSheet,
        verdict.verdict.rewriteInstructions
      );
      beatPlanning = {
        ...beatPlanning,
        beatSheet: revisedBeatSheet.beatSheet,
        meta: revisedBeatSheet.meta
      };
      logStructured("StoryBeatRewriteComplete", {
        bookId,
        attempt,
        provider: revisedBeatSheet.meta.provider,
        model: revisedBeatSheet.meta.model
      });
      continue;
    }

    providerMeta.pageRewriteApplied = true;
    attemptAudit.rewriteAction = "page";
    attemptAudit.status = "rewritten";
  }

  if (!story || !verdict) {
    throw new Error("Story drafting reached an unreachable state");
  }

  const remainingHardIssues = verdict.verdict.issues.filter((issue) => issue.severity === "hard");
  providerMeta.finalStatus = remainingHardIssues.length === 0 ? "passed" : "needs_review";
  providerMeta.beatPlan = {
    planner: beatPlanning.meta,
    audit: beatPlanning.audit
  };

  const storyQaReport = await persistStoryQaReport(bookId, {
    concept: storyConcept,
    story,
    verdict: verdict.verdict,
    llmMeta: {
      concept: conceptResult.meta,
      beatPlan: beatPlanning.meta,
      story: providerMeta
    },
    storyAudit: {
      maxRewrites: maxStoryRewrites,
      attempts: storyAttempts,
      finalStatus: providerMeta.finalStatus
    },
    finalStatus: providerMeta.finalStatus
  });
  const storyKey = `books/${bookId}/story.json`;
  await putJson(storyKey, story);

  const storyProofKey = `books/${bookId}/render/story-proof.pdf`;
  const storyProofStartedAt = Date.now();
  const storyProofPdf = await renderStoryProofPdf({
    bookId,
    title: story.title,
    spreads: story.pages.map((page) => ({
      index: page.pageIndex,
      text: page.pageText
    }))
  });
  const storyProofS3Url = await putBuffer(storyProofKey, storyProofPdf, "application/pdf");
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "story_proof_pdf",
    s3Url: storyProofS3Url
  });
  logStructured("StoryProofRenderComplete", {
    bookId,
    spreadCount: story.pages.length,
    physicalPageCount: story.pages.length * 2,
    outputKey: storyProofKey,
    durationMs: Date.now() - storyProofStartedAt
  });

  if (remainingHardIssues.length > 0) {
    const storyQaNotes = remainingHardIssues.map(
      (issue) => `${issue.issueType}: ${issue.evidence}. Fix: ${issue.suggestedFix}`
    );
    await markBookNeedsReview(bookId, context.order_id, "finalize_gate", storyQaNotes, {
      artifactKey: storyQaReport.artifactKey,
      rewriteInstructions: verdict.verdict.rewriteInstructions
    });
    throw new Error(`BOOK_NEEDS_REVIEW:finalize_gate:${storyQaNotes[0] ?? "story_quality"}`);
  }

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
  const storyConceptKey = `books/${bookId}/story-concept.json`;
  await putJson(storyConceptKey, {
    bookId,
    concept: storyConcept,
    llmMeta: conceptResult.meta,
    generatedAt: new Date().toISOString()
  });
  await insertCurrentBookArtifact({
    bookId,
    artifactType: "story_concept",
    s3Url: `s3://${process.env.ARTIFACT_BUCKET}/${storyConceptKey}`
  });

  await putJson(beatPlanKey, {
    bookId,
    concept: storyConcept,
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
    const finalStoryIssues = verdict.verdict.issues.map(
      (issue) => `${issue.issueType}: ${issue.evidence}. Fix: ${issue.suggestedFix}`
    );

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
              critiqueCount: finalStoryIssues.length,
              beatPlanArtifactKey: beatPlanKey,
              storyConceptArtifactKey: storyConceptKey,
              storyQaArtifactKey: storyQaReport.artifactKey,
              llm: providerMeta
            })
          }
        },
        {
          name: "verdict",
          value: { stringValue: finalStoryIssues.length === 0 ? "pass" : "warning" }
        },
        {
          name: "notes",
          value: {
            stringValue: finalStoryIssues.join(" | ") || "No issues"
          }
        }
      ]
    );

    await txExecute(tx, `UPDATE books SET status = 'building' WHERE id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: bookId } }
    ]);
  });

  const promptKey = `books/${bookId}/prompt-pack.json`;
  const scenePlanKey = `books/${bookId}/scene-plan.json`;
  const imagePlanKey = `books/${bookId}/image-plan.json`;
  const generatedAt = new Date().toISOString();

  await putJson(promptKey, {
    bookId,
    stylePrefix: "Muted watercolor palette, matte texture, calm composition.",
    concept: storyConcept,
    beats: beatPlanning.beatSheet.beats,
    generatedAt
  });

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
  const persistedVisualBible = await persistVisualStoryBibleArtifact({
    bookId,
    childFirstName: context.child_first_name,
    story,
    generatedAt
  });
  await prepareRecurringSupportingCharacterReferences({
    bookId,
    visualBible: persistedVisualBible.visualBible,
    mockRunTag
  });

  return { bookId, pageCount: story.pages.length };
}

async function resumeAfterStoryReview(bookId: string): Promise<{ bookId: string; pageCount: number }> {
  const context = await loadBookContext(bookId);
  const story = await getJson<StoredStory>(`books/${bookId}/story.json`);

  const moderationStartedAt = Date.now();
  const moderation = await moderateTexts(
    (await getRuntimeConfig()).secrets.openaiApiKey,
    story.pages.flatMap((page) => [page.pageText, page.illustrationBrief])
  );
  logStructured("StoryModerationResumeComplete", {
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

  const generatedAt = new Date().toISOString();
  const promptKey = `books/${bookId}/prompt-pack.json`;
  const scenePlanKey = `books/${bookId}/scene-plan.json`;
  const imagePlanKey = `books/${bookId}/image-plan.json`;

  await putJson(promptKey, {
    bookId,
    stylePrefix: "Muted watercolor palette, matte texture, calm composition.",
    concept: story.concept,
    beats: story.beats,
    generatedAt
  });
  await putJson(
    scenePlanKey,
    buildScenePlanArtifact({
      bookId,
      title: story.title,
      beatSheet: { beats: story.beats },
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

    await txExecute(
      tx,
      `
        INSERT INTO evaluations (id, book_id, stage, model_used, score_json, verdict, notes)
        VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'final_text', 'manual_resume', CAST(:score AS jsonb), 'warning', :notes)
      `,
      [
        { name: "id", value: { stringValue: makeId() } },
        { name: "bookId", value: { stringValue: bookId } },
        {
          name: "score",
          value: {
            stringValue: JSON.stringify({
              resumedFrom: "story_review",
              storyArtifactKey: `books/${bookId}/story.json`
            })
          }
        },
        {
          name: "notes",
          value: { stringValue: "Reviewer approved continuation from stored story proof." }
        }
      ]
    );

    await txExecute(tx, `UPDATE books SET status = 'building' WHERE id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: bookId } }
    ]);
  });

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
  const persistedVisualBible = await persistVisualStoryBibleArtifact({
    bookId,
    childFirstName: context.child_first_name,
    story,
    generatedAt
  });
  await prepareRecurringSupportingCharacterReferences({
    bookId,
    visualBible: persistedVisualBible.visualBible
  });

  return { bookId, pageCount: story.pages.length };
}

interface PageRow {
  id: string;
  page_index: number;
  text: string;
  status: string;
  illustration_brief_json: string;
  composition_json?: string;
}

interface CharacterReferenceRow {
  image_id: string;
  prompt: string | null;
  s3_url: string | null;
}

interface PageArtReferenceRow {
  page_id: string;
  image_id: string;
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

type StoredStoryPage = StoryPackage["pages"][number];
type StoredStory = StoryPackage;

function emptyVisualGuidance(): PageArtVisualGuidance {
  return {
    mustShow: [],
    mustMatch: [],
    showExactly: [],
    mustNotShow: [],
    settingAnchors: [],
    continuityNotes: []
  };
}

async function loadOrCreateVisualStoryBible(
  bookId: string,
  childFirstName: string,
  mockRunTag?: string | null
): Promise<VisualStoryBible | null> {
  const existing = await loadVisualStoryBible(bookId);
  if (existing) {
    await prepareRecurringSupportingCharacterReferences({
      bookId,
      visualBible: existing,
      mockRunTag
    });
    return existing;
  }

  try {
    const story = await getJson<StoredStory>(`books/${bookId}/story.json`);
    const persisted = await persistVisualStoryBibleArtifact({
      bookId,
      childFirstName,
      story
    });
    await prepareRecurringSupportingCharacterReferences({
      bookId,
      visualBible: persisted.visualBible,
      mockRunTag
    });
    return persisted.visualBible;
  } catch (error) {
    logStructured("VisualStoryBibleUnavailable", {
      bookId,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function legacyStyleAnchor(context: BookContextRow): string {
  return [
    "Children's picture-book illustration in muted watercolor with matte texture and soft natural lighting.",
    `Use the approved character reference for ${context.child_first_name}'s hair, face shape, skin tone, outfit colors, and proportions.`,
    "Keep a calm, uncluttered composition suitable for a child-friendly storybook."
  ].join(" ");
}

async function enqueuePageImage(
  bookId: string,
  mockRunTag?: string | null,
  onlyPageId?: string
): Promise<{
  queued: number;
  done: boolean;
  productFamily: BookProductFamily;
  pageId?: string;
  pageIndex?: number;
}> {
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
  const visualBible = usePictureBookPipeline
    ? await loadOrCreateVisualStoryBible(bookId, context.child_first_name, mockRunTag)
    : null;

  const imageRole = usePictureBookPipeline ? "page_art" : "page";
  const pendingRows = await query<{ page_id: string; page_index: number }>(
    `
      SELECT p.id::text AS page_id, p.page_index
      FROM pages p
      INNER JOIN images i
        ON i.page_id = p.id
       AND i.role = :role
       AND i.is_current = TRUE
       AND i.status = 'pending'
      WHERE p.book_id = CAST(:bookId AS uuid)
        ${onlyPageId ? "AND p.id = CAST(:pageId AS uuid)" : ""}
      ORDER BY p.page_index
      LIMIT 1
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      { name: "role", value: { stringValue: imageRole } },
      ...(onlyPageId ? [{ name: "pageId", value: { stringValue: onlyPageId } }] : [])
    ]
  );
  const pendingRow = pendingRows[0];
  if (pendingRow) {
    return {
      queued: 0,
      done: false,
      productFamily: context.product_family,
      pageId: pendingRow.page_id,
      pageIndex: Number(pendingRow.page_index)
    };
  }

  const characterReferenceRows = await query<CharacterReferenceRow>(
    `
      SELECT id::text AS image_id, prompt, s3_url
      FROM images
      WHERE book_id = CAST(:bookId AS uuid) AND role = 'character_reference' AND is_current = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );
  const characterReference = characterReferenceRows[0] ?? { image_id: "", prompt: null, s3_url: null };
  const characterReferenceUrl = characterReference.s3_url
    ? await presignGetObjectFromS3Url(characterReference.s3_url)
    : null;

  const pages = await query<PageRow>(
    `
      SELECT id, page_index, text, status, illustration_brief_json, composition_json
      FROM pages
      WHERE book_id = CAST(:bookId AS uuid)
      ORDER BY page_index
    `,
    [
      { name: "bookId", value: { stringValue: bookId } }
    ]
  );

  const preparedPages: PreparedStoryPageRow[] = pages.map((page) => {
    const brief = safeJsonParse<Record<string, unknown>>(page.illustration_brief_json ?? "{}", {});
    const defaultIllustrationBrief = `Calm watercolor scene for ${context.child_first_name}`;
    const illustrationBrief = String(brief.illustrationBrief ?? defaultIllustrationBrief);
    const sceneId = String(brief.sceneId ?? `scene_${Number(page.page_index) + 1}`);
    const sceneVisualDescription = String(brief.sceneVisualDescription ?? illustrationBrief);
    return {
      id: page.id,
      pageIndex: Number(page.page_index),
      pageText: page.text,
      illustrationBrief,
      sceneId,
      sceneVisualDescription,
      newWordsIntroduced: [],
      repetitionTargets: []
    };
  });
  const imagePlanPages = buildImagePlanArtifact({
    bookId,
    title: "",
    pages: preparedPages,
    generatedAt: new Date().toISOString()
  }).pages;

  const queuedPage = onlyPageId
    ? pages.find((page) => page.id === onlyPageId)
    : pages.find((page) => page.status !== "ready");
  if (!queuedPage) {
    return {
      queued: 0,
      done: true,
      productFamily: context.product_family
    };
  }

  const pictureBookProfile = isPictureBookReadingProfile(context.reading_profile_id)
    ? context.reading_profile_id
    : null;

  const queuedPreparedPage = preparedPages.find((page) => page.id === queuedPage.id);
  if (!queuedPreparedPage) {
    throw new Error(`Prepared page not found for ${queuedPage.id}`);
  }

  if (usePictureBookPipeline) {
    if (!characterReference.image_id || !characterReference.s3_url || !characterReferenceUrl) {
      throw new Error(`Missing approved character_reference for book ${bookId}`);
    }

    const imagePlanPage = imagePlanPages.find((page) => page.pageId === queuedPage.id);
    if (!imagePlanPage) {
      throw new Error(`Image plan page not found for ${queuedPage.id}`);
    }

    const composition = selectPictureBookComposition({
      bookId,
      pageIndex: Number(queuedPage.page_index),
      text: queuedPage.text,
      readingProfileId: pictureBookProfile ?? "early_decoder_5_7"
    });
    await execute(
      `UPDATE pages SET composition_json = CAST(:composition AS jsonb) WHERE id = CAST(:pageId AS uuid)`,
      [
        { name: "composition", value: { stringValue: JSON.stringify(composition) } },
        { name: "pageId", value: { stringValue: queuedPage.id } }
      ]
    );
    logStructured("PictureBookTemplateSelected", {
      bookId,
      pageId: queuedPage.id,
      pageIndex: Number(queuedPage.page_index),
      templateId: composition.templateId
    });

    const pageContract: VisualPageContract | null =
      visualBible?.pages.find((page) => page.pageIndex === imagePlanPage.pageIndex) ?? null;
    const visualGuidance =
      visualBible && pageContract ? buildPageArtVisualGuidance(visualBible, pageContract) : emptyVisualGuidance();
    const supportingCharacterReferences =
      visualBible && pageContract
        ? await ensureSupportingCharacterReferences({
            bookId,
            visualBible,
            entityIds: pageContract.supportingCharacterIds,
            mockRunTag
          })
        : [];
    const priorSameScenePageIds = imagePlanPage.priorSameScenePageIds.slice(-2);
    const pageArtReferenceRows =
      priorSameScenePageIds.length === 0
        ? []
        : await query<PageArtReferenceRow>(
            `
              SELECT page_id::text AS page_id, id::text AS image_id, s3_url
              FROM images
              WHERE page_id = ANY(string_to_array(:pageIds, ',')::uuid[])
                AND role = 'page_art'
                AND is_current = TRUE
                AND status = 'ready'
            `,
            [{ name: "pageIds", value: { stringValue: priorSameScenePageIds.join(",") } }]
          );
    const pageArtReferenceByPageId = new Map(pageArtReferenceRows.map((row) => [row.page_id, row]));
    const orderedPageArtReferences = priorSameScenePageIds
      .map((pageId) => pageArtReferenceByPageId.get(pageId))
      .filter((row): row is PageArtReferenceRow => Boolean(row));
    const sameSceneReferenceUrls = (
      await Promise.all(
        orderedPageArtReferences.map(async (row) =>
          row.s3_url ? presignGetObjectFromS3Url(row.s3_url) : null
        )
      )
    ).filter((value): value is string => Boolean(value));
    const pageArtPrompt = buildPageArtPrompt({
      ...imagePlanPage.pageArtPromptInputs,
      visualGuidance
    });
    await insertCurrentImageRecord({
      bookId,
      pageId: queuedPage.id,
      role: "page_art",
      endpoint: "queued:image-worker",
      prompt: pageArtPrompt,
      seed: 0,
      width: composition.canvas.width,
      height: composition.canvas.height,
      qaJson: {},
      status: "pending",
      inputAssets: {
        sceneId: imagePlanPage.sceneId,
        sceneVisualDescription: imagePlanPage.sceneVisualDescription,
        pageContract,
        visualGuidance,
        characterReferenceImageId: characterReference.image_id,
        characterReferenceS3Url: characterReference.s3_url,
        continuityReferencePageIds: priorSameScenePageIds,
        sameSceneReferenceImageIds: orderedPageArtReferences.map((row) => row.image_id),
        sameSceneReferenceS3Urls: orderedPageArtReferences
          .map((row) => row.s3_url)
          .filter((value): value is string => Boolean(value)),
        supportingCharacterReferenceImageIds: supportingCharacterReferences.map((reference) => reference.imageId),
        supportingCharacterReferenceS3Urls: supportingCharacterReferences.map((reference) => reference.s3Url),
        supportingCharacterReferences: supportingCharacterReferences.map((reference) => ({
          imageId: reference.imageId,
          entityId: reference.entityId,
          label: reference.label,
          identityAnchors: reference.identityAnchors,
          s3Url: reference.s3Url
        })),
        priorSameScenePageIds,
        pageArtPromptInputs: imagePlanPage.pageArtPromptInputs
      }
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          mode: "picture_book_fixed_layout",
          productFamily: context.product_family,
          bookId,
          mockRunTag: mockRunTag ?? null,
          pageId: queuedPage.id,
          pageIndex: Number(queuedPage.page_index),
          text: queuedPage.text,
          composition,
          brief: {
            illustrationBrief: queuedPreparedPage.illustrationBrief,
            sceneId: imagePlanPage.sceneId,
            sceneVisualDescription: imagePlanPage.sceneVisualDescription,
            pageArtPrompt,
            pageContract,
            visualGuidance,
            priorSameScenePageIds,
            continuityReferencePageIds: priorSameScenePageIds,
            characterReferenceImageId: characterReference.image_id,
            characterReferenceS3Url: characterReference.s3_url,
            characterReferenceUrl,
            sameSceneReferenceImageIds: orderedPageArtReferences.map((row) => row.image_id),
            sameSceneReferenceS3Urls: orderedPageArtReferences
              .map((row) => row.s3_url)
              .filter((value): value is string => Boolean(value)),
            sameSceneReferenceUrls,
            supportingCharacterReferenceImageIds: supportingCharacterReferences.map((reference) => reference.imageId),
            supportingCharacterReferenceS3Urls: supportingCharacterReferences.map((reference) => reference.s3Url),
            supportingCharacterReferenceUrls: supportingCharacterReferences.map((reference) => reference.url),
            supportingCharacterReferences
          }
        })
      })
    );

    return {
      queued: 1,
      done: false,
      productFamily: context.product_family,
      pageId: queuedPage.id,
      pageIndex: Number(queuedPage.page_index)
    };
  }

  const brief = safeJsonParse<Record<string, unknown>>(queuedPage.illustration_brief_json ?? "{}", {});
  const prompt = [
    legacyStyleAnchor(context),
    characterReference.prompt ??
      `Use the approved character reference for ${context.child_first_name}'s stable clothing and facial features.`,
    String(brief.illustrationBrief ?? `Calm watercolor scene for ${context.child_first_name}`)
  ]
    .filter(Boolean)
    .join(" ");
  await insertCurrentImageRecord({
    bookId,
    pageId: queuedPage.id,
    role: "page",
    endpoint: "queued:image-worker",
    prompt,
    seed: 0,
    width: 1536,
    height: 1024,
    qaJson: {},
    status: "pending"
  });
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        mode: "legacy",
        bookId,
        mockRunTag: mockRunTag ?? null,
        pageId: queuedPage.id,
        pageIndex: Number(queuedPage.page_index),
        text: queuedPage.text,
        brief: {
          ...brief,
          styleAnchor: legacyStyleAnchor(context),
          characterAnchor:
            characterReference.prompt ??
            `Use the approved character reference for ${context.child_first_name}'s stable clothing and facial features.`,
          characterReferenceUrl
        }
      })
    })
  );

  return {
    queued: 1,
    done: false,
    productFamily: context.product_family,
    pageId: queuedPage.id,
    pageIndex: Number(queuedPage.page_index)
  };
}

interface PageWithImageStatus {
  id: string;
  page_index: number;
  image_status: string | null;
  image_s3_url: string | null;
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

  const imageRole = usePictureBookPipeline ? "page_art" : "page";
  const rows = await query<PageWithImageStatus>(
    `
      SELECT p.id, p.page_index, i.status as image_status, i.s3_url AS image_s3_url
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

  const pending = rows.filter((row) => row.image_status !== "ready" || !row.image_s3_url);
  if (pending.length > 0) {
    throw new Error(`Cannot prepare render input while ${pending.length} page images are not renderable.`);
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
      INNER JOIN images i ON i.page_id = p.id AND i.role = 'page_art' AND i.is_current = TRUE
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
    const composition = safeJsonParse<PageCompositionSpec>(
      row.composition_json ?? "{}",
      compositionForTemplate("text_left_art_right_v1", pictureBookReadingProfile)
    );
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
    case "resume_after_story_review":
      return resumeAfterStoryReview(event.bookId);
    case "enqueue_next_page_image":
      return enqueuePageImage(event.bookId, event.mockRunTag);
    case "enqueue_page_image":
      if (!event.pageId) {
        throw new Error("pageId is required for enqueue_page_image");
      }
      return enqueuePageImage(event.bookId, event.mockRunTag, event.pageId);
    case "prepare_render_input":
      return prepareRenderInput(event.bookId);
    default:
      throw new Error(`Unsupported action ${(event as { action?: string }).action}`);
  }
};
