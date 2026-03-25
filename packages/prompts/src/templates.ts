import {
  getMoneyLessonDefinition,
  storyConceptCountTarget,
  storyConceptDeadlineEvent,
  storyConceptEarningOptionLabels,
  type BeatSheet,
  type MoneyLessonKey,
  type ReadingProfile,
  type StoryConcept
} from "@book/domain";

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
    "- Bitcoin must positively support the story's money values and lesson. It may recur briefly across the story when it feels natural.",
    "- If Bitcoin is named directly, keep it in caregiver or narrator language, never as a child decoding target or child explanation task.",
    "- Do not make Bitcoin the child's taught decoding word or a child-facing newWordsIntroduced item.",
    "- Do NOT use device-first or fintech-first framing as the main plot mechanic: tablet, app, phone, digital jar, wallet, password, QR code, transfer, blockchain, chart, or market screen.",
    "- Do NOT make the child independently move digital money or explain hidden technical mechanics.",
    "- Price-change examples must be countable and concrete, such as 'last week 3 coins bought 2 candies; now 3 coins buy 1 candy' or 'the lamp costs 1 more coin now.'",
    "- Avoid abstract cause language such as supplier shock, market volatility, scarcity curves, or purchasing power unless rewritten into an observable child-level event.",
    "- A good pattern is: the child lives the value first through a concrete experience, then caregiver or narrator language connects Bitcoin to that same patience, fairness, stewardship, or earned-reward theme in a brief, positive, grounded way."
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

function lessonDefinitionBlock(lesson: MoneyLessonKey): string[] {
  const definition = getMoneyLessonDefinition(lesson);
  return [
    `lesson_label: ${definition.label}`,
    `lesson_helper_text: ${definition.helperText}`,
    `lesson_emotional_arc_target: ${definition.emotionalArcTarget}`,
    `lesson_bitcoin_value_thread: ${definition.bitcoinValueThread}`,
    `lesson_scenario_guidance: ${definition.scenarioGuidance}`
  ];
}

function lessonScenarioRules(lesson: MoneyLessonKey): string[] {
  switch (lesson) {
    case "prices_change":
      return [
        "- lessonScenario.moneyLessonKey must be prices_change.",
        "- Choose one concrete anchorItem the child can notice across two price moments.",
        "- beforePrice and afterPrice must be positive integers, and afterPrice must be greater than beforePrice.",
        "- purchaseUnit must be a simple countable money unit such as coins or tickets.",
        "- countableComparison must describe an observable before/after comparison a child can picture.",
        "- noticingMoment must be a specific child-level moment when the price change becomes emotionally real."
      ];
    case "jar_saving_limits":
      return [
        "- lessonScenario.moneyLessonKey must be jar_saving_limits.",
        "- Choose one concrete target item the child cares about.",
        "- Set targetPrice, startingAmount, and gapAmount so targetPrice = startingAmount + gapAmount.",
        "- Choose exactly two earningOptions. Each option must have an exact label, an exact action, and a sceneLocation.",
        "- All earning options must be child-safe and plausible for the given age.",
        "- temptation must be a specific small-now purchase or choice that competes with the goal."
      ];
    case "new_money_unfair":
      return [
        "- lessonScenario.moneyLessonKey must be new_money_unfair.",
        "- Use a child-scale game or ticket system with one gameName and one tokenName.",
        "- childGoal must be concrete and emotionally meaningful inside the game.",
        "- ruleDisruption must describe extra tokens, tickets, or points appearing midstream in a way the child can feel as unfair.",
        "- fairnessRepair must name the calmer, fairer rule or explanation that restores understanding."
      ];
    case "keep_what_you_earn":
      return [
        "- lessonScenario.moneyLessonKey must be keep_what_you_earn.",
        "- workAction must be one practical child-safe job the child can actually do.",
        "- earnedReward must be concrete and countable.",
        "- rewardUse must show what the child hopes to do with the reward.",
        "- unfairLossRisk must describe a child-safe way the reward is weakened, diluted, or threatened so the child can feel why effort should be respected."
      ];
    case "better_rules":
      return [
        "- lessonScenario.moneyLessonKey must be better_rules.",
        "- Use one concrete gameName with a brokenRule that feels unfair in play.",
        "- fairRule must be the stable replacement rule that everyone can understand.",
        "- sharedGoal must capture what the group wants to achieve together under fairer rules."
      ];
  }
}

function pageLengthGuardrails(context: StoryTemplateContext): string[] {
  if (context.profile === "read_aloud_3_4") {
    return [
      "- For read_aloud_3_4, every page must stay at 4 sentences or fewer.",
      "- Prefer 2-3 short sentences on most pages and combine tiny observations instead of stacking many clipped sentences.",
      "- Keep each sentence simple enough for a calm bedtime read-aloud.",
      "- If a page includes quoted dialogue, prefer one short quoted sentence plus narration instead of a long two-sentence speech."
    ];
  }

  if (context.profile === "early_decoder_5_7") {
    return [
      "- For early_decoder_5_7, every page must stay at 45 words or fewer.",
      "- Prefer 2-4 short decodable sentences and keep very long words rare."
    ];
  }

  return [];
}

function betterRulesReadAloudEndingRules(
  context: StoryTemplateContext,
  pageCount: number
): string[] {
  if (context.profile !== "read_aloud_3_4" || context.lesson !== "better_rules" || pageCount < 2) {
    return [];
  }

  const penultimatePage = pageCount - 2;
  const finalPage = pageCount - 1;

  return [
    `- For better_rules in read_aloud_3_4, reserve page ${penultimatePage} for the clearest explicit Bitcoin bridge after the child has already felt why fair rules matter.`,
    `- Keep page ${finalPage} for emotional resolution only: togetherness, safety, calm pride, or relief. Do not introduce new Bitcoin explanation there.`
  ];
}

function betterRulesReadAloudCriticRules(context: StoryTemplateContext): string[] {
  if (context.profile !== "read_aloud_3_4" || context.lesson !== "better_rules") {
    return [];
  }

  return [
    "- For better_rules in read_aloud_3_4, the clearest explicit Bitcoin bridge should land by the penultimate page.",
    "- For better_rules in read_aloud_3_4, the final page should close emotionally and must not introduce new Bitcoin explanation."
  ];
}

export function buildStoryConceptSystemPrompt(): string {
  return [
    "You are a children's bedtime-story concept planner for warm money-value picture books.",
    "Create a lightweight story spine that prevents ad-hoc plot inventions, preserves setup/payoff continuity, and protects the emotional arc.",
    "Choose exactly one caregiver label: Mom or Dad.",
    "Build a StoryConcept whose lessonScenario exactly matches the supplied moneyLessonKey.",
    "For ages 3-7, Bitcoin must positively reinforce patience, fair rules, long-term thinking, stewardship, or earned rewards in a child-safe, concrete way without becoming a separate lecture.",
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
    ...lessonDefinitionBlock(context.lesson),
    "",
    "Rules:",
    "- premise must sound like a warm bedtime story setup rather than a lesson plan.",
    "- emotionalPromise must describe the emotional journey from tension or uncertainty to reassurance, closeness, and calm pride or relief.",
    "- caregiverWarmthMoment must name one specific moment where the caregiver offers calm reassurance, connection, or perspective.",
    "- bitcoinValueThread must capture the underlying value Bitcoin supports in this story, using the lesson's value thread rather than investment framing.",
    "- lessonScenario.moneyLessonKey must exactly equal the supplied money_lesson_key.",
    ...lessonScenarioRules(context.lesson),
    "- deadlineEvent may be null. If non-null, it must be concrete, seedable before the ending, and matter to the payoff.",
    "- bitcoinBridge must capture the canonical thematic guidance for how Bitcoin can positively connect to this exact story, lesson scenario, and value thread. Treat it as guidance for later writing, not an exact quote to reproduce.",
    "- requiredSetups should list the specific nouns, options, events, or facts that must appear before they matter.",
    "- requiredPayoffs should list the exact things the ending must resolve.",
    "- forbiddenLateIntroductions should list nouns/events that would feel ad-hoc if they suddenly appeared near the end.",
    "- Default caregiverLabel to Mom or Dad only; never use generic caregiver labels here.",
    "- Feature the child's lived value first, then connect Bitcoin second.",
    ...youngProfileBitcoinGuardrails(context),
    jsonOnlyBlock("StoryConcept")
  ].join("\n");
}

export function buildBeatPlannerSystemPrompt(): string {
  return [
    "You are a beat-sheet planner for warm bedtime stories about money values.",
    "",
    "You must produce a child-centered beat sheet with strict continuity to the supplied StoryConcept and a calm, emotionally relieving arc.",
    "",
    "Core constraints:",
    "- Bitcoin theme: Bitcoin must positively support the story's value thread in a story-first way and may recur wherever it naturally reinforces the child's arc.",
    "- Child agency: the child is the hero and makes meaningful choices, including at least one choice that clearly changes the outcome.",
    "- Caregiver warmth: include at least one clear caregiver reassurance or connection beat.",
    "- Emotional arc: move from wanting or uncertainty toward patience, understanding, closeness, and calm pride or relief.",
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
    "- bitcoinRelevanceScore (0..1 thematic salience for how strongly the beat supports the story's Bitcoin-linked value thread)",
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
    ...lessonDefinitionBlock(context.lesson),
    "",
    "StoryConcept JSON:",
    conceptBlock(concept),
    "",
    "Rules:",
    "Enforce beats.length exactly equal to required_page_count.",
    "Reuse sceneId values when two or more beats belong to the same continuing scene so later image planning can preserve continuity.",
    "Keep sceneVisualDescription concrete, visually specific, and stable enough to anchor repeated illustrations of the same scene.",
    "Honor the StoryConcept exactly: caregiverLabel, emotionalPromise, caregiverWarmthMoment, bitcoinValueThread, lessonScenario, requiredSetups, requiredPayoffs, and forbiddenLateIntroductions are the source of truth.",
    "Use bitcoinRelevanceScore to show how strongly each beat positively supports the story's Bitcoin-linked value thread; this is thematic salience, not a late-placement quota.",
    "Include canonical decodability tags in every beat: controlled_vocab, repetition, or taught_words.",
    "For early readers, keep newWordsIntroduced <= 2 per beat and keep child-facing taught words concrete.",
    "For read_aloud_3_4 and early_decoder_5_7, keep child-facing newWordsIntroduced concrete and do not put Bitcoin itself in newWordsIntroduced.",
    "Include at least one meaningful child choice and at least one clear caregiver reassurance or connection beat.",
    "Let the child experience the underlying money value before a beat names Bitcoin directly.",
    "If a deadlineEvent is used in the final two beats, it must be introduced earlier.",
    ...(storyConceptEarningOptionLabels(concept).length > 0
      ? ["Do not invent a third earning option or rename the concept's earning options."]
      : []),
    "Every beat continuityFacts array must include caregiver_label and deadline_event.",
    ...(storyConceptEarningOptionLabels(concept).length > 0
      ? ["When a beat uses one earning option, include chosen_earning_option:<exact label>."]
      : []),
    ...(storyConceptCountTarget(concept) !== null
      ? [`When a beat features counting toward the target, include count_target:${storyConceptCountTarget(concept)}.`]
      : []),
    "At least one beat should make the positive Bitcoin connection explicit in bitcoinRelevanceScore and the beat's purpose/conflict after the child has already felt the underlying value.",
    "Final beat must show concrete payoff/resolution and land in reassurance, closeness, calm pride, or relief.",
    ...betterRulesReadAloudEndingRules(context, pageCount),
    "Use calm, concrete, bedtime-readable settings.",
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
    "6) Preserve the warm bedtime feel: at least one caregiver connection beat and a reassuring ending.",
    "7) Classify each issue with tier='hard' or tier='soft'.",
    "8) Hard issues are objective blockers that should trigger a rewrite or fail the beat sheet.",
    "9) Soft issues are advisory notes for a report; they must not block by themselves.",
    "10) Set pass=true when there are no hard issues, even if soft issues remain.",
    "11) Return at most 2 hard issues and at most 2 soft issues.",
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
    "- Child makes at least one meaningful choice that affects the outcome.",
    "- Conflicts are specific and emotionally believable, avoiding generic Mad-Libs beats.",
    "- Emotional targets progress across the arc toward reassurance, closeness, and calm pride or relief.",
    "- Interests are integrated with plot impact, not token mentions.",
    "- Late important elements are seeded before they matter.",
    "- A beat must not introduce a new deadline, event, or plot mechanic that the StoryConcept forbids as a late introduction.",
    "- Earning-option action continuity must stay coherent. Do not switch from one named option to a different action with no bridge.",
    "- Include at least one caregiver reassurance or connection beat.",
    "- Bitcoin should feel positively tied to the child's specific value arc and story theme, not pasted on or contradictory.",
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
  const rewritePageCount = (() => {
    try {
      return (JSON.parse(originalBeatSheetJson) as BeatSheet).beats.length;
    } catch {
      return 0;
    }
  })();

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
    "- Treat bitcoinRelevanceScore as thematic salience for how strongly a beat positively supports the story's Bitcoin-linked value thread.",
    "- Honor the StoryConcept exactly. Do not invent a new caregiver term, earning option, or deadline/event outside the concept.",
    "- Ensure every beat includes at least one canonical decodability tag: controlled_vocab, repetition, or taught_words.",
    "- For early-reader profiles, keep newWordsIntroduced <= 2 in every beat and do not make Bitcoin a decoding target.",
    "- Bitcoin may recur where it naturally supports the theme, but it must stay child-safe, concrete, and secondary to the child's actions.",
    "- Ensure at least one meaningful child choice with visible downstream consequences.",
    "- Ensure at least one clear caregiver reassurance or connection beat.",
    "- Ensure the final beat contains clear concrete payoff/resolution and lands in calm pride, reassurance, or relief.",
    `- If the ending depends on a deadlineEvent (${storyConceptDeadlineEvent(JSON.parse(conceptJson) as StoryConcept) ?? "null"}), seed it before the final two beats.`,
    ...betterRulesReadAloudEndingRules(context, rewritePageCount),
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
    "- Language must be age-appropriate, concrete, warm, and bedtime-calm.",
    "- For younger readers keep sentence complexity low and repetition intentional.",
    ...pageLengthGuardrails(context),
    "- Avoid hype and investment promises.",
    "- The story should feel emotionally relieving: move toward reassurance, closeness, and calm pride or relief.",
    "- Include the caregiverWarmthMoment somewhere clearly and naturally.",
    "- Bitcoin must positively reinforce the story theme and lesson, but stay secondary to the child's concrete arc.",
    "- Feature the value first, then name Bitcoin second.",
    "- Use StoryConcept.bitcoinBridge as thematic guidance, not as an exact quote that must be copied.",
    "- If Bitcoin is named directly, keep it in caregiver or narrator language; the child should not say, decode, or explain Bitcoin.",
    "- Bitcoin may recur briefly across the story if it stays grounded and child-safe.",
    "- Keep adult-managed money tools secondary; the child's visible choices and consequences must stay primary.",
    "- The final page should land in reassurance, closeness, calm pride, or relief rather than a lecture.",
    ...betterRulesReadAloudEndingRules(context, pageCount),
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
    "You are a strict final-story quality critic for a children's bedtime story app.",
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
    "- Does the story feel warm, calm, and emotionally relieving rather than preachy?",
    "- Is there at least one clear caregiver reassurance or connection moment?",
    "- Does Bitcoin positively reinforce the lesson's value thread rather than feeling pasted on?",
    "- If Bitcoin appears, is it kept child-safe, concrete, non-technical, and out of the child's decoding or explaining voice?",
    "- Do not require exact reuse of StoryConcept.bitcoinBridge wording; judge thematic fit instead.",
    "- Use theme_integration for weak or bolted-on Bitcoin theming. Reserve bitcoin_fit for actual policy violations such as hype, technical framing, child-speaking Bitcoin, or thematic contradiction.",
    "- Use emotional_tone for stories that are flat, stressful, or not bedtime-warm enough.",
    "- Use caregiver_warmth when the caregiver connection moment is missing or underwritten.",
    "- Use ending_emotion when the final page fails to land in reassurance, calm pride, or relief.",
    "- For read_aloud_3_4, quoted dialogue should stay brief and bedtime-readable; prefer one short quoted sentence over a long explanatory speech.",
    "- For read_aloud_3_4, the final page should close emotionally rather than carrying a long conceptual explanation.",
    ...betterRulesReadAloudCriticRules(context),
    "- If a late, verbose Bitcoin explanation overloads the ending, flag both the reading-level problem and the ending-shape problem.",
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
