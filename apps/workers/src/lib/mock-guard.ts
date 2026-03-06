import type { RuntimeConfig } from "./ssm-config.js";

export interface MockRunContext {
  mockRunTag?: string | null;
  source?: string;
}

export function assertMockRunAuthorized(config: RuntimeConfig, context: MockRunContext = {}): void {
  const requiresMockAuthorization = config.featureFlags.enableMockLlm || config.featureFlags.enableMockImage;
  if (!requiresMockAuthorization) {
    return;
  }

  const normalizedTag = (context.mockRunTag ?? "").trim();
  if (normalizedTag.length === 0) {
    throw new Error(
      "Mock providers are enabled but this run is missing X-Mock-Run-Tag authorization."
    );
  }

  console.log(
    JSON.stringify({
      event: "MOCK_RUN_AUTHORIZED",
      source: context.source ?? "unknown",
      mockRunTagPresent: true,
      enableMockLlm: config.featureFlags.enableMockLlm,
      enableMockImage: config.featureFlags.enableMockImage
    })
  );
}
