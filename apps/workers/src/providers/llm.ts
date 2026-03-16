import type {
  BeatSheet,
  MoneyLessonKey,
  ReadingProfile,
  StoryConcept,
  StoryCriticVerdict,
  StoryPackage
} from "@book/domain";
import {
  beatSheetJsonSchema,
  buildBeatPlannerPrompt,
  buildBeatPlannerSystemPrompt,
  buildBeatRewritePrompt,
  buildCriticPrompt,
  buildMontessoriCriticPrompt,
  buildNarrativeFreshnessCriticPrompt,
  buildPageWriterPrompt,
  buildStoryConceptPrompt,
  buildStoryConceptSystemPrompt,
  buildScienceOfReadingCriticPrompt,
  criticVerdictJsonSchema,
  computeBitcoinBeatTargets,
  runDeterministicBeatChecks,
  runDeterministicStoryChecks,
  schemaNames,
  storyConceptJsonSchema,
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
type CriticIssueTier = CriticVerdict["issues"][number]["tier"];

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
  softIssues: string[];
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
  generateStoryConcept(
    context: StoryContext
  ): Promise<{ concept: StoryConcept; meta: LlmMetadata }>;
  generateBeatSheet(
    context: StoryContext,
    concept: StoryConcept
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }>;
  reviseBeatSheet(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    rewriteInstructions: string
  ): Promise<{ beatSheet: BeatSheet; meta: LlmMetadata }>;
  draftPages(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    rewriteInstructions?: string
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }>;
  critic(
    context: StoryContext,
    concept: StoryConcept,
    story: StoryPackage
  ): Promise<{ verdict: StoryCriticVerdict; meta: LlmMetadata }>;
}

const earningOptionSchema = z.object({
  label: z.string().min(1),
  action: z.string().min(1),
  sceneLocation: z.string().min(1)
});

const storyConceptSchema: z.ZodType<StoryConcept> = z.object({
  premise: z.string().min(1),
  caregiverLabel: z.enum(["Mom", "Dad"]),
  targetItem: z.string().min(1),
  targetPrice: z.number().int().min(1).max(500),
  startingAmount: z.number().int().min(0).max(500),
  gapAmount: z.number().int().min(1).max(500),
  earningOptions: z.tuple([earningOptionSchema, earningOptionSchema]),
  temptation: z.string().min(1),
  deadlineEvent: z.string().min(1).nullable(),
  bitcoinBridge: z.string().min(1),
  requiredSetups: z.array(z.string().min(1)).min(2).max(12),
  requiredPayoffs: z.array(z.string().min(1)).min(2).max(12),
  forbiddenLateIntroductions: z.array(z.string().min(1)).min(1).max(12)
});

const plannedBeatSchema = z.object({
  purpose: z.string().min(1),
  conflict: z.string().min(1),
  sceneLocation: z.string().min(1),
  sceneId: z.string().min(1),
  sceneVisualDescription: z.string().min(1),
  emotionalTarget: z.string().min(1),
  pageIndexEstimate: z.number().int().min(0).max(40),
  decodabilityTags: z.array(z.string().min(1)).min(1).max(16),
  newWordsIntroduced: z.array(z.string().min(1)).min(0).max(8),
  bitcoinRelevanceScore: z.number().min(0).max(1),
  introduces: z.array(z.string().min(1)).max(8),
  paysOff: z.array(z.string().min(1)).max(8),
  continuityFacts: z.array(z.string().min(1)).min(1).max(12)
});

const beatSheetSchema = z.object({
  beats: z.array(plannedBeatSchema).min(4).max(32)
});

const storyPageSchema = z.object({
  pageIndex: z.number().int().min(0),
  pageText: z.string().min(1),
  illustrationBrief: z.string().min(1),
  sceneId: z.string().min(1),
  sceneVisualDescription: z.string().min(1),
  newWordsIntroduced: z.array(z.string().min(1)),
  repetitionTargets: z.array(z.string().min(1))
});

const storyPackageSchema = z.object({
  title: z.string().min(1),
  concept: storyConceptSchema,
  beats: z.array(plannedBeatSchema).min(4).max(32),
  pages: z.array(storyPageSchema).min(4).max(32)
});

const beatCriticSchema = z.object({
  pass: z.boolean(),
  issues: z.array(
    z.object({
      beatIndex: z.number().int().min(0).max(40),
      problem: z.string().min(1),
      tier: z.enum(["hard", "soft"]),
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
  const normalizedTier = (issue: unknown): "hard" | "soft" => {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
      return "hard";
    }

    const issueRecord = issue as Record<string, unknown>;
    if (issueRecord.tier === "hard" || issueRecord.tier === "soft") {
      return issueRecord.tier;
    }

    return issueRecord.severity === "high" ? "hard" : "soft";
  };
  return {
    ...record,
    pass: normalizedPass,
    issues: normalizedIssues.map((issue) => ({
      ...(issue as Record<string, unknown>),
      tier: normalizedTier(issue)
    })),
    rewriteInstructions:
      typeof record.rewriteInstructions === "string" ? record.rewriteInstructions : ""
  };
}, beatCriticSchema);

const storyCriticIssueSchema = z.object({
  pageStart: z.number().int().min(0).max(40),
  pageEnd: z.number().int().min(0).max(40),
  issueType: z.enum([
    "count_sequence",
    "caregiver_consistency",
    "setup_payoff",
    "action_continuity",
    "age_plausibility",
    "theme_integration",
    "bitcoin_fit",
    "reading_level"
  ]),
  severity: z.enum(["hard", "soft"]),
  rewriteTarget: z.enum(["concept", "beat", "page"]),
  evidence: z.string().min(1),
  suggestedFix: z.string().min(1)
});

const storyCriticSchema = z.object({
  ok: z.boolean(),
  issues: z.array(storyCriticIssueSchema),
  rewriteInstructions: z.string()
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

function formatCriticIssue(
  critic: BeatCriticName,
  issue: CriticVerdict["issues"][number]
): string {
  return `[${critic}] beat ${issue.beatIndex}: ${issue.problem}`;
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
    const key = `${issue.beatIndex}:${issue.tier}:${issue.problem.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const hardIssues = dedupedIssues.filter((issue) => issue.tier === "hard").slice(0, 2);
  const softIssues = dedupedIssues.filter((issue) => issue.tier === "soft").slice(0, 2);
  const cappedIssues = [...hardIssues, ...softIssues];

  return {
    pass: hardIssues.length === 0,
    issues: cappedIssues,
    rewriteInstructions: verdict.rewriteInstructions.trim()
  };
}

function normalizeStoryCriticVerdict(verdict: StoryCriticVerdict): StoryCriticVerdict {
  const seen = new Set<string>();
  const dedupedIssues = verdict.issues.filter((issue) => {
    const key = [
      issue.pageStart,
      issue.pageEnd,
      issue.issueType,
      issue.severity,
      issue.rewriteTarget,
      issue.evidence.trim().toLowerCase()
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const hardIssues = dedupedIssues.filter((issue) => issue.severity === "hard").slice(0, 4);
  const softIssues = dedupedIssues.filter((issue) => issue.severity === "soft").slice(0, 4);
  const cappedIssues = [...hardIssues, ...softIssues];

  return {
    ok: hardIssues.length === 0,
    issues: cappedIssues,
    rewriteInstructions: verdict.rewriteInstructions.trim()
  };
}

function normalizeStoryConcept(concept: StoryConcept): StoryConcept {
  const targetPrice = Math.max(1, Math.round(concept.targetPrice));
  const startingAmount = Math.max(0, Math.round(concept.startingAmount));
  const gapAmount = Math.max(1, targetPrice - startingAmount);

  return {
    ...concept,
    targetPrice,
    startingAmount,
    gapAmount
  };
}

function inferStoryIssueType(
  message: string
): StoryCriticVerdict["issues"][number]["issueType"] {
  const lowered = message.toLowerCase();
  if (lowered.includes("count")) {
    return "count_sequence";
  }
  if (lowered.includes("caregiver") || lowered.includes("mom") || lowered.includes("dad") || lowered.includes("grown-up")) {
    return "caregiver_consistency";
  }
  if (lowered.includes("bitcoin")) {
    return "bitcoin_fit";
  }
  if (lowered.includes("late") || lowered.includes("introduc") || lowered.includes("deadline")) {
    return "setup_payoff";
  }
  if (lowered.includes("continuity") || lowered.includes("option") || lowered.includes("forbidden term")) {
    return "action_continuity";
  }
  if (lowered.includes("read") || lowered.includes("decod")) {
    return "reading_level";
  }
  return "theme_integration";
}

function hardCriticIssues(verdict: CriticVerdict): CriticVerdict["issues"] {
  return verdict.issues.filter((issue) => issue.tier === "hard");
}

function collectBeatPlanningIssueSummary(
  attempt: BeatPlanningAttempt,
  options: { narrativeFreshnessAdvisory?: boolean } = {}
): { hard: string[]; soft: string[] } {
  const hard = attempt.deterministic.issues.map((issue) => issue.message);
  const soft: string[] = [];

  for (const critic of attempt.critics) {
    for (const issue of critic.verdict.issues) {
      const formatted = formatCriticIssue(critic.critic, issue);
      if (
        issue.tier === "soft" ||
        (options.narrativeFreshnessAdvisory && critic.critic === "narrative_freshness")
      ) {
        soft.push(formatted);
        continue;
      }

      hard.push(formatted);
    }
  }

  return {
    hard: Array.from(new Set(hard)),
    soft: Array.from(new Set(soft))
  };
}

function buildRewriteInstructions(
  attempt: BeatPlanningAttempt,
  bitcoinTargets: BitcoinBeatTargets,
  context: StoryContext
): string {
  const earlyReader =
    context.profile === "early_decoder_5_7" || (context.ageYears >= 5 && context.ageYears <= 7);
  const youngPictureBookProfile =
    context.profile === "read_aloud_3_4" ||
    context.profile === "early_decoder_5_7" ||
    context.ageYears <= 7;
  const finalTwentyPercentIndex = Math.floor(context.pageCount * 0.8);
  const failingCritics = attempt.critics.filter((critic) => hardCriticIssues(critic.verdict).length > 0);
  const deterministicLines = attempt.deterministic.issues.map(
    (issue) =>
      `- Deterministic (${issue.code})${issue.beatIndex !== undefined ? ` beat ${issue.beatIndex}` : ""}: ${issue.message}`
  );
  const criticLines = failingCritics.flatMap((critic) =>
    hardCriticIssues(critic.verdict).map(
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
    ...(youngPictureBookProfile
      ? [
          "- 3-7 profile guardrails:",
          "- Keep the child's decisive actions physical and observable: count coins, save, wait, choose, earn, compare prices, or buy a smaller item.",
          "- Do not use device-first or fintech-first plot mechanics such as tablet, app, digital jar, wallet, password, transfer, QR code, blockchain, or chart.",
          "- Do not make Bitcoin the child's decoding target or a newWordsIntroduced item unless a validator explicitly requires it.",
          "- If Bitcoin appears, keep it to one brief adult/caregiver aside in the final beats while the child-facing language stays concrete.",
          "- Use exact, countable price-change examples instead of supply-shock, market, scarcity, or volatility explanations."
        ]
      : []),
    "Global rewrite guidance:",
    ...instructionLines,
    "Preserve non-flagged beats unless changes are required by global constraints."
  ].join("\n");
}

class MockLlmProvider implements LlmProvider {
  async generateStoryConcept(
    context: StoryContext
  ): Promise<{ concept: StoryConcept; meta: LlmMetadata }> {
    const targetPrice = 12;
    const startingAmount = 7;
    return {
      concept: {
        premise: `${context.childFirstName} wants a special item and must decide how to save for it.`,
        caregiverLabel: "Mom",
        targetItem: `${context.interests[0] ?? "special"} ball`,
        targetPrice,
        startingAmount,
        gapAmount: targetPrice - startingAmount,
        earningOptions: [
          {
            label: "rake leaves",
            action: "rake leaves in the yard with a small rake",
            sceneLocation: "yard"
          },
          {
            label: "help bake cookies",
            action: "help bake cookies in the kitchen",
            sceneLocation: "kitchen"
          }
        ],
        temptation: "a small sweet from the store",
        deadlineEvent: "Saturday game",
        bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Ava's jar choice.",
        requiredSetups: ["price tag", "coin jar", "Saturday game"],
        requiredPayoffs: ["reach the target price", "buy the item", "feel proud about saving"],
        forbiddenLateIntroductions: ["tournament", "sale", "third chore"]
      },
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }

  async generateBeatSheet(
    context: StoryContext,
    concept: StoryConcept
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }> {
    const beatSheet: BeatSheet = {
      beats: Array.from({ length: context.pageCount }, (_, idx) => {
        const sceneNumber = Math.floor(idx / 2) + 1;
        const sceneId = `scene_${sceneNumber}`;
        const sceneVisualDescription =
          idx < context.pageCount - 2
            ? `Warm watercolor view of ${context.childFirstName} in ${context.interests[0] ?? "home"}, with clear white paper breathing room and familiar props.`
            : `Warm watercolor evening scene where ${context.childFirstName} sees the payoff of careful saving with calm family support.`;

        return {
          purpose:
            idx < context.pageCount - 2
              ? `Setup/test beat ${idx + 1}`
              : `Resolution beat ${idx + 1}`,
          conflict:
            idx < context.pageCount - 2
              ? `${context.childFirstName} faces changing prices in daily life.`
              : `${context.childFirstName} applies a long-term saving tool with confidence.`,
          sceneLocation: context.interests[0] ?? "home",
          sceneId,
          sceneVisualDescription,
          emotionalTarget: idx < context.pageCount - 2 ? "curious then determined" : "relieved and proud",
          pageIndexEstimate: idx,
          decodabilityTags: ["controlled_vocab", "repetition", "taught_words_late"],
          newWordsIntroduced: ["save"],
          bitcoinRelevanceScore: idx >= context.pageCount - 2 ? 0.85 : 0.2,
          introduces: idx === 0 ? concept.requiredSetups.slice(0, 2) : [],
          paysOff: idx === context.pageCount - 1 ? concept.requiredPayoffs.slice(0, 2) : [],
          continuityFacts: [
            `caregiver_label:${concept.caregiverLabel}`,
            `deadline_event:${concept.deadlineEvent ?? "null"}`,
            "forbid_term:grown-up",
            ...(idx === 1 ? [`count_target:${concept.targetPrice}`] : []),
            ...(idx === 3 ? [`chosen_earning_option:${concept.earningOptions[0].label}`] : []),
            ...(idx >= context.pageCount - 2 ? ["bitcoin_bridge_required:true"] : ["bitcoin_bridge_required:false"])
          ]
        };
      })
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
        finalIssues: deterministic.issues.map((issue) => issue.message),
        softIssues: []
      },
      meta: {
        provider: "mock",
        model: "mock-llm",
        latencyMs: 0,
        usage: null
      }
    };
  }

  async reviseBeatSheet(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    _rewriteInstructions: string
  ): Promise<{ beatSheet: BeatSheet; meta: LlmMetadata }> {
    return {
      beatSheet,
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
    concept: StoryConcept,
    beatSheet: BeatSheet
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const pages = beatSheet.beats.map((beat, idx) => ({
      pageIndex: idx,
      pageText:
        idx < beatSheet.beats.length - 2
          ? `${context.childFirstName} saves for the ${concept.targetItem} and keeps going.`
          : `${concept.caregiverLabel} says, "${concept.bitcoinBridge}"`,
      illustrationBrief: `Calm watercolor scene for ${context.childFirstName}, page ${idx + 1}`,
      sceneId: beat.sceneId,
      sceneVisualDescription: beat.sceneVisualDescription,
      newWordsIntroduced: beat.newWordsIntroduced,
      repetitionTargets: ["save", "plan"]
    }));

    return {
      story: {
        title: `${context.childFirstName}'s Bitcoin Adventure`,
        concept,
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
    concept: StoryConcept,
    story: StoryPackage
  ): Promise<{ verdict: StoryCriticVerdict; meta: LlmMetadata }> {
    const quality = runDeterministicStoryChecks(
      context.profile,
      story,
      concept,
      boolFromEnv("ENABLE_STRICT_DECODABLE_CHECKS", true)
    );

    return {
      verdict: {
        ok: quality.ok,
        issues: quality.issues.map((issue) => ({
          pageStart: 0,
          pageEnd: 0,
          issueType: "theme_integration",
          severity: "hard",
          rewriteTarget: "page",
          evidence: issue,
          suggestedFix: issue
        })),
        rewriteInstructions: quality.issues.join(" | ")
      },
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

  async generateStoryConcept(
    context: StoryContext
  ): Promise<{ concept: StoryConcept; meta: LlmMetadata }> {
    const concept = await this.callWithFallbackStructured<StoryConcept>({
      stage: "story_concept",
      prompt: buildStoryConceptPrompt(context, context.pageCount),
      systemPrompt: buildStoryConceptSystemPrompt(),
      schemaName: schemaNames.storyConcept,
      jsonSchema: storyConceptJsonSchema,
      parser: storyConceptSchema,
      maxTokens: 1400
    });

    return {
      concept: normalizeStoryConcept(concept.data),
      meta: concept.meta
    };
  }

  async generateBeatSheet(
    context: StoryContext,
    concept: StoryConcept
  ): Promise<{ beatSheet: BeatSheet; audit: BeatPlanningAudit; meta: LlmMetadata }> {
    const bitcoinTargets = computeBitcoinBeatTargets(context.pageCount);
    const plannerSystemPrompt = buildBeatPlannerSystemPrompt();
    const plannerPrompt = buildBeatPlannerPrompt(context, concept, context.pageCount, bitcoinTargets);

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
      const critics = await this.runBeatCritics(context, concept, currentBeatSheet);

      attempts.push({ attempt, deterministic, critics });

      const issueSummary = collectBeatPlanningIssueSummary(attempts[attempt], {
        narrativeFreshnessAdvisory: attempt === MAX_BEAT_REWRITES
      });

      if (issueSummary.hard.length === 0) {
        return {
          beatSheet: currentBeatSheet,
          audit: {
            attempts,
            rewritesApplied: attempt,
            passed: true,
            finalIssues: [],
            softIssues: issueSummary.soft
          },
          meta: latestMeta
        };
      }

      if (attempt === MAX_BEAT_REWRITES) {
        const latestAttempt = attempts[attempt] ?? attempts[attempts.length - 1];
        const finalIssueSummary = collectBeatPlanningIssueSummary(latestAttempt, {
          narrativeFreshnessAdvisory: true
        });
        const finalIssues = finalIssueSummary.hard;
        throw new BeatPlanningError(
          `Beat planning failed validation after rewrites: ${finalIssues.join(" | ")}`,
          currentBeatSheet,
          {
            attempts,
            rewritesApplied: attempt,
            passed: false,
            finalIssues,
            softIssues: finalIssueSummary.soft
          },
          latestMeta
        );
      }

      const rewritePrompt = buildBeatRewritePrompt(
        context,
        JSON.stringify(concept),
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

  async reviseBeatSheet(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    rewriteInstructions: string
  ): Promise<{ beatSheet: BeatSheet; meta: LlmMetadata }> {
    const bitcoinTargets = computeBitcoinBeatTargets(context.pageCount);
    const rewrite = await this.callWithFallbackStructured<BeatSheet>({
      stage: "beat_rewrite",
      prompt: buildBeatRewritePrompt(
        context,
        JSON.stringify(concept),
        JSON.stringify(beatSheet),
        rewriteInstructions,
        bitcoinTargets
      ),
      systemPrompt: "You rewrite beat sheets precisely according to provided instructions.",
      schemaName: schemaNames.beatSheet,
      jsonSchema: beatSheetJsonSchema,
      parser: beatSheetSchema,
      maxTokens: 2200
    });

    const revisedBeatSheet = normalizeBeatSheetToPageCount(rewrite.data, context.pageCount);
    const deterministic = runDeterministicBeatChecks(
      {
        profile: context.profile,
        ageYears: context.ageYears,
        pageCount: context.pageCount
      },
      revisedBeatSheet
    );
    const critics = await this.runBeatCritics(context, concept, revisedBeatSheet);
    const issueSummary = collectBeatPlanningIssueSummary({
      attempt: 0,
      deterministic,
      critics
    });

    if (issueSummary.hard.length > 0) {
      throw new BeatPlanningError(
        `Beat planning failed validation after story-level rewrite: ${issueSummary.hard.join(" | ")}`,
        revisedBeatSheet,
        {
          attempts: [{ attempt: 0, deterministic, critics }],
          rewritesApplied: 1,
          passed: false,
          finalIssues: issueSummary.hard,
          softIssues: issueSummary.soft
        },
        rewrite.meta
      );
    }

    return {
      beatSheet: revisedBeatSheet,
      meta: rewrite.meta
    };
  }

  async draftPages(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    rewriteInstructions = ""
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const prompt = buildPageWriterPrompt(context, concept, beatSheet, context.pageCount, rewriteInstructions);
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
      concept,
      beats: validated.beats.slice(0, context.pageCount),
      pages: validated.pages
        .sort((a, b) => a.pageIndex - b.pageIndex)
        .slice(0, context.pageCount)
        .map((page, idx) => ({
          pageIndex: idx,
          pageText: page.pageText,
          illustrationBrief: page.illustrationBrief,
          sceneId: page.sceneId,
          sceneVisualDescription: page.sceneVisualDescription,
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
    concept: StoryConcept,
    story: StoryPackage
  ): Promise<{ verdict: StoryCriticVerdict; meta: LlmMetadata }> {
    const prompt = buildCriticPrompt(context, concept, JSON.stringify(story));
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
      story,
      concept,
      boolFromEnv("ENABLE_STRICT_DECODABLE_CHECKS", true)
    );
    const deterministicIssues = deterministic.issues.map((issue) => ({
      pageStart: 0,
      pageEnd: 0,
      issueType: inferStoryIssueType(issue),
      severity: "hard" as const,
      rewriteTarget:
        inferStoryIssueType(issue) === "setup_payoff" ? ("beat" as const) : ("page" as const),
      evidence: issue,
      suggestedFix: issue
    }));
    const normalizedVerdict = normalizeStoryCriticVerdict({
      ok: result.data.ok,
      issues: [...result.data.issues, ...deterministicIssues],
      rewriteInstructions: result.data.rewriteInstructions
    });

    return {
      verdict: normalizedVerdict,
      meta: result.meta
    };
  }

  private async runBeatCritics(
    context: StoryContext,
    concept: StoryConcept,
    beatSheet: BeatSheet
  ): Promise<BeatCriticAudit[]> {
    const beatSheetJson = JSON.stringify(beatSheet);
    const conceptJson = JSON.stringify(concept);

    const critics: Array<{
      critic: BeatCriticName;
      stage: string;
      prompt: string;
    }> = [
      {
        critic: "montessori",
        stage: "beat_critic_montessori",
        prompt: buildMontessoriCriticPrompt(context, conceptJson, beatSheetJson)
      },
      {
        critic: "science_of_reading",
        stage: "beat_critic_sor",
        prompt: buildScienceOfReadingCriticPrompt(context, conceptJson, beatSheetJson)
      },
      {
        critic: "narrative_freshness",
        stage: "beat_critic_narrative",
        prompt: buildNarrativeFreshnessCriticPrompt(context, conceptJson, beatSheetJson)
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
