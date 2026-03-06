import { pageSeed } from "@book/domain";
import { assertMockRunAuthorized, type MockRunContext } from "../lib/mock-guard.js";
import { getRuntimeConfig, type RuntimeConfig } from "../lib/ssm-config.js";
import { sleep } from "../lib/helpers.js";

export interface GenerateImageInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  role: "page" | "character_sheet";
  referenceImageUrl?: string;
}

export interface GenerateScenePlateInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  referenceImageUrls: string[];
  seed?: number;
}

export interface GeneratePageFillInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  canvasImageUrl: string;
  maskImageUrl: string;
  seed?: number;
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

export interface ScenePlateProvider {
  generateScenePlate(input: GenerateScenePlateInput, attempt: number): Promise<GeneratedImage>;
}

export interface PageFillProvider {
  harmonizePageArt(input: GeneratePageFillInput, attempt: number): Promise<GeneratedImage>;
}

interface FalSubmitResponse {
  request_id?: string;
  requestId?: string;
  status_url?: string;
  statusUrl?: string;
  response_url?: string;
  responseUrl?: string;
}

interface FalStatusResponse {
  status?: string;
  response_url?: string;
  responseUrl?: string;
}

interface FalImageResult {
  url?: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalResultResponse {
  images?: FalImageResult[];
  data?: {
    images?: FalImageResult[];
  };
}

interface FalQueuedRequest {
  endpoint: string;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export class FalRequestError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code: "provider_timeout" | "request_error";
  readonly requestId?: string;
  readonly endpoint?: string;
  readonly pollCount?: number;
  readonly elapsedMs?: number;

  constructor(
    message: string,
    status: number | null,
    retryable: boolean,
    code: "provider_timeout" | "request_error" = "request_error",
    context: {
      requestId?: string;
      endpoint?: string;
      pollCount?: number;
      elapsedMs?: number;
    } = {}
  ) {
    super(message);
    this.name = "FalRequestError";
    this.status = status;
    this.retryable = retryable;
    this.code = code;
    this.requestId = context.requestId;
    this.endpoint = context.endpoint;
    this.pollCount = context.pollCount;
    this.elapsedMs = context.elapsedMs;
  }
}

function makeSvg(label: string, prompt: string, width: number, height: number, seed: number): Buffer {
  const color = `hsl(${seed % 360}, 30%, 75%)`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${color}" />
  <text x="60" y="120" font-size="56" font-family="Verdana" fill="#1f2937">${label}</text>
  <foreignObject x="60" y="180" width="${Math.max(width - 120, 200)}" height="${Math.max(height - 240, 200)}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Verdana;font-size:34px;color:#334155;line-height:1.3;">
      ${prompt.replace(/</g, "&lt;")}
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

abstract class FalTransport {
  protected readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  protected async run(endpoint: string, payload: Record<string, unknown>): Promise<GeneratedImage> {
    const seed = typeof payload.seed === "number" ? payload.seed : 0;
    const startedAt = Date.now();
    const queuedRequest = await this.submit(endpoint, payload);
    await this.waitUntilComplete(queuedRequest);
    const output = await this.fetchResult(queuedRequest);
    const image = output.images?.[0] ?? output.data?.images?.[0];
    if (!image?.url) {
      throw new Error(`fal result missing image url for request ${queuedRequest.requestId}`);
    }

    const imageResponse = await this.withTransportRetries(() => fetch(image.url ?? ""), "fal_image_download");
    if (!imageResponse.ok) {
      throw new FalRequestError(
        `fal image download failed: ${responseStatus(imageResponse)}`,
        imageResponse.status,
        isRetryableStatus(imageResponse.status)
      );
    }

    const contentType = imageResponse.headers.get("content-type") ?? image.content_type ?? "image/png";
    const bytes = Buffer.from(await imageResponse.arrayBuffer());

    return {
      bytes,
      contentType,
      seed,
      endpoint,
      requestId: queuedRequest.requestId,
      width: image.width,
      height: image.height,
      latencyMs: Date.now() - startedAt,
      qa: {
        passed: bytes.length > 0,
        issues: bytes.length > 0 ? [] : ["empty_image_payload"],
        attempts: 1
      }
    };
  }

  private async submit(endpoint: string, payload: Record<string, unknown>): Promise<FalQueuedRequest> {
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

    return {
      endpoint,
      requestId,
      statusUrl: data.status_url ?? data.statusUrl ?? this.defaultStatusUrl(endpoint, requestId),
      responseUrl: data.response_url ?? data.responseUrl ?? this.defaultResponseUrl(endpoint, requestId)
    };
  }

  private async waitUntilComplete(queuedRequest: FalQueuedRequest): Promise<void> {
    const startedAt = Date.now();
    const maxPolls =
      queuedRequest.endpoint === this.config.falEndpoints.scenePlate
        ? 60
        : queuedRequest.endpoint === this.config.falEndpoints.pageFill
          ? 80
          : 45;
    for (let poll = 1; poll <= maxPolls; poll += 1) {
      const response = await this.withTransportRetries(
        () =>
          fetch(queuedRequest.statusUrl, {
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
      const responseUrl = payload.response_url ?? payload.responseUrl;
      if (responseUrl) {
        queuedRequest.responseUrl = responseUrl;
      }

      if (normalized === "completed" || normalized === "succeeded" || normalized === "success") {
        return;
      }

      if (normalized === "failed" || normalized === "error" || normalized === "canceled") {
        throw new Error(`fal generation failed with status=${payload.status ?? "unknown"}`);
      }

      await sleep(1_500);
    }

    const elapsedMs = Date.now() - startedAt;
    console.error("PROVIDER_ERROR", {
      stage: "fal_status_poll_timeout",
      provider: "fal",
      retryable: true,
      endpoint: queuedRequest.endpoint,
      requestId: queuedRequest.requestId,
      pollCount: maxPolls,
      elapsedMs
    });
    throw new FalRequestError(
      `fal poll timed out for request ${queuedRequest.requestId}`,
      null,
      true,
      "provider_timeout",
      {
        requestId: queuedRequest.requestId,
        endpoint: queuedRequest.endpoint,
        pollCount: maxPolls,
        elapsedMs
      }
    );
  }

  private async fetchResult(queuedRequest: FalQueuedRequest): Promise<FalResultResponse> {
    const response = await this.withTransportRetries(
      () =>
        fetch(queuedRequest.responseUrl, {
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

  private defaultStatusUrl(endpoint: string, requestId: string): string {
    return `${this.defaultResponseUrl(endpoint, requestId)}/status`;
  }

  private defaultResponseUrl(endpoint: string, requestId: string): string {
    const modelId = this.queueModelId(endpoint);
    return `https://queue.fal.run/${modelId}/requests/${requestId}`;
  }

  private queueModelId(endpoint: string): string {
    const segments = endpoint.split("/").filter(Boolean);
    if (segments.length < 2) {
      return endpoint;
    }

    return `${segments[0]}/${segments[1]}`;
  }

  protected async withTransportRetries(
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

class MockImageProvider implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    return {
      bytes: makeSvg(`${input.role.toUpperCase()} • PAGE ${input.pageIndex + 1} • ATTEMPT ${attempt}`, input.prompt, 1536, 1024, seed),
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

class MockScenePlateProvider implements ScenePlateProvider {
  async generateScenePlate(input: GenerateScenePlateInput, attempt: number): Promise<GeneratedImage> {
    const seed = input.seed ?? pageSeed(input.bookId, input.pageIndex, `scene-${attempt}`);
    return {
      bytes: makeSvg(`SCENE • PAGE ${input.pageIndex + 1} • ATTEMPT ${attempt}`, input.prompt, 2048, 2048, seed),
      contentType: "image/svg+xml",
      seed,
      endpoint: "mock-kontext",
      requestId: `scene-${seed}`,
      width: 2048,
      height: 2048,
      latencyMs: 0,
      qa: {
        passed: true,
        issues: [],
        attempts: attempt
      }
    };
  }
}

class MockFillProvider implements PageFillProvider {
  async harmonizePageArt(input: GeneratePageFillInput, attempt: number): Promise<GeneratedImage> {
    const seed = input.seed ?? pageSeed(input.bookId, input.pageIndex, `fill-${attempt}`);
    return {
      bytes: makeSvg(`FILL • PAGE ${input.pageIndex + 1} • ATTEMPT ${attempt}`, input.prompt, 2048, 2048, seed),
      contentType: "image/svg+xml",
      seed,
      endpoint: "mock-fill",
      requestId: `fill-${seed}`,
      width: 2048,
      height: 2048,
      latencyMs: 0,
      qa: {
        passed: true,
        issues: [],
        attempts: attempt
      }
    };
  }
}

class FalImageProvider extends FalTransport implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    const endpoint = this.resolveEndpoint(input);
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
      loras,
      output_format: "png"
    };

    if (input.referenceImageUrl) {
      payload.reference_image_url = input.referenceImageUrl;
      payload.reference_strength = 0.85;
    }

    const generated = await this.run(endpoint, payload);
    return {
      ...generated,
      seed,
      qa: {
        ...generated.qa,
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
}

class KontextScenePlateProvider extends FalTransport implements ScenePlateProvider {
  async generateScenePlate(input: GenerateScenePlateInput, attempt: number): Promise<GeneratedImage> {
    const seed = input.seed ?? pageSeed(input.bookId, input.pageIndex, `scene-${attempt}`);
    const generated = await this.run(this.config.falEndpoints.scenePlate, {
      prompt: input.prompt,
      seed,
      num_images: 1,
      output_format: "png",
      safety_tolerance: "2",
      aspect_ratio: "1:1",
      image_urls: input.referenceImageUrls
    });

    return {
      ...generated,
      seed,
      qa: {
        ...generated.qa,
        attempts: attempt
      }
    };
  }
}

class FluxFillProvider extends FalTransport implements PageFillProvider {
  async harmonizePageArt(input: GeneratePageFillInput, attempt: number): Promise<GeneratedImage> {
    const seed = input.seed ?? pageSeed(input.bookId, input.pageIndex, `fill-${attempt}`);
    const generated = await this.run(this.config.falEndpoints.pageFill, {
      prompt: input.prompt,
      seed,
      num_images: 1,
      output_format: "png",
      safety_tolerance: "2",
      image_url: input.canvasImageUrl,
      mask_url: input.maskImageUrl
    });

    return {
      ...generated,
      seed,
      qa: {
        ...generated.qa,
        attempts: attempt
      }
    };
  }
}

export async function resolveImageProvider(context: MockRunContext = {}): Promise<ImageProvider> {
  const config = await getRuntimeConfig();
  assertMockRunAuthorized(config, {
    ...context,
    source: context.source ?? "resolve_image_provider"
  });
  if (config.featureFlags.enableMockImage) {
    return new MockImageProvider();
  }

  return new FalImageProvider(config);
}

export async function resolvePictureBookImageProviders(context: MockRunContext = {}): Promise<{
  scenePlateProvider: ScenePlateProvider;
  pageFillProvider: PageFillProvider;
}> {
  const config = await getRuntimeConfig();
  assertMockRunAuthorized(config, {
    ...context,
    source: context.source ?? "resolve_picture_book_image_providers"
  });
  if (config.featureFlags.enableMockImage) {
    return {
      scenePlateProvider: new MockScenePlateProvider(),
      pageFillProvider: new MockFillProvider()
    };
  }

  return {
    scenePlateProvider: new KontextScenePlateProvider(config),
    pageFillProvider: new FluxFillProvider(config)
  };
}
