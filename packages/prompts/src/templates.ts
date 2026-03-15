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

function isYoungPictureBookContext(context: StoryTemplateContext): boolean {
  return (
    context.profile === "read_aloud_3_4" ||
    context.profile === "early_decoder_5_7" ||
    context.ageYears <= 7
  );
}

function youngProfileBitcoinGuardrails(context: StoryTemplateContext): string[] {
  if (!isYoungPictureBookContext(context)) {
    return [];
  }

  return [
    "3-7 late-Bitcoin guardrails:",
    "- Keep the child's visible actions physical and observable: count coins, save, wait, choose, earn, compare what the same coins buy, or choose a smaller item.",
    "- If Bitcoin appears at all, keep it to one brief caregiver/adult line or note in the final 1-2 beats; do not make Bitcoin the child's taught decoding word.",
    "- If an adult briefly names Bitcoin at the end, do not add taught_words solely for that adult aside; keep decodabilityTags centered on controlled_vocab and repetition unless the child truly has to decode a new word.",
    "- Do NOT use device-first or fintech-first framing as the main plot mechanic: tablet, app, phone, digital jar, wallet, password, QR code, transfer, blockchain, chart, or market screen.",
    "- Do NOT make the child independently move digital money or explain hidden technical mechanics.",
    "- Price-change examples must be countable and concrete, such as 'last week 3 coins bought 2 candies; now 3 coins buy 1 candy' or 'the lamp costs 1 more coin now.'",
    "- Avoid abstract cause language such as supplier shock, market volatility, scarcity curves, or purchasing power unless rewritten into an observable child-level event.",
    "- A good late-resolution pattern is: the child makes a careful physical saving choice, reaches a concrete payoff, and an adult may briefly name Bitcoin as one grown-up saving idea without shifting the story into a device lesson."
  ];
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
    "- For ages 3-7, keep any late Bitcoin framing adult-led, concrete, and secondary to the child's physical saving choices.",
    "- For ages 3-7, avoid tablet/app/digital-jar/transfer/password/wallet plots; they trigger abstraction and realism failures.",
    "",
    "For each beat, fill:",
    "- purpose",
    "- conflict",
    "- sceneLocation",
    "- sceneId (stable short slug reused whenever the story returns to the same visual scene)",
    "- sceneVisualDescription (compact canonical look-and-feel description for that scene)",
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
    "Reuse sceneId values when two or more beats belong to the same continuing scene so later image planning can preserve continuity.",
    "Keep sceneVisualDescription concrete, visually specific, and stable enough to anchor repeated illustrations of the same scene.",
    constrainedScoringLine,
    "Include canonical decodability tags in every beat: controlled_vocab, repetition, or taught_words.",
    "For early readers, keep newWordsIntroduced <= 2 per beat and schedule true child-facing taught words late.",
    "For read_aloud_3_4 and early_decoder_5_7, do not use taught_words solely because an adult briefly names Bitcoin in a final aside; that adult label should remain background, not a decoding target.",
    "For read_aloud_3_4 and early_decoder_5_7, keep child-facing newWordsIntroduced concrete; prefer not to put Bitcoin itself in newWordsIntroduced.",
    "Avoid abstract finance jargon (e.g., inflation, purchasing power) unless translated into concrete child-level language.",
    "Include at least two beats where the child makes an explicit choice between options and the next beat shows consequences.",
    "Final beat must show concrete payoff/resolution of the child's saving decision.",
    "Use calm, concrete, child-centered settings.",
    ...youngProfileBitcoinGuardrails(context),
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
    "6) For ages 3-7, an acceptable late Bitcoin beat is concrete and caregiver-managed: the child still saves/chooses with physical coins while an adult may briefly name Bitcoin in one final aside.",
    "7) Do not demand app, password, transfer, wallet, custody, or regulatory mechanics; those are not Montessori practical-life details for this age.",
    "8) Treat tablet/app/digital-jar framing as riskier than a simple caregiver aside; prefer observable child actions over device workflow detail.",
    "9) A single final caregiver-managed Bitcoin label with no device mechanics is soft at most, not a hard blocker.",
    "10) Do not hard-fail because a grown-up term sounds advanced if the child does not have to decode or act on it.",
    "11) Classify each issue with tier='hard' or tier='soft'.",
    "12) Hard issues are objective blockers that should trigger a rewrite or fail the beat sheet.",
    "13) Soft issues are advisory notes for a review report; they must not block the book by themselves.",
    "14) Set pass=true when there are no hard issues, even if soft issues remain.",
    "15) Return at most 2 hard issues and at most 2 soft issues.",
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
    "- For ages 3-7, it is acceptable for Bitcoin to appear only as one brief adult/caregiver label in the final 1-2 beats while child-facing vocabulary stays concrete.",
    "- Do NOT require extra taught_words tags simply because an adult-managed Bitcoin concept exists in the background.",
    "- For ages 3-7, a final adult-only Bitcoin label must not be treated as a child taught word; taught_words-tag cleanup around that label is at most a soft issue unless the child must decode or repeat the word.",
    "- Do NOT hard-fail late beats solely because bitcoinRelevanceScore is high when explicit Bitcoin wording is absent or limited to an adult-only final aside.",
    "- Do NOT push device jargon such as tablet, app, wallet, digital jar, password, transfer, QR code, or chart as the way to satisfy specificity.",
    "- Prefer concrete child-facing words like coin, jar, wait, count, choice, more, less, and price.",
    "- Classify each issue with tier='hard' or tier='soft'.",
    "- Hard issues are objective blockers that should trigger rewrite/fail.",
    "- Soft issues are advisory notes for a report only and must not block the book by themselves.",
    "- Set pass=true when there are no hard issues, even if soft issues remain.",
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
    "- For ages 3-7, good specificity comes from visible child consequences (coin counts, same coins buy less, smaller item chosen), not from tablet/app/transfer mechanics.",
    "- Do not recommend tablet/app/wallet/digital-transfer plots unless absolutely necessary; they usually weaken realism and child agency for this age.",
    "- Preserve child agency by keeping the decisive action the child's observable choice, even if an adult briefly names a grown-up tool near the end.",
    "- Classify each issue with tier='hard' or tier='soft'.",
    "- Hard issues are structural blockers that should trigger rewrite/fail.",
    "- Soft issues are advisory notes for a report only and must not block the book by themselves.",
    "- Set pass=true when there are no hard issues, even if soft issues remain.",
    "- Do NOT flag minor wording/style preferences that can be handled at page-writing stage.",
    "- If the beat sheet clearly has two child-driven choices plus a concrete final payoff, return pass=true unless a hard structural blocker remains.",
    "- Return at most 2 hard issues and at most 2 soft issues.",
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
    "- For ages 3-7, keep child-facing new words concrete and avoid making Bitcoin itself a decoding target.",
    "- For ages 3-7, do not add taught_words solely because an adult briefly names Bitcoin in the final aside; keep the adult label backgrounded and non-decodable.",
    "- Ensure at least two explicit child choices with visible downstream consequences.",
    "- Ensure the final beat contains clear concrete payoff/resolution of the savings arc.",
    "- Keep the child hero active with meaningful choices.",
    ...youngProfileBitcoinGuardrails(context),
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
    "- Each page must copy the matching beat's sceneId exactly so scene continuity stays stable.",
    "- Each page must include sceneVisualDescription that matches the approved beat while staying concise and visually concrete.",
    "- Language must be age-appropriate, concrete, and consequence-driven.",
    "- For younger readers keep sentence complexity low and repetition intentional.",
    "- Avoid hype and investment promises.",
    "- Keep the child's key actions physical and observable on the page: counting, saving, waiting, choosing, earning, comparing prices, or buying a smaller item.",
    "- Show price changes with countable examples rather than abstract economic explanations.",
    "- Do not use device or fintech jargon in page text: tablet, app, digital jar, wallet, password, transfer, QR code, blockchain, market, or volatility.",
    "- For read_aloud_3_4 and early_decoder_5_7, if Bitcoin appears at all, limit it to one short caregiver/adult line near the end; do not teach it as the child's decoding word.",
    "- Keep adult-managed money tools secondary; the child's visible choices and consequences must stay primary.",
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
    "- For ages 3-7, page text stays concrete and observable, without tablet/app/digital-jar/transfer/password jargon.",
    "- For ages 3-7, any explicit Bitcoin wording is limited to one brief adult/caregiver line near the end rather than repeated child-facing exposition.",
    "Story JSON:",
    storyJson,
    jsonOnlyBlock("StoryCriticVerdict")
  ].join("\n");
}

export function stylePrefix(): string {
  return "Muted watercolor palette, matte texture, calm composition, minimal clutter.";
}
