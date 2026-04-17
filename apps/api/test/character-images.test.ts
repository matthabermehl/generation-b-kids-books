import { afterEach, describe, expect, it, vi } from "vitest";

import { generateCharacterCandidateImage } from "../src/lib/character-images.js";

describe("character image generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses low-quality OpenAI renders for synchronous character approval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString("base64") }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-character"
          }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const image = await generateCharacterCandidateImage({
      apiKey: "oa",
      model: "gpt-image-1-mini",
      characterDescription: "A curious child in a red raincoat with a yellow backpack.",
      bookId: "book-1",
      userId: "user-1",
      attemptNumber: 1,
      useMock: false
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body ?? "{}")) as {
      model?: string;
      size?: string;
      quality?: string;
      user?: string;
    };

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe("https://api.openai.com/v1/images/generations");
    expect(requestBody.model).toBe("gpt-image-1-mini");
    expect(requestBody.size).toBe("1024x1536");
    expect(requestBody.quality).toBe("low");
    expect(requestBody.user).toBe("book:book-1:user:user-1");
    expect(image.providerRequestId).toBe("req-character");
    expect(image.endpoint).toBe("openai:gpt-image-1-mini");
    expect(image.contentType).toBe("image/png");
    expect(image.bytes.length).toBeGreaterThan(0);
  });
});
