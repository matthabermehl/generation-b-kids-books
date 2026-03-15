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
  lesson: "saving_later" as const,
  interests: ["space"],
  profile: "early_decoder_5_7" as const,
  pageCount: 4
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
      bitcoinRelevanceScore: 0.1
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
      bitcoinRelevanceScore: 0.2
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
      bitcoinRelevanceScore: 0.2
    },
    {
      purpose: "Resolution",
      conflict: "Ava learns one tool for long-term saving.",
      sceneLocation: "Family room",
      sceneId: "family_room",
      sceneVisualDescription: "Family room sofa with evening light and a calm grown-up nearby.",
      emotionalTarget: "relieved",
      pageIndexEstimate: 3,
      decodabilityTags: ["controlled_vocab", "taught_words"],
      newWordsIntroduced: ["bitcoin"],
      bitcoinRelevanceScore: 0.9
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
      newWordsIntroduced: ["bitcoin"],
      bitcoinRelevanceScore: 0.9
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
    const result = await provider.generateBeatSheet(context);

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
    const result = await provider.generateBeatSheet(context);
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
    const result = await provider.generateBeatSheet(context);

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
    const result = await provider.generateBeatSheet(context);

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
    const result = await provider.generateBeatSheet(context);

    expect(result.audit.passed).toBe(true);
    expect(result.beatSheet.beats).toHaveLength(context.pageCount);
    expect(result.meta.provider).toBe("anthropic");
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
    const result = await provider.generateBeatSheet(context);

    expect(result.audit.passed).toBe(true);
    expect(result.audit.rewritesApplied).toBe(0);
    expect(result.audit.finalIssues).toEqual([]);
    expect(result.audit.softIssues.join(" ")).toContain("Optional adult aside could be shorter");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("hard-pins Anthropic Opus 4.6 for final story writing", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(false));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "StoryPackage",
              input: {
                title: "Ava Saves for Later",
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
                    sceneVisualDescription: "Family room sofa with evening light and a calm grown-up nearby.",
                    newWordsIntroduced: ["bitcoin"],
                    repetitionTargets: ["save"]
                  }
                ]
              }
            }
          ],
          usage: { input_tokens: 50, output_tokens: 120 }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.draftPages(context, compliantBeatSheet);

    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.model).toBe("claude-opus-4-6");
    expect(result.story.pages).toHaveLength(4);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model?: string };
    expect(requestBody.model).toBe("claude-opus-4-6");
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
    await provider.generateBeatSheet(context);

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

  it("injects explicit numeric bitcoin constraints into rewrite prompts", async () => {
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
    const result = await provider.generateBeatSheet(context);

    expect(result.audit.passed).toBe(true);
    expect(result.audit.rewritesApplied).toBe(1);

    const rewriteRequestBody = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const rewritePrompt =
      rewriteRequestBody.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(rewritePrompt).toContain("bitcoinRelevanceScore >= 0.65");
    expect(rewritePrompt).toContain("Only beats with index >=");
    expect(rewritePrompt).toContain("Numeric Bitcoin constraints");
    expect(rewritePrompt).toContain("3-7 profile guardrails");
    expect(rewritePrompt).toContain("digital jar");
    expect(rewritePrompt).toContain("one brief adult/caregiver aside");
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
    const result = await provider.generateBeatSheet(context);

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
    const result = await provider.generateBeatSheet(context);

    expect(result.audit.rewritesApplied).toBe(2);
    expect(result.audit.passed).toBe(true);
    expect(result.audit.finalIssues).toEqual([]);
    expect(result.audit.softIssues.join(" ")).toContain("Ending needs clearer payoff");
  });

  it("uses mock provider when enable_mock_llm is true", async () => {
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig(true));

    const provider = await resolveLlmProvider({ mockRunTag: "test-run", source: "unit-test" });
    const beatPlan = await provider.generateBeatSheet(context);

    expect(beatPlan.meta.provider).toBe("mock");
    expect(beatPlan.beatSheet.beats).toHaveLength(4);
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
