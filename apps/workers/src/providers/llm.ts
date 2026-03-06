import type { BeatSheet, MoneyLessonKey, ReadingProfile, StoryPackage } from "@book/domain";
import {
  beatSheetJsonSchema,
  buildBeatPlannerPrompt,
  buildBeatPlannerSystemPrompt,
  buildBeatRewritePrompt,
  buildCriticPrompt,
  buildMontessoriCriticPrompt,
  buildNarrativeFreshnessCriticPrompt,
  buildPageWriterPrompt,
  buildScienceOfReadingCriticPrompt,
  criticVerdictJsonSchema,
  computeBitcoinBeatTargets,
  runDeterministicBeatChecks,
  runDeterministicStoryChecks,
  schemaNames,
  storyCriticVerdictJsonSchema,
  storyPackageJsonSchema,
  type BitcoinBeatTargets,
  type BeatDeterministicSummary,
  type CriticVerdict
} from "@book/prompts";
import { z } from "zod";
import { boolFromEnv, redactText, sleep } from "../lib/helpers.js";
import { assertMockRunAuthorized, type MockRunContext } from "../lib/mock-guard.js";
import { getRuntimeConfig, type RuntimeConfig } from "../lib/ssm-config.js";

export interface StoryContext {
  bookId: string;
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
  pageCount: number;
  mockRunTag?: string | null;
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

type BeatCriticName = "montessori" | "science_of_reading" | "narrative_freshness";

export interface BeatCriticAudit {
  critic: BeatCriticName;
  verdict: CriticVerdict;
  meta: LlmMetadata;
}

export interface BeatPlanningAttempt {
  attempt: number;
  deterministic: BeatDeterministicSummary;
  critics: BeatCriticAudit[];
}

export interface BeatPlanningAudit {
  attempts: BeatPlanningAttempt[];
  rewritesApplied: number;
  passed: boolean;
  finalIssues: string[];
}

export class BeatPlanningError extends Error {
  readonly beatSheet: BeatSheet;
  readonly audit: BeatPlanningAudit;
  readonly meta: LlmMetadata;

  constructor(message: string, beatSheet: BeatSheet, audit: BeatPlanningAudit, meta: LlmMetadata) {
    super(message);
    this.name = "BeatPlanningError";
    this.beatSheet = beatSheet;
    this.audit = audit;
    this.meta = meta;
  }
}

export interface LlmProvider {
  generateBeatSheet(
    context: StoryContext
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }>;
  draftPages(context: StoryContext, beatSheet: BeatSheet): Promise<{ story: StoryPackage; meta: LlmMetadata }>;
  critic(context: StoryContext, story: StoryPackage): Promise<{ ok: boolean; notes: string[]; meta: LlmMetadata }>;
}

const plannedBeatSchema = z.object({
  purpose: z.string().min(1),
  conflict: z.string().min(1),
  sceneLocation: z.string().min(1),
  emotionalTarget: z.string().min(1),
  pageIndexEstimate: z.number().int().min(0).max(40),
  decodabilityTags: z.array(z.string().min(1)).min(1).max(16),
  newWordsIntroduced: z.array(z.string().min(1)).min(0).max(8),
  bitcoinRelevanceScore: z.number().min(0).max(1)
});

const beatSheetSchema = z.object({
  beats: z.array(plannedBeatSchema).min(4).max(32)
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
  beats: z.array(plannedBeatSchema).min(4).max(32),
  pages: z.array(storyPageSchema).min(4).max(32)
});

const beatCriticSchema = z.object({
  pass: z.boolean(),
  issues: z.array(
    z.object({
      beatIndex: z.number().int().min(0).max(40),
      problem: z.string().min(1),
      severity: z.enum(["low", "med", "high"]),
      fix: z.string().min(1)
    })
  ),
  rewriteInstructions: z.string()
});

const beatCriticLenientParser = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const normalizedIssues = Array.isArray(record.issues) ? record.issues : [];
  const normalizedPass =
    typeof record.pass === "boolean" ? record.pass : normalizedIssues.length === 0;
  return {
    ...record,
    pass: normalizedPass,
    issues: normalizedIssues,
    rewriteInstructions:
      typeof record.rewriteInstructions === "string" ? record.rewriteInstructions : ""
  };
}, beatCriticSchema);

const storyCriticSchema = z.object({
  ok: z.boolean(),
  notes: z.array(z.string())
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_OPUS_46_MODEL = "claude-opus-4-6";
const MAX_BEAT_REWRITES = 2;

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

  return (promptTokens * 3 + completionTokens * 15) / 1_000_000;
}

function parseWithSchema<T>(
  raw: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): T {
  return schema.parse(raw);
}

function normalizeStructuredToolInput(raw: unknown, schemaName: string): unknown {
  let candidate = raw;
  const seen = new Set<unknown>();

  while (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    if (seen.has(candidate)) {
      break;
    }
    seen.add(candidate);

    const record = candidate as Record<string, unknown>;
    if (record[schemaName] !== undefined) {
      candidate = record[schemaName];
      continue;
    }
    if (record.output !== undefined) {
      candidate = record.output;
      continue;
    }
    if (record.data !== undefined) {
      candidate = record.data;
      continue;
    }
    break;
  }

  if (schemaName === schemaNames.beatSheet && Array.isArray(candidate)) {
    return { beats: candidate };
  }

  return candidate;
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

  return { temperature: 0.3 };
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

function flattenBeatPlanningIssues(attempt: BeatPlanningAttempt): string[] {
  const issues = attempt.deterministic.issues.map((issue) => issue.message);
  for (const critic of attempt.critics) {
    for (const issue of critic.verdict.issues) {
      issues.push(`[${critic.critic}] beat ${issue.beatIndex}: ${issue.problem}`);
    }
  }
  return issues;
}

function normalizeBeatSheetToPageCount(beatSheet: BeatSheet, pageCount: number): BeatSheet {
  if (beatSheet.beats.length <= pageCount) {
    return beatSheet;
  }

  const trimmed = [...beatSheet.beats]
    .sort((a, b) => a.pageIndexEstimate - b.pageIndexEstimate)
    .slice(0, pageCount)
    .map((beat, index) => ({
      ...beat,
      pageIndexEstimate: index
    }));

  return { beats: trimmed };
}

function normalizeCriticVerdict(verdict: CriticVerdict): CriticVerdict {
  const seen = new Set<string>();
  const dedupedIssues = verdict.issues.filter((issue) => {
    const key = `${issue.beatIndex}:${issue.problem.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const cappedIssues = dedupedIssues.slice(0, 3);

  return {
    pass: cappedIssues.length === 0,
    issues: cappedIssues,
    rewriteInstructions: verdict.rewriteInstructions.trim()
  };
}

function buildRewriteInstructions(
  attempt: BeatPlanningAttempt,
  bitcoinTargets: BitcoinBeatTargets,
  context: StoryContext
): string {
  const earlyReader =
    context.profile === "early_decoder_5_7" || (context.ageYears >= 5 && context.ageYears <= 7);
  const finalTwentyPercentIndex = Math.floor(context.pageCount * 0.8);
  const failingCritics = attempt.critics.filter(
    (critic) => !critic.verdict.pass || critic.verdict.issues.length > 0
  );
  const deterministicLines = attempt.deterministic.issues.map(
    (issue) =>
      `- Deterministic (${issue.code})${issue.beatIndex !== undefined ? ` beat ${issue.beatIndex}` : ""}: ${issue.message}`
  );
  const criticLines = failingCritics.flatMap((critic) =>
    critic.verdict.issues.map(
      (issue) =>
        `- ${critic.critic} critic beat ${issue.beatIndex}: ${issue.problem}. Fix guidance: ${issue.fix}`
    )
  );
  const instructionLines = failingCritics
    .map((critic) => critic.verdict.rewriteInstructions)
    .filter((line) => line.trim().length > 0)
    .map((line) => `- ${line}`);

  return [
    "Apply the following fixes:",
    ...deterministicLines,
    ...criticLines,
    "- Numeric Bitcoin constraints:",
    `- Set exactly ${bitcoinTargets.minHighBeats}-${bitcoinTargets.maxHighBeats} beats to bitcoinRelevanceScore >= ${bitcoinTargets.highScoreThreshold}.`,
    `- Only beats with index >= ${bitcoinTargets.allowedHighStartIndex} may have bitcoinRelevanceScore >= ${bitcoinTargets.highScoreThreshold}.`,
    ...(earlyReader
      ? [
          "- Numeric SoR constraints:",
          "- Keep newWordsIntroduced length <= 2 for every beat.",
          `- Introduce taught words like Bitcoin only at index >= ${finalTwentyPercentIndex}.`,
          "- Avoid abstract economic jargon unless rewritten into concrete child-level wording."
        ]
      : []),
    "Global rewrite guidance:",
    ...instructionLines,
    "Preserve non-flagged beats unless changes are required by global constraints."
  ].join("\n");
}

class MockLlmProvider implements LlmProvider {
  async generateBeatSheet(
    context: StoryContext
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }> {
    const beatSheet: BeatSheet = {
      beats: Array.from({ length: context.pageCount }, (_, idx) => ({
        purpose:
          idx < context.pageCount - 2
            ? `Setup/test beat ${idx + 1}`
            : `Resolution beat ${idx + 1}`,
        conflict:
          idx < context.pageCount - 2
            ? `${context.childFirstName} faces changing prices in daily life.`
            : `${context.childFirstName} applies a long-term saving tool with confidence.`,
        sceneLocation: context.interests[0] ?? "home",
        emotionalTarget: idx < context.pageCount - 2 ? "curious then determined" : "relieved and proud",
        pageIndexEstimate: idx,
        decodabilityTags: ["controlled_vocab", "repetition", "taught_words_late"],
        newWordsIntroduced: idx >= context.pageCount - 2 ? ["bitcoin"] : ["save"],
        bitcoinRelevanceScore: idx >= context.pageCount - 2 ? 0.85 : 0.2
      }))
    };

    const deterministic = runDeterministicBeatChecks(
      {
        profile: context.profile,
        ageYears: context.ageYears,
        pageCount: context.pageCount
      },
      beatSheet
    );

    return {
      beatSheet,
      audit: {
        attempts: [
          {
            attempt: 0,
            deterministic,
            critics: []
          }
        ],
        rewritesApplied: 0,
        passed: deterministic.ok,
        finalIssues: deterministic.issues.map((issue) => issue.message)
      },
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }

  async draftPages(
    context: StoryContext,
    beatSheet: BeatSheet
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const pages = beatSheet.beats.map((beat, idx) => ({
      pageIndex: idx,
      pageText:
        idx < beatSheet.beats.length - 2
          ? `${context.childFirstName} notices prices changing and plans ahead.`
          : `${context.childFirstName} learns Bitcoin can support long-term saving goals.`,
      illustrationBrief: `Calm watercolor scene for ${context.childFirstName}, page ${idx + 1}`,
      newWordsIntroduced: beat.newWordsIntroduced,
      repetitionTargets: ["save", "plan"]
    }));

    return {
      story: {
        title: `${context.childFirstName}'s Bitcoin Adventure`,
        beats: beatSheet.beats,
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

interface StructuredCallInput<T> {
  stage: string;
  prompt: string;
  systemPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parser: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxTokens: number;
  openAiModel?: string;
  anthropicModel?: string;
}

class OpenAiAnthropicProvider implements LlmProvider {
  private readonly config: RuntimeConfig;
  private openAiBypassReason: string | null = null;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  async generateBeatSheet(
    context: StoryContext
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }> {
    const bitcoinTargets = computeBitcoinBeatTargets(context.pageCount);
    const plannerSystemPrompt = buildBeatPlannerSystemPrompt();
    const plannerPrompt = buildBeatPlannerPrompt(context, context.pageCount, bitcoinTargets);

    const planner = await this.callWithFallbackStructured<BeatSheet>({
      stage: "beat_planner",
      prompt: plannerPrompt,
      systemPrompt: plannerSystemPrompt,
      schemaName: schemaNames.beatSheet,
      jsonSchema: beatSheetJsonSchema,
      parser: beatSheetSchema,
      maxTokens: 2200
    });

    let currentBeatSheet = normalizeBeatSheetToPageCount(planner.data, context.pageCount);
    let latestMeta = planner.meta;
    const attempts: BeatPlanningAttempt[] = [];

    for (let attempt = 0; attempt <= MAX_BEAT_REWRITES; attempt += 1) {
      const deterministic = runDeterministicBeatChecks(
        {
          profile: context.profile,
          ageYears: context.ageYears,
          pageCount: context.pageCount
        },
        currentBeatSheet
      );
      const critics = await this.runBeatCritics(context, currentBeatSheet);

      attempts.push({ attempt, deterministic, critics });

      const criticsPass = critics.every((critic) => critic.verdict.pass);
      const blockingCriticsPass = critics.every(
        (critic) => critic.critic === "narrative_freshness" || critic.verdict.pass
      );
      if (deterministic.ok && criticsPass) {
        return {
          beatSheet: currentBeatSheet,
          audit: {
            attempts,
            rewritesApplied: attempt,
            passed: true,
            finalIssues: []
          },
          meta: latestMeta
        };
      }

      if (deterministic.ok && blockingCriticsPass && attempt === MAX_BEAT_REWRITES) {
        const finalIssues = flattenBeatPlanningIssues(attempts[attempt] ?? attempts[attempts.length - 1]);
        return {
          beatSheet: currentBeatSheet,
          audit: {
            attempts,
            rewritesApplied: attempt,
            passed: false,
            finalIssues
          },
          meta: latestMeta
        };
      }

      if (attempt === MAX_BEAT_REWRITES) {
        const finalIssues = flattenBeatPlanningIssues(attempts[attempt] ?? attempts[attempts.length - 1]);
        throw new BeatPlanningError(
          `Beat planning failed validation after rewrites: ${finalIssues.join(" | ")}`,
          currentBeatSheet,
          {
            attempts,
            rewritesApplied: attempt,
            passed: false,
            finalIssues
          },
          latestMeta
        );
      }

      const rewritePrompt = buildBeatRewritePrompt(
        context,
        JSON.stringify(currentBeatSheet),
        buildRewriteInstructions(attempts[attempt], bitcoinTargets, context),
        bitcoinTargets
      );

      const rewrite = await this.callWithFallbackStructured<BeatSheet>({
        stage: "beat_rewrite",
        prompt: rewritePrompt,
        systemPrompt: "You rewrite beat sheets precisely according to provided instructions.",
        schemaName: schemaNames.beatSheet,
        jsonSchema: beatSheetJsonSchema,
        parser: beatSheetSchema,
        maxTokens: 2200
      });

      currentBeatSheet = normalizeBeatSheetToPageCount(rewrite.data, context.pageCount);
      latestMeta = rewrite.meta;
    }

    throw new Error("Beat planning reached an unreachable state");
  }

  async draftPages(context: StoryContext, beatSheet: BeatSheet): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const prompt = buildPageWriterPrompt(context, beatSheet, context.pageCount);
    const result = await this.withRetries("anthropic", "draft_pages", () =>
      this.callAnthropicStrict<z.infer<typeof storyPackageSchema>>({
        stage: "draft_pages",
        model: ANTHROPIC_OPUS_46_MODEL,
        prompt,
        systemPrompt:
          "You write final story pages for children. Output only schema-valid structured data.",
        schemaName: schemaNames.storyPackage,
        jsonSchema: storyPackageJsonSchema,
        parser: storyPackageSchema,
        maxTokens: 5000
      })
    );

    const validated = result.data;

    const story: StoryPackage = {
      title: validated.title,
      beats: validated.beats.slice(0, context.pageCount),
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
      meta: {
        ...result.meta,
        model: ANTHROPIC_OPUS_46_MODEL
      }
    };
  }

  async critic(
    context: StoryContext,
    story: StoryPackage
  ): Promise<{ ok: boolean; notes: string[]; meta: LlmMetadata }> {
    const prompt = buildCriticPrompt(context, JSON.stringify(story));
    const result = await this.callWithFallbackStructured<z.infer<typeof storyCriticSchema>>({
      stage: "story_critic",
      prompt,
      systemPrompt: "You are a strict final-story validator. Output only schema-valid JSON.",
      schemaName: schemaNames.storyCriticVerdict,
      jsonSchema: storyCriticVerdictJsonSchema,
      parser: storyCriticSchema,
      maxTokens: 2200
    });

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

  private async runBeatCritics(context: StoryContext, beatSheet: BeatSheet): Promise<BeatCriticAudit[]> {
    const beatSheetJson = JSON.stringify(beatSheet);

    const critics: Array<{
      critic: BeatCriticName;
      stage: string;
      prompt: string;
    }> = [
      {
        critic: "montessori",
        stage: "beat_critic_montessori",
        prompt: buildMontessoriCriticPrompt(context, beatSheetJson)
      },
      {
        critic: "science_of_reading",
        stage: "beat_critic_sor",
        prompt: buildScienceOfReadingCriticPrompt(context, beatSheetJson)
      },
      {
        critic: "narrative_freshness",
        stage: "beat_critic_narrative",
        prompt: buildNarrativeFreshnessCriticPrompt(context, beatSheetJson)
      }
    ];

    return Promise.all(
      critics.map(async (critic) => {
        const result = await this.callWithFallbackStructured<CriticVerdict>({
          stage: critic.stage,
          prompt: critic.prompt,
          systemPrompt: "You are a strict beat-sheet critic. Output only schema-valid structured data.",
          schemaName: schemaNames.criticVerdict,
          jsonSchema: criticVerdictJsonSchema,
          parser: beatCriticLenientParser,
          maxTokens: 1100
        });

        return {
          critic: critic.critic,
          verdict: normalizeCriticVerdict(result.data),
          meta: result.meta
        };
      })
    );
  }

  private async callWithFallbackStructured<T>(
    input: StructuredCallInput<T>
  ): Promise<{ data: T; meta: LlmMetadata }> {
    if (this.openAiBypassReason) {
      const fallback = await this.withRetries("anthropic", input.stage, () =>
        this.callAnthropicStrict<T>({
          stage: input.stage,
          model: input.anthropicModel ?? this.config.models.anthropicWriter,
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          schemaName: input.schemaName,
          jsonSchema: input.jsonSchema,
          parser: input.parser,
          maxTokens: input.maxTokens
        })
      );

      return {
        data: fallback.data,
        meta: {
          ...fallback.meta,
          fallbackFrom: "openai"
        }
      };
    }

    try {
      return await this.withRetries("openai", input.stage, () =>
        this.callOpenAiStrict<T>({
          stage: input.stage,
          model: input.openAiModel ?? this.config.models.openaiJson,
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          schemaName: input.schemaName,
          jsonSchema: input.jsonSchema,
          parser: input.parser,
          maxTokens: input.maxTokens
        })
      );
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) {
        throw error;
      }

      if (this.shouldBypassOpenAi(error)) {
        this.openAiBypassReason = redactText(error.message);
        console.error("OPENAI_BYPASS_ENABLED", {
          stage: input.stage,
          status: error.status,
          reason: this.openAiBypassReason
        });
      }

      console.error("PROVIDER_ERROR", providerErrorContext(input.stage, error));
      const fallback = await this.withRetries("anthropic", input.stage, () =>
        this.callAnthropicStrict<T>({
          stage: input.stage,
          model: input.anthropicModel ?? this.config.models.anthropicWriter,
          prompt: input.prompt,
          systemPrompt: input.systemPrompt,
          schemaName: input.schemaName,
          jsonSchema: input.jsonSchema,
          parser: input.parser,
          maxTokens: input.maxTokens
        })
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

  private shouldBypassOpenAi(error: ProviderRequestError): boolean {
    if (error.provider !== "openai" || error.retryable) {
      return false;
    }

    if (error.status === 401 || error.status === 403) {
      return true;
    }

    const message = error.message.toLowerCase();
    if (error.status === 400 && message.includes("archived")) {
      return true;
    }

    return (
      message.includes("archived") ||
      message.includes("invalid api key") ||
      message.includes("not authorized")
    );
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

  private async callOpenAiStrict<T>(input: {
    stage: string;
    model: string;
    prompt: string;
    systemPrompt: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    parser: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens: number;
  }): Promise<{ data: T; meta: LlmMetadata }> {
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
          model: input.model,
          ...buildOpenAiSamplingOptions(input.model),
          ...buildOpenAiTokenLimit(input.model, input.maxTokens),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.jsonSchema
            }
          },
          messages: [
            {
              role: "system",
              content: input.systemPrompt
            },
            {
              role: "user",
              content: input.prompt
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
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const finishReason = payload.choices?.[0]?.finish_reason ?? null;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderRequestError(
          "openai",
          `OpenAI ${input.stage} response missing content`,
          null,
          finishReason === "length"
        );
      }

      const parsedJson = JSON.parse(content) as unknown;
      const data = parseWithSchema(parsedJson, input.parser);
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const totalTokens = payload.usage?.total_tokens ?? promptTokens + completionTokens;

      return {
        data,
        meta: {
          provider: "openai",
          model: input.model,
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
        throw new ProviderRequestError("openai", `OpenAI ${input.stage} request timed out`, null, true);
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

  private async callAnthropicStrict<T>(input: {
    stage: string;
    model: string;
    prompt: string;
    systemPrompt: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
    parser: z.ZodType<T, z.ZodTypeDef, unknown>;
    maxTokens: number;
  }): Promise<{ data: T; meta: LlmMetadata }> {
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
          model: input.model,
          max_tokens: input.maxTokens,
          temperature: 0.3,
          system: input.systemPrompt,
          messages: [
            {
              role: "user",
              content: input.prompt
            }
          ],
          tools: [
            {
              name: input.schemaName,
              description: `Return ${input.schemaName} as structured output`,
              input_schema: input.jsonSchema
            }
          ],
          tool_choice: {
            type: "tool",
            name: input.schemaName
          }
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
        content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const toolOutput = payload.content?.find(
        (item) => item.type === "tool_use" && item.name === input.schemaName
      );
      if (!toolOutput || toolOutput.input === undefined) {
        throw new ProviderRequestError(
          "anthropic",
          `Anthropic ${input.stage} response missing structured tool output`,
          null,
          false
        );
      }

      const data = parseWithSchema(normalizeStructuredToolInput(toolOutput.input, input.schemaName), input.parser);
      const promptTokens = payload.usage?.input_tokens ?? 0;
      const completionTokens = payload.usage?.output_tokens ?? 0;
      const totalTokens = promptTokens + completionTokens;

      return {
        data,
        meta: {
          provider: "anthropic",
          model: input.model,
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
        throw new ProviderRequestError("anthropic", `Anthropic ${input.stage} request timed out`, null, true);
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

export async function resolveLlmProvider(context: MockRunContext = {}): Promise<LlmProvider> {
  const config = await getRuntimeConfig();
  assertMockRunAuthorized(config, {
    ...context,
    source: context.source ?? "resolve_llm_provider"
  });
  if (config.featureFlags.enableMockLlm) {
    return new MockLlmProvider();
  }

  return new OpenAiAnthropicProvider(config);
}
