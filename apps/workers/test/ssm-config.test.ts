import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-ssm", () => {
  class SSMClient {
    send = sendMock;
  }

  class GetParametersByPathCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    SSMClient,
    GetParametersByPathCommand
  };
});

import { clearRuntimeConfigCache, getRuntimeConfig } from "../src/lib/ssm-config.js";

function parameter(name: string, value: string): { Name: string; Value: string } {
  return {
    Name: `/ai-childrens-book/dev/${name}`,
    Value: value
  };
}

describe("worker runtime ssm config", () => {
  beforeEach(() => {
    clearRuntimeConfigCache();
    sendMock.mockReset();
    process.env.SSM_PREFIX = "/ai-childrens-book/dev";
    process.env.RUNTIME_CONFIG_CACHE_TTL_SECONDS = "1";
  });

  afterEach(() => {
    clearRuntimeConfigCache();
    vi.useRealTimers();
  });

  it("uses cache within TTL and reloads after expiry", async () => {
    const response = {
      Parameters: [
        parameter("sendgrid_api_key", "sg"),
        parameter("openai_api_key", "oa"),
        parameter("anthropic_api_key", "an"),
        parameter("fal_key", "fk"),
        parameter("jwt_signing_secret", "x".repeat(32)),
        parameter("stripe_secret_key", "sk_test_123"),
        parameter("stripe_webhook_secret", "whsec_123"),
        parameter("stripe_price_id", "price_123"),
        parameter("stripe_success_url", "https://example.com/success"),
        parameter("stripe_cancel_url", "https://example.com/cancel"),
        parameter("sendgrid_from_email", "hello@example.com"),
        parameter("web_base_url", "https://example.com"),
        parameter("enable_mock_llm", "false"),
        parameter("enable_mock_image", "false"),
        parameter("enable_mock_checkout", "false"),
        parameter("enable_picture_book_pipeline", "true"),
        parameter("enable_independent_8_to_10", "false"),
        parameter("fal_endpoint_scene_plate", "fal-ai/flux-pro/kontext/max/multi"),
        parameter("fal_endpoint_page_fill", "fal-ai/flux-pro/v1/fill")
      ]
    };

    sendMock.mockResolvedValue(response);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:00:00.000Z"));

    const first = await getRuntimeConfig();
    const second = await getRuntimeConfig();
    expect(first.featureFlags.enableMockLlm).toBe(false);
    expect(second.featureFlags.enableMockImage).toBe(false);
    expect(second.featureFlags.enableMockCheckout).toBe(false);
    expect(second.featureFlags.enablePictureBookPipeline).toBe(true);
    expect(second.featureFlags.enableIndependent8To10).toBe(false);
    expect(first.falEndpoints.scenePlate).toBe("fal-ai/flux-pro/kontext/max/multi");
    expect(first.falEndpoints.pageFill).toBe("fal-ai/flux-pro/v1/fill");
    expect(first.stripe.priceId).toBe("price_123");
    expect(sendMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-04T12:00:02.000Z"));
    await getRuntimeConfig();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
