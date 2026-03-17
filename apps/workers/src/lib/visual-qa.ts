import { z } from "zod";
import type { PageArtVisualGuidance, VisualPageContract, VisualQaIssue, VisualQaVerdict } from "@book/domain";
import { getRuntimeConfig } from "./ssm-config.js";

const openAiChatUrl = "https://api.openai.com/v1/chat/completions";
const openAiRequestTimeoutMs = 90_000;

const visualQaIssueSchema = z.object({
  code: z.enum([
    "supporting_character_mismatch",
    "prop_count_mismatch",
    "prop_state_mismatch",
    "setting_anchor_mismatch",
    "forbidden_extra_entity",
    "low_confidence"
  ]),
  message: z.string().min(1),
  entityId: z.string().optional(),
  expected: z.string().optional(),
  observed: z.string().optional(),
  confidence: z.number().min(0).max(1).nullable().optional()
});

const visualQaResponseSchema = z.object({
  passed: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  summary: z.string().min(1),
  issues: z.array(visualQaIssueSchema)
});

interface VisualQaReference {
  label: string;
  url: string;
}

export interface EvaluateVisualContinuityInput {
  imageUrl: string | null;
  pageText: string;
  illustrationBrief: string;
  sceneVisualDescription: string;
  pageContract: VisualPageContract | null;
  visualGuidance?: PageArtVisualGuidance | null;
  mainCharacterReferenceUrl?: string | null;
  supportingCharacterReferences?: VisualQaReference[];
  continuityReferenceImages?: VisualQaReference[];
}

function buildOpenAiTokenLimit(model: string, maxTokens: number): { max_completion_tokens: number } | { max_tokens: number } {
  if (model.startsWith("gpt-5")) {
    return { max_completion_tokens: maxTokens };
  }

  return { max_tokens: maxTokens };
}

function buildOpenAiSamplingOptions(model: string): { temperature?: number; reasoning_effort?: "minimal" } {
  if (model.startsWith("gpt-5")) {
    return { reasoning_effort: "minimal" };
  }

  return { temperature: 0.1 };
}

function skippedVerdict(summary: string): VisualQaVerdict {
  return {
    passed: true,
    issues: [],
    confidence: null,
    summary,
    mode: "skipped"
  };
}

function normalizeVerdict(parsed: z.infer<typeof visualQaResponseSchema>): VisualQaVerdict {
  const issues: VisualQaIssue[] = parsed.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    entityId: issue.entityId,
    expected: issue.expected,
    observed: issue.observed,
    confidence: issue.confidence ?? null
  }));

  if (parsed.confidence !== null && parsed.confidence < 0.65 && !issues.some((issue) => issue.code === "low_confidence")) {
    issues.push({
      code: "low_confidence",
      message: "Visual QA confidence was too low to trust this verdict.",
      confidence: parsed.confidence
    });
  }

  return {
    passed: parsed.passed && issues.length === 0,
    issues,
    confidence: parsed.confidence,
    summary: parsed.summary,
    mode: "openai"
  };
}

function visualQaJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["passed", "confidence", "summary", "issues"],
    properties: {
      passed: { type: "boolean" },
      confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
      summary: { type: "string" },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              enum: [
                "supporting_character_mismatch",
                "prop_count_mismatch",
                "prop_state_mismatch",
                "setting_anchor_mismatch",
                "forbidden_extra_entity",
                "low_confidence"
              ]
            },
            message: { type: "string" },
            entityId: { type: "string" },
            expected: { type: "string" },
            observed: { type: "string" },
            confidence: { type: ["number", "null"], minimum: 0, maximum: 1 }
          }
        }
      }
    }
  };
}

export async function evaluateVisualContinuity(input: EvaluateVisualContinuityInput): Promise<VisualQaVerdict> {
  if (!input.imageUrl) {
    return skippedVerdict("No rendered page art URL was available for visual QA.");
  }
  if (!input.pageContract) {
    return skippedVerdict("No visual page contract was available for this page.");
  }

  const config = await getRuntimeConfig();
  if (config.featureFlags.enableMockImage) {
    return {
      passed: true,
      issues: [],
      confidence: 1,
      summary: "Mock visual QA accepted the page.",
      mode: "mock"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openAiRequestTimeoutMs);

  try {
    const referenceSections = [
      input.mainCharacterReferenceUrl
        ? [
            { type: "text", text: "Approved main character reference image." },
            { type: "image_url", image_url: { url: input.mainCharacterReferenceUrl } }
          ]
        : [],
      ...(input.supportingCharacterReferences ?? []).map((reference) => [
        { type: "text", text: `Supporting character reference: ${reference.label}.` },
        { type: "image_url", image_url: { url: reference.url } }
      ]),
      ...(input.continuityReferenceImages ?? []).map((reference) => [
        { type: "text", text: `Prior continuity page reference: ${reference.label}.` },
        { type: "image_url", image_url: { url: reference.url } }
      ])
    ].flat();

    const response = await fetch(openAiChatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secrets.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.models.openaiVision,
        ...buildOpenAiSamplingOptions(config.models.openaiVision),
        ...buildOpenAiTokenLimit(config.models.openaiVision, 900),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "visual_continuity_verdict",
            strict: true,
            schema: visualQaJsonSchema()
          }
        },
        messages: [
          {
            role: "system",
            content:
              "You are a strict visual continuity reviewer for children's picture books. Check only story-critical continuity. Ignore harmless background extras unless they conflict with the contract. If you are uncertain, fail with low_confidence instead of guessing."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Review this rendered page against the visual continuity contract.",
                  "",
                  `Page text: ${input.pageText}`,
                  `Illustration brief: ${input.illustrationBrief}`,
                  `Scene visual description: ${input.sceneVisualDescription}`,
                  "",
                  `Page contract JSON: ${JSON.stringify(input.pageContract)}`,
                  `Visual guidance JSON: ${JSON.stringify(input.visualGuidance ?? null)}`,
                  "",
                  "Return only the structured verdict."
                ].join("\n")
              },
              {
                type: "text",
                text: "Rendered candidate page art."
              },
              {
                type: "image_url",
                image_url: {
                  url: input.imageUrl
                }
              },
              ...referenceSections
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      return skippedVerdict(`Visual QA request failed with status ${response.status}: ${body.slice(0, 120)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return skippedVerdict("Visual QA response did not include structured content.");
    }

    const parsed = visualQaResponseSchema.parse(JSON.parse(content));
    return normalizeVerdict(parsed);
  } catch (error) {
    return skippedVerdict(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}
