import type { MoneyLessonKey, ReadingProfile, StoryPackage } from "@book/domain";
import {
  buildBeatPlannerPrompt,
  buildCriticPrompt,
  buildPageWriterPrompt,
  runDeterministicStoryChecks
} from "@book/prompts";
import { z } from "zod";
import { boolFromEnv, redactText, sleep } from "../lib/helpers.js";
import { getRuntimeConfig, type RuntimeConfig } from "../lib/ssm-config.js";

export interface StoryContext {
  bookId: string;
  childFirstName: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
  pageCount: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmMetadata {
  provider: "mock" | "openai" | "anthropic";
  model: string;
  latencyMs: number;
  usage: TokenUsage | null;
  fallbackFrom?: "openai";
}

export interface LlmProvider {
  generateBeatSheet(context: StoryContext): Promise<{ beats: string[]; meta: LlmMetadata }>;
  draftPages(context: StoryContext, beats: string[]): Promise<{ story: StoryPackage; meta: LlmMetadata }>;
  critic(context: StoryContext, story: StoryPackage): Promise<{ ok: boolean; notes: string[]; meta: LlmMetadata }>;
}

const beatSheetSchema = z.object({
  beats: z.array(z.string().min(1)).min(4).max(32)
});

const storyBeatSchema = z.object({
  purpose: z.string().min(1),
  conflict: z.string().min(1),
  sceneLocation: z.string().min(1),
  emotionalTarget: z.string().min(1),
  bitcoinRelevanceScore: z.number().min(0).max(1)
});

const storyPageSchema = z.object({
  pageIndex: z.number().int().min(0),
  pageText: z.string().min(1),
  illustrationBrief: z.string().min(1),
  newWordsIntroduced: z.array(z.string().min(1)),
  repetitionTargets: z.array(z.string().min(1))
});

const storyPackageSchema = z.object({
  title: z.string().min(1),
  beats: z.array(storyBeatSchema),
  pages: z.array(storyPageSchema).min(4).max(32)
});

const criticSchema = z.object({
  ok: z.boolean(),
  notes: z.array(z.string())
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

class ProviderRequestError extends Error {
  readonly provider: "openai" | "anthropic";
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    provider: "openai" | "anthropic",
    message: string,
    status: number | null,
    retryable: boolean
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function estimateCostUsd(
  provider: "openai" | "anthropic",
  promptTokens: number,
  completionTokens: number
): number {
  if (provider === "openai") {
    // gpt-5-mini indicative pricing per 1M tokens.
    return (promptTokens * 0.25 + completionTokens * 2) / 1_000_000;
  }

  // claude-sonnet indicative pricing per 1M tokens.
  return (promptTokens * 3 + completionTokens * 15) / 1_000_000;
}

function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = JSON.parse(raw) as unknown;
  return schema.parse(parsed);
}

function providerErrorContext(stage: string, error: ProviderRequestError): Record<string, unknown> {
  return {
    stage,
    provider: error.provider,
    status: error.status,
    retryable: error.retryable,
    message: redactText(error.message)
  };
}

class MockLlmProvider implements LlmProvider {
  async generateBeatSheet(context: StoryContext): Promise<{ beats: string[]; meta: LlmMetadata }> {
    return {
      beats: Array.from({ length: context.pageCount }, (_, idx) => {
        if (idx < context.pageCount - 2) {
          return `Beat ${idx + 1}: ${context.childFirstName} faces a money challenge while exploring ${context.interests[0] ?? "their neighborhood"}.`;
        }

        return `Beat ${idx + 1}: ${context.childFirstName} discovers Bitcoin as a long-term saving tool.`;
      }),
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }

  async draftPages(context: StoryContext, beats: string[]): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const pages = beats.map((beat, idx) => ({
      pageIndex: idx,
      pageText:
        idx < beats.length - 2
          ? `${context.childFirstName} notices prices changing and learns to plan ahead. ${beat}`
          : `${context.childFirstName} learns Bitcoin can protect savings over time and feels more confident. ${beat}`,
      illustrationBrief: `Calm watercolor scene for ${context.childFirstName}, page ${idx + 1}`,
      newWordsIntroduced: idx === 0 ? ["budget"] : idx === beats.length - 2 ? ["bitcoin"] : [],
      repetitionTargets: ["save", "plan"]
    }));

    return {
      story: {
        title: `${context.childFirstName}'s Bitcoin Adventure`,
        beats: beats.map((beat) => ({
          purpose: beat,
          conflict: "Changing prices",
          sceneLocation: context.interests[0] ?? "home",
          emotionalTarget: "calm confidence",
          bitcoinRelevanceScore: beat.includes("Bitcoin") ? 0.9 : 0.2
        })),
        pages,
        readingProfileId: context.profile,
        moneyLessonKey: context.lesson
      },
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }

  async critic(
    context: StoryContext,
    story: StoryPackage
  ): Promise<{ ok: boolean; notes: string[]; meta: LlmMetadata }> {
    const quality = runDeterministicStoryChecks(
      context.profile,
      story.pages,
      boolFromEnv("ENABLE_STRICT_DECODABLE_CHECKS", true)
    );

    return {
      ok: quality.ok,
      notes: quality.issues,
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }
}

class OpenAiAnthropicProvider implements LlmProvider {
  private readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  async generateBeatSheet(context: StoryContext): Promise<{ beats: string[]; meta: LlmMetadata }> {
    const prompt = buildBeatPlannerPrompt(context, context.pageCount);
    const result = await this.callWithFallback("beat_sheet", prompt, beatSheetSchema, 1200);
    const beats = result.data.beats.slice(0, context.pageCount);

    if (beats.length !== context.pageCount) {
      throw new Error(`Beat sheet returned ${beats.length} beats; expected ${context.pageCount}.`);
    }

    return {
      beats,
      meta: result.meta
    };
  }

  async draftPages(context: StoryContext, beats: string[]): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const prompt = buildPageWriterPrompt(context, beats, context.pageCount);
    const result = await this.callWithFallback("draft_pages", prompt, storyPackageSchema, 5000);
    const validated = result.data;

    const story: StoryPackage = {
      title: validated.title,
      beats: validated.beats,
      pages: validated.pages
        .sort((a, b) => a.pageIndex - b.pageIndex)
        .slice(0, context.pageCount)
        .map((page, idx) => ({
          pageIndex: idx,
          pageText: page.pageText,
          illustrationBrief: page.illustrationBrief,
          newWordsIntroduced: page.newWordsIntroduced,
          repetitionTargets: page.repetitionTargets
        })),
      readingProfileId: context.profile,
      moneyLessonKey: context.lesson
    };

    if (story.pages.length !== context.pageCount) {
      throw new Error(`Draft returned ${story.pages.length} pages; expected ${context.pageCount}.`);
    }

    return {
      story,
      meta: result.meta
    };
  }

  async critic(
    context: StoryContext,
    story: StoryPackage
  ): Promise<{ ok: boolean; notes: string[]; meta: LlmMetadata }> {
    const prompt = buildCriticPrompt(context, JSON.stringify(story));
    const result = await this.callWithFallback("critic", prompt, criticSchema, 1000);

    const deterministic = runDeterministicStoryChecks(
      context.profile,
      story.pages,
      boolFromEnv("ENABLE_STRICT_DECODABLE_CHECKS", true)
    );

    return {
      ok: result.data.ok && deterministic.ok,
      notes: [...result.data.notes, ...deterministic.issues],
      meta: result.meta
    };
  }

  private async callWithFallback<T>(
    stage: string,
    prompt: string,
    schema: z.ZodType<T>,
    maxTokens: number
  ): Promise<{ data: T; meta: LlmMetadata }> {
    try {
      return await this.withRetries("openai", stage, () => this.callOpenAi(prompt, schema, maxTokens));
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) {
        throw error;
      }

      if (!error.retryable) {
        throw error;
      }

      console.error("PROVIDER_ERROR", providerErrorContext(stage, error));
      const fallback = await this.withRetries("anthropic", stage, () =>
        this.callAnthropic(prompt, schema, maxTokens)
      );
      return {
        data: fallback.data,
        meta: {
          ...fallback.meta,
          fallbackFrom: "openai"
        }
      };
    }
  }

  private async withRetries<T>(
    provider: "openai" | "anthropic",
    stage: string,
    task: () => Promise<T>,
    maxAttempts = 2
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProviderRequestError) || !error.retryable || attempt >= maxAttempts) {
          throw error;
        }

        console.error("PROVIDER_ERROR", {
          stage,
          provider,
          attempt,
          status: error.status,
          retryable: error.retryable,
          message: redactText(error.message)
        });
        await sleep(attempt * 500);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unknown provider retry failure");
  }

  private async callOpenAi<T>(
    prompt: string,
    schema: z.ZodType<T>,
    maxTokens: number
  ): Promise<{ data: T; meta: LlmMetadata }> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secrets.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.models.openaiJson,
          temperature: 0.4,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Return strict JSON only. No markdown, no prose."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ProviderRequestError(
          "openai",
          `OpenAI request failed: ${response.status} ${body.slice(0, 256)}`,
          response.status,
          isRetryableStatus(response.status)
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderRequestError("openai", "OpenAI response missing content", null, false);
      }

      const data = parseJson(content, schema);
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const totalTokens = payload.usage?.total_tokens ?? promptTokens + completionTokens;

      return {
        data,
        meta: {
          provider: "openai",
          model: this.config.models.openaiJson,
          latencyMs: Date.now() - startedAt,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd: estimateCostUsd("openai", promptTokens, completionTokens)
          }
        }
      };
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError("openai", "OpenAI request timed out", null, true);
      }

      throw new ProviderRequestError(
        "openai",
        error instanceof Error ? error.message : String(error),
        null,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callAnthropic<T>(
    prompt: string,
    schema: z.ZodType<T>,
    maxTokens: number
  ): Promise<{ data: T; meta: LlmMetadata }> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.config.secrets.anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.models.anthropicWriter,
          max_tokens: maxTokens,
          temperature: 0.4,
          system: "Return strict JSON only. No markdown, no prose.",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ProviderRequestError(
          "anthropic",
          `Anthropic request failed: ${response.status} ${body.slice(0, 256)}`,
          response.status,
          isRetryableStatus(response.status)
        );
      }

      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const content = payload.content?.find((item) => item.type === "text")?.text;
      if (!content) {
        throw new ProviderRequestError("anthropic", "Anthropic response missing text", null, false);
      }

      const data = parseJson(content, schema);
      const promptTokens = payload.usage?.input_tokens ?? 0;
      const completionTokens = payload.usage?.output_tokens ?? 0;
      const totalTokens = promptTokens + completionTokens;

      return {
        data,
        meta: {
          provider: "anthropic",
          model: this.config.models.anthropicWriter,
          latencyMs: Date.now() - startedAt,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd: estimateCostUsd("anthropic", promptTokens, completionTokens)
          }
        }
      };
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        console.error("PROVIDER_ERROR", providerErrorContext("anthropic_call", error));
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError("anthropic", "Anthropic request timed out", null, true);
      }

      throw new ProviderRequestError(
        "anthropic",
        error instanceof Error ? error.message : String(error),
        null,
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function resolveLlmProvider(): Promise<LlmProvider> {
  const config = await getRuntimeConfig();
  if (config.featureFlags.enableMockLlm) {
    return new MockLlmProvider();
  }

  return new OpenAiAnthropicProvider(config);
}
