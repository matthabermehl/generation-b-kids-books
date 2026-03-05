import type { GenerateImageInput, GeneratedImage, ImageProvider } from "../providers/image.js";

export interface ImageAttemptResult {
  generated: GeneratedImage;
  attempts: number;
  generatedKey: string;
}

export async function runImageGenerationAttempts(
  provider: ImageProvider,
  input: GenerateImageInput,
  maxAttempts = 2
): Promise<ImageAttemptResult> {
  let attempts = 0;
  let generated: GeneratedImage | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    const candidate = await provider.generate(input, attempts);

    if (candidate.qa.passed) {
      generated = candidate;
      break;
    }

    generated = candidate;
  }

  if (!generated) {
    throw new Error("Image generation did not run");
  }

  return {
    generated,
    attempts,
    generatedKey: `books/${input.bookId}/images/page-${input.pageIndex + 1}-v${attempts}`
  };
}
