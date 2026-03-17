import { pageSeed } from "@book/domain";
import { assertMockRunAuthorized, type MockRunContext } from "../lib/mock-guard.js";
import { getRuntimeConfig, type RuntimeConfig } from "../lib/ssm-config.js";
import { sleep } from "../lib/helpers.js";

const openAiImagesBaseUrl = "https://api.openai.com/v1/images";
const openAiRequestTimeoutMs = 120_000;
const pageArtWorkingCanvasSize = 1024;

export interface GenerateImageInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  role: "page" | "supporting_character_reference";
}

export interface GeneratePageArtInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  canvasImageUrl: string;
  maskImageUrl: string;
  referenceImageUrls: string[];
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

export interface PageArtProvider {
  generatePageArt(input: GeneratePageArtInput, attempt: number): Promise<GeneratedImage>;
}

interface OpenAiImageResult {
  b64_json?: string;
  url?: string;
}

interface OpenAiImageResponse {
  data?: OpenAiImageResult[];
}

export class OpenAiImageRequestError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code: "provider_timeout" | "request_error";
  readonly requestId?: string;
  readonly endpoint?: string;

  constructor(
    message: string,
    status: number | null,
    retryable: boolean,
    code: "provider_timeout" | "request_error" = "request_error",
    context: {
      requestId?: string;
      endpoint?: string;
    } = {}
  ) {
    super(message);
    this.name = "OpenAiImageRequestError";
    this.status = status;
    this.retryable = retryable;
    this.code = code;
    this.requestId = context.requestId;
    this.endpoint = context.endpoint;
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

function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError")
  );
}

function responseStatus(response: Response): string {
  return String(response.status);
}

async function bytesFromOpenAiResult(result: OpenAiImageResult): Promise<{ bytes: Buffer; contentType: string }> {
  if (result.b64_json) {
    return {
      bytes: Buffer.from(result.b64_json, "base64"),
      contentType: "image/png"
    };
  }

  if (!result.url) {
    throw new Error("OpenAI image response missing image data");
  }

  const response = await fetch(result.url, {
    signal: AbortSignal.timeout(openAiRequestTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`OpenAI image download failed: ${responseStatus(response)}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/png"
  };
}

abstract class OpenAiTransport {
  protected readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  protected async requestImage(
    path: "/generations" | "/edits",
    payload: Record<string, unknown>,
    seed: number,
    endpoint: string,
    width: number,
    height: number
  ): Promise<GeneratedImage> {
    const startedAt = Date.now();
    const response = await this.withTransportRetries(
      () =>
        fetch(`${openAiImagesBaseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.secrets.openaiApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(openAiRequestTimeoutMs)
        }),
      endpoint
    );

    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      const text = await response.text();
      throw new OpenAiImageRequestError(
        `OpenAI image request failed (${response.status}): ${text.slice(0, 256)}`,
        response.status,
        isRetryableStatus(response.status),
        "request_error",
        { requestId, endpoint }
      );
    }

    const parsed = (await response.json()) as OpenAiImageResponse;
    const first = parsed.data?.[0];
    if (!first) {
      throw new OpenAiImageRequestError("OpenAI image response missing output data", null, true, "request_error", {
        requestId,
        endpoint
      });
    }

    const { bytes, contentType } = await bytesFromOpenAiResult(first);
    return {
      bytes,
      contentType,
      seed,
      endpoint,
      requestId,
      width,
      height,
      latencyMs: Date.now() - startedAt,
      qa: {
        passed: bytes.length > 0,
        issues: bytes.length > 0 ? [] : ["empty_image_payload"],
        attempts: 1
      }
    };
  }

  protected async withTransportRetries(
    fn: () => Promise<Response>,
    endpoint: string,
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
          stage: "openai_image_request",
          provider: "openai",
          endpoint,
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

    if (isAbortLikeError(lastError)) {
      console.error("PROVIDER_ERROR", {
        stage: "openai_image_request_timeout",
        provider: "openai",
        endpoint,
        retryable: true
      });
      throw new OpenAiImageRequestError("OpenAI image request timed out", null, true, "provider_timeout", {
        endpoint
      });
    }

    if (lastError instanceof OpenAiImageRequestError) {
      throw lastError;
    }

    throw new OpenAiImageRequestError(
      `OpenAI transport failure at endpoint=${endpoint}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      null,
      true,
      "request_error",
      { endpoint }
    );
  }
}

class MockImageProvider implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    return {
      bytes: makeSvg(`PAGE ${input.pageIndex + 1} • ATTEMPT ${attempt}`, input.prompt, 1536, 1024, seed),
      contentType: "image/svg+xml",
      seed,
      endpoint: "mock:gpt-image-1.5:generate",
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

class MockPageArtProvider implements PageArtProvider {
  async generatePageArt(input: GeneratePageArtInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `page-art-${attempt}`);
    return {
      bytes: makeSvg(`PAGE ART ${input.pageIndex + 1} • ATTEMPT ${attempt}`, input.prompt, 1024, 1024, seed),
      contentType: "image/svg+xml",
      seed,
      endpoint: "mock:gpt-image-1.5:edit",
      requestId: `page-art-${seed}`,
      width: 1024,
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

class OpenAiImageProvider extends OpenAiTransport implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    const endpoint = `openai:${this.config.models.openaiImage}:generate`;
    const generated = await this.requestImage(
      "/generations",
      {
        model: this.config.models.openaiImage,
        prompt: input.prompt,
        size: "1536x1024",
        quality: "high",
        background: "opaque",
        output_format: "png",
        moderation: "auto",
        user: `book:${input.bookId}:page:${input.pageIndex}`
      },
      seed,
      endpoint,
      1536,
      1024
    );

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

class OpenAiPageArtProvider extends OpenAiTransport implements PageArtProvider {
  async generatePageArt(input: GeneratePageArtInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `page-art-${attempt}`);
    const endpoint = `openai:${this.config.models.openaiImage}:edit`;
    const generated = await this.requestImage(
      "/edits",
      {
        model: this.config.models.openaiImage,
        prompt: input.prompt,
        quality: "high",
        size: `${pageArtWorkingCanvasSize}x${pageArtWorkingCanvasSize}`,
        background: "opaque",
        output_format: "png",
        moderation: "auto",
        input_fidelity: "high",
        images: [
          {
            image_url: input.canvasImageUrl
          },
          ...input.referenceImageUrls.map((referenceImageUrl) => ({
            image_url: referenceImageUrl
          }))
        ],
        mask: {
          image_url: input.maskImageUrl
        },
        user: `book:${input.bookId}:page:${input.pageIndex}`
      },
      seed,
      endpoint,
      pageArtWorkingCanvasSize,
      pageArtWorkingCanvasSize
    );

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

  return new OpenAiImageProvider(config);
}

export async function resolvePictureBookImageProvider(context: MockRunContext = {}): Promise<PageArtProvider> {
  const config = await getRuntimeConfig();
  assertMockRunAuthorized(config, {
    ...context,
    source: context.source ?? "resolve_picture_book_image_provider"
  });
  if (config.featureFlags.enableMockImage) {
    return new MockPageArtProvider();
  }

  return new OpenAiPageArtProvider(config);
}
