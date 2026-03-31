import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  executeMock,
  withTransactionMock,
  txExecuteMock,
  getRuntimeConfigMock,
  putJsonMock,
  getJsonMock,
  putBufferMock,
  presignGetObjectMock,
  moderateTextsMock,
  resolveLlmProviderMock,
  resolveImageProviderMock,
  logStructuredMock,
  sqsSendMock
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn(),
  withTransactionMock: vi.fn(),
  txExecuteMock: vi.fn(),
  getRuntimeConfigMock: vi.fn(),
  putJsonMock: vi.fn(),
  getJsonMock: vi.fn(),
  putBufferMock: vi.fn(),
  presignGetObjectMock: vi.fn(),
  moderateTextsMock: vi.fn(),
  resolveLlmProviderMock: vi.fn(),
  resolveImageProviderMock: vi.fn(),
  logStructuredMock: vi.fn(),
  sqsSendMock: vi.fn()
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({
    send: sqsSendMock
  })),
  SendMessageCommand: vi.fn((input: unknown) => input)
}));

vi.mock("../src/lib/rds.js", () => ({
  query: queryMock,
  execute: executeMock,
  withTransaction: withTransactionMock,
  txExecute: txExecuteMock
}));

vi.mock("../src/lib/storage.js", () => ({
  getJson: getJsonMock,
  putJson: putJsonMock,
  putBuffer: putBufferMock,
  presignGetObjectFromS3Url: presignGetObjectMock
}));

vi.mock("../src/lib/content-safety.js", () => ({
  moderateTexts: moderateTextsMock
}));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
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

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("pipeline beat-planning failure persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARTIFACT_BUCKET = "artifact-bucket";
    process.env.BOOK_DEFAULT_SPREAD_COUNT = "12";
    process.env.BOOK_DEFAULT_PAGE_COUNT = "12";
    delete process.env.STORY_MAX_REWRITES;
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM books b")) {
        return [
          {
            book_id: "book-1",
            order_id: "order-1",
            child_first_name: "Ava",
            age_years: 6,
            pronouns: "she/her",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "jar_saving_limits",
            story_mode: "bitcoin_forward",
            interest_tags: "space,soccer"
          }
        ];
      }
      if (normalized.includes("role = 'supporting_character_reference'")) {
        return [];
      }
      return [];
    });
    executeMock.mockResolvedValue(undefined);
    putJsonMock.mockResolvedValue("s3://artifact-bucket/key.json");
    moderateTextsMock.mockResolvedValue({ ok: true, reasons: [], mode: "allow" });
    withTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<void>) =>
      callback({})
    );
    txExecuteMock.mockResolvedValue(undefined);
    putBufferMock.mockResolvedValue("s3://artifact-bucket/render/story-proof.pdf");
    presignGetObjectMock.mockResolvedValue("https://example.com/presigned");
    sqsSendMock.mockResolvedValue({ MessageId: "msg-1" });
    resolveImageProviderMock.mockResolvedValue({
      generate: vi.fn().mockResolvedValue({
        bytes: Buffer.from("supporting-reference"),
        contentType: "image/png",
        seed: 11,
        endpoint: "openai:gpt-image-1.5",
        requestId: "supporting-ref-1",
        width: 1024,
        height: 1024,
        qa: {
          passed: true,
          issues: []
        }
      })
    });
    getRuntimeConfigMock.mockResolvedValue({
      secrets: {
        openaiApiKey: "oa"
      },
      featureFlags: {
        enablePictureBookPipeline: true
      }
    });
  });

  const concept = {
    premise: "Ava saves for a soccer ball.",
    caregiverLabel: "Mom" as const,
    bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Ava's jar choice.",
    emotionalPromise: "Ava moves from wanting the ball to calm pride.",
    caregiverWarmthMoment: "Mom sits beside Ava and helps her choose the steady path.",
    bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
    requiredSetups: ["price tag", "coin jar"],
    requiredPayoffs: ["reach 12 coins", "buy the ball"],
    forbiddenLateIntroductions: ["tournament", "sale"],
    lessonScenario: {
      moneyLessonKey: "jar_saving_limits",
      targetItem: "soccer ball",
      targetPrice: 12,
      startingAmount: 7,
      gapAmount: 5,
      earningOptions: [
        { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
        { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
      ] as const,
      temptation: "sticker pack",
      deadlineEvent: "Saturday game"
    }
  };

  it("persists beat-plan-failed artifact and evaluation then rethrows", async () => {
    const beatFailure = new BeatPlanningError(
      "Beat planning failed validation after rewrites: At least one beat must use bitcoinRelevanceScore >= 0.35 so Bitcoin is explicitly story-forward in caregiver or narrator framing.",
      { beats: [] },
      {
        attempts: [],
        rewritesApplied: 2,
        passed: false,
        finalIssues: [
          "At least one beat must use bitcoinRelevanceScore >= 0.35 so Bitcoin is explicitly story-forward in caregiver or narrator framing."
        ],
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
              continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
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
          moneyLessonKey: "jar_saving_limits",
          storyMode: "bitcoin_forward"
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
    expect(moderateTextsMock).toHaveBeenCalledWith(
      "oa",
      Array.from({ length: 12 }, (_, index) => `Page ${index} text.`)
    );

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
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/story.json",
      expect.objectContaining({
        title: "Ava Saves"
      })
    );
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/visual-bible.json",
      expect.objectContaining({
        bookId: "book-1",
        childFirstName: "Ava",
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageIndex: 0
          })
        ])
      })
    );
    expect(putBufferMock).toHaveBeenCalledWith(
      "books/book-1/render/story-proof.pdf",
      expect.any(Buffer),
      "application/pdf"
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
    const storyProofInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO book_artifacts") &&
      Array.isArray(call[2]) &&
      call[2].some(
        (parameter) =>
          parameter &&
          typeof parameter === "object" &&
          "name" in parameter &&
          parameter.name === "artifactType" &&
          "value" in parameter &&
          parameter.value?.stringValue === "story_proof_pdf"
      )
    );
    expect(storyProofInsert).toBeDefined();
    const visualBibleInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO book_artifacts") &&
      Array.isArray(call[2]) &&
      call[2].some(
        (parameter) =>
          parameter &&
          typeof parameter === "object" &&
          "name" in parameter &&
          parameter.name === "artifactType" &&
          "value" in parameter &&
          parameter.value?.stringValue === "visual_bible"
      )
    );
    expect(visualBibleInsert).toBeDefined();

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

  it("persists story-proof.pdf before stopping on final story QA hard issues", async () => {
    process.env.STORY_MAX_REWRITES = "2";
    const draftPagesMock = vi.fn().mockResolvedValue({
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      meta: {
        provider: "openai",
        model: "gpt-5-mini-2025-08-07",
        latencyMs: 234,
        usage: null
      }
    });
    const criticMock = vi.fn().mockResolvedValue({
      verdict: {
        ok: false,
        issues: [
          {
            pageStart: 10,
            pageEnd: 10,
            issueType: "theme_integration",
            severity: "hard",
            rewriteTarget: "page",
            evidence: "Bitcoin feels bolted on instead of tied to Ava's saving theme.",
            suggestedFix: "Tie Bitcoin back to Ava's patient saving choice."
          }
        ],
        rewriteInstructions: "Rewrite the story so Bitcoin clearly supports Ava's saving theme."
      },
      meta: {
        provider: "openai",
        model: "gpt-5-mini-2025-08-07",
        latencyMs: 99,
        usage: null
      }
    });

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
              continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
            }
          ]
        },
        audit: {
          attempts: [],
          rewritesApplied: 0,
          passed: true,
          finalIssues: [],
          softIssues: []
        },
        meta: {
          provider: "openai",
          model: "gpt-5-mini-2025-08-07",
          latencyMs: 123,
          usage: null
        }
      }),
      draftPages: draftPagesMock,
      critic: criticMock
    });

    await expect(handler({ action: "prepare_story", bookId: "book-1" })).rejects.toThrow(
      "BOOK_NEEDS_REVIEW:finalize_gate"
    );

    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/story.json",
      expect.objectContaining({
        title: "Ava Saves"
      })
    );
    expect(putBufferMock).toHaveBeenCalledWith(
      "books/book-1/render/story-proof.pdf",
      expect.any(Buffer),
      "application/pdf"
    );

    const storyProofInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO book_artifacts") &&
      Array.isArray(call[2]) &&
      call[2].some(
        (parameter) =>
          parameter &&
          typeof parameter === "object" &&
          "name" in parameter &&
          parameter.name === "artifactType" &&
          "value" in parameter &&
          parameter.value?.stringValue === "story_proof_pdf"
      )
    );
    expect(storyProofInsert).toBeDefined();
    expect(draftPagesMock).toHaveBeenCalledTimes(3);
    expect(criticMock).toHaveBeenCalledTimes(3);
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/story-qa-report.json",
      expect.objectContaining({
        finalStatus: "needs_review",
        storyAudit: expect.objectContaining({
          maxRewrites: 2,
          finalStatus: "needs_review",
          attempts: expect.arrayContaining([
            expect.objectContaining({ attempt: 0, rewriteAction: "page", status: "rewritten" }),
            expect.objectContaining({ attempt: 1, rewriteAction: "page", status: "rewritten" }),
            expect.objectContaining({ attempt: 2, rewriteAction: "none", status: "needs_review" })
          ])
        })
      })
    );
  });

  it("rebuilds pages from stored story data when resuming after manual story review", async () => {
    const supportingReferenceGenerate = vi.fn().mockResolvedValue({
      bytes: Buffer.from("supporting-reference"),
      contentType: "image/png",
      seed: 5,
      endpoint: "openai:gpt-image-1.5",
      requestId: "supporting-ref-5",
      width: 1024,
      height: 1024,
      qa: {
        passed: true,
        issues: []
      }
    });
    resolveImageProviderMock.mockResolvedValue({
      generate: supportingReferenceGenerate
    });
    getJsonMock.mockResolvedValue({
      title: "Ava Saves",
      concept,
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
          continuityFacts: []
        }
      ],
      pages: [
        {
          pageIndex: 0,
          pageText: "Ava and Mom can save.",
          illustrationBrief: "Mom smiles at a calm kitchen table with a coin jar.",
          sceneId: "kitchen_table",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar and open notebook.",
          newWordsIntroduced: ["save"],
          repetitionTargets: ["save"]
        }
      ],
      readingProfileId: "early_decoder_5_7",
      moneyLessonKey: "jar_saving_limits",
      storyMode: "bitcoin_forward"
    });

    await expect(handler({ action: "resume_after_story_review", bookId: "book-1" })).resolves.toEqual({
      bookId: "book-1",
      pageCount: 1
    });

    expect(getJsonMock).toHaveBeenCalledWith("books/book-1/story.json");
    expect(moderateTextsMock).toHaveBeenCalledWith("oa", ["Ava and Mom can save."]);
    const pageInsert = txExecuteMock.mock.calls.find((call) =>
      String(call[1]).includes("INSERT INTO pages")
    );
    expect(pageInsert).toBeDefined();
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/image-plan.json",
      expect.objectContaining({
        bookId: "book-1"
      })
    );
    expect(putJsonMock).toHaveBeenCalledWith(
      "books/book-1/visual-bible.json",
      expect.objectContaining({
        bookId: "book-1",
        childFirstName: "Ava"
      })
    );
    expect(supportingReferenceGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-1",
        role: "supporting_character_reference",
        prompt: expect.stringContaining("Locked identity anchors:")
      }),
      1
    );
    expect(putBufferMock).toHaveBeenCalledWith(
      "books/book-1/images/supporting-character-supporting_character_mom.png",
      expect.any(Buffer),
      "image/png"
    );
  });

  it("queues picture-book page jobs with visual contracts and supporting references", async () => {
    process.env.IMAGE_QUEUE_URL = "https://sqs.example.com/image-queue";
    getJsonMock.mockImplementation(async (key: string) => {
      if (key === "books/book-1/visual-bible.json") {
        return {
          bookId: "book-1",
          title: "Ava Saves",
          childFirstName: "Ava",
          generatedAt: "2026-03-17T12:00:00.000Z",
          entities: [
            {
              entityId: "main_character",
              kind: "main_character",
              label: "Ava",
              description: "Use the approved Ava character reference.",
              anchors: ["ava"],
              pageIndices: [0],
              sceneIds: ["kitchen_table"],
              importance: "story_critical",
              recurring: true,
              referenceStrategy: "approved_character"
            },
            {
              entityId: "supporting_character_mom",
              kind: "supporting_character",
              label: "Mom",
              description: "Mom is the same caregiver on every page.",
              anchors: ["mom"],
              pageIndices: [0, 1],
              sceneIds: ["kitchen_table"],
              importance: "story_critical",
              recurring: true,
              referenceStrategy: "generated_supporting_reference"
            },
            {
              entityId: "prop_coin",
              kind: "prop",
              label: "coin",
              description: "Keep the coins consistent.",
              anchors: ["coin"],
              pageIndices: [0],
              sceneIds: ["kitchen_table"],
              importance: "story_critical",
              recurring: false,
              referenceStrategy: "prompt_only"
            }
          ],
          pages: [
            {
              pageIndex: 0,
              sceneId: "kitchen_table",
              settingEntityId: "setting_kitchen_table",
              requiredCharacterIds: ["main_character", "supporting_character_mom"],
              supportingCharacterIds: ["supporting_character_mom"],
              requiredPropIds: ["prop_coin"],
              exactCountConstraints: [
                {
                  entityId: "prop_coin",
                  label: "coin",
                  quantity: 4,
                  sourceText: "Ava and Mom count 4 coins by the jar"
                }
              ],
              stateConstraints: [],
              settingAnchors: ["sunny kitchen table", "blue coin jar"],
              continuityNotes: ["Mom points at the blue coin jar."],
              mustNotShow: ["more than 4 coins"]
            }
          ]
        };
      }
      throw new Error(`Unexpected getJson key: ${key}`);
    });
    presignGetObjectMock.mockImplementation(async (url: string) => {
      if (url === "s3://bucket/character.png") {
        return "https://example.com/character.png";
      }
      if (url === "s3://bucket/supporting-mom.png") {
        return "https://example.com/supporting-mom.png";
      }
      return "https://example.com/presigned";
    });
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM books b")) {
        return [
          {
            book_id: "book-1",
            order_id: "order-1",
            child_first_name: "Ava",
            age_years: 6,
            pronouns: "she/her",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "jar_saving_limits",
            interest_tags: "space,soccer",
            product_family: "picture_book_fixed_layout",
            layout_profile_id: "pb_square_spread_8_5_v1"
          }
        ];
      }
      if (normalized.includes("INNER JOIN images i") && normalized.includes("i.status = 'pending'")) {
        return [];
      }
      if (normalized.includes("role = 'character_reference'")) {
        return [
          {
            image_id: "char-1",
            prompt: "Use the approved Ava reference.",
            s3_url: "s3://bucket/character.png"
          }
        ];
      }
      if (normalized.includes("SELECT id, page_index, text, status, illustration_brief_json, composition_json")) {
        return [
          {
            id: "page-1",
            page_index: 0,
            text: "Ava and Mom count 4 coins by the jar.",
            status: "pending",
            illustration_brief_json: JSON.stringify({
              illustrationBrief: "Mom points at the blue coin jar.",
              sceneId: "kitchen_table",
              sceneVisualDescription: "Sunny kitchen table with a blue coin jar."
            }),
            composition_json: "{}"
          }
        ];
      }
      if (normalized.includes("role = 'supporting_character_reference'")) {
        return [
          {
            image_id: "support-1",
            s3_url: "s3://bucket/supporting-mom.png",
            input_assets_json: JSON.stringify({
              entityId: "supporting_character_mom",
              entityLabel: "Mom"
            })
          }
        ];
      }

      return [];
    });

    await expect(handler({ action: "enqueue_next_page_image", bookId: "book-1" })).resolves.toEqual({
      queued: 1,
      done: false,
      productFamily: "picture_book_fixed_layout",
      pageId: "page-1",
      pageIndex: 0
    });

    const sqsPayload = sqsSendMock.mock.calls[0]?.[0] as { MessageBody?: string };
    const message = JSON.parse(String(sqsPayload.MessageBody ?? "{}")) as {
      brief?: {
        pageContract?: { exactCountConstraints?: Array<{ quantity?: number }> };
        supportingCharacterReferenceImageIds?: string[];
        supportingCharacterReferenceUrls?: string[];
        pageArtPrompt?: string;
      };
    };
    expect(message.brief?.pageContract?.exactCountConstraints?.[0]?.quantity).toBe(4);
    expect(message.brief?.supportingCharacterReferenceImageIds).toEqual(["support-1"]);
    expect(message.brief?.supportingCharacterReferenceUrls).toEqual(["https://example.com/supporting-mom.png"]);
    expect(message.brief?.pageArtPrompt).toContain("Show exactly:");
    expect(message.brief?.pageArtPrompt).toContain("Must not show:");
    expect(message.brief?.pageArtPrompt).toContain("new prominent humans");
    expect(message.brief?.pageArtPrompt).toContain("style-outlier extras");
  });

  it("rejects render preparation when a ready page image is missing its S3 url", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM books b")) {
        return [
          {
            book_id: "book-1",
            order_id: "order-1",
            child_first_name: "Ava",
            age_years: 6,
            pronouns: "she/her",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "jar_saving_limits",
            interest_tags: "space,soccer",
            product_family: "picture_book_fixed_layout",
            layout_profile_id: "pb_square_spread_8_5_v1"
          }
        ];
      }
      if (normalized.includes("SELECT p.id, p.page_index, i.status as image_status, i.s3_url AS image_s3_url")) {
        return [
          {
            id: "page-1",
            page_index: 0,
            image_status: "ready",
            image_s3_url: null
          }
        ];
      }

      return [];
    });

    await expect(handler({ action: "prepare_render_input", bookId: "book-1" })).rejects.toThrow(
      "Cannot prepare render input while 1 page images are not renderable."
    );
  });
});
