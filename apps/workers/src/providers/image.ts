import { pageSeed } from "@book/domain";
import { getRuntimeConfig, type RuntimeConfig } from "../lib/ssm-config.js";
import { sleep } from "../lib/helpers.js";

export interface GenerateImageInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  role: "page" | "character_sheet";
  referenceImageUrl?: string;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  seed: number;
  endpoint: string;
  requestId?: string;
  width?: number;
  height?: number;
  latencyMs: number;
  qa: {
    passed: boolean;
    issues: string[];
    attempts: number;
  };
}

export interface ImageProvider {
  generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage>;
}

interface FalSubmitResponse {
  request_id?: string;
  requestId?: string;
}

interface FalStatusResponse {
  status?: string;
}

interface FalImageResult {
  url?: string;
  width?: number;
  height?: number;
}

interface FalResultResponse {
  images?: FalImageResult[];
  data?: {
    images?: FalImageResult[];
  };
}

class FalRequestError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "FalRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

function makeSvg(input: GenerateImageInput, attempt: number): Buffer {
  const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
  const color = `hsl(${seed % 360}, 30%, 75%)`;
  const text = `${input.role.toUpperCase()} • PAGE ${input.pageIndex + 1} • ATTEMPT ${attempt}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <rect width="1536" height="1024" fill="${color}" />
  <text x="60" y="120" font-size="56" font-family="Verdana" fill="#1f2937">${text}</text>
  <foreignObject x="60" y="180" width="1400" height="760">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Verdana;font-size:34px;color:#334155;line-height:1.3;">
      ${input.prompt.replace(/</g, "&lt;")}
    </div>
  </foreignObject>
</svg>`;

  return Buffer.from(svg, "utf8");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function responseStatus(response: Response): string {
  return String(response.status);
}

class MockImageProvider implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    return {
      bytes: makeSvg(input, attempt),
      contentType: "image/svg+xml",
      seed,
      endpoint: "mock-fal",
      requestId: `mock-${seed}`,
      width: 1536,
      height: 1024,
      latencyMs: 0,
      qa: {
        passed: true,
        issues: [],
        attempts: attempt
      }
    };
  }
}

class FalImageProvider implements ImageProvider {
  private readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    const endpoint = this.resolveEndpoint(input);
    const startedAt = Date.now();
    const loras = this.config.falStyleLoraUrl
      ? [
          {
            path: this.config.falStyleLoraUrl,
            scale: input.role === "character_sheet" ? 1 : 0.9
          }
        ]
      : undefined;

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      seed,
      num_images: 1,
      image_size: "landscape_16_9",
      loras
    };

    if (input.referenceImageUrl) {
      payload.reference_image_url = input.referenceImageUrl;
      payload.reference_strength = 0.85;
    }

    const requestId = await this.submit(endpoint, payload);

    await this.waitUntilComplete(endpoint, requestId);
    const output = await this.fetchResult(endpoint, requestId);

    const image = output.images?.[0] ?? output.data?.images?.[0];
    if (!image?.url) {
      throw new Error(`fal result missing image url for request ${requestId}`);
    }
    const imageUrl = image.url;

    const imageResponse = await this.withTransportRetries(() => fetch(imageUrl), "fal_image_download");
    if (!imageResponse.ok) {
      throw new FalRequestError(
        `fal image download failed: ${responseStatus(imageResponse)}`,
        imageResponse.status,
        isRetryableStatus(imageResponse.status)
      );
    }

    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await imageResponse.arrayBuffer());

    return {
      bytes,
      contentType,
      seed,
      endpoint,
      requestId,
      width: image.width,
      height: image.height,
      latencyMs: Date.now() - startedAt,
      qa: {
        passed: bytes.length > 0,
        issues: bytes.length > 0 ? [] : ["empty_image_payload"],
        attempts: attempt
      }
    };
  }

  private resolveEndpoint(input: GenerateImageInput): string {
    if (input.role === "character_sheet") {
      return this.config.falStyleLoraUrl ? this.config.falEndpoints.lora : this.config.falEndpoints.base;
    }

    if (input.referenceImageUrl) {
      return this.config.falEndpoints.general;
    }

    if (this.config.falStyleLoraUrl) {
      return this.config.falEndpoints.lora;
    }

    return this.config.falEndpoints.general;
  }

  private async submit(endpoint: string, payload: Record<string, unknown>): Promise<string> {
    const response = await this.withTransportRetries(
      () =>
        fetch(`https://queue.fal.run/${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${this.config.secrets.falKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }),
      "fal_submit"
    );

    if (!response.ok) {
      const text = await response.text();
      throw new FalRequestError(
        `fal submit failed (${response.status}): ${text.slice(0, 256)}`,
        response.status,
        isRetryableStatus(response.status)
      );
    }

    const data = (await response.json()) as FalSubmitResponse;
    const requestId = data.request_id ?? data.requestId;
    if (!requestId) {
      throw new Error("fal submit response missing request id");
    }

    return requestId;
  }

  private async waitUntilComplete(endpoint: string, requestId: string): Promise<void> {
    const maxPolls = 45;
    for (let poll = 1; poll <= maxPolls; poll += 1) {
      const response = await this.withTransportRetries(
        () =>
          fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, {
            headers: {
              Authorization: `Key ${this.config.secrets.falKey}`
            }
          }),
        "fal_status_poll"
      );

      if (!response.ok) {
        const text = await response.text();
        throw new FalRequestError(
          `fal status check failed (${response.status}): ${text.slice(0, 256)}`,
          response.status,
          isRetryableStatus(response.status)
        );
      }

      const payload = (await response.json()) as FalStatusResponse;
      const normalized = (payload.status ?? "").toLowerCase();

      if (normalized === "completed" || normalized === "succeeded" || normalized === "success") {
        return;
      }

      if (normalized === "failed" || normalized === "error" || normalized === "canceled") {
        throw new Error(`fal generation failed with status=${payload.status ?? "unknown"}`);
      }

      await sleep(1_500);
    }

    throw new Error(`fal poll timed out for request ${requestId}`);
  }

  private async fetchResult(endpoint: string, requestId: string): Promise<FalResultResponse> {
    const response = await this.withTransportRetries(
      () =>
        fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}`, {
          headers: {
            Authorization: `Key ${this.config.secrets.falKey}`
          }
        }),
      "fal_result_fetch"
    );

    if (!response.ok) {
      const text = await response.text();
      throw new FalRequestError(
        `fal result fetch failed (${response.status}): ${text.slice(0, 256)}`,
        response.status,
        isRetryableStatus(response.status)
      );
    }

    return (await response.json()) as FalResultResponse;
  }

  private async withTransportRetries(
    fn: () => Promise<Response>,
    stage: string,
    maxAttempts = 3
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fn();
        if (response.ok || !isRetryableStatus(response.status) || attempt === maxAttempts) {
          return response;
        }

        console.error("PROVIDER_ERROR", {
          stage,
          provider: "fal",
          status: response.status,
          retryable: true,
          attempt
        });
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          break;
        }
      }

      await sleep(400 * attempt);
    }

    throw lastError instanceof Error ? lastError : new Error(`fal transport failure at stage=${stage}`);
  }
}

export async function resolveImageProvider(): Promise<ImageProvider> {
  const config = await getRuntimeConfig();
  if (config.featureFlags.enableMockImage) {
    return new MockImageProvider();
  }

  return new FalImageProvider(config);
}
