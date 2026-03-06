import type { BeatSheet, MoneyLessonKey, ReadingProfile } from "@book/domain";

export interface StoryTemplateContext {
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
}

export interface BeatPromptConstraints {
  highScoreThreshold: number;
  minHighBeats: number;
  maxHighBeats: number;
  allowedHighStartIndex: number;
}

function jsonOnlyBlock(schemaName: string): string {
  return [
    "Return ONLY valid JSON that matches the provided schema.",
    `Target schema name: ${schemaName}.`,
    "Do not wrap JSON in markdown fences.",
    "Do not include keys outside the schema."
  ].join("\n");
}

function profileBlock(context: StoryTemplateContext, pageCount: number): string {
  return [
    `child_first_name: ${context.childFirstName}`,
    `pronouns: ${context.pronouns}`,
    `age_years: ${context.ageYears}`,
    `reading_profile: ${context.profile}`,
    `money_lesson_key: ${context.lesson}`,
    `interests: [${context.interests.map((interest) => `\"${interest}\"`).join(", ") || "\"everyday family activities\""}]`,
    `required_page_count: ${pageCount}`
  ].join("\n");
}

export function buildBeatPlannerSystemPrompt(): string {
  return [
    "You are a beat-sheet planner for children's money-learning stories.",
    "",
    "You must produce a hero's-journey-style beat sheet with strict educational alignment.",
    "",
    "Core constraints:",
    "- Bitcoin timing: around 80% of beats explore the problem and only around 20% feature Bitcoin as late-stage resolution.",
    "- Child agency: the child is the hero and makes meaningful choices that change the outcome.",
    "- Anti-Mad-Libs: conflicts must be specific, emotionally believable, and grounded in the child's interests.",
    "- Montessori alignment: for under 6, keep scenes reality-based and practical-life oriented; avoid fantasy systems/creatures as plot engine.",
    "- Science-of-Reading planning: include controlled vocabulary, repetition, and taught-word sequencing using decodabilityTags and newWordsIntroduced.",
    "- If age or profile implies early-reader constraints, keep new words sparse and intentional.",
    "- Avoid hype, guaranteed returns, and risk-free claims.",
    "",
    "For each beat, fill:",
    "- purpose",
    "- conflict",
    "- sceneLocation",
    "- emotionalTarget",
    "- pageIndexEstimate (0-based rough mapping)",
    "- decodabilityTags",
    "- newWordsIntroduced",
    "- bitcoinRelevanceScore (0..1)",
    "",
    "Keep output concise and non-repetitive.",
    jsonOnlyBlock("BeatSheet")
  ].join("\n");
}

export function buildBeatPlannerPrompt(
  context: StoryTemplateContext,
  pageCount: number,
  constraints?: BeatPromptConstraints
): string {
  const constrainedScoringLine = constraints
    ? `Set exactly ${constraints.minHighBeats}-${constraints.maxHighBeats} beats to bitcoinRelevanceScore >= ${constraints.highScoreThreshold}, and only for beats with index >= ${constraints.allowedHighStartIndex}.`
    : "Keep bitcoinRelevanceScore high mainly in the final part of the arc.";

  return [
    "Create a beat sheet for this child profile.",
    profileBlock(context, pageCount),
    "",
    "Enforce beats.length exactly equal to required_page_count.",
    constrainedScoringLine,
    "Include canonical decodability tags in every beat: controlled_vocab, repetition, or taught_words.",
    "For early readers, keep newWordsIntroduced <= 2 per beat and schedule taught words (e.g. Bitcoin) late.",
    "Avoid abstract finance jargon (e.g., inflation, purchasing power) unless translated into concrete child-level language.",
    "Include at least two beats where the child makes an explicit choice between options and the next beat shows consequences.",
    "Final beat must show concrete payoff/resolution of the child's saving decision.",
    "Use calm, concrete, child-centered settings.",
    jsonOnlyBlock("BeatSheet")
  ].join("\n");
}

export function buildMontessoriCriticPrompt(
  context: StoryTemplateContext,
  beatSheetJson: string
): string {
  return [
    "Role: Montessori validator for children's narrative beats.",
    profileBlock(context, 0),
    "",
    "Task:",
    "1) If age_years < 6 or profile is read_aloud_3_4, verify reality-based practical-life framing.",
    "2) For age_years >= 6 (and non-read-aloud), do not apply under-6 realism strictness; only flag concrete blockers.",
    "3) Flag adult-imposed fantasy framing (magic systems, fantasy creatures, enchanted worlds).",
    "4) Preserve child agency and interests in proposed fixes.",
    "5) Preserve late-stage Bitcoin resolution beats required by the beat constraints; do not recommend removing Bitcoin entirely.",
    "6) Return at most 3 issues, only for objective blockers.",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildScienceOfReadingCriticPrompt(
  context: StoryTemplateContext,
  beatSheetJson: string
): string {
  return [
    "Role: Science-of-Reading validator for early-reader planning.",
    profileBlock(context, 0),
    "",
    "Only flag objective blockers. Use these rules:",
    "- Flag when newWordsIntroduced has more than 2 items for an early-reader beat.",
    "- Flag when decodabilityTags miss canonical tags: controlled_vocab, repetition, or taught_words.",
    "- Flag when taught words like Bitcoin are introduced too early.",
    "- Flag when comprehension depends entirely on pictures instead of explicit text-level meaning.",
    "- Do not flag merely for discussing price changes/scarcity if language is concrete and age-appropriate.",
    "- Preserve the required late-stage Bitcoin resolution structure; propose compatible rewrites instead of removing Bitcoin.",
    "- Return at most 3 issues, prioritizing the highest-severity blockers.",
    "- If no objective blockers exist, return pass=true and issues=[].",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildNarrativeFreshnessCriticPrompt(
  context: StoryTemplateContext,
  beatSheetJson: string
): string {
  return [
    "Role: Narrative freshness and anti-Mad-Libs critic for children's stories.",
    profileBlock(context, 0),
    "",
    "Check objective narrative blockers only:",
    "- Child makes at least two meaningful choices that affect the outcome.",
    "- Conflicts are specific and emotionally believable, avoiding generic Mad-Libs beats.",
    "- Emotional targets progress across the arc (not flat or repetitive).",
    "- Interests are integrated with plot impact, not token mentions.",
    "- Lesson is shown through consequences, not preachy moralizing.",
    "- Preserve required late-stage Bitcoin resolution beats and improve specificity around them rather than deleting them.",
    "- Do NOT flag minor wording/style preferences that can be handled at page-writing stage.",
    "- If the beat sheet clearly has two child-driven choices plus a concrete final payoff, return pass=true unless a major structural blocker remains.",
    "- Return at most 3 highest-severity issues.",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildBeatRewritePrompt(
  context: StoryTemplateContext,
  originalBeatSheetJson: string,
  rewriteInstructions: string,
  constraints?: BeatPromptConstraints
): string {
  const constrainedScoringLine = constraints
    ? `- Enforce this scoring contract exactly: ${constraints.minHighBeats}-${constraints.maxHighBeats} beats must have bitcoinRelevanceScore >= ${constraints.highScoreThreshold}, and only beat indexes >= ${constraints.allowedHighStartIndex} may use scores >= ${constraints.highScoreThreshold}.`
    : "- Keep high bitcoin relevance scores concentrated in late beats.";

  return [
    "You are rewriting a beat sheet to satisfy validator and critic issues.",
    profileBlock(context, 0),
    "",
    "Rules:",
    "- Preserve beats that were not flagged unless global constraints require a cascade change.",
    "- Apply rewrite instructions literally and keep schema compliance.",
    constrainedScoringLine,
    "- Maintain the 80% problem / 20% Bitcoin resolution spirit.",
    "- Ensure every beat includes at least one canonical decodability tag: controlled_vocab, repetition, or taught_words.",
    "- For early-reader profiles, keep newWordsIntroduced <= 2 in every beat and introduce taught words like Bitcoin only in the final 20% of beats.",
    "- Ensure at least two explicit child choices with visible downstream consequences.",
    "- Ensure the final beat contains clear concrete payoff/resolution of the savings arc.",
    "- Keep the child hero active with meaningful choices.",
    "",
    "Original beat sheet JSON:",
    originalBeatSheetJson,
    "",
    "Rewrite instructions:",
    rewriteInstructions,
    jsonOnlyBlock("BeatSheet")
  ].join("\n");
}

export function buildPageWriterPrompt(
  context: StoryTemplateContext,
  beatSheet: BeatSheet,
  pageCount: number
): string {
  return [
    "You are a children's story page writer.",
    "Write the final pages from this approved beat sheet.",
    profileBlock(context, pageCount),
    "",
    "Writing constraints:",
    "- Exactly one page object per page index from 0 to pageCount-1.",
    "- Language must be age-appropriate, concrete, and consequence-driven.",
    "- For younger readers keep sentence complexity low and repetition intentional.",
    "- Avoid hype and investment promises.",
    "",
    "Approved beat sheet JSON:",
    JSON.stringify(beatSheet),
    jsonOnlyBlock("StoryPackage")
  ].join("\n");
}

export function buildCriticPrompt(context: StoryTemplateContext, storyJson: string): string {
  return [
    "You are a strict final-story quality critic for a children's money-learning app.",
    `Reading profile: ${context.profile}`,
    "Evaluate:",
    "- Bitcoin reveal remains late in explicit wording.",
    "- No banned phrases like guaranteed returns or risk-free gains.",
    "- Reading complexity matches profile.",
    "- Story remains emotionally coherent and child-led.",
    "Story JSON:",
    storyJson,
    jsonOnlyBlock("StoryCriticVerdict")
  ].join("\n");
}

export function stylePrefix(): string {
  return "Muted watercolor palette, matte texture, calm composition, minimal clutter.";
}
