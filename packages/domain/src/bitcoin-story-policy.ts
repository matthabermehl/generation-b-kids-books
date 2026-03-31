import type { MoneyLessonKey, ReadingProfile } from "./enums.js";

export interface BitcoinStoryPolicyContext {
  lesson: MoneyLessonKey;
  profile: ReadingProfile;
  ageYears?: number;
  pageCount?: number;
}

export interface BitcoinStoryPolicy {
  postureId: "bitcoin_forward";
  lesson: MoneyLessonKey;
  profile: ReadingProfile;
  pageCount: number;
  protectedEndingPageCount: number;
  minimumBitcoinMentions: number;
  minimumHighRelevanceScore: number;
  minimumHighRelevanceBeats: number;
  requireMentionBeforeEnding: boolean;
  basePromptSummary: string;
  storyConceptLine: string;
  beatPlannerLine: string;
  beatRewriteLine: string;
  writerLine: string;
  criticLine: string;
  titleGuidanceLine: string;
  titleReviewLine: string;
  endingLine: string;
  youngProfileGuardrails: string[];
  lessonPlacementRules: string[];
  criticEndingRules: string[];
  disallowedGenericTitlePatterns: RegExp[];
}

export const bitcoinForwardStoryPrincipleSummary =
  "Bitcoin should be clearly named in caregiver or narrator framing before the ending, while the child's concrete money problem stays primary.";

function isYoungPictureBookProfile(context: BitcoinStoryPolicyContext): boolean {
  return (
    context.profile === "read_aloud_3_4" ||
    context.profile === "early_decoder_5_7" ||
    (context.ageYears ?? Number.POSITIVE_INFINITY) <= 7
  );
}

export function resolveBitcoinStoryPolicy(
  context: BitcoinStoryPolicyContext
): BitcoinStoryPolicy {
  const pageCount = Math.max(0, context.pageCount ?? 12);
  const requiresRecurringBitcoin = pageCount >= 8;

  return {
    postureId: "bitcoin_forward",
    lesson: context.lesson,
    profile: context.profile,
    pageCount,
    protectedEndingPageCount: requiresRecurringBitcoin ? 2 : 1,
    minimumBitcoinMentions: requiresRecurringBitcoin ? 2 : 1,
    minimumHighRelevanceScore: 0.35,
    minimumHighRelevanceBeats: requiresRecurringBitcoin ? 2 : 1,
    requireMentionBeforeEnding: requiresRecurringBitcoin,
    basePromptSummary: bitcoinForwardStoryPrincipleSummary,
    storyConceptLine:
      "Feature the child's lived money problem first, then define a warm caregiver or narrator Bitcoin bridge that can recur before the ending without turning the story into a lecture.",
    beatPlannerLine:
      "Make the story Bitcoin-forward in caregiver or narrator framing: once the child has felt the problem, plan at least one non-final explicit Bitcoin bridge and let a later beat echo it when the page budget allows.",
    beatRewriteLine:
      "Preserve the child's concrete money problem as the main arc, but rewrite until Bitcoin is clearly present in caregiver or narrator framing before the ending and no longer reads like a late-only add-on.",
    writerLine:
      "Keep the child's concrete money problem primary, but name Bitcoin in caregiver or narrator framing before the ending and let it recur briefly in longer stories so it feels like the shipped posture instead of a final-page footnote.",
    criticLine:
      "Flag stories where Bitcoin arrives only as a last-page add-on or is so sparse that the caregiver or narrator framing no longer feels meaningfully Bitcoin-forward.",
    titleGuidanceLine:
      "Title should center the child's concrete money problem or emotional goal. Avoid generic fallback titles like 'Bitcoin Adventure'; if Bitcoin appears in the title, keep it warm and problem-led.",
    titleReviewLine:
      "Does the title center the child's concrete money problem instead of defaulting to a generic Bitcoin Adventure label?",
    endingLine:
      "The final page must stay emotionally warm, not lecture-like. If Bitcoin is mentioned there, it must echo an earlier idea rather than introduce fresh explanation.",
    youngProfileGuardrails: isYoungPictureBookProfile(context)
      ? [
          "3-7 Bitcoin guardrails:",
          "- Keep the child's visible actions physical and observable: count coins, save, wait, choose, earn, compare what the same coins buy, or choose a smaller item.",
          "- Keep Bitcoin clearly present in caregiver or narrator framing before the ending, then let it recur once more only if it still fits the same child-sized value thread.",
          "- If Bitcoin is named directly, keep it in caregiver or narrator language, never as a child decoding target or child explanation task.",
          "- Do not make Bitcoin the child's taught decoding word or a child-facing newWordsIntroduced item.",
          "- Do NOT use device-first or fintech-first framing as the main plot mechanic: tablet, app, phone, digital jar, wallet, password, QR code, transfer, blockchain, chart, or market screen.",
          "- Do NOT make the child independently move digital money or explain hidden technical mechanics.",
          "- Price-change examples must be countable and concrete, such as 'last week 3 coins bought 2 candies; now 3 coins buy 1 candy' or 'the lamp costs 1 more coin now.'",
          "- Avoid abstract cause language such as supplier shock, market volatility, scarcity curves, or purchasing power unless rewritten into an observable child-level event.",
          "- A good pattern is: the child lives the value first, then caregiver or narrator language names Bitcoin as a warm grown-up money idea, and the story returns to that framing once more without turning the ending into a lecture."
        ]
      : [],
    lessonPlacementRules:
      context.profile === "read_aloud_3_4" && context.lesson === "better_rules" && pageCount >= 2
        ? [
            `- For better_rules in read_aloud_3_4, reserve page ${pageCount - 2} for the clearest explicit Bitcoin bridge after the child has already felt why fair rules matter.`,
            `- Keep page ${pageCount - 1} for emotional resolution only: togetherness, safety, calm pride, or relief. Do not introduce new Bitcoin explanation there.`
          ]
        : [],
    criticEndingRules:
      context.profile === "read_aloud_3_4" && context.lesson === "better_rules"
        ? [
            "- For better_rules in read_aloud_3_4, the clearest explicit Bitcoin bridge should land by the penultimate page.",
            "- For better_rules in read_aloud_3_4, the final page should close emotionally and must not introduce new Bitcoin explanation."
          ]
        : [],
    disallowedGenericTitlePatterns: [/\bbitcoin adventure\b/i]
  };
}

export function buildBitcoinStoryBridgeText(
  caregiverLabel: "Mom" | "Dad",
  lesson: MoneyLessonKey
): string {
  switch (lesson) {
    case "prices_change":
      return `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for planning when prices change around you.`;
    case "jar_saving_limits":
      return `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for protecting patient effort over time.`;
    case "new_money_unfair":
      return `${caregiverLabel} calmly names Bitcoin as one grown-up money rule where new money does not appear by surprise.`;
    case "keep_what_you_earn":
      return `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for protecting the value of work already done.`;
    case "better_rules":
      return `${caregiverLabel} calmly names Bitcoin as one grown-up rule system that tries to keep the rules steady for everyone.`;
  }
}

export function buildBitcoinStoryFallbackTitle(
  childFirstName: string,
  lesson: MoneyLessonKey
): string {
  switch (lesson) {
    case "prices_change":
      return `${childFirstName} and the Changing Price`;
    case "jar_saving_limits":
      return `${childFirstName}'s Saving Plan`;
    case "new_money_unfair":
      return `${childFirstName} and the Surprise Tickets`;
    case "keep_what_you_earn":
      return `${childFirstName}'s Earned Coins`;
    case "better_rules":
      return `${childFirstName} and the Fair Rule`;
  }
}

export function bitcoinStoryTitlePolicyIssue(
  title: string,
  context: BitcoinStoryPolicyContext
): string | null {
  const policy = resolveBitcoinStoryPolicy(context);
  const normalizedTitle = title.trim();
  if (normalizedTitle.length === 0) {
    return "Title must not be empty.";
  }

  if (policy.disallowedGenericTitlePatterns.some((pattern) => pattern.test(normalizedTitle))) {
    return "Title should center the child's concrete money problem instead of defaulting to a generic Bitcoin Adventure label.";
  }

  return null;
}
