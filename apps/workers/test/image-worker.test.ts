import { describe, expect, it } from "vitest";
import type { GenerateImageInput, GeneratedImage, ImageProvider } from "../src/providers/image.js";
import { runImageGenerationAttempts } from "../src/lib/image-attempts.js";

const baseInput: GenerateImageInput = {
  bookId: "book-1",
  pageIndex: 2,
  prompt: "Calm scene",
  role: "page"
};

function generated(passed: boolean, attempt: number): GeneratedImage {
  return {
    bytes: Buffer.from(`attempt-${attempt}`),
    contentType: "image/svg+xml",
    seed: attempt,
    endpoint: "fal-ai/flux-2",
    qa: {
      passed,
      issues: passed ? [] : ["style mismatch"],
      attempts: attempt
    }
  };
}

describe("runImageGenerationAttempts", () => {
  it("stops on first passing result", async () => {
    const provider: ImageProvider = {
      async generate() {
        return generated(true, 1);
      }
    };

    const result = await runImageGenerationAttempts(provider, baseInput, 2);

    expect(result.attempts).toBe(1);
    expect(result.generated.qa.passed).toBe(true);
    expect(result.generatedKey).toBe("books/book-1/images/page-3-v1");
  });

  it("retries until attempt budget is exhausted", async () => {
    let call = 0;
    const provider: ImageProvider = {
      async generate() {
        call += 1;
        if (call === 1) {
          return generated(false, 1);
        }

        return generated(true, 2);
      }
    };

    const result = await runImageGenerationAttempts(provider, baseInput, 2);

    expect(result.attempts).toBe(2);
    expect(result.generated.qa.passed).toBe(true);
    expect(result.generatedKey).toBe("books/book-1/images/page-3-v2");
  });

  it("returns failed result when all attempts fail", async () => {
    const provider: ImageProvider = {
      async generate(_, attempt) {
        return generated(false, attempt);
      }
    };

    const result = await runImageGenerationAttempts(provider, baseInput, 2);

    expect(result.attempts).toBe(2);
    expect(result.generated.qa.passed).toBe(false);
    expect(result.generated.qa.issues).toContain("style mismatch");
  });
});

describe("pictureBookFillPrompt", () => {
  it("explicitly forbids rendered text artifacts in the watercolor region", async () => {
    process.env.DB_CLUSTER_ARN ??= "arn:aws:rds:us-east-1:123456789012:cluster:test";
    process.env.DB_SECRET_ARN ??= "arn:aws:secretsmanager:us-east-1:123456789012:secret:test";
    process.env.DB_NAME ??= "bookapp";

    const { pictureBookFillPrompt } = await import("../src/image-worker.js");
    const prompt = pictureBookFillPrompt("Luna sits on a bench and declines a candy.");

    expect(prompt).toContain("Do not render any text");
    expect(prompt).toContain("captions");
    expect(prompt).toContain("watermarks");
  });
});
