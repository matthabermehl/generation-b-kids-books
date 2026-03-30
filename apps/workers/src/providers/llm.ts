import type {
  BeatSheet,
  MoneyLessonKey,
  ReadingProfile,
  StoryConcept,
  StoryDraftOptions,
  StoryCriticVerdict,
  StoryPackage
} from "@book/domain";
import {
  buildBitcoinStoryBridgeText,
  buildBitcoinStoryFallbackTitle,
  getMoneyLessonDefinition,
  resolveBitcoinStoryPolicy,
  storyConceptCountTarget,
  storyConceptDeadlineEvent,
  storyConceptEarningOptionLabels,
  storyConceptHighlightLabels
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
  runDeterministicBeatChecks,
  runDeterministicStoryChecks,
  schemaNames,
  storyConceptJsonSchema,
  storyCriticVerdictJsonSchema,
  storyPackageJsonSchema,
  type BeatDeterministicSummary,
  type CriticVerdict,
  type DeterministicStoryIssue
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
    options?: StoryDraftOptions
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

const storyLessonScenarioSchema = z.discriminatedUnion("moneyLessonKey", [
  z.object({
    moneyLessonKey: z.literal("prices_change"),
    anchorItem: z.string().min(1),
    beforePrice: z.number().int().min(1).max(500),
    afterPrice: z.number().int().min(1).max(500),
    purchaseUnit: z.string().min(1),
    countableComparison: z.string().min(1),
    noticingMoment: z.string().min(1),
    deadlineEvent: z.string().min(1).nullable()
  }),
  z.object({
    moneyLessonKey: z.literal("jar_saving_limits"),
    targetItem: z.string().min(1),
    targetPrice: z.number().int().min(1).max(500),
    startingAmount: z.number().int().min(0).max(500),
    gapAmount: z.number().int().min(1).max(500),
    earningOptions: z.tuple([earningOptionSchema, earningOptionSchema]),
    temptation: z.string().min(1),
    deadlineEvent: z.string().min(1).nullable()
  }),
  z.object({
    moneyLessonKey: z.literal("new_money_unfair"),
    gameName: z.string().min(1),
    tokenName: z.string().min(1),
    childGoal: z.string().min(1),
    ruleDisruption: z.string().min(1),
    fairnessRepair: z.string().min(1),
    deadlineEvent: z.string().min(1).nullable()
  }),
  z.object({
    moneyLessonKey: z.literal("keep_what_you_earn"),
    workAction: z.string().min(1),
    earnedReward: z.string().min(1),
    rewardUse: z.string().min(1),
    unfairLossRisk: z.string().min(1),
    deadlineEvent: z.string().min(1).nullable()
  }),
  z.object({
    moneyLessonKey: z.literal("better_rules"),
    gameName: z.string().min(1),
    brokenRule: z.string().min(1),
    fairRule: z.string().min(1),
    sharedGoal: z.string().min(1),
    deadlineEvent: z.string().min(1).nullable()
  })
]);

const storyConceptSchema: z.ZodType<StoryConcept> = z.object({
  premise: z.string().min(1),
  caregiverLabel: z.enum(["Mom", "Dad"]),
  bitcoinBridge: z.string().min(1),
  emotionalPromise: z.string().min(1),
  caregiverWarmthMoment: z.string().min(1),
  bitcoinValueThread: z.string().min(1),
  requiredSetups: z.array(z.string().min(1)).min(2).max(12),
  requiredPayoffs: z.array(z.string().min(1)).min(2).max(12),
  forbiddenLateIntroductions: z.array(z.string().min(1)).min(1).max(12),
  lessonScenario: storyLessonScenarioSchema
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
    "reading_level",
    "emotional_tone",
    "caregiver_warmth",
    "ending_emotion"
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
  const normalizedSchemaName = schemaName.replace(/[^a-z0-9]/gi, "").toLowerCase();

  while (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    if (seen.has(candidate)) {
      break;
    }
    seen.add(candidate);

    const record = candidate as Record<string, unknown>;
    const wrappedSchemaKey = Object.keys(record).find(
      (key) => key.replace(/[^a-z0-9]/gi, "").toLowerCase() === normalizedSchemaName
    );
    if (wrappedSchemaKey && record[wrappedSchemaKey] !== undefined) {
      candidate = record[wrappedSchemaKey];
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
    if (schemaName === schemaNames.beatSheet) {
      const values = Object.values(record);
      if (Object.keys(record).length === 1 && values.length === 1) {
        const [onlyValue] = values;
        if (Array.isArray(onlyValue)) {
          return { beats: onlyValue };
        }
        if (onlyValue && typeof onlyValue === "object") {
          candidate = onlyValue;
          continue;
        }
      }
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

interface StructuredMessage {
  role: "user" | "assistant";
  content: string;
}

function deterministicIssueToStoryCriticIssue(
  issue: DeterministicStoryIssue
): StoryCriticVerdict["issues"][number] {
  return {
    pageStart: issue.pageStart,
    pageEnd: issue.pageEnd,
    issueType: issue.issueType,
    severity: issue.severity,
    rewriteTarget: issue.rewriteTarget,
    evidence: issue.message,
    suggestedFix: issue.message
  };
}

function pageRangeLabel(issue: StoryCriticVerdict["issues"][number], pageCount: number): string {
  if (issue.pageStart === 0 && issue.pageEnd === Math.max(0, pageCount - 1)) {
    return "whole story";
  }

  return issue.pageStart === issue.pageEnd
    ? `page ${issue.pageStart}`
    : `pages ${issue.pageStart}-${issue.pageEnd}`;
}

function fallbackStoryRewriteInstructions(
  context: StoryContext,
  verdict: StoryCriticVerdict
): string {
  const hardIssues = verdict.issues.filter((issue) => issue.severity === "hard");
  if (hardIssues.length === 0) {
    return "";
  }

  const profileLines =
    context.profile === "read_aloud_3_4"
      ? [
          "- Rewrite flagged pages so each page has 4 sentences or fewer.",
          "- Prefer 2-3 short bedtime-readable sentences and combine clipped observations instead of adding more sentence breaks.",
          "- If a flagged page uses quoted dialogue, keep it to one short quoted sentence plus narration instead of a long explanatory speech.",
          "- Move explanatory content off a flagged page when that preserves the bedtime rhythm better than squeezing it into the same spread."
        ]
      : context.profile === "early_decoder_5_7"
        ? [
            "- Rewrite flagged pages so each page has 45 words or fewer.",
            "- Keep sentences short and decodable, with very long words used sparingly."
          ]
        : [];

  if (context.profile === "read_aloud_3_4" && context.lesson === "better_rules" && context.pageCount >= 2) {
    profileLines.push(
      `- For better_rules read-aloud stories, place the clearest explicit Bitcoin bridge by page ${context.pageCount - 2}.`,
      `- Keep page ${context.pageCount - 1} for calm emotional closure only: togetherness, safety, calm pride, or relief.`
    );
  }

  const issueLines = hardIssues.map((issue) => {
    const fix = issue.suggestedFix.trim().length > 0 ? issue.suggestedFix.trim() : issue.evidence.trim();
    const rangeLabel = pageRangeLabel(issue, context.pageCount);

    if (
      context.profile === "read_aloud_3_4" &&
      issue.issueType === "reading_level" &&
      issue.pageStart === context.pageCount - 1 &&
      issue.pageEnd === context.pageCount - 1
    ) {
      return `- ${rangeLabel} (${issue.issueType}): ${fix} Move conceptual explanation to page ${Math.max(
        0,
        context.pageCount - 2
      )} and keep the final page to 2-3 short emotional-closing sentences.`;
    }

    return `- ${rangeLabel} (${issue.issueType}): ${fix}`;
  });

  return [...profileLines, ...issueLines].join("\n");
}

function buildStoryRewriteFeedbackMessage(
  context: StoryContext,
  verdict: StoryCriticVerdict
): string {
  const hardIssues = verdict.issues.filter((issue) => issue.severity === "hard");
  const softIssues = verdict.issues.filter((issue) => issue.severity === "soft");
  const fallbackInstructions = fallbackStoryRewriteInstructions(context, verdict);
  const rewriteInstructions =
    verdict.rewriteInstructions.trim().length > 0 ? verdict.rewriteInstructions.trim() : fallbackInstructions;

  return [
    "The critic rejected the previous draft. Rewrite the story so it satisfies the critic while preserving the parts that already work.",
    "Prior critic verdict JSON:",
    JSON.stringify(verdict),
    "",
    "Rewrite priorities:",
    `- Hard issues to fix first: ${hardIssues.length}.`,
    `- Soft issues to improve when possible: ${softIssues.length}.`,
    ...(rewriteInstructions
      ? [
          "- Apply these rewrite instructions exactly:",
          rewriteInstructions
        ]
      : []),
    "- Preserve the story concept, reading level, and any valid continuity that was not criticized.",
    "- Do not answer with commentary. Return a full revised StoryPackage JSON only."
  ].join("\n");
}

function buildStoryDraftMessages(
  context: StoryContext,
  concept: StoryConcept,
  beatSheet: BeatSheet,
  options?: StoryDraftOptions
): StructuredMessage[] {
  const messages: StructuredMessage[] = [
    {
      role: "user",
      content: buildPageWriterPrompt(context, concept, beatSheet, context.pageCount)
    }
  ];

  for (const turn of options?.rewriteHistory ?? []) {
    messages.push({
      role: "assistant",
      content: JSON.stringify(turn.story)
    });
    messages.push({
      role: "user",
      content: buildStoryRewriteFeedbackMessage(context, turn.criticVerdict)
    });
  }

  if ((options?.rewriteHistory?.length ?? 0) === 0 && options?.rewriteInstructions?.trim()) {
    messages.push({
      role: "user",
      content: [
        "Revise the story to satisfy these rewrite instructions while preserving the valid parts of the existing brief:",
        options.rewriteInstructions
      ].join("\n")
    });
  }

  return messages;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickStringField(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
  fallback: string
): string {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return fallback;
}

function pickNullableStringField(
  sources: Array<Record<string, unknown> | null>,
  keys: string[]
): string | null {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
}

function pickIntegerField(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
  fallback: number,
  minimum: number,
  maximum: number
): number {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      const numericValue =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim().length > 0
            ? Number(value)
            : Number.NaN;
      if (Number.isFinite(numericValue)) {
        return Math.max(minimum, Math.min(maximum, Math.round(numericValue)));
      }
    }
  }

  return Math.max(minimum, Math.min(maximum, Math.round(fallback)));
}

function capitalizeWord(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function defaultEarningOptions(context: StoryContext) {
  const primaryInterest = context.interests[0] ?? "garden";
  const secondaryInterest = context.interests[1] ?? "kitchen";

  return [
    {
      label: `help with ${primaryInterest}`,
      action: `help with a ${primaryInterest} job`,
      sceneLocation: primaryInterest
    },
    {
      label: `help at ${secondaryInterest}`,
      action: `do a careful family job at ${secondaryInterest}`,
      sceneLocation: secondaryInterest
    }
  ] as const;
}

function normalizeEarningOptions(
  value: unknown,
  context: StoryContext
): readonly [{ label: string; action: string; sceneLocation: string }, { label: string; action: string; sceneLocation: string }] {
  const defaults = defaultEarningOptions(context);

  if (!Array.isArray(value)) {
    return defaults;
  }

  const normalized = value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const label = typeof record.label === "string" ? record.label.trim() : "";
      const action = typeof record.action === "string" ? record.action.trim() : "";
      const sceneLocation = typeof record.sceneLocation === "string" ? record.sceneLocation.trim() : "";
      if (!label || !action || !sceneLocation) {
        return null;
      }

      return { label, action, sceneLocation };
    })
    .filter((entry): entry is { label: string; action: string; sceneLocation: string } => entry !== null)
    .slice(0, 2);

  if (normalized.length === 2) {
    return [normalized[0], normalized[1]] as const;
  }
  if (normalized.length === 1) {
    return [normalized[0], defaults[1]] as const;
  }

  return defaults;
}

function normalizeCaregiverLabel(value: unknown): "Mom" | "Dad" {
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "dad" || lowered === "father" || lowered === "papa") {
      return "Dad";
    }
  }

  return "Mom";
}

function normalizeLessonScenarioInput(
  lessonScenario: unknown,
  rawConcept: Record<string, unknown>,
  context: StoryContext
): StoryConcept["lessonScenario"] | unknown {
  const scenarioRecord = asRecord(lessonScenario);
  const sources = [scenarioRecord, rawConcept];
  const primaryInterest = context.interests[0] ?? "play";
  const topicName = capitalizeWord(primaryInterest);

  const lessonKey =
    pickStringField(
      [scenarioRecord],
      ["moneyLessonKey"],
      typeof lessonScenario === "string" ? lessonScenario : context.lesson
    ) as MoneyLessonKey;

  switch (lessonKey) {
    case "prices_change": {
      const beforePrice = pickIntegerField(sources, ["beforePrice"], 3, 1, 500);
      const afterPrice = Math.max(
        beforePrice + 1,
        pickIntegerField(sources, ["afterPrice"], beforePrice + 2, 1, 500)
      );
      return {
        moneyLessonKey: "prices_change",
        anchorItem: pickStringField(sources, ["anchorItem", "targetItem"], `${primaryInterest} treat`),
        beforePrice,
        afterPrice,
        purchaseUnit: pickStringField(sources, ["purchaseUnit"], "coins"),
        countableComparison: pickStringField(sources, ["countableComparison"], "one instead of two"),
        noticingMoment: pickStringField(
          sources,
          ["noticingMoment"],
          `${context.childFirstName} notices the same coins do less than before.`
        ),
        deadlineEvent: pickNullableStringField(sources, ["deadlineEvent"])
      };
    }
    case "new_money_unfair": {
      const tokenName = pickStringField(sources, ["tokenName"], "gold tokens");
      return {
        moneyLessonKey: "new_money_unfair",
        gameName: pickStringField(sources, ["gameName"], `${topicName} Game`),
        tokenName,
        childGoal: pickStringField(sources, ["childGoal"], `earn enough ${tokenName} to reach the goal`),
        ruleDisruption: pickStringField(
          sources,
          ["ruleDisruption"],
          "new tokens suddenly appear for someone who did not earn them"
        ),
        fairnessRepair: pickStringField(
          sources,
          ["fairnessRepair"],
          "everyone goes back to the same shared earning rule"
        ),
        deadlineEvent: pickNullableStringField(sources, ["deadlineEvent"])
      };
    }
    case "keep_what_you_earn":
      return {
        moneyLessonKey: "keep_what_you_earn",
        workAction: pickStringField(sources, ["workAction"], `help with a ${primaryInterest} job`),
        earnedReward: pickStringField(sources, ["earnedReward"], `${primaryInterest} tickets`),
        rewardUse: pickStringField(sources, ["rewardUse"], `save for a ${primaryInterest} plan`),
        unfairLossRisk: pickStringField(
          sources,
          ["unfairLossRisk"],
          "the rules might take the reward away after the work is done"
        ),
        deadlineEvent: pickNullableStringField(sources, ["deadlineEvent"])
      };
    case "better_rules":
      return {
        moneyLessonKey: "better_rules",
        gameName: pickStringField(sources, ["gameName"], `${topicName} Game`),
        brokenRule: pickStringField(
          sources,
          ["brokenRule"],
          "one player keeps changing the rule in the middle of the game"
        ),
        fairRule: pickStringField(
          sources,
          ["fairRule"],
          "everyone follows the same rule from start to finish"
        ),
        sharedGoal: pickStringField(sources, ["sharedGoal"], "finish the game feeling it was fair"),
        deadlineEvent: pickNullableStringField(sources, ["deadlineEvent"])
      };
    case "jar_saving_limits":
    default: {
      const targetPrice = pickIntegerField(sources, ["targetPrice"], 12, 1, 500);
      const startingAmount = pickIntegerField(sources, ["startingAmount"], 5, 0, 500);
      return {
        moneyLessonKey: "jar_saving_limits",
        targetItem: pickStringField(sources, ["targetItem", "anchorItem"], `${primaryInterest} kit`),
        targetPrice,
        startingAmount,
        gapAmount: Math.max(
          1,
          pickIntegerField(sources, ["gapAmount"], targetPrice - startingAmount, 1, 500)
        ),
        earningOptions: normalizeEarningOptions(
          scenarioRecord?.earningOptions ?? rawConcept.earningOptions,
          context
        ),
        temptation: pickStringField(sources, ["temptation"], "small sticker"),
        deadlineEvent: pickNullableStringField(sources, ["deadlineEvent"])
      };
    }
  }
}

function storyConceptParser(context: StoryContext): z.ZodType<StoryConcept, z.ZodTypeDef, unknown> {
  return z.preprocess((raw) => {
    const record = asRecord(raw);
    if (!record) {
      return raw;
    }

    return {
      ...record,
      caregiverLabel: normalizeCaregiverLabel(record.caregiverLabel),
      lessonScenario: normalizeLessonScenarioInput(record.lessonScenario, record, context)
    };
  }, storyConceptSchema);
}

function normalizeStoryConcept(concept: StoryConcept): StoryConcept {
  if (concept.lessonScenario.moneyLessonKey !== "jar_saving_limits") {
    if (concept.lessonScenario.moneyLessonKey === "prices_change") {
      const beforePrice = Math.max(1, Math.round(concept.lessonScenario.beforePrice));
      const afterPrice = Math.max(beforePrice + 1, Math.round(concept.lessonScenario.afterPrice));
      return {
        ...concept,
        lessonScenario: {
          ...concept.lessonScenario,
          beforePrice,
          afterPrice
        }
      };
    }

    return concept;
  }

  const targetPrice = Math.max(1, Math.round(concept.lessonScenario.targetPrice));
  const startingAmount = Math.max(0, Math.round(concept.lessonScenario.startingAmount));
  const gapAmount = Math.max(1, targetPrice - startingAmount);

  return {
    ...concept,
    lessonScenario: {
      ...concept.lessonScenario,
      targetPrice,
      startingAmount,
      gapAmount
    }
  };
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
  context: StoryContext
): string {
  const policy = resolveBitcoinStoryPolicy({
    lesson: context.lesson,
    profile: context.profile,
    ageYears: context.ageYears,
    pageCount: context.pageCount
  });
  const earlyReader =
    context.profile === "early_decoder_5_7" || (context.ageYears >= 5 && context.ageYears <= 7);
  const youngPictureBookProfile =
    context.profile === "read_aloud_3_4" ||
    context.profile === "early_decoder_5_7" ||
    context.ageYears <= 7;
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
    "- Bitcoin policy constraints:",
    `- Ensure at least ${policy.minimumHighRelevanceBeats} beat${policy.minimumHighRelevanceBeats === 1 ? "" : "s"} clearly give Bitcoin positive thematic relevance to the story's value arc.`,
    "- Treat bitcoinRelevanceScore as thematic salience, not a late-stage quota.",
    `- ${policy.beatRewriteLine}`,
    ...(earlyReader
      ? [
          "- Science-of-Reading constraints:",
          "- Keep newWordsIntroduced length <= 2 for every beat.",
          "- Do not make Bitcoin a child-facing newWordsIntroduced item or decoding target.",
          "- Avoid abstract economic jargon unless rewritten into concrete child-level wording."
        ]
      : []),
    ...(youngPictureBookProfile
      ? [
          "- 3-7 profile guardrails:",
          ...policy.youngProfileGuardrails.slice(1)
        ]
      : []),
    "Global rewrite guidance:",
    ...instructionLines,
    "Preserve non-flagged beats unless changes are required by global constraints."
  ].join("\n");
}

function buildMockStoryConcept(context: StoryContext): StoryConcept {
  const lessonDefinition = getMoneyLessonDefinition(context.lesson);
  const firstInterest = context.interests[0] ?? "special";
  const baseConcept = {
    premise: `${context.childFirstName} lives through a small money moment that reveals ${lessonDefinition.label.toLowerCase()}.`,
    caregiverLabel: "Mom" as const,
    bitcoinBridge: buildBitcoinStoryBridgeText("Mom", context.lesson),
    emotionalPromise: `Move from uncertainty to understanding, then to ${lessonDefinition.emotionalArcTarget}.`,
    caregiverWarmthMoment: `Mom kneels beside ${context.childFirstName}, names the feeling, and offers a calm next step.`,
    bitcoinValueThread: lessonDefinition.bitcoinValueThread,
    requiredSetups: ["kitchen table talk", "careful noticing", "Mom's calm explanation"],
    requiredPayoffs: ["the child understands the money value", "the ending feels calm and proud"],
    forbiddenLateIntroductions: ["mystery grown-up rescue", "surprise gadget", "last-second rule change"]
  };

  switch (context.lesson) {
    case "prices_change":
      return {
        ...baseConcept,
        premise: `${context.childFirstName} notices that the same ${firstInterest} treat costs more than before and wants to understand why.`,
        requiredSetups: ["fruit stand sign", "three coins", "last week's memory"],
        requiredPayoffs: ["the child notices the price change clearly", "Mom connects the moment to patient money values"],
        forbiddenLateIntroductions: ["secret sale", "phone app", "grown-up market chart"],
        lessonScenario: {
          moneyLessonKey: "prices_change",
          anchorItem: `${firstInterest} snack`,
          beforePrice: 2,
          afterPrice: 3,
          purchaseUnit: "coins",
          countableComparison: "Three coins used to buy two snacks, and now three coins buy only one.",
          noticingMoment: "the neighborhood stand after playtime",
          deadlineEvent: "after-school stop"
        }
      };
    case "jar_saving_limits":
      return {
        ...baseConcept,
        premise: `${context.childFirstName} wants a ${firstInterest} set and learns that saving patiently needs more than letting coins sit still.`,
        requiredSetups: ["price tag", "coin jar", "Saturday plan"],
        requiredPayoffs: ["reach the target price", "feel proud about protecting effort"],
        forbiddenLateIntroductions: ["tournament", "sale", "third chore"],
        lessonScenario: {
          moneyLessonKey: "jar_saving_limits",
          targetItem: `${firstInterest} set`,
          targetPrice: 12,
          startingAmount: 7,
          gapAmount: 5,
          earningOptions: [
            {
              label: "rake leaves",
              action: "rake leaves in the yard with a small rake",
              sceneLocation: "yard"
            },
            {
              label: "help bake muffins",
              action: "help bake muffins in the kitchen",
              sceneLocation: "kitchen"
            }
          ],
          temptation: "a small sweet from the store",
          deadlineEvent: "Saturday outing"
        }
      };
    case "new_money_unfair":
      return {
        ...baseConcept,
        premise: `${context.childFirstName} joins a ticket game and feels confused when new tickets appear out of nowhere.`,
        requiredSetups: ["ticket game", "bell prize", "same starting tickets"],
        requiredPayoffs: ["the unfair feeling is named", "a calmer fair rule is understood"],
        forbiddenLateIntroductions: ["hidden bonus bucket", "surprise app", "new scoring gadget"],
        lessonScenario: {
          moneyLessonKey: "new_money_unfair",
          gameName: "ticket toss",
          tokenName: "blue tickets",
          childGoal: "ring the bell and choose the prize first",
          ruleDisruption: "extra blue tickets suddenly appear for other players halfway through the game",
          fairnessRepair: "Mom explains that fair games keep the ticket count steady for everyone",
          deadlineEvent: "before cleanup time"
        }
      };
    case "keep_what_you_earn":
      return {
        ...baseConcept,
        premise: `${context.childFirstName} works hard for a reward and feels why effort should still count at the end.`,
        requiredSetups: ["small job", "earned coins", "plan for the reward"],
        requiredPayoffs: ["the reward still feels meaningful", "the child's effort is respected"],
        forbiddenLateIntroductions: ["secret bonus", "surprise device", "new grown-up rule"],
        lessonScenario: {
          moneyLessonKey: "keep_what_you_earn",
          workAction: "help wash the family bikes",
          earnedReward: "four shiny coins",
          rewardUse: "save toward a bright helmet bell",
          unfairLossRisk: "new reward slips get handed out after the work is done and make the earned coins feel smaller",
          deadlineEvent: "before the evening ride"
        }
      };
    case "better_rules":
      return {
        ...baseConcept,
        premise: `${context.childFirstName} plays a favorite game and feels the difference between shifting rules and fair ones.`,
        requiredSetups: ["backyard game", "agreed starting rule", "shared goal"],
        requiredPayoffs: ["the fair rule becomes clear", "the group feels calmer under stable rules"],
        forbiddenLateIntroductions: ["secret referee app", "extra power-up", "last-second exception"],
        lessonScenario: {
          moneyLessonKey: "better_rules",
          gameName: "backyard marble race",
          brokenRule: "the finish line keeps moving after the race starts",
          fairRule: "the finish line stays fixed once everyone begins",
          sharedGoal: "everyone wants a fair chance to finish together",
          deadlineEvent: "before supper"
        }
      };
  }
}

function mockBitcoinBeatIndexes(context: StoryContext): number[] {
  if (context.pageCount <= 1) {
    return [0];
  }

  const indexes = new Set<number>();
  if (context.pageCount >= 4) {
    indexes.add(1);
    indexes.add(Math.max(1, context.pageCount - 2));
  } else if (context.pageCount === 3) {
    indexes.add(1);
  } else {
    indexes.add(0);
  }

  return Array.from(indexes).sort((left, right) => left - right);
}

function mockStoryConflict(context: StoryContext, concept: StoryConcept): string {
  const scenario = concept.lessonScenario;

  switch (scenario.moneyLessonKey) {
    case "prices_change":
      return `${context.childFirstName} notices the same ${scenario.anchorItem} costs more and feels unsure why.`;
    case "jar_saving_limits":
      return `${context.childFirstName} must choose between a now-treat and patient saving.`;
    case "new_money_unfair":
      return `${context.childFirstName} feels the game turn unfair when new ${scenario.tokenName} appear.`;
    case "keep_what_you_earn":
      return `${context.childFirstName} wants hard work to keep its meaning.`;
    case "better_rules":
      return `${context.childFirstName} feels frustrated when the rules change mid-game.`;
  }
}

function mockPageTextForBeat(context: StoryContext, concept: StoryConcept, idx: number, total: number): string {
  const highlight = storyConceptHighlightLabels(concept)[0] ?? "small family moment";
  const bitcoinBeatIndexes = new Set(mockBitcoinBeatIndexes(context));
  if (idx === total - 1) {
    return `${concept.caregiverLabel} held ${context.childFirstName} close. ${context.childFirstName} felt relieved, safe, and proud.`;
  }

  if (bitcoinBeatIndexes.has(idx)) {
    return `${concept.caregiverLabel} helped ${context.childFirstName} make sense of ${highlight}. ${concept.bitcoinBridge}`;
  }

  return `${context.childFirstName} noticed ${highlight} and took one small, steady step forward.`;
}

class MockLlmProvider implements LlmProvider {
  async generateStoryConcept(
    context: StoryContext
  ): Promise<{ concept: StoryConcept; meta: LlmMetadata }> {
    return {
      concept: buildMockStoryConcept(context),
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
    const deadlineEvent = storyConceptDeadlineEvent(concept);
    const countTarget = storyConceptCountTarget(concept);
    const earningOptions = storyConceptEarningOptionLabels(concept);
    const bitcoinBeatIndexes = new Set(mockBitcoinBeatIndexes(context));
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
            idx === context.pageCount - 2
              ? "Caregiver reassurance beat"
              : idx === context.pageCount - 1
                ? "Warm resolution beat"
                : `Story beat ${idx + 1}`,
          conflict: idx < context.pageCount - 2 ? mockStoryConflict(context, concept) : "The lesson finally feels clear and safe.",
          sceneLocation: context.interests[0] ?? "home",
          sceneId,
          sceneVisualDescription,
          emotionalTarget:
            idx === 0
              ? "curious and unsure"
              : idx === context.pageCount - 2
                ? "reassured and close"
                : idx === context.pageCount - 1
                  ? "calm, relieved, and proud"
                  : "steady and determined",
          pageIndexEstimate: idx,
          decodabilityTags: ["controlled_vocab", "repetition", "taught_words_late"],
          newWordsIntroduced: ["save"],
          bitcoinRelevanceScore: bitcoinBeatIndexes.has(idx) ? 0.7 : idx === context.pageCount - 1 ? 0.3 : 0.15,
          introduces: idx === 0 ? concept.requiredSetups.slice(0, 2) : [],
          paysOff: idx === context.pageCount - 1 ? concept.requiredPayoffs.slice(0, 2) : [],
          continuityFacts: [
            `caregiver_label:${concept.caregiverLabel}`,
            `deadline_event:${deadlineEvent ?? "null"}`,
            ...(idx === 1 && countTarget !== null ? [`count_target:${countTarget}`] : []),
            ...(idx === 3 && earningOptions[0] ? [`chosen_earning_option:${earningOptions[0]}`] : [])
          ]
        };
      })
    };

    const deterministic = runDeterministicBeatChecks(
      {
        profile: context.profile,
        lesson: context.lesson,
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
    beatSheet: BeatSheet,
    _options?: StoryDraftOptions
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const pages = beatSheet.beats.map((beat, idx) => ({
      pageIndex: idx,
      pageText: mockPageTextForBeat(context, concept, idx, beatSheet.beats.length),
      illustrationBrief: `Calm watercolor scene for ${context.childFirstName}, page ${idx + 1}`,
      sceneId: beat.sceneId,
      sceneVisualDescription: beat.sceneVisualDescription,
      newWordsIntroduced: beat.newWordsIntroduced,
      repetitionTargets: ["save", "plan"]
    }));

    return {
      story: {
        title: buildBitcoinStoryFallbackTitle(context.childFirstName, context.lesson),
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
        issues: quality.issues.map(deterministicIssueToStoryCriticIssue),
        rewriteInstructions: quality.issues.map((issue) => issue.message).join(" | ")
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
  prompt?: string;
  messages?: StructuredMessage[];
  systemPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parser: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxTokens: number;
  openAiModel?: string;
  anthropicModel?: string;
}

function resolveStructuredMessages(input: Pick<StructuredCallInput<unknown>, "prompt" | "messages">): StructuredMessage[] {
  if (input.messages && input.messages.length > 0) {
    return input.messages;
  }

  if (input.prompt) {
    return [{ role: "user", content: input.prompt }];
  }

  throw new Error("Structured call requires either prompt or messages.");
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
      parser: storyConceptParser(context),
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
    const plannerSystemPrompt = buildBeatPlannerSystemPrompt();
    const plannerPrompt = buildBeatPlannerPrompt(context, concept, context.pageCount);

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
          lesson: context.lesson,
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
        buildRewriteInstructions(attempts[attempt], context)
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
    const rewrite = await this.callWithFallbackStructured<BeatSheet>({
      stage: "beat_rewrite",
      prompt: buildBeatRewritePrompt(
        context,
        JSON.stringify(concept),
        JSON.stringify(beatSheet),
        rewriteInstructions
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
        lesson: context.lesson,
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
    options?: StoryDraftOptions
  ): Promise<{ story: StoryPackage; meta: LlmMetadata }> {
    const result = await this.callWithFallbackStructured<z.infer<typeof storyPackageSchema>>({
      stage: "draft_pages",
      messages: buildStoryDraftMessages(context, concept, beatSheet, options),
      systemPrompt:
        "You write final story pages for children. Output only schema-valid structured data.",
      schemaName: schemaNames.storyPackage,
      jsonSchema: storyPackageJsonSchema,
      parser: storyPackageSchema,
      maxTokens: 5000
    });

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
      meta: result.meta
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
    const deterministicIssues = deterministic.issues.map(deterministicIssueToStoryCriticIssue);
    const normalizedVerdict = normalizeStoryCriticVerdict({
      ok: result.data.ok,
      issues: [...result.data.issues, ...deterministicIssues],
      rewriteInstructions: result.data.rewriteInstructions
    });
    const rewriteInstructions =
      normalizedVerdict.rewriteInstructions.trim().length > 0
        ? normalizedVerdict.rewriteInstructions.trim()
        : fallbackStoryRewriteInstructions(context, normalizedVerdict);
    const hydratedVerdict: StoryCriticVerdict = {
      ...normalizedVerdict,
      rewriteInstructions
    };

    return {
      verdict: hydratedVerdict,
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
    const messages = resolveStructuredMessages(input);

    if (this.openAiBypassReason) {
      const fallback = await this.withRetries("anthropic", input.stage, () =>
        this.callAnthropicStrict<T>({
          stage: input.stage,
          model: input.anthropicModel ?? this.config.models.anthropicWriter,
          messages,
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
          messages,
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
          messages,
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
    messages: StructuredMessage[];
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
            ...input.messages
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
    messages: StructuredMessage[];
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
          messages: input.messages,
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
