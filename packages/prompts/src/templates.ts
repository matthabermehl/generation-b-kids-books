import type { BeatSheet, MoneyLessonKey, ReadingProfile, StoryConcept } from "@book/domain";

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
    "3-7 Bitcoin guardrails:",
    "- Keep the child's visible actions physical and observable: count coins, save, wait, choose, earn, compare what the same coins buy, or choose a smaller item.",
    "- Bitcoin must positively support the story theme and money lesson. It may recur briefly across the story when it feels natural.",
    "- If Bitcoin is named directly, keep it in caregiver or narrator language, never as a child decoding target or child explanation task.",
    "- Do not make Bitcoin the child's taught decoding word or a child-facing newWordsIntroduced item.",
    "- Do NOT use device-first or fintech-first framing as the main plot mechanic: tablet, app, phone, digital jar, wallet, password, QR code, transfer, blockchain, chart, or market screen.",
    "- Do NOT make the child independently move digital money or explain hidden technical mechanics.",
    "- Price-change examples must be countable and concrete, such as 'last week 3 coins bought 2 candies; now 3 coins buy 1 candy' or 'the lamp costs 1 more coin now.'",
    "- Avoid abstract cause language such as supplier shock, market volatility, scarcity curves, or purchasing power unless rewritten into an observable child-level event.",
    "- A good pattern is: the child makes careful saving choices, sees concrete consequences, and caregiver or narrator language can connect Bitcoin to that same long-term saving theme in a brief, positive, grounded way."
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

function conceptBlock(concept: StoryConcept): string {
  return JSON.stringify(concept);
}

export function buildStoryConceptSystemPrompt(): string {
  return [
    "You are a children's story concept planner for money-learning picture books.",
    "Create a lightweight story spine that prevents ad-hoc plot inventions and preserves setup/payoff continuity.",
    "Choose exactly one caregiver label: Mom or Dad.",
    "Choose exactly two child-safe earning options the child can really do.",
    "For ages 3-7, Bitcoin must positively reinforce the saving theme in a child-safe, concrete way without becoming a separate lecture.",
    jsonOnlyBlock("StoryConcept")
  ].join("\n");
}

export function buildStoryConceptPrompt(
  context: StoryTemplateContext,
  pageCount: number
): string {
  return [
    "Create a StoryConcept for this child profile.",
    profileBlock(context, pageCount),
    "",
    "Rules:",
    "- Choose one concrete target item the child cares about.",
    "- Set targetPrice, startingAmount, and gapAmount so targetPrice = startingAmount + gapAmount.",
    "- Choose exactly two earningOptions. Each option must have an exact label, an exact action, and a sceneLocation.",
    "- All earning options must be child-safe and plausible for the given age.",
    "- temptation must be a specific small-now purchase or choice that competes with the goal.",
    "- deadlineEvent may be null. If non-null, it must be concrete, seedable before the ending, and matter to the payoff.",
    "- bitcoinBridge must capture the canonical thematic guidance for how Bitcoin can positively connect to this exact story, target item, and saving choice. Treat it as guidance for later writing, not an exact quote to reproduce.",
    "- requiredSetups should list the specific nouns, options, events, or facts that must appear before they matter.",
    "- requiredPayoffs should list the exact things the ending must resolve.",
    "- forbiddenLateIntroductions should list nouns/events that would feel ad-hoc if they suddenly appeared near the end.",
    "- Default caregiverLabel to Mom or Dad only; never use generic caregiver labels here.",
    ...youngProfileBitcoinGuardrails(context),
    jsonOnlyBlock("StoryConcept")
  ].join("\n");
}

export function buildBeatPlannerSystemPrompt(): string {
  return [
    "You are a beat-sheet planner for children's money-learning stories.",
    "",
    "You must produce a hero's-journey-style beat sheet with strict educational alignment and strict continuity to the supplied StoryConcept.",
    "",
    "Core constraints:",
    "- Bitcoin theme: Bitcoin must positively support the story's saving theme and may recur wherever it naturally reinforces the child's arc.",
    "- Child agency: the child is the hero and makes meaningful choices that change the outcome.",
    "- Anti-Mad-Libs: conflicts must be specific, emotionally believable, and grounded in the child's interests and the supplied StoryConcept.",
    "- Montessori alignment: for under 6, keep scenes reality-based and practical-life oriented; avoid fantasy systems/creatures as plot engine.",
    "- Science-of-Reading planning: include controlled vocabulary, repetition, and taught-word sequencing using decodabilityTags and newWordsIntroduced.",
    "- If age or profile implies early-reader constraints, keep new words sparse and intentional.",
    "- Do not invent a new caregiver term, a new chore label, or a new deadline/event that is not already supported by the StoryConcept.",
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
    "- bitcoinRelevanceScore (0..1 thematic salience for how strongly the beat supports the story's Bitcoin-linked saving theme)",
    "- introduces",
    "- paysOff",
    "- continuityFacts (parseable key:value strings; always include caregiver_label and deadline_event, and when relevant chosen_earning_option or count_target)",
    "",
    "Keep output concise and non-repetitive.",
    jsonOnlyBlock("BeatSheet")
  ].join("\n");
}

export function buildBeatPlannerPrompt(
  context: StoryTemplateContext,
  concept: StoryConcept,
  pageCount: number,
  _constraints?: BeatPromptConstraints
): string {
  return [
    "Create a beat sheet for this child profile from the supplied StoryConcept.",
    profileBlock(context, pageCount),
    "",
    "StoryConcept JSON:",
    conceptBlock(concept),
    "",
    "Rules:",
    "Enforce beats.length exactly equal to required_page_count.",
    "Reuse sceneId values when two or more beats belong to the same continuing scene so later image planning can preserve continuity.",
    "Keep sceneVisualDescription concrete, visually specific, and stable enough to anchor repeated illustrations of the same scene.",
    "Honor the StoryConcept exactly: caregiverLabel, earningOptions, temptation, deadlineEvent, requiredSetups, requiredPayoffs, and forbiddenLateIntroductions are the source of truth.",
    "Use bitcoinRelevanceScore to show how strongly each beat positively supports the story's Bitcoin-linked saving theme; this is thematic salience, not a late-placement quota.",
    "Include canonical decodability tags in every beat: controlled_vocab, repetition, or taught_words.",
    "For early readers, keep newWordsIntroduced <= 2 per beat and keep child-facing taught words concrete.",
    "For read_aloud_3_4 and early_decoder_5_7, keep child-facing newWordsIntroduced concrete and do not put Bitcoin itself in newWordsIntroduced.",
    "Include at least two beats where the child makes an explicit choice between options and the next beat shows consequences.",
    "If a deadlineEvent is used in the final two beats, it must be introduced earlier.",
    "Do not invent a third earning option or rename the concept's earning options.",
    "Every beat continuityFacts array must include caregiver_label and deadline_event.",
    "When a beat uses one earning option, include chosen_earning_option:<exact label>.",
    "When a beat features counting toward the target, include count_target:<targetPrice>.",
    "At least one beat should make the positive Bitcoin-saving connection explicit in bitcoinRelevanceScore and the beat's purpose/conflict.",
    "Final beat must show concrete payoff/resolution of the child's saving decision.",
    "Use calm, concrete, child-centered settings.",
    ...youngProfileBitcoinGuardrails(context),
    jsonOnlyBlock("BeatSheet")
  ].join("\n");
}

export function buildMontessoriCriticPrompt(
  context: StoryTemplateContext,
  conceptJson: string,
  beatSheetJson: string
): string {
  return [
    "Role: Montessori validator for children's narrative beats.",
    profileBlock(context, 0),
    "",
    "StoryConcept JSON:",
    conceptJson,
    "",
    "Task:",
    "1) If age_years < 6 or profile is read_aloud_3_4, verify reality-based practical-life framing.",
    "2) Flag age-implausible chores, unsafe earning actions, or unrealistic child responsibility levels as hard issues.",
    "3) Flag beats that rename the caregiver, earning options, or deadline from the StoryConcept.",
    "4) Preserve child agency and interests in proposed fixes.",
    "5) Preserve child-safe Bitcoin handling: keep it grounded, positive, and secondary to the child's concrete arc.",
    "6) Classify each issue with tier='hard' or tier='soft'.",
    "7) Hard issues are objective blockers that should trigger a rewrite or fail the beat sheet.",
    "8) Soft issues are advisory notes for a report; they must not block by themselves.",
    "9) Set pass=true when there are no hard issues, even if soft issues remain.",
    "10) Return at most 2 hard issues and at most 2 soft issues.",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildScienceOfReadingCriticPrompt(
  context: StoryTemplateContext,
  conceptJson: string,
  beatSheetJson: string
): string {
  return [
    "Role: Science-of-Reading validator for early-reader planning.",
    profileBlock(context, 0),
    "",
    "StoryConcept JSON:",
    conceptJson,
    "",
    "Only flag objective blockers. Use these rules:",
    "- Flag when newWordsIntroduced has more than 2 items for an early-reader beat.",
    "- Flag when decodabilityTags miss canonical tags: controlled_vocab, repetition, or taught_words.",
    "- Flag when comprehension depends entirely on pictures instead of explicit text-level meaning.",
    "- Do not decode or repeat the word Bitcoin; flag beats that ask the child to decode or repeat the word Bitcoin.",
    "- For ages 3-7, Bitcoin may recur in caregiver or narrator language if it stays concrete, positive, and child-safe.",
    "- Flag beats that make Bitcoin a child-facing newWordsIntroduced item or a technical/device-first explanation.",
    "- Prefer concrete child-facing words like coin, jar, wait, count, choice, more, less, and price.",
    "- Classify each issue with tier='hard' or tier='soft'.",
    "- Hard issues are objective blockers that should trigger rewrite/fail.",
    "- Soft issues are advisory notes only and must not block by themselves.",
    "- Set pass=true when there are no hard issues, even if soft issues remain.",
    "- Return at most 3 issues, prioritizing the highest-severity blockers.",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildNarrativeFreshnessCriticPrompt(
  context: StoryTemplateContext,
  conceptJson: string,
  beatSheetJson: string
): string {
  return [
    "Role: Narrative freshness and story-logic critic for children's stories.",
    profileBlock(context, 0),
    "",
    "StoryConcept JSON:",
    conceptJson,
    "",
    "Check objective narrative blockers only:",
    "- Child makes at least two meaningful choices that affect the outcome.",
    "- Conflicts are specific and emotionally believable, avoiding generic Mad-Libs beats.",
    "- Emotional targets progress across the arc.",
    "- Interests are integrated with plot impact, not token mentions.",
    "- Late important elements are seeded before they matter.",
    "- A beat must not introduce a new deadline, event, or plot mechanic that the StoryConcept forbids as a late introduction.",
    "- Earning-option action continuity must stay coherent. Do not switch from one named option to a different action with no bridge.",
    "- Bitcoin should feel positively tied to the child's specific saving arc and story theme, not pasted on or contradictory.",
    "- Classify each issue with tier='hard' or tier='soft'.",
    "- Hard issues are structural blockers that should trigger rewrite/fail.",
    "- Soft issues are advisory notes only and must not block by themselves.",
    "- Set pass=true when there are no hard issues, even if soft issues remain.",
    "- Return at most 2 hard issues and at most 2 soft issues.",
    "",
    "Beat sheet JSON:",
    beatSheetJson,
    jsonOnlyBlock("CriticVerdict")
  ].join("\n");
}

export function buildBeatRewritePrompt(
  context: StoryTemplateContext,
  conceptJson: string,
  originalBeatSheetJson: string,
  rewriteInstructions: string,
  _constraints?: BeatPromptConstraints
): string {
  return [
    "You are rewriting a beat sheet to satisfy validator and critic issues.",
    profileBlock(context, 0),
    "",
    "StoryConcept JSON:",
    conceptJson,
    "",
    "Rules:",
    "- Preserve beats that were not flagged unless global constraints require a cascade change.",
    "- Apply rewrite instructions literally and keep schema compliance.",
    "- Treat bitcoinRelevanceScore as thematic salience for how strongly a beat positively supports the story's Bitcoin-linked saving theme.",
    "- Honor the StoryConcept exactly. Do not invent a new caregiver term, earning option, or deadline/event outside the concept.",
    "- Ensure every beat includes at least one canonical decodability tag: controlled_vocab, repetition, or taught_words.",
    "- For early-reader profiles, keep newWordsIntroduced <= 2 in every beat and do not make Bitcoin a decoding target.",
    "- Bitcoin may recur where it naturally supports the theme, but it must stay child-safe, concrete, and secondary to the child's actions.",
    "- Ensure at least two explicit child choices with visible downstream consequences.",
    "- Ensure the final beat contains clear concrete payoff/resolution of the savings arc.",
    "- If the ending depends on a deadlineEvent, seed it before the final two beats.",
    "- Keep continuityFacts parseable and aligned to the StoryConcept.",
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
  concept: StoryConcept,
  beatSheet: BeatSheet,
  pageCount: number,
  rewriteInstructions = ""
): string {
  return [
    "You are a children's story page writer.",
    "Write the final pages from this approved StoryConcept and beat sheet.",
    profileBlock(context, pageCount),
    "",
    "StoryConcept JSON:",
    conceptBlock(concept),
    "",
    "Approved beat sheet JSON:",
    JSON.stringify(beatSheet),
    "",
    "Writing constraints:",
    "- Exactly one page object per page index from 0 to pageCount-1.",
    "- Each page must copy the matching beat's sceneId exactly so scene continuity stays stable.",
    "- Each page must include sceneVisualDescription that matches the approved beat while staying concise and visually concrete.",
    "- Use the caregiverLabel from StoryConcept consistently when naming the caregiver. Generic terms like people, adults, or grown-ups are fine when they are not relabeling the named caregiver.",
    "- Preserve beat continuityFacts semantically.",
    "- If the child counts aloud, spell the count sequentially unless the text explicitly says it is skip-counting.",
    "- Do not introduce a deadline, event, or option that was not seeded earlier by the concept and beats.",
    "- Do not swap a chosen earning-option label for a different action unless the beat explicitly changes it.",
    "- Language must be age-appropriate, concrete, and consequence-driven.",
    "- For younger readers keep sentence complexity low and repetition intentional.",
    "- Avoid hype and investment promises.",
    "- Bitcoin must positively reinforce the story theme and saving lesson, but stay secondary to the child's concrete arc.",
    "- Use StoryConcept.bitcoinBridge as thematic guidance, not as an exact quote that must be copied.",
    "- If Bitcoin is named directly, keep it in caregiver or narrator language; the child should not say, decode, or explain Bitcoin.",
    "- Bitcoin may recur briefly across the story if it stays grounded and child-safe.",
    "- Keep adult-managed money tools secondary; the child's visible choices and consequences must stay primary.",
    ...(rewriteInstructions.trim().length > 0
      ? [
          "",
          "Rewrite instructions:",
          rewriteInstructions
        ]
      : []),
    jsonOnlyBlock("StoryPackage")
  ].join("\n");
}

export function buildCriticPrompt(
  context: StoryTemplateContext,
  concept: StoryConcept,
  storyJson: string
): string {
  return [
    "You are a strict final-story quality critic for a children's money-learning app.",
    `Reading profile: ${context.profile}`,
    "",
    "StoryConcept JSON:",
    conceptBlock(concept),
    "",
    "Evaluate using these questions:",
    "- Does every important late element get introduced before it matters?",
    "- Is caregiver wording consistent with StoryConcept.caregiverLabel without over-penalizing generic class words like adults, people, or grown-ups?",
    "- If the child counts aloud, is the sequence complete and natural for the age?",
    "- Do actions remain physically and logically consistent across adjacent pages?",
    "- Are age-implausible chores or responsibilities present?",
    "- Does Bitcoin positively reinforce the saving theme rather than feeling pasted on?",
    "- If Bitcoin appears, is it kept child-safe, concrete, non-technical, and out of the child's decoding or explaining voice?",
    "- Do not require exact reuse of StoryConcept.bitcoinBridge wording; judge thematic fit instead.",
    "- Use theme_integration for weak or bolted-on Bitcoin theming. Reserve bitcoin_fit for actual policy violations such as hype, technical framing, child-speaking Bitcoin, or thematic contradiction.",
    "- Does the ending resolve the original goal and required payoffs without introducing a new unseeded event?",
    "",
    "Return hard issues for blockers and soft issues for polish only.",
    "Story JSON:",
    storyJson,
    jsonOnlyBlock("StoryCriticVerdict")
  ].join("\n");
}

export function stylePrefix(): string {
  return "Muted watercolor palette, matte texture, calm composition, minimal clutter.";
}
