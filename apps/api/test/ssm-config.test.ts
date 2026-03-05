import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOperationalEnvCache } from "../src/lib/env.js";

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
  return { Name: `/ai-childrens-book/dev/${name}`, Value: value };
}

describe("api runtime ssm config", () => {
  beforeEach(() => {
    clearRuntimeConfigCache();
    clearOperationalEnvCache();
    sendMock.mockReset();
    process.env.SSM_PREFIX = "/ai-childrens-book/dev";
    process.env.RUNTIME_CONFIG_CACHE_TTL_SECONDS = "300";
  });

  afterEach(() => {
    clearRuntimeConfigCache();
    clearOperationalEnvCache();
  });

  it("loads and validates runtime config from SSM", async () => {
    sendMock.mockResolvedValue({
      Parameters: [
        parameter("sendgrid_api_key", "sg"),
        parameter("openai_api_key", "oa"),
        parameter("anthropic_api_key", "an"),
        parameter("fal_key", "fk"),
        parameter("jwt_signing_secret", "x".repeat(32)),
        parameter("sendgrid_from_email", "noreply@example.com"),
        parameter("web_base_url", "https://example.com"),
        parameter("enable_mock_llm", "false"),
        parameter("enable_mock_image", "false"),
        parameter("auth_link_ttl_minutes", "30")
      ]
    });

    const config = await getRuntimeConfig();

    expect(config.authLinkTtlMinutes).toBe(30);
    expect(config.sendgridFromEmail).toBe("noreply@example.com");
    expect(config.featureFlags.enableMockLlm).toBe(false);
    expect(config.featureFlags.enableMockImage).toBe(false);

    await getRuntimeConfig();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
