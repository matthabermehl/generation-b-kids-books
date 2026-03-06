import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  executeMock,
  withTransactionMock,
  txExecuteMock,
  putJsonMock,
  putBufferMock,
  presignGetObjectMock,
  moderateTextsMock,
  resolveLlmProviderMock,
  resolveImageProviderMock,
  logStructuredMock
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn(),
  withTransactionMock: vi.fn(),
  txExecuteMock: vi.fn(),
  putJsonMock: vi.fn(),
  putBufferMock: vi.fn(),
  presignGetObjectMock: vi.fn(),
  moderateTextsMock: vi.fn(),
  resolveLlmProviderMock: vi.fn(),
  resolveImageProviderMock: vi.fn(),
  logStructuredMock: vi.fn()
}));

vi.mock("../src/lib/rds.js", () => ({
  query: queryMock,
  execute: executeMock,
  withTransaction: withTransactionMock,
  txExecute: txExecuteMock
}));

vi.mock("../src/lib/storage.js", () => ({
  putJson: putJsonMock,
  putBuffer: putBufferMock,
  presignGetObjectFromS3Url: presignGetObjectMock
}));

vi.mock("../src/lib/content-safety.js", () => ({
  moderateTexts: moderateTextsMock
}));

vi.mock("../src/providers/llm.js", () => {
  class TestBeatPlanningError extends Error {
    readonly beatSheet: { beats: unknown[] };
    readonly audit: {
      attempts: unknown[];
      rewritesApplied: number;
      passed: boolean;
      finalIssues: string[];
    };
    readonly meta: {
      provider: "mock" | "openai" | "anthropic";
      model: string;
      latencyMs: number;
      usage: null;
    };

    constructor(
      message: string,
      beatSheet: { beats: unknown[] },
      audit: { attempts: unknown[]; rewritesApplied: number; passed: boolean; finalIssues: string[] },
      meta: { provider: "mock" | "openai" | "anthropic"; model: string; latencyMs: number; usage: null }
    ) {
      super(message);
      this.name = "BeatPlanningError";
      this.beatSheet = beatSheet;
      this.audit = audit;
      this.meta = meta;
    }
  }

  return {
    resolveLlmProvider: resolveLlmProviderMock,
    BeatPlanningError: TestBeatPlanningError
  };
});

vi.mock("../src/providers/image.js", () => ({
  resolveImageProvider: resolveImageProviderMock
}));

vi.mock("../src/lib/helpers.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/helpers.js")>("../src/lib/helpers.js");
  return {
    ...actual,
    makeId: vi.fn(() => "test-id"),
    logStructured: logStructuredMock
  };
});

import { handler } from "../src/pipeline.js";
import { BeatPlanningError } from "../src/providers/llm.js";

describe("pipeline beat-planning failure persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARTIFACT_BUCKET = "artifact-bucket";
    process.env.BOOK_DEFAULT_PAGE_COUNT = "12";
    queryMock.mockResolvedValue([
      {
        book_id: "book-1",
        order_id: "order-1",
        child_first_name: "Ava",
        age_years: 6,
        pronouns: "she/her",
        reading_profile_id: "early_decoder_5_7",
        money_lesson_key: "saving_later",
        interest_tags: "space,soccer"
      }
    ]);
    executeMock.mockResolvedValue(undefined);
    putJsonMock.mockResolvedValue("s3://artifact-bucket/key.json");
    moderateTextsMock.mockResolvedValue({ ok: true, reasons: [], mode: "allow" });
    withTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<void>) =>
      callback({})
    );
    txExecuteMock.mockResolvedValue(undefined);
    putBufferMock.mockResolvedValue("s3://artifact-bucket/image.png");
    presignGetObjectMock.mockResolvedValue("https://example.com/presigned");
    resolveImageProviderMock.mockResolvedValue({
      generate: vi.fn()
    });
  });

  it("persists beat-plan-failed artifact and evaluation then rethrows", async () => {
    const beatFailure = new BeatPlanningError(
      "Beat planning failed validation after rewrites: Bitcoin beat ratio 0.00 must be between 0.15 and 0.30.",
      { beats: [] },
      {
        attempts: [],
        rewritesApplied: 2,
        passed: false,
        finalIssues: ["Bitcoin beat ratio 0.00 must be between 0.15 and 0.30."]
      },
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        latencyMs: 321,
        usage: null
      }
    );

    resolveLlmProviderMock.mockResolvedValue({
      generateBeatSheet: vi.fn().mockRejectedValue(beatFailure),
      draftPages: vi.fn(),
      critic: vi.fn()
    });

    await expect(handler({ action: "prepare_story", bookId: "book-1" })).rejects.toThrow(
      "Beat planning failed validation"
    );

    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/beat-plan-failed.json",
      expect.objectContaining({
        bookId: "book-1",
        audit: expect.objectContaining({ passed: false })
      })
    );

    const artifactInsert = executeMock.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO book_artifacts")
    );
    expect(artifactInsert).toBeDefined();
    expect(String(artifactInsert?.[0])).toContain("beat_plan_failed");

    const evaluationInsert = executeMock.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO evaluations")
    );
    expect(evaluationInsert).toBeDefined();
    expect(String(evaluationInsert?.[0])).toContain("'beat_plan'");
    expect(String(evaluationInsert?.[0])).toContain("'fail'");
  });
});
