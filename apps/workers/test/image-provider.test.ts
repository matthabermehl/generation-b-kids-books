import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({ getRuntimeConfigMock: vi.fn() }));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { OpenAiImageRequestError, resolveImageProvider, resolvePictureBookImageProvider } from "../src/providers/image.js";

function runtimeConfig(overrides?: Record<string, unknown>) {
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
      openaiImage: "gpt-image-1-mini",
      anthropicWriter: "claude-sonnet-4-5"
    },
    stripe: {
      priceId: "price_123",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel"
    },
    featureFlags: {
      enableMockLlm: false,
      enableMockImage: false,
      enableMockCheckout: false,
      enablePictureBookPipeline: false,
      enableIndependent8To10: false
    },
    sendgridFromEmail: "noreply@example.com",
    webBaseUrl: "https://example.com",
    ...overrides
  };
}

describe("image provider", () => {
  beforeEach(() => {
    getRuntimeConfigMock.mockReset();
    getRuntimeConfigMock.mockResolvedValue(runtimeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls OpenAI image generation for legacy page renders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString("base64") }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-generate"
          }
        }
      )
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

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      model?: string;
      size?: string;
      quality?: string;
      user?: string;
    };
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe("https://api.openai.com/v1/images/generations");
    expect(requestBody.model).toBe("gpt-image-1-mini");
    expect(requestBody.size).toBe("1536x1024");
    expect(requestBody.quality).toBe("high");
    expect(requestBody.user).toBe("book:book-1:page:0");
    expect(image.requestId).toBe("req-generate");
    expect(image.endpoint).toBe("openai:gpt-image-1-mini:generate");
    expect(image.contentType).toContain("image/png");
    expect(image.bytes.length).toBeGreaterThan(0);
  });

  it("calls OpenAI image edits for picture-book page art", async () => {
    getRuntimeConfigMock.mockResolvedValue(
      runtimeConfig({
        models: {
          openaiJson: "gpt-5-mini-2025-08-07",
          openaiVision: "gpt-5-mini-2025-08-07",
          openaiImage: "gpt-image-1.5",
          anthropicWriter: "claude-sonnet-4-5"
        }
      })
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from([5, 6, 7, 8]).toString("base64") }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-edit"
          }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolvePictureBookImageProvider();
    const image = await provider.generatePageArt(
      {
        bookId: "book-2",
        pageIndex: 1,
        prompt: "Paint the masked watercolor region.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png",
        referenceImageUrls: ["https://example.com/character.png", "https://example.com/page-1.png"]
      },
      2
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      images?: Array<{ image_url?: string }>;
      mask?: { image_url?: string };
      size?: string;
      input_fidelity?: string;
    };
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe("https://api.openai.com/v1/images/edits");
    expect(requestBody.images?.map((imageRef) => imageRef.image_url)).toEqual([
      "https://example.com/canvas.png",
      "https://example.com/character.png",
      "https://example.com/page-1.png"
    ]);
    expect(requestBody.images?.every((imageRef) => !("type" in imageRef))).toBe(true);
    expect(requestBody.mask?.image_url).toBe("https://example.com/mask.png");
    expect(requestBody.mask && !("type" in requestBody.mask)).toBe(true);
    expect(requestBody.size).toBe("1024x1024");
    expect(requestBody.input_fidelity).toBe("high");
    expect(image.requestId).toBe("req-edit");
    expect(image.endpoint).toBe("openai:gpt-image-1.5:edit");
    expect(image.width).toBe(1024);
    expect(image.height).toBe(1024);
  });

  it("omits input_fidelity for gpt-image-1-mini page edits", async () => {
    getRuntimeConfigMock.mockResolvedValue(
      runtimeConfig({
        models: {
          openaiJson: "gpt-5-mini-2025-08-07",
          openaiVision: "gpt-5-mini-2025-08-07",
          openaiImage: "gpt-image-1-mini",
          anthropicWriter: "claude-sonnet-4-5"
        }
      })
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from([9, 8, 7, 6]).toString("base64") }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-edit-mini"
          }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolvePictureBookImageProvider();
    await provider.generatePageArt(
      {
        bookId: "book-mini",
        pageIndex: 0,
        prompt: "Paint the masked watercolor region.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png",
        referenceImageUrls: []
      },
      1
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      input_fidelity?: string;
      model?: string;
    };
    expect(requestBody.model).toBe("gpt-image-1-mini");
    expect("input_fidelity" in requestBody).toBe(false);
  });

  it("uses mock adapters when enable_mock_image is true", async () => {
    getRuntimeConfigMock.mockResolvedValue(
      runtimeConfig({
        featureFlags: {
          enableMockLlm: false,
          enableMockImage: true,
          enableMockCheckout: false,
          enablePictureBookPipeline: false,
          enableIndependent8To10: false
        }
      })
    );

    await expect(resolveImageProvider()).rejects.toThrow("X-Mock-Run-Tag");
    await expect(resolvePictureBookImageProvider()).rejects.toThrow("X-Mock-Run-Tag");

    const pageProvider = await resolveImageProvider({ mockRunTag: "test-run", source: "unit-test" });
    const pageArtProvider = await resolvePictureBookImageProvider({ mockRunTag: "test-run", source: "unit-test" });

    const pageImage = await pageProvider.generate(
      {
        bookId: "book-1",
        pageIndex: 0,
        prompt: "Calm scene",
        role: "page"
      },
      1
    );
    const pageArtImage = await pageArtProvider.generatePageArt(
      {
        bookId: "book-1",
        pageIndex: 0,
        prompt: "Masked watercolor region.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png",
        referenceImageUrls: []
      },
      1
    );

    expect(pageImage.endpoint).toBe("mock:gpt-image-1.5:generate");
    expect(pageArtImage.endpoint).toBe("mock:gpt-image-1.5:edit");
    expect(pageArtImage.contentType).toBe("image/svg+xml");
  });

  it("classifies OpenAI request timeouts as retryable provider timeouts", async () => {
    vi.useFakeTimers();
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);

    vi.stubGlobal("fetch", fetchMock);

    const provider = await resolvePictureBookImageProvider();
    const pending = provider.generatePageArt(
      {
        bookId: "book-timeout",
        pageIndex: 1,
        prompt: "Masked watercolor region.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png",
        referenceImageUrls: []
      },
      1
    );

    const assertion = expect(pending).rejects.toMatchObject({
      name: "OpenAiImageRequestError",
      code: "provider_timeout",
      retryable: true,
      endpoint: "openai:gpt-image-1-mini:edit"
    } satisfies Partial<OpenAiImageRequestError>);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
