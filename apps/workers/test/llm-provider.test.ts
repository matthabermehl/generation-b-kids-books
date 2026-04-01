import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({ getRuntimeConfigMock: vi.fn() }));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { resolveLlmProvider } from "../src/providers/llm.js";

const context = {
  bookId: "book-1",
  childFirstName: "Ava",
  pronouns: "she/her",
  ageYears: 7,
  lesson: "jar_saving_limits" as const,
  storyMode: "bitcoin_forward" as const,
  interests: ["space"],
  profile: "early_decoder_5_7" as const,
  pageCount: 4
};

const compliantConcept = {
  premise: "Ava wants a space soccer ball and must decide how to save for it.",
  caregiverLabel: "Mom" as const,
  bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Ava's jar choice.",
  emotionalPromise: "Ava moves from wanting the ball to calm pride.",
  caregiverWarmthMoment: "Mom sits close and helps Ava feel steady before the final choice.",
  bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
  requiredSetups: ["price tag", "coin jar", "Saturday game"],
  requiredPayoffs: ["reach 12 coins", "buy the ball"],
  forbiddenLateIntroductions: ["tournament", "sale", "third chore"],
  lessonScenario: {
    moneyLessonKey: "jar_saving_limits",
    targetItem: "space soccer ball",
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

const compliantBeatSheet = {
  beats: [
    {
      purpose: "Setup",
      conflict: "Ava wants a game now but also a bigger goal later.",
      sceneLocation: "Toy aisle",
      sceneId: "toy_aisle",
      sceneVisualDescription: "Toy aisle with open shelf space and a bright yellow price tag.",
      emotionalTarget: "curious",
      pageIndexEstimate: 0,
      decodabilityTags: ["controlled_vocab", "repetition"],
      newWordsIntroduced: ["save"],
      bitcoinRelevanceScore: 0.1,
      introduces: ["price tag", "coin jar"],
      paysOff: [],
      continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
    },
    {
      purpose: "Setback",
      conflict: "Prices changed and Ava cannot buy both things.",
      sceneLocation: "Home kitchen table",
      sceneId: "kitchen_table",
      sceneVisualDescription: "Kitchen table with a blue coin jar, pencil, and price note.",
      emotionalTarget: "frustrated",
      pageIndexEstimate: 1,
      decodabilityTags: ["controlled_vocab", "repetition"],
      newWordsIntroduced: ["plan"],
      bitcoinRelevanceScore: 0.2,
      introduces: ["temptation"],
      paysOff: [],
      continuityFacts: [
        "caregiver_label:Mom",
        "deadline_event:Saturday game",
        "count_target:12"
      ]
    },
    {
      purpose: "Choice",
      conflict: "Ava decides to track spending and wait.",
      sceneLocation: "Library",
      sceneId: "library_corner",
      sceneVisualDescription: "Quiet library corner with a notebook and warm daylight.",
      emotionalTarget: "determined",
      pageIndexEstimate: 2,
      decodabilityTags: ["controlled_vocab", "repetition"],
      newWordsIntroduced: ["wait"],
      bitcoinRelevanceScore: 0.2,
      introduces: [],
      paysOff: ["price tag"],
      continuityFacts: [
        "caregiver_label:Mom",
        "deadline_event:Saturday game",
        "chosen_earning_option:rake leaves"
      ]
    },
    {
      purpose: "Resolution",
      conflict: "Ava learns one tool for long-term saving.",
      sceneLocation: "Family room",
      sceneId: "family_room",
      sceneVisualDescription: "Family room sofa with evening light and a calm Mom nearby.",
      emotionalTarget: "relieved",
      pageIndexEstimate: 3,
      decodabilityTags: ["controlled_vocab", "taught_words"],
      newWordsIntroduced: ["plan"],
      bitcoinRelevanceScore: 0.9,
      introduces: [],
      paysOff: ["reach 12 coins", "buy the ball"],
      continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
    }
  ]
};

const noBitcoinBeatSheet = {
  beats: compliantBeatSheet.beats.map((beat) => ({
    ...beat,
    bitcoinRelevanceScore: 0
  }))
};

const oversizedBeatSheet = {
  beats: [
    ...compliantBeatSheet.beats,
    {
      purpose: "Extra resolution echo",
      conflict: "Ava repeats the lesson one more time.",
      sceneLocation: "Hallway",
      sceneId: "hallway",
      sceneVisualDescription: "Hallway with a small lamp and soft evening shadows.",
      emotionalTarget: "confident",
      pageIndexEstimate: 4,
      decodabilityTags: ["controlled_vocab"],
      newWordsIntroduced: ["plan"],
      bitcoinRelevanceScore: 0.9,
      introduces: [],
      paysOff: ["reach 12 coins"],
      continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
    }
  ]
};

function runtimeConfig(enableMockLlm: boolean, enableMockImage = false) {
  return {
    secrets: {
      sendgridApiKey: "sg",
      openaiApiKey: "oa",
      anthropicApiKey: "an",
      jwtSigningSecret: "x".repeat(32),
      stripeSecretKey: "sk_test_123",
      stripeWebhookSecret: "whsec_123"
    },
    models: {
      openaiJson: "gpt-5-mini-2025-08-07",
      openaiVision: "gpt-5-mini-2025-08-07",
      openaiImage: "gpt-image-1.5",
      anthropicWriter: "claude-sonnet-4-5"
    },
    stripe: {
      priceId: "price_123",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel"
    },
    featureFlags: {
      enableMockLlm,
      enableMockImage,
      enableMockCheckout: false,
      enablePictureBookPipeline: false,
      enableIndependent8To10: false
    },
    sendgridFromEmail: "noreply@example.com",
    webBaseUrl: "https://example.com"
  };
}

function anthropicToolResponse(payload: unknown, toolName = "BeatSheet"): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "tool_use", name: toolName, input: payload }],
      usage: { input_tokens: 10, output_tokens: 5 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

function anthropicCriticResponse(payload: unknown): Response {
  return anthropicToolResponse(payload, "CriticVerdict");
}

function openAiCriticResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: true, issues: [], rewriteInstructions: "" })
          }
        }
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

function openAiNarrativeFailResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pass: false,
              issues: [
                {
                  beatIndex: 3,
                  problem: "Ending needs clearer payoff.",
                  severity: "high",
                  fix: "Show concrete payoff in final beat."
                }
              ],
              rewriteInstructions: "Strengthen concrete final payoff."
            })
          }
        }
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

function openAiEmptyContentResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: ""
          }
        }
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

function openAiStructuredResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(payload)
          }
        }
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

describe("llm provider routing", () => {
  beforeEach(() => {
    getRuntimeConfigMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses strict schema calls and falls back from OpenAI to Anthropic on retryable planner failure", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.beatSheet.beats).toHaveLength(4);
    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.fallbackFrom).toBe("openai");
    expect(result.audit.passed).toBe(true);

    const openAiRequestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens?: number;
      max_completion_tokens?: number;
      temperature?: number;
      reasoning_effort?: string;
      response_format?: { type?: string; json_schema?: { strict?: boolean } };
    };
    expect(openAiRequestBody.response_format?.type).toBe("json_schema");
    expect(openAiRequestBody.response_format?.json_schema?.strict).toBe(true);
    expect(openAiRequestBody.max_completion_tokens).toBe(2200);
    expect(openAiRequestBody.max_tokens).toBeUndefined();
    expect(openAiRequestBody.temperature).toBeUndefined();
    expect(openAiRequestBody.reasoning_effort).toBe("minimal");

    const anthropicRequestBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as {
      tools?: unknown[];
      tool_choice?: { type?: string };
    };
    expect(Array.isArray(anthropicRequestBody.tools)).toBe(true);
    expect(anthropicRequestBody.tool_choice?.type).toBe("tool");
  });

  it("falls back to Anthropic when OpenAI planner fails with non-retryable errors", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not authorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse(compliantBeatSheet))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);
    expect(result.audit.passed).toBe(true);
    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.fallbackFrom).toBe("openai");

    const plannerCallUrl = String(fetchMock.mock.calls[0]?.[0]);
    const firstCriticUrl = String(fetchMock.mock.calls[2]?.[0]);
    expect(plannerCallUrl).toContain("/v1/chat/completions");
    expect(firstCriticUrl).toContain("/v1/messages");
  });

  it("treats empty OpenAI content with length finish as retryable and falls back", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiEmptyContentResponse())
      .mockResolvedValueOnce(openAiEmptyContentResponse())
      .mockResolvedValueOnce(anthropicToolResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.fallbackFrom).toBe("openai");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("accepts anthropic critic outputs missing optional fields and avoids retry fanout", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not authorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse(compliantBeatSheet))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true }));

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("normalizes wrapped Anthropic beat-sheet tool payloads", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not authorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse({ BeatSheet: compliantBeatSheet }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.beatSheet.beats).toHaveLength(context.pageCount);
    expect(result.meta.provider).toBe("anthropic");
  });

  it("normalizes case-insensitive singleton Anthropic beat-sheet wrappers", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not authorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse({ beat_sheet: compliantBeatSheet }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(anthropicCriticResponse({ pass: true, issues: [], rewriteInstructions: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.beatSheet.beats).toHaveLength(context.pageCount);
    expect(result.meta.provider).toBe("anthropic");
  });

  it("normalizes Anthropic story concepts when lessonScenario comes back as a string key", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const storyContext = {
      ...context,
      ageYears: 4,
      lesson: "better_rules" as const,
      profile: "read_aloud_3_4" as const,
      interests: ["soccer", "yard"]
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not authorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        anthropicToolResponse({
          premise: "Ava wants a game that feels fair for everyone.",
          caregiverLabel: "Mama",
          bitcoinBridge: "Dad says Bitcoin follows shared rules people can trust.",
          emotionalPromise: "Ava moves from frustration to calm relief.",
          caregiverWarmthMoment: "Dad kneels beside Ava and helps her breathe before trying again.",
          bitcoinValueThread: "fair rules and patient trust",
          requiredSetups: ["soccer game starts", "rule keeps changing"],
          requiredPayoffs: ["shared rule agreed", "game feels fair"],
          forbiddenLateIntroductions: ["new coach"],
          lessonScenario: "better_rules",
          gameName: "Backyard Soccer",
          brokenRule: "one player keeps changing when goals count",
          fairRule: "the same goal rule stays true for every turn",
          sharedGoal: "finish the game smiling together",
          deadlineEvent: "sunset"
        }, "StoryConcept")
      );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateStoryConcept(storyContext);

    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.fallbackFrom).toBe("openai");
    expect(result.concept.caregiverLabel).toBe("Mom");
    expect(result.concept.lessonScenario.moneyLessonKey).toBe("better_rules");
    if (result.concept.lessonScenario.moneyLessonKey !== "better_rules") {
      throw new Error("Expected better_rules scenario");
    }
    expect(result.concept.lessonScenario.gameName).toBe("Backyard Soccer");
    expect(result.concept.lessonScenario.fairRule).toContain("same goal rule");
  });

  it("allows soft beat-critic issues without triggering rewrites", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiStructuredResponse(compliantBeatSheet))
      .mockResolvedValueOnce(
        openAiStructuredResponse({
          pass: true,
          issues: [
            {
              beatIndex: 3,
              tier: "soft",
              problem: "Optional adult aside could be shorter.",
              severity: "med",
              fix: "Trim the adult aside."
            }
          ],
          rewriteInstructions: "Shorten the adult aside if time permits."
        })
      )
      .mockResolvedValueOnce(openAiStructuredResponse({ pass: true, issues: [], rewriteInstructions: "" }))
      .mockResolvedValueOnce(openAiStructuredResponse({ pass: true, issues: [], rewriteInstructions: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.audit.rewritesApplied).toBe(0);
    expect(result.audit.finalIssues).toEqual([]);
    expect(result.audit.softIssues.join(" ")).toContain("Optional adult aside could be shorter");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("uses story-mode-aware beat rewrite guidance for sound_money_implicit", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const implicitContext = {
      ...context,
      storyMode: "sound_money_implicit" as const
    };
    const implicitConcept = {
      ...compliantConcept,
      bitcoinBridge: "Mom names the grown-up habit of protecting patient effort over time."
    };
    const overlyExplicitBeatSheet = {
      beats: compliantBeatSheet.beats.map((beat, index) => ({
        ...beat,
        bitcoinRelevanceScore: index === 2 ? 0.8 : 0.1
      }))
    };
    const repairedImplicitBeatSheet = {
      beats: compliantBeatSheet.beats.map((beat) => ({
        ...beat,
        bitcoinRelevanceScore: 0.1
      }))
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiStructuredResponse(overlyExplicitBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiStructuredResponse(repairedImplicitBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(implicitContext, implicitConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.audit.rewritesApplied).toBe(1);

    const rewriteRequestBody = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const rewritePrompt = rewriteRequestBody.messages?.[1]?.content ?? "";

    expect(rewritePrompt).toContain("Story-mode anchor: Do not name Bitcoin anywhere.");
    expect(rewritePrompt).toContain(
      "Do not make any beat explicitly Bitcoin-forward in score or wording in this implicit mode."
    );
    expect(rewritePrompt).not.toContain("Ensure at least 1 beat");
    expect(rewritePrompt).not.toContain("Ensure at least 0 beat");
  });

  it("uses structured OpenAI page writing when the configured JSON model is available", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      openAiStructuredResponse({
        title: "Ava Saves for Later",
        concept: compliantConcept,
        beats: compliantBeatSheet.beats,
        pages: [
          {
            pageIndex: 0,
            pageText: "Ava sees something she wants.",
            illustrationBrief: "Toy aisle",
            sceneId: "toy_aisle",
            sceneVisualDescription: "Toy aisle with open shelf space and a bright yellow price tag.",
            newWordsIntroduced: ["save"],
            repetitionTargets: ["save"]
          },
          {
            pageIndex: 1,
            pageText: "Ava compares prices and feels unsure.",
            illustrationBrief: "Kitchen table",
            sceneId: "kitchen_table",
            sceneVisualDescription: "Kitchen table with a blue coin jar, pencil, and price note.",
            newWordsIntroduced: ["plan"],
            repetitionTargets: ["plan"]
          },
          {
            pageIndex: 2,
            pageText: "Ava decides to wait and plan ahead.",
            illustrationBrief: "Library desk",
            sceneId: "library_corner",
            sceneVisualDescription: "Quiet library corner with a notebook and warm daylight.",
            newWordsIntroduced: ["wait"],
            repetitionTargets: ["wait"]
          },
          {
            pageIndex: 3,
            pageText: "Ava learns how Bitcoin can support long-term saving.",
            illustrationBrief: "Family room",
            sceneId: "family_room",
            sceneVisualDescription: "Family room sofa with evening light and a calm Mom nearby.",
            newWordsIntroduced: ["bitcoin"],
            repetitionTargets: ["save"]
          }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.draftPages(context, compliantConcept, compliantBeatSheet);

    expect(result.meta.provider).toBe("openai");
    expect(result.meta.model).toBe("gpt-5-mini-2025-08-07");
    expect(result.story.pages).toHaveLength(4);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model?: string;
      response_format?: { type?: string; json_schema?: { strict?: boolean } };
    };
    expect(requestBody.model).toBe("gpt-5-mini-2025-08-07");
    expect(requestBody.response_format?.type).toBe("json_schema");
    expect(requestBody.response_format?.json_schema?.strict).toBe(true);
  });

  it("passes prior story drafts and critic feedback back as structured rewrite history", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      openAiStructuredResponse({
        title: "Ava Saves for Later",
        concept: compliantConcept,
        beats: compliantBeatSheet.beats,
        pages: compliantBeatSheet.beats.map((beat, index) => ({
          pageIndex: index,
          pageText: `Rewritten page ${index + 1}`,
          illustrationBrief: beat.sceneLocation,
          sceneId: beat.sceneId,
          sceneVisualDescription: beat.sceneVisualDescription,
          newWordsIntroduced: [],
          repetitionTargets: ["save"]
        }))
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    await provider.draftPages(context, compliantConcept, compliantBeatSheet, {
      rewriteHistory: [
        {
          story: {
            title: "Ava Saves for Later",
            concept: compliantConcept,
            beats: compliantBeatSheet.beats,
            pages: compliantBeatSheet.beats.map((beat, index) => ({
              pageIndex: index,
              pageText: `Draft page ${index + 1}`,
              illustrationBrief: beat.sceneLocation,
              sceneId: beat.sceneId,
              sceneVisualDescription: beat.sceneVisualDescription,
              newWordsIntroduced: [],
              repetitionTargets: ["save"]
            })),
            readingProfileId: context.profile,
            moneyLessonKey: context.lesson,
            storyMode: context.storyMode
          },
          criticVerdict: {
            ok: false,
            issues: [
              {
                pageStart: 3,
                pageEnd: 3,
                issueType: "theme_integration",
                severity: "hard",
                rewriteTarget: "page",
                evidence: "Bitcoin feels bolted on instead of tied to Ava's saving choice.",
                suggestedFix: "Tie Bitcoin back to Ava's patient saving theme."
              }
            ],
            rewriteInstructions:
              "Rewrite the story so Bitcoin clearly supports Ava's saving theme while preserving the valid pages."
          }
        }
      ]
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const messages = requestBody.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[2]?.content).toContain("\"title\":\"Ava Saves for Later\"");
    expect(messages[3]?.content).toContain("The critic rejected the previous draft");
    expect(messages[3]?.content).toContain("Rewrite the story so it satisfies the critic");
    expect(messages[3]?.content).toContain("\"issueType\":\"theme_integration\"");
  });

  it("adds explicit reading-budget rewrite guidance when critic instructions are blank", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const betterRulesContext = {
      ...context,
      profile: "read_aloud_3_4" as const,
      ageYears: 4,
      lesson: "better_rules" as const,
      interests: ["soccer"],
      pageCount: 12
    };
    const betterRulesConcept = {
      premise: "Ava wants fair rules for a backyard game.",
      caregiverLabel: "Mom" as const,
      bitcoinBridge: "Bitcoin can reinforce shared rules that stay fair.",
      emotionalPromise: "Ava moves from frustration to calm relief.",
      caregiverWarmthMoment: "Mom kneels beside Ava and helps her breathe.",
      bitcoinValueThread: "fair rules and shared trust",
      requiredSetups: ["ball", "friends", "rule talk"],
      requiredPayoffs: ["fair rule agreed", "game feels calm again"],
      forbiddenLateIntroductions: ["new coach"],
      lessonScenario: {
        moneyLessonKey: "better_rules" as const,
        gameName: "Backyard Ball",
        brokenRule: "one child keeps changing the score",
        fairRule: "every goal counts once for everyone",
        sharedGoal: "play together under one fair rule",
        deadlineEvent: null
      }
    };
    const betterRulesBeatSheet = {
      beats: Array.from({ length: 12 }, (_, index) => ({
        ...compliantBeatSheet.beats[Math.min(index, compliantBeatSheet.beats.length - 1)],
        pageIndexEstimate: index,
        sceneId: `fair-scene-${Math.floor(index / 2) + 1}`,
        purpose: `Fair beat ${index + 1}`,
        conflict: "Ava wants the game rules to stay fair for everyone.",
        sceneLocation: "Backyard field",
        sceneVisualDescription: "Backyard field with a ball, soft grass, and evening light.",
        emotionalTarget: index < 9 ? "frustrated" : index === 10 ? "understanding" : "relieved",
        bitcoinRelevanceScore: index === 10 ? 0.9 : index === 11 ? 0.3 : 0.1,
        introduces: index === 0 ? ["ball", "friends", "rule talk"] : [],
        paysOff: index === 11 ? ["fair rule agreed", "game feels calm again"] : [],
        continuityFacts: ["caregiver_label:Mom", "deadline_event:null"]
      }))
    };
    const rewrittenPages = betterRulesBeatSheet.beats.map((beat, index) => ({
      pageIndex: index,
      pageText: `Rewritten fair page ${index + 1}`,
      illustrationBrief: beat.sceneLocation,
      sceneId: beat.sceneId,
      sceneVisualDescription: beat.sceneVisualDescription,
      newWordsIntroduced: [],
      repetitionTargets: ["fair"]
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      openAiStructuredResponse({
        title: "Ava Plays Fair",
        concept: betterRulesConcept,
        beats: betterRulesBeatSheet.beats,
        pages: rewrittenPages
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    await provider.draftPages(
      betterRulesContext,
      betterRulesConcept,
      betterRulesBeatSheet,
      {
        rewriteHistory: [
          {
            story: {
              title: "Ava Plays Fair",
              concept: betterRulesConcept,
              beats: betterRulesBeatSheet.beats,
              pages: betterRulesBeatSheet.beats.map((beat, index) => ({
                pageIndex: index,
                pageText: `Draft fair page ${index + 1}`,
                illustrationBrief: beat.sceneLocation,
                sceneId: beat.sceneId,
                sceneVisualDescription: beat.sceneVisualDescription,
                newWordsIntroduced: [],
                repetitionTargets: ["fair"]
              })),
              readingProfileId: "read_aloud_3_4",
              moneyLessonKey: "better_rules",
              storyMode: betterRulesContext.storyMode
            },
            criticVerdict: {
              ok: false,
              issues: [
                {
                  pageStart: 11,
                  pageEnd: 11,
                  issueType: "reading_level",
                  severity: "hard",
                  rewriteTarget: "page",
                  evidence: "Page 11 exceeds read-aloud sentence budget.",
                  suggestedFix: "Page 11 exceeds read-aloud sentence budget."
                }
              ],
              rewriteInstructions: ""
            }
          }
        ]
      }
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const messages = requestBody.messages ?? [];
    expect(messages[3]?.content).toContain("4 sentences or fewer");
    expect(messages[3]?.content).toContain("page 11");
    expect(messages[3]?.content).toContain("page 10");
    expect(messages[3]?.content).toContain("Story-mode anchor:");
    expect(messages[3]?.content).toContain("add one earlier caregiver or narrator Bitcoin bridge before page 10");
    expect(messages[3]?.content).toContain("reserve page 10 for a brief caregiver or narrator Bitcoin echo");
    expect(messages[3]?.content).toContain("expect Bitcoin more than once");
    expect(messages[3]?.content).toContain("do not push every Bitcoin line earlier");
    expect(messages[3]?.content).toContain("combine clipped observations");
    expect(messages[3]?.content).toContain("one short quoted sentence plus narration");
    expect(messages[3]?.content).toContain("final page should close emotionally");
  });

  it("keeps an earlier Bitcoin bridge plus penultimate echo for new_money_unfair early decoders when critic instructions are blank", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const unfairContext = {
      ...context,
      lesson: "new_money_unfair" as const,
      pageCount: 12
    };
    const unfairConcept = {
      premise: "Ava feels upset when extra tickets appear in the game.",
      caregiverLabel: "Mom" as const,
      bitcoinBridge: "Bitcoin can reinforce steady fair rules in grown-up money.",
      emotionalPromise: "Ava moves from confusion to calm relief.",
      caregiverWarmthMoment: "Mom kneels beside Ava and helps her feel steady.",
      bitcoinValueThread: "fairness, honest rules, and trust",
      requiredSetups: ["ticket game", "same starting tickets", "bell prize"],
      requiredPayoffs: ["the unfair feeling is named", "a calmer fair rule is understood"],
      forbiddenLateIntroductions: ["surprise app"],
      lessonScenario: {
        moneyLessonKey: "new_money_unfair" as const,
        gameName: "Star Ticket Game",
        tokenName: "blue tickets",
        childGoal: "ring the bell first",
        ruleDisruption: "extra tickets appear halfway through the game",
        fairnessRepair: "Mom explains the ticket count should stay steady for everyone",
        deadlineEvent: "before cleanup time"
      }
    };
    const unfairBeatSheet = {
      beats: Array.from({ length: 12 }, (_, index) => ({
        ...compliantBeatSheet.beats[Math.min(index, compliantBeatSheet.beats.length - 1)],
        pageIndexEstimate: index,
        sceneId: `ticket-scene-${Math.floor(index / 2) + 1}`,
        purpose: `Ticket beat ${index + 1}`,
        conflict: "Ava feels upset when extra tickets suddenly appear for other players.",
        sceneLocation: "School fair",
        sceneVisualDescription: "School fair ticket game with bright paper stars and a calm evening sky.",
        emotionalTarget: index < 9 ? "upset" : index === 10 ? "understanding" : "relieved",
        bitcoinRelevanceScore: index === 9 ? 0.6 : index === 10 ? 0.9 : 0.1,
        introduces: index === 0 ? ["ticket game", "same starting tickets", "bell prize"] : [],
        paysOff: index === 11 ? ["the unfair feeling is named", "a calmer fair rule is understood"] : [],
        continuityFacts: ["caregiver_label:Mom", "deadline_event:before cleanup time"]
      }))
    };
    const rewrittenPages = unfairBeatSheet.beats.map((beat, index) => ({
      pageIndex: index,
      pageText: `Rewritten unfair page ${index + 1}`,
      illustrationBrief: beat.sceneLocation,
      sceneId: beat.sceneId,
      sceneVisualDescription: beat.sceneVisualDescription,
      newWordsIntroduced: [],
      repetitionTargets: ["fair"]
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      openAiStructuredResponse({
        title: "Ava and the Ticket Rule",
        concept: unfairConcept,
        beats: unfairBeatSheet.beats,
        pages: rewrittenPages
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    await provider.draftPages(
      unfairContext,
      unfairConcept,
      unfairBeatSheet,
      {
        rewriteHistory: [
          {
            story: {
              title: "Ava and the Ticket Rule",
              concept: unfairConcept,
              beats: unfairBeatSheet.beats,
              pages: unfairBeatSheet.beats.map((beat, index) => ({
                pageIndex: index,
                pageText: `Draft unfair page ${index + 1}`,
                illustrationBrief: beat.sceneLocation,
                sceneId: beat.sceneId,
                sceneVisualDescription: beat.sceneVisualDescription,
                newWordsIntroduced: [],
                repetitionTargets: ["fair"]
              })),
              readingProfileId: "early_decoder_5_7",
              moneyLessonKey: "new_money_unfair",
              storyMode: unfairContext.storyMode
            },
            criticVerdict: {
              ok: false,
              issues: [
                {
                  pageStart: 0,
                  pageEnd: 11,
                  issueType: "theme_integration",
                  severity: "hard",
                  rewriteTarget: "page",
                  evidence:
                    "Story must mention Bitcoin more than once so the caregiver or narrator framing feels meaningfully Bitcoin-forward.",
                  suggestedFix:
                    "Story must mention Bitcoin more than once so the caregiver or narrator framing feels meaningfully Bitcoin-forward."
                }
              ],
              rewriteInstructions: ""
            }
          }
        ]
      }
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const messages = requestBody.messages ?? [];
    expect(messages[3]?.content).toContain("45 words or fewer");
    expect(messages[3]?.content).toContain("page 10");
    expect(messages[3]?.content).toContain("Story-mode anchor:");
    expect(messages[3]?.content).toContain("add one short caregiver or narrator Bitcoin bridge before page 10");
    expect(messages[3]?.content).toContain("reserve page 10 for one brief caregiver or narrator Bitcoin echo");
    expect(messages[3]?.content).toContain("expect Bitcoin more than once");
    expect(messages[3]?.content).toContain("do not collapse the story to one late Bitcoin page");
    expect(messages[3]?.content).toContain("final page should land on calm or pride");
  });

  it("mock critic preserves deterministic page ranges for read-aloud sentence-budget issues", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(true));

    const provider = await resolveLlmProvider({ mockRunTag: "test-run", source: "unit-test" });
    const result = await provider.critic(
      {
        ...context,
        profile: "read_aloud_3_4",
        ageYears: 4,
        lesson: "better_rules",
        interests: ["soccer"],
        pageCount: 12,
        mockRunTag: "test-run"
      },
      {
        premise: "Ava wants fair rules for a backyard game.",
        caregiverLabel: "Mom",
        bitcoinBridge: "Bitcoin can reinforce shared rules that stay fair.",
        emotionalPromise: "Ava moves from frustration to calm relief.",
        caregiverWarmthMoment: "Mom kneels beside Ava and helps her breathe.",
        bitcoinValueThread: "fair rules and shared trust",
        requiredSetups: ["ball", "friends", "rule talk"],
        requiredPayoffs: ["fair rule agreed", "game feels calm again"],
        forbiddenLateIntroductions: ["new coach"],
        lessonScenario: {
          moneyLessonKey: "better_rules",
          gameName: "Backyard Ball",
          brokenRule: "one child keeps changing the score",
          fairRule: "every goal counts once for everyone",
          sharedGoal: "play together under one fair rule",
          deadlineEvent: null
        }
      },
      {
        title: "Ava Plays Fair",
        concept: {
          premise: "Ava wants fair rules for a backyard game.",
          caregiverLabel: "Mom",
          bitcoinBridge: "Bitcoin can reinforce shared rules that stay fair.",
          emotionalPromise: "Ava moves from frustration to calm relief.",
          caregiverWarmthMoment: "Mom kneels beside Ava and helps her breathe.",
          bitcoinValueThread: "fair rules and shared trust",
          requiredSetups: ["ball", "friends", "rule talk"],
          requiredPayoffs: ["fair rule agreed", "game feels calm again"],
          forbiddenLateIntroductions: ["new coach"],
          lessonScenario: {
            moneyLessonKey: "better_rules",
            gameName: "Backyard Ball",
            brokenRule: "one child keeps changing the score",
            fairRule: "every goal counts once for everyone",
            sharedGoal: "play together under one fair rule",
            deadlineEvent: null
          }
        },
        beats: Array.from({ length: 12 }, (_, index) => ({
          ...compliantBeatSheet.beats[Math.min(index, compliantBeatSheet.beats.length - 1)],
          pageIndexEstimate: index
        })),
        pages: Array.from({ length: 12 }, (_, index) => ({
          pageIndex: index,
          pageText:
            index === 11
              ? 'After the game, Ava and Mom sit in the grass. The rocket is full of stars. A soft breeze moves the grass. Mom says, "Fair rules help us trust and play together. Bitcoin is special because its rules stay the same for everyone, too." Ava feels safe and proud inside.'
              : `Fair page ${index + 1}.`,
          illustrationBrief: "Backyard field",
          sceneId: `fair-scene-${Math.floor(index / 2) + 1}`,
          sceneVisualDescription: "Backyard field with a ball, soft grass, and evening light.",
          newWordsIntroduced: [],
          repetitionTargets: []
        })),
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "better_rules",
        storyMode: "bitcoin_forward"
      }
    );

    expect(result.meta.provider).toBe("mock");
    expect(result.verdict.issues).toContainEqual(
      expect.objectContaining({
        issueType: "reading_level",
        pageStart: 11,
        pageEnd: 11,
        evidence: "Page 11 exceeds read-aloud sentence budget."
      })
    );
  });

  it("mock critic flags sound_money_implicit concept Bitcoin naming as a concept-scope issue", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(true));

    const implicitContext = {
      ...context,
      storyMode: "sound_money_implicit" as const
    };
    const result = await (
      await resolveLlmProvider({ mockRunTag: "test-run", source: "unit-test" })
    ).critic(
      implicitContext,
      compliantConcept,
      {
        title: "Ava's Saving Plan",
        concept: compliantConcept,
        beats: compliantBeatSheet.beats.map((beat) => ({
          ...beat,
          bitcoinRelevanceScore: 0.1
        })),
        pages: Array.from({ length: implicitContext.pageCount }, (_, index) => ({
          pageIndex: index,
          pageText:
            index === implicitContext.pageCount - 1
              ? "Mom held Ava close and Ava felt calm, proud, and safe."
              : `Ava saves one coin after task ${index + 1}.`,
          illustrationBrief: `Illustration ${index + 1}`,
          sceneId: `scene_${Math.floor(index / 2) + 1}`,
          sceneVisualDescription: "Quiet room with a blue coin jar and soft lamplight.",
          newWordsIntroduced: [],
          repetitionTargets: ["save"]
        })),
        readingProfileId: implicitContext.profile,
        moneyLessonKey: implicitContext.lesson,
        storyMode: implicitContext.storyMode
      }
    );

    expect(result.verdict.ok).toBe(false);
    expect(result.verdict.issues).toContainEqual(
      expect.objectContaining({
        issueType: "bitcoin_fit",
        rewriteTarget: "concept",
        evidence: expect.stringContaining("story concept")
      })
    );
    expect(result.verdict.rewriteInstructions).toContain("story concept");
  });

  it("uses legacy max_tokens for non-gpt-5 OpenAI models", async () => {
    const config = runtimeConfig(false);
    config.models.openaiJson = "gpt-4.1-mini";
    getRuntimeConfigMock.mockResolvedValue(config);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(anthropicToolResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    await provider.generateBeatSheet(context, compliantConcept);

    const openAiRequestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens?: number;
      max_completion_tokens?: number;
      temperature?: number;
      reasoning_effort?: string;
    };
    expect(openAiRequestBody.max_tokens).toBe(2200);
    expect(openAiRequestBody.max_completion_tokens).toBeUndefined();
    expect(openAiRequestBody.temperature).toBe(0.3);
    expect(openAiRequestBody.reasoning_effort).toBeUndefined();
  });

  it("injects thematic Bitcoin rewrite guidance into beat rewrite prompts", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiStructuredResponse(noBitcoinBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiStructuredResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.audit.rewritesApplied).toBe(1);

    const rewriteRequestBody = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const rewritePrompt =
      rewriteRequestBody.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(rewritePrompt).toContain("Bitcoin policy constraints");
    expect(rewritePrompt).toContain("story-forward in caregiver or narrator framing");
    expect(rewritePrompt).toContain("thematic salience");
    expect(rewritePrompt).toContain("3-7 profile guardrails");
    expect(rewritePrompt).toContain("digital jar");
    expect(rewritePrompt).toContain("caregiver or narrator language");
  });

  it("normalizes oversized beat sheets back to pageCount before deterministic checks", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiStructuredResponse(oversizedBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.passed).toBe(true);
    expect(result.beatSheet.beats).toHaveLength(context.pageCount);
    expect(result.beatSheet.beats.map((beat) => beat.pageIndexEstimate)).toEqual([0, 1, 2, 3]);
  });

  it("downgrades narrative freshness issues to warning after max rewrites", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiStructuredResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiNarrativeFailResponse())
      .mockResolvedValueOnce(openAiStructuredResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiNarrativeFailResponse())
      .mockResolvedValueOnce(openAiStructuredResponse(compliantBeatSheet))
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiCriticResponse())
      .mockResolvedValueOnce(openAiNarrativeFailResponse());

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context, compliantConcept);

    expect(result.audit.rewritesApplied).toBe(2);
    expect(result.audit.passed).toBe(true);
    expect(result.audit.finalIssues).toEqual([]);
    expect(result.audit.softIssues.join(" ")).toContain("Ending needs clearer payoff");
  });

  it("uses mock provider when enable_mock_llm is true", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(true));

    const provider = await resolveLlmProvider({ mockRunTag: "test-run", source: "unit-test" });
    const conceptResult = await provider.generateStoryConcept({ ...context, mockRunTag: "test-run" });
    const beatPlan = await provider.generateBeatSheet(context, conceptResult.concept);
    const story = await provider.draftPages(context, conceptResult.concept, beatPlan.beatSheet);

    expect(beatPlan.meta.provider).toBe("mock");
    expect(beatPlan.beatSheet.beats).toHaveLength(4);
    expect(story.story.title).toBe("Ava's Saving Plan");
    expect(story.story.title).not.toContain("Bitcoin Adventure");
  });

  it("requires mock run tag when mock providers are enabled", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(true));
    await expect(resolveLlmProvider()).rejects.toThrow("X-Mock-Run-Tag");
  });

  it("requires mock run tag when mock image is enabled even if llm mock is disabled", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false, true));
    await expect(resolveLlmProvider()).rejects.toThrow("X-Mock-Run-Tag");
  });
});
