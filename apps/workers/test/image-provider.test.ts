import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({ getRuntimeConfigMock: vi.fn() }));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { resolveImageProvider } from "../src/providers/image.js";

describe("image provider", () => {
  beforeEach(() => {
    getRuntimeConfigMock.mockReset();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("polls fal and returns downloaded image bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "req-1" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [{ url: "https://cdn.example.com/image.png", width: 1024, height: 768 }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveImageProvider();
    const image = await provider.generate(
      {
        bookId: "book-1",
        pageIndex: 0,
        prompt: "Calm scene",
        role: "page"
      },
      1
    );

    expect(image.requestId).toBe("req-1");
    expect(image.contentType).toContain("image/png");
    expect(image.bytes.length).toBeGreaterThan(0);
    expect(image.qa.passed).toBe(true);
    expect(image.endpoint).toBe("fal-ai/flux-general");
  });

  it("uses mock adapter when enable_mock_image is true", async () => {
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
        enableMockImage: true,
        enableMockCheckout: false
      },
      sendgridFromEmail: "noreply@example.com",
      webBaseUrl: "https://example.com"
    });

    await expect(resolveImageProvider()).rejects.toThrow("X-Mock-Run-Tag");

    const provider = await resolveImageProvider({ mockRunTag: "test-run", source: "unit-test" });
    const image = await provider.generate(
      {
        bookId: "book-1",
        pageIndex: 0,
        prompt: "Calm scene",
        role: "page"
      },
      1
    );

    expect(image.endpoint).toBe("mock-fal");
    expect(image.contentType).toBe("image/svg+xml");
  });

  it("routes page renders to LoRA endpoint when style LoRA is configured", async () => {
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
      falStyleLoraUrl: "https://example.com/style.safetensors",
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
        new Response(JSON.stringify({ request_id: "req-lora" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [{ url: "https://cdn.example.com/lora.png", width: 1024, height: 768 }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveImageProvider();
    const image = await provider.generate(
      {
        bookId: "book-style",
        pageIndex: 1,
        prompt: "Consistent page style",
        role: "page"
      },
      1
    );

    const firstCallUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(firstCallUrl).toContain("/fal-ai/flux-lora");
    expect(image.endpoint).toBe("fal-ai/flux-lora");
  });

  it("uses reference-image conditioning on fal payload when a reference URL is provided", async () => {
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
      falStyleLoraUrl: "https://example.com/style.safetensors",
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
        new Response(JSON.stringify({ request_id: "req-ref" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [{ url: "https://cdn.example.com/ref.png", width: 1024, height: 768 }]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolveImageProvider();
    const image = await provider.generate(
      {
        bookId: "book-style",
        pageIndex: 1,
        prompt: "Consistent page style",
        role: "page",
        referenceImageUrl: "https://example.com/character-sheet.png"
      },
      1
    );

    const firstCallUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(firstCallUrl).toContain("/fal-ai/flux-general");
    expect(image.endpoint).toBe("fal-ai/flux-general");

    const firstCallInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(firstCallInit.body ?? "{}")) as {
      reference_image_url?: string;
      reference_strength?: number;
      loras?: Array<{ path: string }>;
    };
    expect(requestBody.reference_image_url).toBe("https://example.com/character-sheet.png");
    expect(requestBody.reference_strength).toBe(0.85);
    expect(requestBody.loras?.[0]?.path).toBe("https://example.com/style.safetensors");
  });
});
