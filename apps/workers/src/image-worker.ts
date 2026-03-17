import type { SQSHandler } from "aws-lambda";
import sharp from "sharp";
import {
  buildPageArtPrompt,
  type PageArtVisualGuidance,
  type PageCompositionSpec,
  type VisualPageContract,
  type VisualQaVerdict
} from "@book/domain";
import { execute } from "./lib/rds.js";
import { putBuffer, presignGetObjectFromS3Url } from "./lib/storage.js";
import { fileExtensionForContentType, logStructured } from "./lib/helpers.js";
import { blockedTermsInText } from "./lib/content-safety.js";
import { createFadedArtBackground } from "./lib/page-canvas.js";
import { createExpandedMaskPng } from "./lib/page-mask.js";
import {
  classifyPictureBookIssues,
  evaluatePictureBookPage,
  type PageQaResult,
  type PictureBookQaCategory
} from "./lib/page-qa.js";
import { selectAlternatePictureBookComposition } from "./lib/page-template-select.js";
import { evaluateVisualContinuity } from "./lib/visual-qa.js";
import {
  OpenAiImageRequestError,
  resolveImageProvider,
  resolvePictureBookImageProvider,
  type GenerateImageInput,
  type GeneratedImage,
  type ImageProvider,
  type PageArtProvider
} from "./providers/image.js";
import { runImageGenerationAttempts } from "./lib/image-attempts.js";
import { insertCurrentImageRecord } from "./lib/records.js";

const pageArtWorkingCanvasSize = 1024;

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
    characterReferenceUrl?: string | null;
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
    sceneId: string;
    sceneVisualDescription: string;
    pageArtPrompt: string;
    pageContract: VisualPageContract | null;
    visualGuidance: PageArtVisualGuidance;
    priorSameScenePageIds: string[];
    continuityReferencePageIds: string[];
    characterReferenceImageId: string;
    characterReferenceS3Url: string;
    characterReferenceUrl: string;
    supportingCharacterReferenceImageIds: string[];
    supportingCharacterReferenceS3Urls: string[];
    supportingCharacterReferenceUrls: string[];
    supportingCharacterReferences: Array<{
      imageId: string;
      entityId: string;
      label: string;
      s3Url: string;
      url: string;
    }>;
    sameSceneReferenceImageIds: string[];
    sameSceneReferenceS3Urls: string[];
    sameSceneReferenceUrls: string[];
  };
}

type JobPayload = LegacyJobPayload | PictureBookJobPayload;

interface PictureBookQaPayload extends Record<string, unknown> {
  passed: boolean;
  issues: string[];
  visualQa?: VisualQaVerdict | null;
}

function legacyImagePrompt(job: LegacyJobPayload): string {
  const scenePrompt =
    job.brief.illustrationBrief ?? `Page ${job.pageIndex + 1}: calm illustration of ${job.text.slice(0, 120)}`;
  const styleAnchor =
    job.brief.styleAnchor ??
    "Muted watercolor palette, matte texture, soft natural lighting, and child-friendly realism.";
  const characterAnchor =
    job.brief.characterAnchor ??
    "Use the approved character reference for stable clothing details, face shape, and proportions.";

  return [styleAnchor, characterAnchor, scenePrompt].filter(Boolean).join(" ");
}

async function persistPageComposition(pageId: string, composition: PageCompositionSpec): Promise<void> {
  await execute(`UPDATE pages SET composition_json = CAST(:composition AS jsonb) WHERE id = CAST(:pageId AS uuid)`, [
    { name: "composition", value: { stringValue: JSON.stringify(composition) } },
    { name: "pageId", value: { stringValue: pageId } }
  ]);
}

function pictureBookQaPayload(input: {
  generated: GeneratedImage;
  pageQaIssues: string[];
  promptSafetyTerms: string[];
  textFit: PageQaResult["textFit"];
  metrics: PageQaResult["metrics"];
  visualQa: VisualQaVerdict;
}): PictureBookQaPayload {
  const issues = [
    ...input.generated.qa.issues,
    ...input.promptSafetyTerms.map((term) => `safety_flagged_prompt:${term}`),
    ...input.pageQaIssues,
    ...(input.visualQa.passed ? [] : input.visualQa.issues.map((issue) => `visual_qa:${issue.code}`))
  ];
  return {
    ...input.generated.qa,
    passed:
      input.generated.qa.passed &&
      input.pageQaIssues.length === 0 &&
      input.promptSafetyTerms.length === 0 &&
      input.visualQa.passed,
    issues,
    metrics: input.metrics,
    textFit: input.textFit,
    visualQa: input.visualQa
  };
}

function qaPayloadFromError(error: unknown): PictureBookQaPayload {
  if (error instanceof OpenAiImageRequestError && error.code === "provider_timeout") {
    return {
      passed: false,
      issues: ["provider_timeout"],
      metrics: null,
      textFit: null,
      retryable: error.retryable,
      requestId: error.requestId,
      endpoint: error.endpoint
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
  if (error instanceof OpenAiImageRequestError && error.code === "provider_timeout") {
    return "provider_timeout";
  }
  return "other";
}

function qaHasTextOverflow(qaPayload: PictureBookQaPayload | null): boolean {
  return qaPayload?.issues.includes("text_overflow") ?? false;
}

function scaleCompositionForWorkingCanvas(composition: PageCompositionSpec): PageCompositionSpec {
  return {
    ...composition,
    canvas: {
      width: pageArtWorkingCanvasSize,
      height: pageArtWorkingCanvasSize
    },
    spreadCanvas: {
      width: pageArtWorkingCanvasSize * 2,
      height: pageArtWorkingCanvasSize
    }
  };
}

async function createBlankPageCanvas(composition: PageCompositionSpec): Promise<Buffer> {
  return sharp({
    create: {
      width: composition.canvas.width,
      height: composition.canvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .png()
    .toBuffer();
}

async function normalizePageArtToComposition(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
  return sharp(artBytes)
    .resize({
      width: composition.canvas.width,
      height: composition.canvas.height,
      fit: "fill"
    })
    .png()
    .toBuffer();
}

async function generateLegacyPageImage(job: LegacyJobPayload): Promise<void> {
  const provider = await resolveImageProvider({
    mockRunTag: job.mockRunTag,
    source: "image_worker"
  });
  const prompt = legacyImagePrompt(job);
  const input: GenerateImageInput = {
    bookId: job.bookId,
    pageIndex: job.pageIndex,
    prompt,
    role: "page"
  };
  const attemptResult = await runImageGenerationAttempts(provider, input);

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

async function runPictureBookPipeline(job: PictureBookJobPayload): Promise<void> {
  const pageArtProvider = await resolvePictureBookImageProvider({
    mockRunTag: job.mockRunTag,
    source: "image_worker_picture_book"
  });
  const promptSafetyTerms = blockedTermsInText(job.brief.pageArtPrompt);
  const referenceImageUrls = [
    job.brief.characterReferenceUrl,
    ...job.brief.supportingCharacterReferenceUrls,
    ...job.brief.sameSceneReferenceUrls
  ];

  let activeComposition = job.composition;
  let finalQa: PictureBookQaPayload | null = null;
  let stopAfterSpreadQaFailure = false;
  let hasRenderablePageArtCandidate = false;

  await persistPageComposition(job.pageId, activeComposition);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const providerComposition = scaleCompositionForWorkingCanvas(activeComposition);
    const canvasBytes = await createBlankPageCanvas(providerComposition);
    const canvasKey = `books/${job.bookId}/images/page-${job.pageIndex + 1}-canvas-v${attempt}.png`;
    const canvasS3Url = await putBuffer(canvasKey, canvasBytes, "image/png");
    const canvasReferenceUrl = await presignGetObjectFromS3Url(canvasS3Url);
    if (!canvasReferenceUrl) {
      throw new Error("Unable to presign page canvas image");
    }

    const mask = await createExpandedMaskPng(providerComposition);
    const maskKey = `books/${job.bookId}/images/page-${job.pageIndex + 1}-mask-v${attempt}.png`;
    const maskS3Url = await putBuffer(maskKey, mask.bytes, "image/png");
    const maskReferenceUrl = await presignGetObjectFromS3Url(maskS3Url);
    if (!maskReferenceUrl) {
      throw new Error("Unable to presign page mask image");
    }

    const inputAssets = {
      sceneId: job.brief.sceneId,
      sceneVisualDescription: job.brief.sceneVisualDescription,
      pageContract: job.brief.pageContract,
      visualGuidance: job.brief.visualGuidance,
      characterReferenceImageId: job.brief.characterReferenceImageId,
      characterReferenceS3Url: job.brief.characterReferenceS3Url,
      supportingCharacterReferenceImageIds: job.brief.supportingCharacterReferenceImageIds,
      supportingCharacterReferenceS3Urls: job.brief.supportingCharacterReferenceS3Urls,
      supportingCharacterReferences: job.brief.supportingCharacterReferences.map((reference) => ({
        imageId: reference.imageId,
        entityId: reference.entityId,
        label: reference.label,
        s3Url: reference.s3Url
      })),
      sameSceneReferenceImageIds: job.brief.sameSceneReferenceImageIds,
      sameSceneReferenceS3Urls: job.brief.sameSceneReferenceS3Urls,
      priorSameScenePageIds: job.brief.priorSameScenePageIds,
      continuityReferencePageIds: job.brief.continuityReferencePageIds,
      pageArtPromptInputs: {
        pageText: job.text,
        illustrationBrief: job.brief.illustrationBrief,
        sceneVisualDescription: job.brief.sceneVisualDescription,
        visualGuidance: job.brief.visualGuidance
      },
      canvasS3Url,
      maskS3Url,
      maskRect: mask.rect,
      gutterSafeRect: mask.gutterSafeRect,
      previewTemplateId: activeComposition.templateId,
      providerCanvas: providerComposition.canvas
    };

    try {
      const pageArt = await pageArtProvider.generatePageArt(
        {
          bookId: job.bookId,
          pageIndex: job.pageIndex,
          prompt: job.brief.pageArtPrompt,
          canvasImageUrl: canvasReferenceUrl,
          maskImageUrl: maskReferenceUrl,
          referenceImageUrls
        },
        attempt
      );

      const normalizedPageArt = await normalizePageArtToComposition(pageArt.bytes, activeComposition);
      const pageArtS3Url = await putBuffer(
        `books/${job.bookId}/images/page-${job.pageIndex + 1}-art-v${attempt}.png`,
        normalizedPageArt,
        "image/png"
      );
      const fadedBackground = await createFadedArtBackground(normalizedPageArt, activeComposition);
      const qa = await evaluatePictureBookPage(fadedBackground, activeComposition, job.text);
      const pageArtUrl = await presignGetObjectFromS3Url(pageArtS3Url);
      const visualQa = await evaluateVisualContinuity({
        imageUrl: pageArtUrl,
        pageText: job.text,
        illustrationBrief: job.brief.illustrationBrief,
        sceneVisualDescription: job.brief.sceneVisualDescription,
        pageContract: job.brief.pageContract,
        visualGuidance: job.brief.visualGuidance,
        mainCharacterReferenceUrl: job.brief.characterReferenceUrl,
        supportingCharacterReferences: job.brief.supportingCharacterReferences.map((reference) => ({
          label: reference.label,
          url: reference.url
        })),
        continuityReferenceImages: job.brief.sameSceneReferenceUrls.map((url, index) => ({
          label: job.brief.continuityReferencePageIds[index] ?? `page-reference-${index + 1}`,
          url
        }))
      });
      const qaPayload = pictureBookQaPayload({
        generated: pageArt,
        pageQaIssues: qa.issues,
        promptSafetyTerms,
        metrics: qa.metrics,
        textFit: qa.textFit,
        visualQa
      });
      inputAssets.visualQa = visualQa;
      const category = classifyPictureBookIssues(qaPayload.issues);
      finalQa = qaPayload;

      await insertCurrentImageRecord({
        pageId: job.pageId,
        role: "page_art",
        bookId: job.bookId,
        endpoint: pageArt.endpoint,
        prompt: job.brief.pageArtPrompt,
        seed: pageArt.seed,
        requestId: pageArt.requestId,
        width: activeComposition.canvas.width,
        height: activeComposition.canvas.height,
        s3Url: pageArtS3Url,
        qaJson: qaPayload,
        status: qaPayload.passed ? "ready" : "failed",
        inputAssets,
        maskS3Url
      });
      hasRenderablePageArtCandidate = true;

      logStructured("PictureBookPageQaEvaluated", {
        bookId: job.bookId,
        pageId: job.pageId,
        pageIndex: job.pageIndex,
        passed: qaPayload.passed,
        issues: qaPayload.issues,
        templateId: activeComposition.templateId
      });

      if (qaPayload.passed) {
        await persistPageComposition(job.pageId, activeComposition);
        await execute(`UPDATE pages SET status = 'ready' WHERE id = CAST(:pageId AS uuid)`, [
          { name: "pageId", value: { stringValue: job.pageId } }
        ]);
        logStructured("PictureBookPageArtGenerated", {
          bookId: job.bookId,
          pageId: job.pageId,
          pageIndex: job.pageIndex,
          endpoint: pageArt.endpoint,
          templateId: activeComposition.templateId,
          sceneId: job.brief.sceneId
        });
        return;
      }

      if (category === "text_layout" && qaHasTextOverflow(qaPayload)) {
        const alternateComposition = selectAlternatePictureBookComposition({
          bookId: job.bookId,
          pageIndex: job.pageIndex,
          text: job.text,
          currentTemplateId: activeComposition.templateId,
          readingProfileId: activeComposition.textStyle.readingProfileId
        });

        if (!alternateComposition) {
          stopAfterSpreadQaFailure = true;
          break;
        }

        activeComposition = alternateComposition;
        await persistPageComposition(job.pageId, activeComposition);
        logStructured("PictureBookTemplateSelected", {
          bookId: job.bookId,
          pageId: job.pageId,
          pageIndex: job.pageIndex,
          templateId: activeComposition.templateId,
          reason: "qa_retry"
        });
        continue;
      }

      if (category === "art_strength" || category === "provider_timeout") {
        continue;
      }

      if (category === "text_layout" || category === "gutter_safety") {
        stopAfterSpreadQaFailure = true;
      }
      break;
    } catch (error) {
      finalQa = qaPayloadFromError(error);
      const category = qaCategoryFromError(error);

      if (!hasRenderablePageArtCandidate) {
        await insertCurrentImageRecord({
          pageId: job.pageId,
          role: "page_art",
          bookId: job.bookId,
          endpoint: error instanceof OpenAiImageRequestError ? error.endpoint ?? "provider-timeout" : "page-art-error",
          prompt: job.brief.pageArtPrompt,
          seed: 0,
          qaJson: finalQa,
          status: "failed",
          inputAssets,
          maskS3Url
        });
      }

      logStructured("PictureBookPageQaEvaluated", {
        bookId: job.bookId,
        pageId: job.pageId,
        pageIndex: job.pageIndex,
        passed: false,
        issues: finalQa.issues,
        templateId: activeComposition.templateId
      });

      if (category === "provider_timeout") {
        continue;
      }

      if (category === "other") {
        throw error;
      }

      break;
    }
  }

  await execute(`UPDATE pages SET status = 'failed' WHERE id = CAST(:pageId AS uuid)`, [
    { name: "pageId", value: { stringValue: job.pageId } }
  ]);

  if (finalQa && !hasRenderablePageArtCandidate) {
    await insertCurrentImageRecord({
      pageId: job.pageId,
      role: "page_art",
      bookId: job.bookId,
      endpoint: stopAfterSpreadQaFailure ? "qa-needs-review" : "qa-failed",
      prompt: job.brief.pageArtPrompt,
      seed: 0,
      qaJson: finalQa,
      status: "failed",
      inputAssets: {
        sceneId: job.brief.sceneId,
        sceneVisualDescription: job.brief.sceneVisualDescription,
        pageContract: job.brief.pageContract,
        visualGuidance: job.brief.visualGuidance,
        characterReferenceImageId: job.brief.characterReferenceImageId,
        characterReferenceS3Url: job.brief.characterReferenceS3Url,
        supportingCharacterReferenceImageIds: job.brief.supportingCharacterReferenceImageIds,
        supportingCharacterReferenceS3Urls: job.brief.supportingCharacterReferenceS3Urls,
        supportingCharacterReferences: job.brief.supportingCharacterReferences.map((reference) => ({
          imageId: reference.imageId,
          entityId: reference.entityId,
          label: reference.label,
          s3Url: reference.s3Url
        })),
        sameSceneReferenceImageIds: job.brief.sameSceneReferenceImageIds,
        sameSceneReferenceS3Urls: job.brief.sameSceneReferenceS3Urls,
        priorSameScenePageIds: job.brief.priorSameScenePageIds,
        continuityReferencePageIds: job.brief.continuityReferencePageIds,
        pageArtPromptInputs: {
          pageText: job.text,
          illustrationBrief: job.brief.illustrationBrief,
          sceneVisualDescription: job.brief.sceneVisualDescription,
          visualGuidance: job.brief.visualGuidance
        }
      }
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

    if (payload.mode === "picture_book_fixed_layout") {
      await runPictureBookPipeline(payload);
      continue;
    }

    await generateLegacyPageImage(payload);
  }
};

export function pictureBookPageArtPrompt(input: {
  pageText: string;
  illustrationBrief: string;
  sceneVisualDescription: string;
  visualGuidance?: PageArtVisualGuidance;
}): string {
  return buildPageArtPrompt(input);
}
