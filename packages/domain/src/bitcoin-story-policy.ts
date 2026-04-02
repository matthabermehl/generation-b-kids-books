import { storyModes, type MoneyLessonKey, type ReadingProfile, type StoryMode } from "./enums.js";

export interface BitcoinStoryPolicyContext {
  lesson: MoneyLessonKey;
  profile: ReadingProfile;
  storyMode?: StoryMode;
  ageYears?: number;
  pageCount?: number;
}

export interface StoryModeDefinition {
  key: StoryMode;
  label: string;
  helperText: string;
  promptSummary: string;
}

export interface BitcoinStoryPolicy {
  postureId: StoryMode;
  storyMode: StoryMode;
  lesson: MoneyLessonKey;
  profile: ReadingProfile;
  pageCount: number;
  protectedEndingPageCount: number;
  minimumBitcoinMentions: number;
  maximumBitcoinMentions: number | null;
  minimumHighRelevanceScore: number;
  minimumHighRelevanceBeats: number;
  maximumHighRelevanceBeats: number | null;
  requireMentionBeforeEnding: boolean;
  revealStartPageIndex: number | null;
  maximumBitcoinMentionsBeforePageIndex: number | null;
  maximumHighRelevanceBeatsBeforePageIndex: number | null;
  titleShouldHideBitcoin: boolean;
  basePromptSummary: string;
  storyConceptLine: string;
  storyConceptBridgeLine: string;
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

export const storyModeDefinitions: Record<StoryMode, StoryModeDefinition> = {
  sound_money_implicit: {
    key: "sound_money_implicit",
    label: "Sound money only",
    helperText: "No Bitcoin mention at all; teach the underlying money lesson through the child's concrete problem.",
    promptSummary:
      "Do not name Bitcoin anywhere. Teach the underlying sound-money lesson through the child's concrete money problem and a warm caregiver or narrator perspective."
  },
  bitcoin_reveal_8020: {
    key: "bitcoin_reveal_8020",
    label: "Late Bitcoin reveal",
    helperText:
      "Let the money problem dominate most of the story, then bring in Bitcoin late as the warm grown-up answer.",
    promptSummary:
      "Let the child's concrete money problem carry most of the story. Delay explicit Bitcoin naming until the late solution window, then land the ending warmly rather than as a lecture."
  },
  bitcoin_forward: {
    key: "bitcoin_forward",
    label: "Bitcoin forward",
    helperText:
      "Name Bitcoin early in caregiver or narrator framing while keeping the child's money problem primary.",
    promptSummary:
      "Bitcoin should be clearly named in caregiver or narrator framing before the ending, while the child's concrete money problem stays primary."
  }
};

export const orderedStoryModes = storyModes.map((key) => storyModeDefinitions[key]);

export const bitcoinForwardStoryPrincipleSummary = storyModeDefinitions.bitcoin_forward.promptSummary;

export function getStoryModeDefinition(storyMode: StoryMode): StoryModeDefinition {
  return storyModeDefinitions[storyMode];
}

export function getStoryModePrincipleSummary(storyMode: StoryMode): string {
  return getStoryModeDefinition(storyMode).promptSummary;
}

function isYoungPictureBookProfile(context: BitcoinStoryPolicyContext): boolean {
  return (
    context.profile === "read_aloud_3_4" ||
    context.profile === "early_decoder_5_7" ||
    (context.ageYears ?? Number.POSITIVE_INFINITY) <= 7
  );
}

function revealStartPageIndex(pageCount: number): number {
  if (pageCount <= 2) {
    return Math.max(0, pageCount - 1);
  }

  return Math.min(pageCount - 2, Math.floor(pageCount * 0.8));
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function youngProfileGuardrails(context: BitcoinStoryPolicyContext, storyMode: StoryMode): string[] {
  if (!isYoungPictureBookProfile(context)) {
    return [];
  }

  const shared = [
    "3-7 story guardrails:",
    "- Keep the child's visible actions physical and observable: count coins, save, wait, choose, earn, compare what the same coins buy, or choose a smaller item.",
    "- Do NOT use device-first or fintech-first framing as the main plot mechanic: tablet, app, phone, digital jar, wallet, password, QR code, transfer, blockchain, chart, or market screen.",
    "- Do NOT make the child independently move digital money or explain hidden technical mechanics.",
    "- Price-change examples must stay countable and concrete, such as 'last week 3 coins bought 2 candies; now 3 coins buy 1 candy' or 'the lamp costs 1 more coin now.'",
    "- Avoid abstract cause language such as supplier shock, market volatility, scarcity curves, or purchasing power unless rewritten into an observable child-level event."
  ];

  if (storyMode === "sound_money_implicit") {
    return [
      ...shared,
      "- Do not name Bitcoin in child, caregiver, narrator, title, or taught-word language anywhere in the story.",
      "- Keep the sound-money value implicit through the child's experience: fairness, steadiness, patient saving, earned effort, and rules that do not suddenly change."
    ];
  }

  if (storyMode === "bitcoin_reveal_8020") {
    return [
      ...shared,
      "- Keep Bitcoin absent for most of the story. Let the child feel the money problem first.",
      "- When Bitcoin finally appears, keep it in caregiver or narrator language only, never as a child decoding target or explanation task.",
      "- The reveal should feel like a warm grown-up answer, not a technical dump or a lecture."
    ];
  }

  return [
    ...shared,
    "- Keep Bitcoin clearly present in caregiver or narrator framing before the ending, then let it recur once more only if it still fits the same child-sized value thread.",
    "- If Bitcoin is named directly, keep it in caregiver or narrator language, never as a child decoding target or child explanation task.",
    "- Do not make Bitcoin the child's taught decoding word or a child-facing newWordsIntroduced item.",
    "- A good pattern is: the child lives the value first, then caregiver or narrator language names Bitcoin as a warm grown-up money idea, and the story returns to that framing once more without turning the ending into a lecture."
  ];
}

function lessonPlacementRules(
  context: BitcoinStoryPolicyContext,
  storyMode: StoryMode,
  pageCount: number,
  protectedEndingPageCount: number
): string[] {
  if (storyMode === "sound_money_implicit") {
    return [
      "- Keep the entire story in the money problem and its emotional resolution. Do not reveal or hint at Bitcoin by name near the ending."
    ];
  }

  if (storyMode === "bitcoin_reveal_8020") {
    const revealStart = revealStartPageIndex(pageCount);
    const recurringReveal = pageCount >= 8;
    return [
      `- Keep the problem-led setup dominant through page ${Math.max(1, revealStart)}; do not name Bitcoin before page ${revealStart + 1}.`,
      `- Use page ${revealStart + 1} or later for the first explicit Bitcoin solution beat.`,
      ...(recurringReveal
        ? [
            "- In longer late-reveal books, keep one later brief emotional Bitcoin echo after that first reveal so Bitcoin is named more than once without turning the ending into a lecture.",
            "- In longer late-reveal books, make that later echo a plain narrator sentence, never a new quoted caregiver line, a child private thought, or a remembered-thought line.",
            "- In longer late-reveal books, do not solve ending warmth by deleting the second late Bitcoin mention entirely; shorten it into one warm emotional narrator echo instead."
          ]
        : []),
      `- Keep the final ${protectedEndingPageCount} page${protectedEndingPageCount === 1 ? "" : "s"} emotionally warm; if Bitcoin appears there, it must echo the reveal rather than introduce fresh explanation.`
    ];
  }

  if (context.profile === "read_aloud_3_4" && context.lesson === "better_rules" && pageCount >= 2) {
    return [
      `- For better_rules in read_aloud_3_4, add one earlier caregiver or narrator Bitcoin bridge before page ${pageCount - 2} once the child has already felt why fair rules matter.`,
      `- For better_rules in read_aloud_3_4, reserve page ${pageCount - 2} for exactly one short, warm caregiver or narrator Bitcoin echo that reconnects the repaired fair rule to Bitcoin without turning the ending into a lecture.`,
      `- For better_rules in read_aloud_3_4, keep that page ${pageCount - 2} echo tied to the game that is restarting right now. Do not use a narrator summary like "Bitcoin is special because..." or any fresh why-Bitcoin explanation there.`,
      `- Keep page ${pageCount - 1} for emotional resolution only: togetherness, safety, calm pride, or relief. Do not introduce new Bitcoin explanation there.`
    ];
  }

  if (context.profile === "early_decoder_5_7" && context.lesson === "new_money_unfair" && pageCount >= 2) {
    return [
      `- For new_money_unfair in early_decoder_5_7, add one short caregiver or narrator Bitcoin bridge before page ${pageCount - 2} once the child has already felt why surprise tickets seem unfair.`,
      `- For new_money_unfair in early_decoder_5_7, reserve page ${pageCount - 2} for one brief caregiver or narrator Bitcoin echo that reconnects the steady ticket count to Bitcoin without sounding technical.`,
      `- Keep page ${pageCount - 1} focused on calm emotional resolution only: fairness understood, closeness, relief, or pride. Do not introduce fresh Bitcoin explanation there.`
    ];
  }

  return [];
}

function criticEndingRules(
  context: BitcoinStoryPolicyContext,
  storyMode: StoryMode,
  pageCount: number
): string[] {
  if (storyMode === "sound_money_implicit") {
    return [
      "- In sound_money_implicit mode, do not ask for a late Bitcoin reveal or an explicit Bitcoin echo on the ending pages."
    ];
  }

  if (storyMode === "bitcoin_reveal_8020") {
    const revealStart = revealStartPageIndex(pageCount);
    const recurringReveal = pageCount >= 8;
    return [
      `- In bitcoin_reveal_8020 mode, any explicit Bitcoin beat before page ${revealStart + 1} is too early.`,
      "- In bitcoin_reveal_8020 mode, the reveal should be late and concise. Do not let it turn the final page into a lecture.",
      ...(recurringReveal
        ? [
            "- In bitcoin_reveal_8020 mode for longer books, expect two late Bitcoin mentions: one concise warm reveal beat, then one brief emotional echo on a later page.",
            "- In bitcoin_reveal_8020 mode for longer books, the later echo must stay in plain narrator framing, not a new caregiver quote, child memory, or private-thought line.",
            "- In bitcoin_reveal_8020 mode for longer books, do not collapse the ending to a single reveal mention just to reduce repetition; shorten the later echo instead.",
            "- In bitcoin_reveal_8020 mode for longer books, keep the later echo to one short warm narrator sentence, not fresh explanation or new quoted dialogue."
          ]
        : ["- In bitcoin_reveal_8020 mode, prefer one warm reveal beat plus, at most, one brief emotional echo."])
    ];
  }

  if (context.profile === "read_aloud_3_4" && context.lesson === "better_rules") {
    return [
      "- For better_rules in read_aloud_3_4, expect Bitcoin more than once: one earlier caregiver or narrator bridge, then one brief echo on the penultimate page.",
      "- For better_rules in read_aloud_3_4, do not push every Bitcoin line earlier if that would erase the penultimate echo; shorten the penultimate echo instead.",
      '- For better_rules in read_aloud_3_4, the penultimate echo should be one short warm line, not a new narrator explanation about why Bitcoin works. If needed, prefer a gentle in-scene line such as "Mom smiles. \\"Just like Bitcoin, your game has fair rules now.\\""',
      "- For better_rules in read_aloud_3_4, the final page should close emotionally and must not introduce new Bitcoin explanation."
    ];
  }

  if (context.profile === "early_decoder_5_7" && context.lesson === "new_money_unfair") {
    return [
      "- For new_money_unfair in early_decoder_5_7, expect Bitcoin more than once: one earlier caregiver or narrator bridge before the final 2 pages, then one brief echo on the penultimate page.",
      "- For new_money_unfair in early_decoder_5_7, do not collapse the story to one late Bitcoin page just to avoid repetition; keep the earlier bridge short and concrete instead.",
      "- For new_money_unfair in early_decoder_5_7, the final page should land on calm or pride and must not carry fresh Bitcoin explanation."
    ];
  }

  return [];
}

export function resolveBitcoinStoryPolicy(
  context: BitcoinStoryPolicyContext
): BitcoinStoryPolicy {
  const storyMode = context.storyMode ?? "bitcoin_forward";
  const pageCount = Math.max(0, context.pageCount ?? 12);
  const requiresRecurringBitcoin = pageCount >= 8;
  const revealStart = storyMode === "bitcoin_reveal_8020" ? revealStartPageIndex(pageCount) : null;

  if (storyMode === "sound_money_implicit") {
    return {
      postureId: storyMode,
      storyMode,
      lesson: context.lesson,
      profile: context.profile,
      pageCount,
      protectedEndingPageCount: 1,
      minimumBitcoinMentions: 0,
      maximumBitcoinMentions: 0,
      minimumHighRelevanceScore: 0.35,
      minimumHighRelevanceBeats: 0,
      maximumHighRelevanceBeats: 0,
      requireMentionBeforeEnding: false,
      revealStartPageIndex: null,
      maximumBitcoinMentionsBeforePageIndex: null,
      maximumHighRelevanceBeatsBeforePageIndex: null,
      titleShouldHideBitcoin: true,
      basePromptSummary: getStoryModePrincipleSummary(storyMode),
      storyConceptLine:
        "Do not name Bitcoin anywhere. Capture the underlying sound-money lesson through the child's concrete money problem, caregiver warmth, and steady value thread only.",
      storyConceptBridgeLine:
        "bitcoinBridge must stay thematic only: describe the steady, fair, sound-money value behind the story without naming Bitcoin or implying a future reveal.",
      beatPlannerLine:
        "Keep Bitcoin implicit. Every beat should deepen the child's concrete money problem and the sound-money value behind it without naming Bitcoin directly.",
      beatRewriteLine:
        "Rewrite until Bitcoin disappears entirely while the child's concrete money problem and the underlying sound-money lesson still feel clear and emotionally satisfying.",
      writerLine:
        "Do not name Bitcoin anywhere in the story, title, or ending. Keep the lesson implicit through the child's problem, caregiver warmth, and the concrete value of steadier money.",
      criticLine:
        "Flag any explicit Bitcoin naming, spoiled reveal language, or titles that break the fully implicit posture.",
      titleGuidanceLine:
        "Title must center the child's concrete money problem or emotional goal and must not mention Bitcoin.",
      titleReviewLine:
        "Does the title stay problem-led and avoid naming Bitcoin in this fully implicit mode?",
      endingLine:
        "The final page must stay emotionally warm and must not pivot into naming Bitcoin or giving a lecture about money systems.",
      youngProfileGuardrails: youngProfileGuardrails(context, storyMode),
      lessonPlacementRules: lessonPlacementRules(context, storyMode, pageCount, 1),
      criticEndingRules: criticEndingRules(context, storyMode, pageCount),
      disallowedGenericTitlePatterns: [/\bbitcoin adventure\b/i, /\bbitcoin\b/i]
    };
  }

  if (storyMode === "bitcoin_reveal_8020") {
    const minimumBitcoinMentions = requiresRecurringBitcoin ? 2 : 1;
    return {
      postureId: storyMode,
      storyMode,
      lesson: context.lesson,
      profile: context.profile,
      pageCount,
      protectedEndingPageCount: 1,
      minimumBitcoinMentions,
      maximumBitcoinMentions: null,
      minimumHighRelevanceScore: 0.35,
      minimumHighRelevanceBeats: 1,
      maximumHighRelevanceBeats: null,
      requireMentionBeforeEnding: true,
      revealStartPageIndex: revealStart,
      maximumBitcoinMentionsBeforePageIndex: 0,
      maximumHighRelevanceBeatsBeforePageIndex: 0,
      titleShouldHideBitcoin: true,
      basePromptSummary: getStoryModePrincipleSummary(storyMode),
      storyConceptLine:
        "Keep the child's lived money problem primary for most of the concept. Plan a late, warm caregiver or narrator Bitcoin reveal that solves the problem without turning the ending into a lecture.",
      storyConceptBridgeLine:
        minimumBitcoinMentions > 1
          ? "bitcoinBridge must justify a late, warm caregiver or narrator Bitcoin answer spoken aloud or plainly narrated, not hidden in a private adult thought. Keep it strong enough that later prompts know the reveal belongs in the solution window, not earlier, and that longer books still need one brief emotional Bitcoin echo after the first reveal in plain narrator framing rather than a quoted line or a child private-thought line."
          : "bitcoinBridge must justify a late, warm caregiver or narrator Bitcoin answer spoken aloud or plainly narrated, not hidden in a private adult thought. Keep it strong enough that later prompts know the reveal belongs in the solution window, not earlier.",
      beatPlannerLine:
        minimumBitcoinMentions > 1
          ? "Let the child experience the money problem first. Before the late reveal window, keep bitcoinRelevanceScore below the explicit-Bitcoin threshold and avoid Bitcoin-solution wording so those beats stay thematic rather than high-salience. Do not name Bitcoin explicitly until the late reveal window, then use a brief caregiver or narrator solution beat spoken aloud or plainly narrated, never buried in a private adult thought, and keep one later brief emotional Bitcoin echo so the ending still names Bitcoin more than once without turning into a lecture. That later echo must stay in plain narrator wording, not quoted caregiver dialogue or the child's private thoughts."
          : "Let the child experience the money problem first. Before the late reveal window, keep bitcoinRelevanceScore below the explicit-Bitcoin threshold and avoid Bitcoin-solution wording so those beats stay thematic rather than high-salience. Do not name Bitcoin explicitly until the late reveal window, then use a brief caregiver or narrator solution beat spoken aloud or plainly narrated, never buried in a private adult thought, and preserve an emotionally warm ending.",
      beatRewriteLine:
        minimumBitcoinMentions > 1
          ? "Rewrite until pre-reveal beats stay below the explicit-Bitcoin salience threshold and avoid Bitcoin-solution wording, while Bitcoin stays absent through most of the story and then appears late as a warm caregiver or narrator solution spoken aloud or plainly narrated instead of an early, technical, or private-thought explanation. In longer books, preserve one later brief emotional Bitcoin echo rather than collapsing the story back to a single reveal mention, and keep that echo out of quoted dialogue and the child's private thoughts."
          : "Rewrite until pre-reveal beats stay below the explicit-Bitcoin salience threshold and avoid Bitcoin-solution wording, while Bitcoin stays absent through most of the story and then appears late as a warm caregiver or narrator solution spoken aloud or plainly narrated instead of an early, technical, or private-thought explanation.",
      writerLine:
        minimumBitcoinMentions > 1
          ? "For most of the story, keep Bitcoin unspoken while the child's concrete money problem grows clear. Reveal Bitcoin late in caregiver or narrator framing, with the explicit Bitcoin mention spoken aloud or plainly narrated rather than hidden in private thoughts. In longer books, keep one later brief emotional Bitcoin echo after the reveal so Bitcoin lands more than once, but make that echo shorter and warmer than the reveal and keep it in plain narrator wording rather than quoted dialogue or the child's internal thoughts."
          : "For most of the story, keep Bitcoin unspoken while the child's concrete money problem grows clear. Reveal Bitcoin late in caregiver or narrator framing, with the explicit Bitcoin mention spoken aloud or plainly narrated rather than hidden in private thoughts, then keep the ending warm and non-lecture-like.",
      criticLine:
        minimumBitcoinMentions > 1
          ? "Flag stories that spoil Bitcoin too early, skip the late reveal entirely, hide the only direct Bitcoin mention inside private thoughts, collapse longer late-reveal books to only one explicit Bitcoin mention, or overload the ending with late explanation."
          : "Flag stories that spoil Bitcoin too early, skip the late reveal entirely, hide the only direct Bitcoin mention inside private thoughts, or overload the ending with late explanation.",
      titleGuidanceLine:
        "Title should center the child's concrete money problem and should not spoil the late Bitcoin reveal by naming Bitcoin up front.",
      titleReviewLine:
        "Does the title keep the late Bitcoin reveal hidden and stay anchored in the child's concrete money problem?",
      endingLine:
        minimumBitcoinMentions > 1
          ? "The final page must stay emotionally warm. In longer late-reveal books, keep one brief emotional Bitcoin echo there in plain narrator wording rather than deleting the second late mention entirely, but do not introduce fresh explanation, quoted dialogue, or child private thoughts."
          : "The final page must stay emotionally warm. If Bitcoin is mentioned there, it must echo the late reveal softly rather than introduce fresh explanation.",
      youngProfileGuardrails: youngProfileGuardrails(context, storyMode),
      lessonPlacementRules: lessonPlacementRules(context, storyMode, pageCount, 1),
      criticEndingRules: criticEndingRules(context, storyMode, pageCount),
      disallowedGenericTitlePatterns: [/\bbitcoin adventure\b/i, /\bbitcoin\b/i]
    };
  }

  return {
    postureId: storyMode,
    storyMode,
    lesson: context.lesson,
    profile: context.profile,
    pageCount,
    protectedEndingPageCount: requiresRecurringBitcoin ? 2 : 1,
    minimumBitcoinMentions: requiresRecurringBitcoin ? 2 : 1,
    maximumBitcoinMentions: null,
    minimumHighRelevanceScore: 0.35,
    minimumHighRelevanceBeats: requiresRecurringBitcoin ? 2 : 1,
    maximumHighRelevanceBeats: null,
    requireMentionBeforeEnding: requiresRecurringBitcoin,
    revealStartPageIndex: null,
    maximumBitcoinMentionsBeforePageIndex: null,
    maximumHighRelevanceBeatsBeforePageIndex: null,
    titleShouldHideBitcoin: false,
    basePromptSummary: getStoryModePrincipleSummary(storyMode),
    storyConceptLine:
      "Feature the child's lived money problem first, then define a warm caregiver or narrator Bitcoin bridge that can recur before the ending without turning the story into a lecture.",
    storyConceptBridgeLine:
      "bitcoinBridge must clearly explain how Bitcoin warmly fits this exact child-sized problem in caregiver or narrator framing, spoken aloud or plainly narrated rather than hidden in private thoughts, strong enough to appear before the ending and echo again in longer stories without becoming a lecture.",
    beatPlannerLine:
      "Make the story Bitcoin-forward in caregiver or narrator framing: once the child has felt the problem, plan at least one non-final explicit Bitcoin bridge spoken aloud or plainly narrated, not hidden in private thoughts, and let a later beat echo it when the page budget allows.",
    beatRewriteLine:
      "Preserve the child's concrete money problem as the main arc, but rewrite until Bitcoin is clearly present in caregiver or narrator framing before the ending, spoken aloud or plainly narrated rather than tucked into private thoughts, and no longer reads like a late-only add-on.",
    writerLine:
      "Keep the child's concrete money problem primary, but name Bitcoin in caregiver or narrator framing before the ending with a spoken or plainly narrated mention, never as the only private-thought reference, and let it recur briefly in longer stories so it feels like the shipped posture instead of a final-page footnote.",
    criticLine:
      "Flag stories where Bitcoin arrives only as a last-page add-on, is hidden only in private thoughts, or is so sparse that the caregiver or narrator framing no longer feels meaningfully Bitcoin-forward.",
    titleGuidanceLine:
      "Title should center the child's concrete money problem or emotional goal. Avoid generic fallback titles like 'Bitcoin Adventure'; if Bitcoin appears in the title, keep it warm and problem-led.",
    titleReviewLine:
      "Does the title center the child's concrete money problem instead of defaulting to a generic Bitcoin Adventure label?",
    endingLine:
      "The final page must stay emotionally warm, not lecture-like. If Bitcoin is mentioned there, it must echo an earlier idea rather than introduce fresh explanation.",
    youngProfileGuardrails: youngProfileGuardrails(context, storyMode),
    lessonPlacementRules: lessonPlacementRules(context, storyMode, pageCount, requiresRecurringBitcoin ? 2 : 1),
    criticEndingRules: criticEndingRules(context, storyMode, pageCount),
    disallowedGenericTitlePatterns: [/\bbitcoin adventure\b/i]
  };
}

export function bitcoinBeatThemeRequirementMessage(policy: BitcoinStoryPolicy): string {
  if (policy.minimumHighRelevanceBeats === 0) {
    return "Do not make any beat explicitly Bitcoin-forward in bitcoinRelevanceScore or wording; keep the lesson implicit instead.";
  }

  if (policy.minimumHighRelevanceBeats > 1) {
    return `At least ${policy.minimumHighRelevanceBeats} beats must use bitcoinRelevanceScore >= ${policy.minimumHighRelevanceScore} so Bitcoin feels recurring and story-forward instead of late-only.`;
  }

  return `At least one beat must use bitcoinRelevanceScore >= ${policy.minimumHighRelevanceScore} so Bitcoin is explicitly story-forward in caregiver or narrator framing.`;
}

export function bitcoinBeatRevealTimingMessage(policy: BitcoinStoryPolicy): string | null {
  if (policy.revealStartPageIndex === null || policy.maximumHighRelevanceBeatsBeforePageIndex === null) {
    return null;
  }

  return `High-salience Bitcoin beats must not appear before beat ${policy.revealStartPageIndex + 1} in late-reveal mode.`;
}

export function bitcoinBeatRevealWordingMessage(policy: BitcoinStoryPolicy): string | null {
  if (policy.revealStartPageIndex === null || policy.maximumBitcoinMentionsBeforePageIndex === null) {
    return null;
  }

  return `Do not name Bitcoin in beat wording before beat ${policy.revealStartPageIndex + 1} in this late-reveal mode.`;
}

export function bitcoinBeatBeforeEndingMessage(policy: BitcoinStoryPolicy): string | null {
  if (!policy.requireMentionBeforeEnding) {
    return null;
  }

  return `At least one high-salience Bitcoin beat must land before the final ${policy.protectedEndingPageCount} ${pluralize(policy.protectedEndingPageCount, "beat")} so the ending does not carry all of the Bitcoin framing.`;
}

export function bitcoinStoryConceptNamingMessage(policy: BitcoinStoryPolicy): string | null {
  return policy.storyMode === "sound_money_implicit"
    ? "Sound-money-implicit mode must not name Bitcoin anywhere in the story concept."
    : null;
}

export function bitcoinStoryUsageMaximumMessage(policy: BitcoinStoryPolicy): string {
  return policy.storyMode === "sound_money_implicit"
    ? "Sound-money-implicit mode must not name Bitcoin anywhere in the story."
    : "Story mentions Bitcoin more often than this mode allows.";
}

export function bitcoinStoryUsageMinimumMessage(policy: BitcoinStoryPolicy): string {
  if (policy.storyMode === "bitcoin_reveal_8020") {
    return policy.minimumBitcoinMentions > 1
      ? "Story must reveal Bitcoin late and more than once so the solution lands clearly before the warm ending."
      : "Story must reveal Bitcoin late in caregiver or narrator framing before the ending.";
  }

  return policy.minimumBitcoinMentions > 1
    ? "Story must mention Bitcoin more than once so the caregiver or narrator framing feels meaningfully Bitcoin-forward."
    : "Story must mention Bitcoin at least once in caregiver or narrator framing while the child's money problem stays primary.";
}

export function bitcoinStoryRevealTimingMessage(policy: BitcoinStoryPolicy): string | null {
  if (policy.revealStartPageIndex === null || policy.maximumBitcoinMentionsBeforePageIndex === null) {
    return null;
  }

  return `Story must not name Bitcoin before page ${policy.revealStartPageIndex + 1} in this late-reveal mode.`;
}

export function bitcoinStoryBeforeFinalPageMessage(policy: BitcoinStoryPolicy): string | null {
  if (!policy.requireMentionBeforeEnding) {
    return null;
  }

  return policy.storyMode === "bitcoin_reveal_8020"
    ? "Story must reveal Bitcoin before the final page so the ending does not carry the entire explanation."
    : "Story must name Bitcoin before the final page so it does not read like a last-page add-on.";
}

export function bitcoinStoryBeforeEndingWindowMessage(policy: BitcoinStoryPolicy): string | null {
  if (!policy.requireMentionBeforeEnding) {
    return null;
  }

  const endingWindowStart = Math.max(1, policy.pageCount - policy.protectedEndingPageCount);
  return policy.storyMode === "bitcoin_reveal_8020"
    ? `Story must reveal Bitcoin by page ${endingWindowStart} so the final page can stay warm instead of carrying all the explanation.`
    : `Story must establish Bitcoin before the final ${policy.protectedEndingPageCount} ${pluralize(policy.protectedEndingPageCount, "page")} so the ending can stay warm instead of carrying all the Bitcoin weight.`;
}

export function buildBitcoinStoryBridgeText(
  caregiverLabel: "Mom" | "Dad",
  lesson: MoneyLessonKey,
  storyMode: StoryMode = "bitcoin_forward"
): string {
  if (storyMode === "sound_money_implicit") {
    switch (lesson) {
      case "prices_change":
        return `${caregiverLabel} calmly names the grown-up habit of planning for prices that change.`;
      case "jar_saving_limits":
        return `${caregiverLabel} calmly names the grown-up habit of protecting patient effort over time.`;
      case "new_money_unfair":
        return `${caregiverLabel} calmly names the importance of fair money rules that do not change by surprise.`;
      case "keep_what_you_earn":
        return `${caregiverLabel} calmly names the value of protecting work that has already been done.`;
      case "better_rules":
        return `${caregiverLabel} calmly names the value of steady rules that feel fair to everyone.`;
    }
  }

  switch (lesson) {
    case "prices_change":
      return storyMode === "bitcoin_reveal_8020"
        ? `${caregiverLabel} later calmly names Bitcoin as one grown-up saving idea for planning when prices change around you.`
        : `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for planning when prices change around you.`;
    case "jar_saving_limits":
      return storyMode === "bitcoin_reveal_8020"
        ? `${caregiverLabel} later calmly names Bitcoin as one grown-up saving idea for protecting patient effort over time.`
        : `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for protecting patient effort over time.`;
    case "new_money_unfair":
      return storyMode === "bitcoin_reveal_8020"
        ? `${caregiverLabel} later calmly names Bitcoin as one grown-up money rule where new money does not appear by surprise.`
        : `${caregiverLabel} calmly names Bitcoin as one grown-up money rule where new money does not appear by surprise.`;
    case "keep_what_you_earn":
      return storyMode === "bitcoin_reveal_8020"
        ? `${caregiverLabel} later calmly names Bitcoin as one grown-up saving idea for protecting the value of work already done.`
        : `${caregiverLabel} calmly names Bitcoin as one grown-up saving idea for protecting the value of work already done.`;
    case "better_rules":
      return storyMode === "bitcoin_reveal_8020"
        ? `${caregiverLabel} later calmly names Bitcoin as one grown-up rule system that tries to keep the rules steady for everyone.`
        : `${caregiverLabel} calmly names Bitcoin as one grown-up rule system that tries to keep the rules steady for everyone.`;
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
    return policy.titleShouldHideBitcoin
      ? "Title should center the child's concrete money problem and avoid naming Bitcoin in this mode."
      : "Title should center the child's concrete money problem instead of defaulting to a generic Bitcoin Adventure label.";
  }

  return null;
}
