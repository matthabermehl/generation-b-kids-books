import { buildCharacterCandidatePrompt } from "@book/domain";

const openAiImageGenerationsUrl = "https://api.openai.com/v1/images/generations";

export interface CharacterImageGenerationResult {
  bytes: Buffer;
  contentType: string;
  endpoint: string;
  prompt: string;
  providerRequestId: string | null;
  width: number;
  height: number;
}

interface GenerateCharacterImageInput {
  apiKey: string;
  model: string;
  characterDescription: string;
  bookId: string;
  userId: string;
  attemptNumber: number;
  useMock: boolean;
}

function makeMockSvg(prompt: string, attemptNumber: number): Buffer {
  const hue = (attemptNumber * 43) % 360;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
  <rect width="1024" height="1536" fill="white" />
  <circle cx="512" cy="768" r="340" fill="hsl(${hue}, 45%, 88%)" opacity="0.6" />
  <text x="512" y="180" text-anchor="middle" font-size="48" font-family="Verdana" fill="#334155">Character Candidate ${attemptNumber}</text>
  <foreignObject x="140" y="280" width="744" height="980">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Verdana;font-size:30px;line-height:1.45;color:#475569;background:rgba(255,255,255,0.85);padding:24px;border-radius:24px;">
      ${prompt.replace(/</g, "&lt;")}
    </div>
  </foreignObject>
</svg>`;

  return Buffer.from(svg, "utf8");
}

export async function generateCharacterCandidateImage(
  input: GenerateCharacterImageInput
): Promise<CharacterImageGenerationResult> {
  const prompt = buildCharacterCandidatePrompt(input.characterDescription);

  if (input.useMock) {
    return {
      bytes: makeMockSvg(prompt, input.attemptNumber),
      contentType: "image/svg+xml",
      endpoint: "mock:gpt-image-1.5",
      prompt,
      providerRequestId: null,
      width: 1024,
      height: 1536
    };
  }

  const response = await fetch(openAiImageGenerationsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      prompt,
      size: "1024x1536",
      quality: "high",
      background: "opaque",
      output_format: "png",
      moderation: "auto",
      user: `book:${input.bookId}:user:${input.userId}`
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI character image generation failed (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      b64_json?: string;
    }>;
  };

  const imageBase64 = payload.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("OpenAI character image generation did not return image data");
  }

  return {
    bytes: Buffer.from(imageBase64, "base64"),
    contentType: "image/png",
    endpoint: `openai:${input.model}`,
    prompt,
    providerRequestId: response.headers.get("x-request-id"),
    width: 1024,
    height: 1536
  };
}
