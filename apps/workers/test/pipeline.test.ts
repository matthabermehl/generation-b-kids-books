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
      softIssues: string[];
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
      audit: {
        attempts: unknown[];
        rewritesApplied: number;
        passed: boolean;
        finalIssues: string[];
        softIssues: string[];
      },
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

  const concept = {
    premise: "Ava saves for a soccer ball.",
    caregiverLabel: "Mom" as const,
    targetItem: "soccer ball",
    targetPrice: 12,
    startingAmount: 7,
    gapAmount: 5,
    earningOptions: [
      { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
      { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
    ] as const,
    temptation: "sticker pack",
    deadlineEvent: "Saturday game",
    bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Ava's jar choice.",
    requiredSetups: ["price tag", "coin jar"],
    requiredPayoffs: ["reach 12 coins", "buy the ball"],
    forbiddenLateIntroductions: ["tournament", "sale"]
  };

  it("persists beat-plan-failed artifact and evaluation then rethrows", async () => {
    const beatFailure = new BeatPlanningError(
      "Beat planning failed validation after rewrites: Bitcoin beat ratio 0.00 must be between 0.15 and 0.30.",
      { beats: [] },
      {
        attempts: [],
        rewritesApplied: 2,
        passed: false,
        finalIssues: ["Bitcoin beat ratio 0.00 must be between 0.15 and 0.30."],
        softIssues: []
      },
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        latencyMs: 321,
        usage: null
      }
    );

    resolveLlmProviderMock.mockResolvedValue({
      generateStoryConcept: vi.fn().mockResolvedValue({
        concept,
        meta: {
          provider: "openai",
          model: "gpt-5-mini-2025-08-07",
          latencyMs: 100,
          usage: null
        }
      }),
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

    const artifactInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO book_artifacts")
    );
    expect(artifactInsert).toBeDefined();
    expect(artifactInsert?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "artifactType",
          value: { stringValue: "beat_plan_failed" }
        })
      ])
    );

    const evaluationInsert = executeMock.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO evaluations")
    );
    expect(evaluationInsert).toBeDefined();
    expect(String(evaluationInsert?.[0])).toContain("'beat_plan'");
    expect(String(evaluationInsert?.[0])).toContain("'fail'");
  });

  it("persists a beat-plan report when only soft issues remain", async () => {
    resolveLlmProviderMock.mockResolvedValue({
      generateStoryConcept: vi.fn().mockResolvedValue({
        concept,
        meta: {
          provider: "openai",
          model: "gpt-5-mini-2025-08-07",
          latencyMs: 100,
          usage: null
        }
      }),
      generateBeatSheet: vi.fn().mockResolvedValue({
        beatSheet: {
          beats: [
            {
              purpose: "Setup",
              conflict: "Ava wants to save for later.",
              sceneLocation: "Kitchen table",
              sceneId: "kitchen_table",
              sceneVisualDescription: "Sunny kitchen table with a blue coin jar and open notebook.",
              emotionalTarget: "hopeful",
              pageIndexEstimate: 0,
              decodabilityTags: ["controlled_vocab", "repetition"],
              newWordsIntroduced: ["save"],
              bitcoinRelevanceScore: 0,
              introduces: ["price tag", "coin jar"],
              paysOff: [],
              continuityFacts: [
                "caregiver_label:Mom",
                "deadline_event:Saturday game",
                "forbid_term:grown-up",
                "bitcoin_bridge_required:false"
              ]
            }
          ]
        },
        audit: {
          attempts: [],
          rewritesApplied: 1,
          passed: true,
          finalIssues: [],
          softIssues: ["[science_of_reading] beat 3: Optional adult aside could be shorter."]
        },
        meta: {
          provider: "openai",
          model: "gpt-5-mini-2025-08-07",
          latencyMs: 123,
          usage: null
        }
      }),
      draftPages: vi.fn().mockResolvedValue({
        story: {
          title: "Ava Saves",
          concept,
          beats: [],
          pages: Array.from({ length: 12 }, (_, index) => ({
            pageIndex: index,
            pageText: `Page ${index} text.`,
            illustrationBrief: `Illustration ${index}`,
            sceneId: `scene_${Math.floor(index / 2) + 1}`,
            sceneVisualDescription: `Scene ${Math.floor(index / 2) + 1} watercolor setting.`,
            newWordsIntroduced: ["save"],
            repetitionTargets: ["save"]
          })),
          readingProfileId: "early_decoder_5_7",
          moneyLessonKey: "saving_later"
        },
        meta: {
          provider: "anthropic",
          model: "claude-opus-4-6",
          latencyMs: 234,
          usage: null
        }
      }),
      critic: vi.fn().mockResolvedValue({
        verdict: {
          ok: true,
          issues: [],
          rewriteInstructions: ""
        },
        meta: {
          provider: "openai",
          model: "gpt-5-mini-2025-08-07",
          latencyMs: 99,
          usage: null
        }
      })
    });

    await expect(handler({ action: "prepare_story", bookId: "book-1" })).resolves.toEqual({
      bookId: "book-1",
      pageCount: 12
    });

    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/beat-plan-report.json",
      expect.objectContaining({
        bookId: "book-1",
        softIssues: ["[science_of_reading] beat 3: Optional adult aside could be shorter."]
      })
    );
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/scene-plan.json",
      expect.objectContaining({
        bookId: "book-1",
        scenes: expect.arrayContaining([
          expect.objectContaining({
            sceneId: "scene_1",
            pageIndices: [0, 1]
          })
        ])
      })
    );
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/image-plan.json",
      expect.objectContaining({
        bookId: "book-1",
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageIndex: 1,
            priorSameScenePageIds: ["test-id"]
          }),
          expect.objectContaining({
            pageIndex: 2,
            priorSameScenePageIds: []
          })
        ])
      })
    );

    const artifactInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO book_artifacts") &&
      Array.isArray(call[2]) &&
      call[2].some(
        (parameter) =>
          parameter &&
          typeof parameter === "object" &&
          "name" in parameter &&
          parameter.name === "artifactType" &&
          "value" in parameter &&
          parameter.value?.stringValue === "beat_plan_report"
      )
    );
    expect(artifactInsert).toBeDefined();

    const pageInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO pages")
    );
    expect(pageInsert?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "brief",
          value: {
            stringValue: JSON.stringify({
              illustrationBrief: "Illustration 0",
              sceneId: "scene_1",
              sceneVisualDescription: "Scene 1 watercolor setting."
            })
          }
        })
      ])
    );

    const evaluationInsert = executeMock.mock.calls.find(
      (call) =>
        String(call[0]).includes("INSERT INTO evaluations") &&
        String(call[0]).includes("'beat_plan'") &&
        String(call[0]).includes(":verdict")
    );
    expect(evaluationInsert?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "verdict",
          value: { stringValue: "warning" }
        })
      ])
    );
  });
});
