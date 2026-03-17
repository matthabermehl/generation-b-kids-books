import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  blockedTermsInTextMock,
  classifyPictureBookIssuesMock,
  createExpandedMaskPngMock,
  createFadedArtBackgroundMock,
  evaluatePictureBookPageMock,
  evaluateVisualContinuityMock,
  executeMock,
  insertCurrentImageRecordMock,
  presignGetObjectFromS3UrlMock,
  putBufferMock,
  resolvePictureBookImageProviderMock
} = vi.hoisted(() => ({
  blockedTermsInTextMock: vi.fn(),
  classifyPictureBookIssuesMock: vi.fn(),
  createExpandedMaskPngMock: vi.fn(),
  createFadedArtBackgroundMock: vi.fn(),
  evaluatePictureBookPageMock: vi.fn(),
  evaluateVisualContinuityMock: vi.fn(),
  executeMock: vi.fn(),
  insertCurrentImageRecordMock: vi.fn(),
  presignGetObjectFromS3UrlMock: vi.fn(),
  putBufferMock: vi.fn(),
  resolvePictureBookImageProviderMock: vi.fn()
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => {
    const chain = {
      resize: vi.fn(() => chain),
      png: vi.fn(() => chain),
      toBuffer: vi.fn(async () => Buffer.from("png"))
    };
    return chain;
  })
}));

vi.mock("@book/domain", () => ({
  buildPageArtPrompt: vi.fn(() => "page art prompt")
}));

vi.mock("../src/lib/rds.js", () => ({
  execute: executeMock
}));

vi.mock("../src/lib/storage.js", () => ({
  putBuffer: putBufferMock,
  presignGetObjectFromS3Url: presignGetObjectFromS3UrlMock
}));

vi.mock("../src/lib/helpers.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/helpers.js")>("../src/lib/helpers.js");
  return {
    ...actual,
    fileExtensionForContentType: vi.fn(() => "png"),
    logStructured: vi.fn()
  };
});

vi.mock("../src/lib/content-safety.js", () => ({
  blockedTermsInText: blockedTermsInTextMock
}));

vi.mock("../src/lib/page-canvas.js", () => ({
  createFadedArtBackground: createFadedArtBackgroundMock
}));

vi.mock("../src/lib/page-mask.js", () => ({
  createExpandedMaskPng: createExpandedMaskPngMock
}));

vi.mock("../src/lib/page-qa.js", () => ({
  classifyPictureBookIssues: classifyPictureBookIssuesMock,
  evaluatePictureBookPage: evaluatePictureBookPageMock
}));

vi.mock("../src/lib/page-template-select.js", () => ({
  selectAlternatePictureBookComposition: vi.fn(() => null)
}));

vi.mock("../src/lib/visual-qa.js", () => ({
  evaluateVisualContinuity: evaluateVisualContinuityMock
}));

vi.mock("../src/providers/image.js", () => {
  class TestOpenAiImageRequestError extends Error {
    readonly code: string;
    readonly endpoint?: string;
    readonly retryable?: boolean;
    readonly requestId?: string;

    constructor(message: string, input: { code: string; endpoint?: string; retryable?: boolean; requestId?: string }) {
      super(message);
      this.name = "OpenAiImageRequestError";
      this.code = input.code;
      this.endpoint = input.endpoint;
      this.retryable = input.retryable;
      this.requestId = input.requestId;
    }
  }

  return {
    OpenAiImageRequestError: TestOpenAiImageRequestError,
    resolveImageProvider: vi.fn(),
    resolvePictureBookImageProvider: resolvePictureBookImageProviderMock
  };
});

vi.mock("../src/lib/image-attempts.js", () => ({
  runImageGenerationAttempts: vi.fn()
}));

vi.mock("../src/lib/records.js", () => ({
  insertCurrentImageRecord: insertCurrentImageRecordMock
}));

import { handler } from "../src/image-worker.js";
import { OpenAiImageRequestError } from "../src/providers/image.js";

describe("image worker page-art fallback handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockedTermsInTextMock.mockReturnValue([]);
    createExpandedMaskPngMock.mockResolvedValue({
      bytes: Buffer.from("mask"),
      rect: { left: 0, top: 0, width: 512, height: 1024 },
      gutterSafeRect: { left: 32, top: 0, width: 480, height: 1024 }
    });
    createFadedArtBackgroundMock.mockResolvedValue(Buffer.from("background"));
    evaluatePictureBookPageMock.mockResolvedValue({
      issues: ["art could be stronger"],
      metrics: { textCoverage: 0.4 },
      textFit: { overflow: false }
    });
    evaluateVisualContinuityMock.mockResolvedValue({
      passed: true,
      issues: [],
      confidence: 0.92,
      summary: "Visual continuity passed.",
      mode: "mock"
    });
    classifyPictureBookIssuesMock.mockReturnValue("art_strength");
    executeMock.mockResolvedValue(undefined);
    insertCurrentImageRecordMock.mockResolvedValue("img-1");
    putBufferMock.mockImplementation(async (key: string) => `s3://bucket/${key}`);
    presignGetObjectFromS3UrlMock.mockImplementation(async (url: string) => `https://example.com/${encodeURIComponent(url)}`);
  });

  it("keeps the latest renderable candidate current when later retries fail before producing art", async () => {
    const generatePageArt = vi
      .fn()
      .mockResolvedValueOnce({
        bytes: Buffer.from("art-1"),
        contentType: "image/png",
        seed: 1,
        endpoint: "openai:gpt-image-1.5",
        requestId: "req-1",
        qa: {
          passed: true,
          issues: [],
          attempts: 1
        }
      })
      .mockRejectedValueOnce(
        new OpenAiImageRequestError("timed out", {
          code: "provider_timeout",
          endpoint: "openai:gpt-image-1.5",
          retryable: true,
          requestId: "req-2"
        })
      )
      .mockRejectedValueOnce(
        new OpenAiImageRequestError("timed out again", {
          code: "provider_timeout",
          endpoint: "openai:gpt-image-1.5",
          retryable: true,
          requestId: "req-3"
        })
      );

    resolvePictureBookImageProviderMock.mockResolvedValue({
      generatePageArt
    });

    await handler({
      Records: [
        {
          body: JSON.stringify({
            mode: "picture_book_fixed_layout",
            productFamily: "picture_book_fixed_layout",
            bookId: "book-1",
            pageId: "page-1",
            pageIndex: 0,
            text: "Ava can save.",
            composition: {
              templateId: "text_left_art_right_v1",
              canvas: { width: 1024, height: 1024 },
              spreadCanvas: { width: 2048, height: 1024 },
              textStyle: { readingProfileId: "early_decoder_5_7" }
            },
            brief: {
              illustrationBrief: "Ava looks at her coin jar.",
              sceneId: "scene-1",
              sceneVisualDescription: "A bright bedroom with a coin jar on a shelf.",
              pageArtPrompt: "Watercolor scene of Ava and a coin jar.",
              pageContract: {
                pageIndex: 0,
                sceneId: "scene-1",
                settingEntityId: "setting_scene_1",
                requiredCharacterIds: ["main_character"],
                supportingCharacterIds: [],
                requiredPropIds: ["prop_coin_jar"],
                exactCountConstraints: [],
                stateConstraints: [],
                settingAnchors: ["bright bedroom", "coin jar on a shelf"],
                continuityNotes: ["Keep the coin jar on the shelf."],
                mustNotShow: []
              },
              visualGuidance: {
                mustShow: ["coin jar: Keep the coin jar visually consistent."],
                mustMatch: [],
                showExactly: [],
                mustNotShow: [],
                settingAnchors: ["bright bedroom", "coin jar on a shelf"],
                continuityNotes: ["Keep the coin jar on the shelf."]
              },
              priorSameScenePageIds: [],
              continuityReferencePageIds: [],
              characterReferenceImageId: "char-1",
              characterReferenceS3Url: "s3://bucket/character.png",
              characterReferenceUrl: "https://example.com/character.png",
              supportingCharacterReferenceImageIds: [],
              supportingCharacterReferenceS3Urls: [],
              supportingCharacterReferenceUrls: [],
              supportingCharacterReferences: [],
              sameSceneReferenceImageIds: [],
              sameSceneReferenceS3Urls: [],
              sameSceneReferenceUrls: []
            }
          })
        }
      ]
    } as never, {} as never, () => undefined);

    expect(generatePageArt).toHaveBeenCalledTimes(3);
    expect(insertCurrentImageRecordMock).toHaveBeenCalledTimes(1);
    expect(insertCurrentImageRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        role: "page_art",
        s3Url: "s3://bucket/books/book-1/images/page-1-art-v1.png",
        status: "failed"
      })
    );
    expect(
      insertCurrentImageRecordMock.mock.calls.some((call) => {
        const input = call[0] as { s3Url?: string | null };
        return !input.s3Url;
      })
    ).toBe(false);
  });
});
