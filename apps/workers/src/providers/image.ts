import { pageSeed } from "@book/domain";
import { boolFromEnv } from "../lib/helpers.js";

export interface GenerateImageInput {
  bookId: string;
  pageIndex: number;
  prompt: string;
  role: "page" | "character_sheet";
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  seed: number;
  endpoint: string;
  qa: {
    passed: boolean;
    issues: string[];
    attempts: number;
  };
}

export interface ImageProvider {
  generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage>;
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

class MockImageProvider implements ImageProvider {
  async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    const seed = pageSeed(input.bookId, input.pageIndex, `v${attempt}`);
    return {
      bytes: makeSvg(input, attempt),
      contentType: "image/svg+xml",
      seed,
      endpoint: process.env.FAL_ENDPOINT_BASE ?? "fal-ai/flux-2",
      qa: {
        passed: true,
        issues: [],
        attempts: attempt
      }
    };
  }
}

class StubFalProvider extends MockImageProvider {
  override async generate(input: GenerateImageInput, attempt: number): Promise<GeneratedImage> {
    // Real fal integration is deferred until keys are provided for live testing.
    return super.generate(input, attempt);
  }
}

export function resolveImageProvider(): ImageProvider {
  const useMock = boolFromEnv("ENABLE_MOCK_IMAGE", true);
  if (useMock) {
    return new MockImageProvider();
  }

  return new StubFalProvider();
}
