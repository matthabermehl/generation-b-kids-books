import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({ getRuntimeConfigMock: vi.fn() }));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { resolveLlmProvider } from "../src/providers/llm.js";

const context = {
  bookId: "book-1",
  childFirstName: "Ava",
  ageYears: 7,
  lesson: "saving_later" as const,
  interests: ["space"],
  profile: "early_decoder_5_7" as const,
  pageCount: 4
};

describe("llm provider routing", () => {
  beforeEach(() => {
    getRuntimeConfigMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back from OpenAI to Anthropic on retryable OpenAI failure", async () => {
    getRuntimeConfigMock.mockResolvedValue({
      secrets: {
        sendgridApiKey: "sg",
        openaiApiKey: "oa",
        anthropicApiKey: "an",
        falKey: "fk",
        jwtSigningSecret: "x".repeat(32),
        stripeSecretKey: "sk_test_123",
        stripeWebhookSecret: "whsec_123"
      },
      models: {
        openaiJson: "gpt-4.1-mini",
        openaiVision: "gpt-4.1-mini",
        anthropicWriter: "claude-sonnet-4-5"
      },
      stripe: {
        priceId: "price_123",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel"
      },
      falEndpoints: {
        base: "fal-ai/flux-2",
        lora: "fal-ai/flux-lora",
        general: "fal-ai/flux-general"
      },
      falStyleLoraUrl: null,
      featureFlags: {
        enableMockLlm: false,
        enableMockImage: false,
        enableMockCheckout: false
      },
      sendgridFromEmail: "noreply@example.com",
      webBaseUrl: "https://example.com"
    });

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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify({ beats: ["a", "b", "c", "d"] }) }],
            usage: { input_tokens: 10, output_tokens: 5 }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveLlmProvider();
    const result = await provider.generateBeatSheet(context);

    expect(result.beats).toHaveLength(4);
    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.fallbackFrom).toBe("openai");
  });

  it("uses mock provider when enable_mock_llm is true", async () => {
    getRuntimeConfigMock.mockResolvedValue({
      secrets: {
        sendgridApiKey: "sg",
        openaiApiKey: "oa",
        anthropicApiKey: "an",
        falKey: "fk",
        jwtSigningSecret: "x".repeat(32),
        stripeSecretKey: "sk_test_123",
        stripeWebhookSecret: "whsec_123"
      },
      models: {
        openaiJson: "gpt-4.1-mini",
        openaiVision: "gpt-4.1-mini",
        anthropicWriter: "claude-sonnet-4-5"
      },
      stripe: {
        priceId: "price_123",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel"
      },
      falEndpoints: {
        base: "fal-ai/flux-2",
        lora: "fal-ai/flux-lora",
        general: "fal-ai/flux-general"
      },
      falStyleLoraUrl: null,
      featureFlags: {
        enableMockLlm: true,
        enableMockImage: false,
        enableMockCheckout: false
      },
      sendgridFromEmail: "noreply@example.com",
      webBaseUrl: "https://example.com"
    });

    const provider = await resolveLlmProvider();
    const beatSheet = await provider.generateBeatSheet(context);

    expect(beatSheet.meta.provider).toBe("mock");
  });
});
