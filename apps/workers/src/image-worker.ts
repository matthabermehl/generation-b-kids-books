import type { SQSHandler } from "aws-lambda";
import type { PageCompositionSpec } from "@book/domain";
import { execute } from "./lib/rds.js";
import { putBuffer, presignGetObjectFromS3Url } from "./lib/storage.js";
import { fileExtensionForContentType, logStructured } from "./lib/helpers.js";
import { blockedTermsInText } from "./lib/content-safety.js";
import { createPlacedPageCanvas, createFadedArtBackground } from "./lib/page-canvas.js";
import { createExpandedMaskPng } from "./lib/page-mask.js";
import {
  classifyPictureBookIssues,
  evaluatePictureBookPage,
  type PageQaResult,
  type PictureBookQaCategory
} from "./lib/page-qa.js";
import { selectAlternatePictureBookComposition } from "./lib/page-template-select.js";
import {
  FalRequestError,
  resolveImageProvider,
  resolvePictureBookImageProviders,
  type GenerateImageInput,
  type GeneratedImage,
  type ImageProvider,
  type PageFillProvider,
  type ScenePlateProvider
} from "./providers/image.js";
import { runImageGenerationAttempts } from "./lib/image-attempts.js";
import { clearCurrentImagesForPage, insertCurrentImageRecord } from "./lib/records.js";

interface LegacyJobPayload {
  mode?: "legacy";
  bookId: string;
  mockRunTag?: string | null;
  pageId: string;
  pageIndex: number;
  text: string;
  brief: {
    illustrationBrief?: string;
    styleAnchor?: string;
    characterAnchor?: string;
    characterSheetS3Url?: string | null;
    characterSheetReferenceUrl?: string | null;
  };
}

interface PictureBookJobPayload {
  mode: "picture_book_fixed_layout";
  productFamily: "picture_book_fixed_layout";
  bookId: string;
  mockRunTag?: string | null;
  pageId: string;
  pageIndex: number;
  text: string;
  composition: PageCompositionSpec;
  brief: {
    illustrationBrief: string;
    characterSheetS3Url?: string | null;
    characterSheetReferenceUrl?: string | null;
    styleBoardS3Url?: string | null;
    styleBoardReferenceUrl?: string | null;
    paperTextureS3Url?: string | null;
    paperTextureReferenceUrl?: string | null;
    scenePrompt: string;
  };
}

type JobPayload = LegacyJobPayload | PictureBookJobPayload;

interface PictureBookQaPayload extends Record<string, unknown> {
  passed: boolean;
  issues: string[];
}

function legacyImagePrompt(job: LegacyJobPayload): string {
  const scenePrompt =
    job.brief.illustrationBrief ?? `Page ${job.pageIndex + 1}: calm illustration of ${job.text.slice(0, 120)}`;
  const styleAnchor =
    job.brief.styleAnchor ??
    "Muted watercolor palette, matte texture, soft natural lighting, and child-friendly realism.";
  const characterAnchor =
    job.brief.characterAnchor ??
    "Use the attached character sheet for stable clothing details, face shape, and proportions.";
  const characterSheetReference = job.brief.characterSheetS3Url
    ? `Reference character-sheet image: ${job.brief.characterSheetS3Url}.`
    : "";

  return [styleAnchor, characterAnchor, characterSheetReference, scenePrompt].filter(Boolean).join(" ");
}

async function persistPageComposition(pageId: string, composition: PageCompositionSpec): Promise<void> {
  await execute(`UPDATE pages SET composition_json = CAST(:composition AS jsonb) WHERE id = CAST(:pageId AS uuid)`, [
    { name: "composition", value: { stringValue: JSON.stringify(composition) } },
    { name: "pageId", value: { stringValue: pageId } }
  ]);
}

function pictureBookFillPrompt(illustrationBrief: string): string {
  return [
    "Preserve all existing blank white paper and negative space outside the masked watercolor region.",
    "Harmonize only inside the editable watercolor region with soft edges and clean paper transitions.",
    "Do not introduce new elements outside the editable region.",
    illustrationBrief
  ].join(" ");
}

function pictureBookQaPayload(input: {
  generated: GeneratedImage;
  pageQaIssues: string[];
  promptSafetyTerms: string[];
  textFit: PageQaResult["textFit"];
  metrics: PageQaResult["metrics"];
}): PictureBookQaPayload {
  const issues = [
    ...input.generated.qa.issues,
    ...input.promptSafetyTerms.map((term) => `safety_flagged_prompt:${term}`),
    ...input.pageQaIssues
  ];
  return {
    ...input.generated.qa,
    passed: input.generated.qa.passed && input.pageQaIssues.length === 0 && input.promptSafetyTerms.length === 0,
    issues,
    metrics: input.metrics,
    textFit: input.textFit
  };
}

function qaPayloadFromError(error: unknown): PictureBookQaPayload {
  if (error instanceof FalRequestError && error.code === "provider_timeout") {
    return {
      passed: false,
      issues: ["provider_timeout"],
      metrics: null,
      textFit: null,
      retryable: error.retryable,
      requestId: error.requestId,
      endpoint: error.endpoint,
      pollCount: error.pollCount,
      elapsedMs: error.elapsedMs
    };
  }

  return {
    passed: false,
    issues: [error instanceof Error ? error.message : String(error)],
    metrics: null,
    textFit: null
  };
}

function qaCategoryFromError(error: unknown): PictureBookQaCategory {
  if (error instanceof FalRequestError && error.code === "provider_timeout") {
    return "provider_timeout";
  }
  return "other";
}

async function generateLegacyPageImage(job: LegacyJobPayload): Promise<void> {
  const provider = await resolveImageProvider({
    mockRunTag: job.mockRunTag,
    source: "image_worker"
  });
  const prompt = legacyImagePrompt(job);
  const attemptResult = await runImageGenerationAttempts(provider, {
    bookId: job.bookId,
    pageIndex: job.pageIndex,
    prompt,
    role: "page",
    referenceImageUrl: job.brief.characterSheetReferenceUrl ?? undefined
  });

  const { generated, generatedKey } = attemptResult;
  const promptSafetyTerms = blockedTermsInText(prompt);
  const qaIssues = [
    ...generated.qa.issues,
    ...promptSafetyTerms.map((term) => `safety_flagged_prompt:${term}`)
  ];
  const qaPassed = generated.qa.passed && promptSafetyTerms.length === 0;
  const qaPayload = {
    ...generated.qa,
    passed: qaPassed,
    issues: qaIssues
  };
  const extension = fileExtensionForContentType(generated.contentType);
  const keyWithExtension = `${generatedKey}.${extension}`;
  const s3Url = await putBuffer(keyWithExtension, generated.bytes, generated.contentType);

  await insertCurrentImageRecord({
    pageId: job.pageId,
    role: "page",
    bookId: job.bookId,
    endpoint: generated.endpoint,
    prompt,
    seed: generated.seed,
    requestId: generated.requestId,
    width: generated.width ?? 1536,
    height: generated.height ?? 1024,
    s3Url,
    qaJson: qaPayload,
    status: qaPassed ? "ready" : "failed"
  });

  await execute(`UPDATE pages SET status = :status WHERE id = CAST(:pageId AS uuid)`, [
    { name: "status", value: { stringValue: qaPassed ? "ready" : "failed" } },
    { name: "pageId", value: { stringValue: job.pageId } }
  ]);
}

async function persistScenePlate(
  job: PictureBookJobPayload,
  generated: GeneratedImage,
  attempt: number,
  prompt: string,
  composition: PageCompositionSpec
): Promise<{ imageId: string; s3Url: string }> {
  const extension = fileExtensionForContentType(generated.contentType);
  const key = `books/${job.bookId}/images/page-${job.pageIndex + 1}-scene-v${attempt}.${extension}`;
  const s3Url = await putBuffer(key, generated.bytes, generated.contentType);
  const imageId = await insertCurrentImageRecord({
    pageId: job.pageId,
    role: "scene_plate",
    bookId: job.bookId,
    endpoint: generated.endpoint,
    prompt,
    seed: generated.seed,
    requestId: generated.requestId,
    width: generated.width ?? 2048,
    height: generated.height ?? 2048,
    s3Url,
    qaJson: generated.qa,
    status: "ready",
    inputAssets: {
      references: [job.brief.characterSheetS3Url, job.brief.styleBoardS3Url, job.brief.paperTextureS3Url].filter(Boolean)
    }
  });

  logStructured("PictureBookScenePlateGenerated", {
    bookId: job.bookId,
    pageId: job.pageId,
    pageIndex: job.pageIndex,
    endpoint: generated.endpoint,
    templateId: composition.templateId
  });

  return { imageId, s3Url };
}

async function runPictureBookPipeline(job: PictureBookJobPayload): Promise<void> {
  const { scenePlateProvider, pageFillProvider } = await resolvePictureBookImageProviders({
    mockRunTag: job.mockRunTag,
    source: "image_worker_picture_book"
  });
  const scenePrompt = job.brief.scenePrompt;
  const promptSafetyTerms = blockedTermsInText(scenePrompt);
  const referenceImageUrls = [
    job.brief.characterSheetReferenceUrl,
    job.brief.styleBoardReferenceUrl,
    job.brief.paperTextureReferenceUrl
  ].filter((value): value is string => Boolean(value));

  let activeComposition = job.composition;
  let finalQa: PictureBookQaPayload | null = null;
  let stopAfterTextZoneFailure = false;

  await persistPageComposition(job.pageId, activeComposition);

  const runFillAttempt = async (input: {
    composition: PageCompositionSpec;
    sceneAttempt: number;
    fillAttempt: number;
    sceneRecord: { imageId: string; s3Url: string };
    scenePlate: GeneratedImage;
  }): Promise<{ passed: boolean; category: PictureBookQaCategory; qaPayload: PictureBookQaPayload }> => {
    const placedCanvas = await createPlacedPageCanvas(input.scenePlate.bytes, input.composition);
    const canvasKey = `books/${job.bookId}/images/page-${job.pageIndex + 1}-canvas-s${input.sceneAttempt}-f${input.fillAttempt}.png`;
    const canvasS3Url = await putBuffer(canvasKey, placedCanvas, "image/png");
    const canvasReferenceUrl = await presignGetObjectFromS3Url(canvasS3Url);
    if (!canvasReferenceUrl) {
      throw new Error("Unable to presign placed canvas image");
    }

    const mask = await createExpandedMaskPng(input.composition);
    const maskKey = `books/${job.bookId}/images/page-${job.pageIndex + 1}-mask-s${input.sceneAttempt}-f${input.fillAttempt}.png`;
    const maskS3Url = await putBuffer(maskKey, mask.bytes, "image/png");
    const maskReferenceUrl = await presignGetObjectFromS3Url(maskS3Url);
    if (!maskReferenceUrl) {
      throw new Error("Unable to presign page mask image");
    }

    const fillPrompt = pictureBookFillPrompt(job.brief.illustrationBrief);

    try {
      const filled = await pageFillProvider.harmonizePageArt(
        {
          bookId: job.bookId,
          pageIndex: job.pageIndex,
          prompt: fillPrompt,
          canvasImageUrl: canvasReferenceUrl,
          maskImageUrl: maskReferenceUrl
        },
        input.fillAttempt
      );

      const extension = fileExtensionForContentType(filled.contentType);
      const key = `books/${job.bookId}/images/page-${job.pageIndex + 1}-fill-s${input.sceneAttempt}-f${input.fillAttempt}.${extension}`;
      const filledS3Url = await putBuffer(key, filled.bytes, filled.contentType);
      const fadedBackground = await createFadedArtBackground(filled.bytes, input.composition);
      const qa = await evaluatePictureBookPage(fadedBackground, input.composition, job.text);
      const qaPayload = pictureBookQaPayload({
        generated: filled,
        pageQaIssues: qa.issues,
        promptSafetyTerms,
        metrics: qa.metrics,
        textFit: qa.textFit
      });
      const category = classifyPictureBookIssues(qaPayload.issues);

      await insertCurrentImageRecord({
        pageId: job.pageId,
        role: "page_fill",
        bookId: job.bookId,
        endpoint: filled.endpoint,
        prompt: fillPrompt,
        seed: filled.seed,
        requestId: filled.requestId,
        width: filled.width ?? input.composition.canvas.width,
        height: filled.height ?? input.composition.canvas.height,
        s3Url: filledS3Url,
        qaJson: qaPayload,
        status: qaPayload.passed ? "ready" : "failed",
        parentImageId: input.sceneRecord.imageId,
        inputAssets: {
          scenePlateS3Url: input.sceneRecord.s3Url,
          canvasS3Url,
          maskRect: mask.rect,
          protectedTextRect: mask.protectedTextRect,
          previewTemplateId: input.composition.templateId
        },
        maskS3Url
      });

      logStructured("PictureBookPageQaEvaluated", {
        bookId: job.bookId,
        pageId: job.pageId,
        pageIndex: job.pageIndex,
        passed: qaPayload.passed,
        issues: qaPayload.issues,
        templateId: input.composition.templateId
      });

      if (qaPayload.passed) {
        await persistPageComposition(job.pageId, input.composition);
        await execute(`UPDATE pages SET status = 'ready' WHERE id = CAST(:pageId AS uuid)`, [
          { name: "pageId", value: { stringValue: job.pageId } }
        ]);
        logStructured("PictureBookPageFillGenerated", {
          bookId: job.bookId,
          pageId: job.pageId,
          pageIndex: job.pageIndex,
          endpoint: filled.endpoint,
          templateId: input.composition.templateId
        });
      }

      return {
        passed: qaPayload.passed,
        category,
        qaPayload
      };
    } catch (error) {
      const qaPayload = qaPayloadFromError(error);
      const category = qaCategoryFromError(error);

      await insertCurrentImageRecord({
        pageId: job.pageId,
        role: "page_fill",
        bookId: job.bookId,
        endpoint: error instanceof FalRequestError ? error.endpoint ?? "provider-timeout" : "page-fill-error",
        prompt: fillPrompt,
        seed: 0,
        qaJson: qaPayload,
        status: "failed",
        parentImageId: input.sceneRecord.imageId
      });

      logStructured("PictureBookPageQaEvaluated", {
        bookId: job.bookId,
        pageId: job.pageId,
        pageIndex: job.pageIndex,
        passed: false,
        issues: qaPayload.issues,
        templateId: input.composition.templateId
      });

      if (category === "other") {
        throw error;
      }

      return {
        passed: false,
        category,
        qaPayload
      };
    }
  };

  for (let sceneAttempt = 1; sceneAttempt <= 2; sceneAttempt += 1) {
    let scenePlate: GeneratedImage;
    try {
      scenePlate = await scenePlateProvider.generateScenePlate(
        {
          bookId: job.bookId,
          pageIndex: job.pageIndex,
          prompt: scenePrompt,
          referenceImageUrls
        },
        sceneAttempt
      );
    } catch (error) {
      finalQa = qaPayloadFromError(error);
      if (qaCategoryFromError(error) === "provider_timeout" && sceneAttempt < 2) {
        continue;
      }
      throw error;
    }

    const sceneRecord = await persistScenePlate(job, scenePlate, sceneAttempt, scenePrompt, activeComposition);
    let compositionForScene = activeComposition;

    const firstFill = await runFillAttempt({
      composition: compositionForScene,
      sceneAttempt,
      fillAttempt: 1,
      sceneRecord,
      scenePlate
    });
    finalQa = firstFill.qaPayload;
    if (firstFill.passed) {
      return;
    }

    if (firstFill.category === "text_zone") {
      const alternateComposition = selectAlternatePictureBookComposition({
        text: job.text,
        currentTemplateId: compositionForScene.templateId,
        readingProfileId: compositionForScene.textStyle.readingProfileId
      });

      if (!alternateComposition) {
        stopAfterTextZoneFailure = true;
        break;
      }

      compositionForScene = alternateComposition;
      activeComposition = alternateComposition;
      await persistPageComposition(job.pageId, compositionForScene);

      logStructured("PictureBookTemplateSelected", {
        bookId: job.bookId,
        pageId: job.pageId,
        pageIndex: job.pageIndex,
        templateId: compositionForScene.templateId,
        reason: "qa_retry"
      });

      const secondFill = await runFillAttempt({
        composition: compositionForScene,
        sceneAttempt,
        fillAttempt: 2,
        sceneRecord,
        scenePlate
      });
      finalQa = secondFill.qaPayload;
      if (secondFill.passed) {
        return;
      }

      if (secondFill.category === "text_zone") {
        stopAfterTextZoneFailure = true;
        break;
      }

      if (secondFill.category === "art_strength" || secondFill.category === "provider_timeout") {
        continue;
      }

      break;
    }

    if (firstFill.category === "art_strength" || firstFill.category === "provider_timeout") {
      continue;
    }

    break;
  }

  await execute(`UPDATE pages SET status = 'failed' WHERE id = CAST(:pageId AS uuid)`, [
    { name: "pageId", value: { stringValue: job.pageId } }
  ]);

  if (finalQa) {
    await insertCurrentImageRecord({
      pageId: job.pageId,
      role: "page_fill",
      bookId: job.bookId,
      endpoint: stopAfterTextZoneFailure ? "qa-needs-review" : "qa-failed",
      prompt: job.brief.illustrationBrief,
      seed: 0,
      qaJson: finalQa,
      status: "failed"
    });
  }
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const payload = JSON.parse(record.body) as JobPayload;
    logStructured("ImageWorkerJobStart", {
      mode: payload.mode ?? "legacy",
      bookId: payload.bookId,
      pageId: payload.pageId,
      pageIndex: payload.pageIndex
    });

    await clearCurrentImagesForPage(payload.pageId, ["page", "scene_plate", "page_fill", "page_preview"]);

    if (payload.mode === "picture_book_fixed_layout") {
      await runPictureBookPipeline(payload);
      continue;
    }

    await generateLegacyPageImage(payload);
  }
};
