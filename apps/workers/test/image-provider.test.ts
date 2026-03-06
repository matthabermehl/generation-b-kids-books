import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({ getRuntimeConfigMock: vi.fn() }));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { FalRequestError, resolveImageProvider, resolvePictureBookImageProviders } from "../src/providers/image.js";

function runtimeConfig(overrides?: Record<string, unknown>) {
  return {
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
      openaiJson: "gpt-5-mini-2025-08-07",
      openaiVision: "gpt-5-mini-2025-08-07",
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
      general: "fal-ai/flux-general",
      scenePlate: "fal-ai/flux-pro/kontext/max/multi",
      pageFill: "fal-ai/flux-pro/v1/fill"
    },
    falStyleLoraUrl: null,
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

  it("uses fal returned status and response urls for queue subpaths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req-kontext",
            status_url: "https://queue.fal.run/fal-ai/flux-pro/requests/req-kontext/status",
            response_url: "https://queue.fal.run/fal-ai/flux-pro/requests/req-kontext"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
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
            images: [{ url: "https://cdn.example.com/kontext.png", width: 2048, height: 2048 }]
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

    const { scenePlateProvider } = await resolvePictureBookImageProviders();
    await scenePlateProvider.generateScenePlate(
      {
        bookId: "book-kontext",
        pageIndex: 0,
        prompt: "Watercolor reading scene.",
        referenceImageUrls: ["https://example.com/character.png", "https://example.com/style.png"]
      },
      1
    );

    expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toBe(
      "https://queue.fal.run/fal-ai/flux-pro/requests/req-kontext/status"
    );
    expect(String(fetchMock.mock.calls[2]?.[0] ?? "")).toBe(
      "https://queue.fal.run/fal-ai/flux-pro/requests/req-kontext"
    );
  });

  it("falls back to queue model id for status and result urls when fal omits them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "req-fill" }), {
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
            images: [{ url: "https://cdn.example.com/fill.png", width: 2048, height: 2048 }]
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

    const { pageFillProvider } = await resolvePictureBookImageProviders();
    await pageFillProvider.harmonizePageArt(
      {
        bookId: "book-fill-fallback",
        pageIndex: 1,
        prompt: "Blend art into the mask.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png"
      },
      1
    );

    expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toBe(
      "https://queue.fal.run/fal-ai/flux-pro/requests/req-fill/status"
    );
    expect(String(fetchMock.mock.calls[2]?.[0] ?? "")).toBe(
      "https://queue.fal.run/fal-ai/flux-pro/requests/req-fill"
    );
  });

  it("uses mock adapter when enable_mock_image is true", async () => {
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

    expect(image.endpoint).toBe("mock-fal");
    expect(image.contentType).toBe("image/svg+xml");
  });

  it("classifies fill polling timeouts as retryable provider timeouts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "req-timeout" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockImplementation(async () =>
        new Response(JSON.stringify({ status: "IN_PROGRESS" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { pageFillProvider } = await resolvePictureBookImageProviders();
    const pending = pageFillProvider.harmonizePageArt(
      {
        bookId: "book-fill-timeout",
        pageIndex: 1,
        prompt: "Blend art into the mask.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png"
      },
      1
    );
    const assertion = expect(pending).rejects.toMatchObject({
      name: "FalRequestError",
      code: "provider_timeout",
      retryable: true,
      requestId: "req-timeout"
    } satisfies Partial<FalRequestError>);
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it("routes page renders to LoRA endpoint when style LoRA is configured", async () => {
    getRuntimeConfigMock.mockResolvedValue(
      runtimeConfig({
        falStyleLoraUrl: "https://example.com/style.safetensors"
      })
    );

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
    getRuntimeConfigMock.mockResolvedValue(
      runtimeConfig({
        falStyleLoraUrl: "https://example.com/style.safetensors"
      })
    );

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

  it("sends explicit reference urls to the scene-plate provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "req-scene" }), {
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
            images: [{ url: "https://cdn.example.com/scene.png", width: 2048, height: 2048 }]
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
    const { scenePlateProvider } = await resolvePictureBookImageProviders();
    await scenePlateProvider.generateScenePlate(
      {
        bookId: "book-scene",
        pageIndex: 0,
        prompt: "Watercolor playground scene.",
        referenceImageUrls: ["https://example.com/character.png", "https://example.com/style.png"]
      },
      1
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      image_urls?: string[];
      aspect_ratio?: string;
    };
    expect(requestBody.image_urls).toEqual([
      "https://example.com/character.png",
      "https://example.com/style.png"
    ]);
    expect(requestBody.aspect_ratio).toBe("1:1");
  });

  it("sends image and mask urls to the fill provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "req-fill" }), {
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
            images: [{ url: "https://cdn.example.com/fill.png", width: 2048, height: 2048 }]
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
    const { pageFillProvider } = await resolvePictureBookImageProviders();
    await pageFillProvider.harmonizePageArt(
      {
        bookId: "book-fill",
        pageIndex: 1,
        prompt: "Blend art into the mask.",
        canvasImageUrl: "https://example.com/canvas.png",
        maskImageUrl: "https://example.com/mask.png"
      },
      1
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      image_url?: string;
      mask_url?: string;
    };
    expect(requestBody.image_url).toBe("https://example.com/canvas.png");
    expect(requestBody.mask_url).toBe("https://example.com/mask.png");
  });
});
