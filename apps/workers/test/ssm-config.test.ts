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
        parameter("sendgrid_from_email", "hello@example.com"),
        parameter("web_base_url", "https://example.com"),
        parameter("enable_mock_llm", "false"),
        parameter("enable_mock_image", "false")
      ]
    };

    sendMock.mockResolvedValue(response);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:00:00.000Z"));

    const first = await getRuntimeConfig();
    const second = await getRuntimeConfig();
    expect(first.featureFlags.enableMockLlm).toBe(false);
    expect(second.featureFlags.enableMockImage).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-04T12:00:02.000Z"));
    await getRuntimeConfig();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
