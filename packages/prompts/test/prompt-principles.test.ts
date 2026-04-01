import { describe, expect, it } from "vitest";
import {
  buildBeatPlannerPrompt,
  buildBeatPlannerSystemPrompt,
  buildBeatRewritePrompt,
  buildCriticPrompt,
  buildMontessoriCriticPrompt,
  buildNarrativeFreshnessCriticPrompt,
  buildStoryConceptPrompt,
  buildStoryConceptSystemPrompt,
  buildScienceOfReadingCriticPrompt,
  buildPageWriterPrompt,
  principlesFor,
  type StoryTemplateContext
} from "../src/index.js";

const context: StoryTemplateContext = {
  childFirstName: "Maya",
  pronouns: "she/her",
  ageYears: 6,
  lesson: "jar_saving_limits",
  storyMode: "bitcoin_forward",
  interests: ["puzzles"],
  profile: "early_decoder_5_7"
};

const beatSheet = {
  beats: [
    {
      purpose: "Setup",
      conflict: "Maya wants to buy now but is saving for later.",
      sceneLocation: "Toy aisle",
      sceneId: "toy_aisle",
      sceneVisualDescription: "Toy aisle with open shelf space and a bright yellow price tag.",
      emotionalTarget: "Torn",
      pageIndexEstimate: 0,
      decodabilityTags: ["controlled_vocab", "repetition"],
      newWordsIntroduced: ["save"],
      bitcoinRelevanceScore: 0.4,
      introduces: ["price tag", "coin jar"],
      paysOff: [],
      continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
    }
  ]
};

const concept = {
  premise: "Maya wants a puzzle and must decide how to save for it.",
  caregiverLabel: "Mom" as const,
  bitcoinBridge: "Bitcoin can positively support Maya's long-term saving theme.",
  emotionalPromise: "Maya moves from temptation to calm pride.",
  caregiverWarmthMoment: "Mom sits close and helps Maya feel steadier.",
  bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
  requiredSetups: ["price tag", "coin jar"],
  requiredPayoffs: ["reach 12 coins", "buy the puzzle"],
  forbiddenLateIntroductions: ["tournament", "sale", "third chore"],
  lessonScenario: {
    moneyLessonKey: "jar_saving_limits",
    targetItem: "puzzle set",
    targetPrice: 12,
    startingAmount: 7,
    gapAmount: 5,
    earningOptions: [
      { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
      { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
    ] as const,
    temptation: "sticker pack",
    deadlineEvent: "Saturday game"
  }
};

function expectSignals(prompt: string, signals: string[]): void {
  const lowered = prompt.toLowerCase();
  for (const signal of signals) {
    expect(lowered.includes(signal.toLowerCase())).toBe(true);
  }
}

describe("prompt principles", () => {
  it("story concept system prompt preserves core story-mode signals", () => {
    const prompt = buildStoryConceptSystemPrompt();
    const conceptPrinciples = principlesFor("concept");
    conceptPrinciples.forEach((principle) => {
      expectSignals(prompt, principle.requiredSignals);
    });
  });

  it("planner prompt preserves core spirit signals", () => {
    const prompt = buildBeatPlannerSystemPrompt();
    const plannerPrinciples = principlesFor("planner");
    plannerPrinciples.forEach((principle) => {
      expectSignals(prompt, principle.requiredSignals);
    });
  });

  it("narrative critic prompt preserves anti-mad-libs signals", () => {
    const prompt = buildNarrativeFreshnessCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );
    const [principle] = principlesFor("critic");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("rewrite prompt preserves surgical rewrite signals", () => {
    const prompt = buildBeatRewritePrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet),
      "Fix beat 0 only."
    );
    const [principle] = principlesFor("rewrite");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("planner prompt includes thematic Bitcoin guidance and decodability tags", () => {
    const prompt = buildBeatPlannerPrompt(context, concept, 12);
    expectSignals(prompt, [
      "controlled_vocab",
      "repetition",
      "taught_words",
      "bitcoinrelevancescore",
      "intended bitcoin connection explicit"
    ]);
  });

  it("planner prompt adds young-profile Bitcoin guardrails", () => {
    const prompt = buildBeatPlannerPrompt(context, concept, 12);

    expectSignals(prompt, [
      "keep bitcoin clearly present in caregiver or narrator framing before the ending",
      "caregiver or narrator language",
      "device-first",
      "chosen_earning_option",
      "count_target"
    ]);
  });

  it("story concept prompt asks for an earlier reusable Bitcoin bridge without making the book a lecture", () => {
    const prompt = buildStoryConceptPrompt(context, 12);

    expectSignals(prompt, [
      "story-mode anchor",
      "appear before the ending",
      "echo again in longer stories",
      "without becoming a lecture",
      "feature the child's lived money problem first"
    ]);
  });

  it("story concept prompt keeps sound_money_implicit fully unnamed", () => {
    const prompt = buildStoryConceptPrompt({ ...context, storyMode: "sound_money_implicit" }, 12);

    expectSignals(prompt, [
      "story-mode anchor",
      "do not name bitcoin anywhere",
      "bitcoinbridge must stay thematic only",
      "without naming bitcoin"
    ]);
  });

  it("story concept prompt keeps bitcoin_reveal_8020 late and warm", () => {
    const prompt = buildStoryConceptPrompt({ ...context, storyMode: "bitcoin_reveal_8020" }, 12);

    expectSignals(prompt, [
      "story-mode anchor",
      "late, warm caregiver or narrator bitcoin answer",
      "solution window",
      "not earlier"
    ]);
  });

  it("writer prompt keeps sound_money_implicit fully unnamed and title-safe", () => {
    const prompt = buildPageWriterPrompt(
      { ...context, storyMode: "sound_money_implicit" },
      {
        ...concept,
        bitcoinBridge: "Mom calmly names the grown-up habit of protecting patient effort over time."
      },
      beatSheet,
      12
    );

    expectSignals(prompt, [
      "story-mode anchor",
      "do not name bitcoin anywhere in the story, title, or ending",
      "title must center the child's concrete money problem or emotional goal and must not mention bitcoin",
      "final page must stay emotionally warm and must not pivot into naming bitcoin"
    ]);
  });

  it("writer and critic prompts keep bitcoin_reveal_8020 late, hidden in the title, and warm at the end", () => {
    const revealContext = { ...context, storyMode: "bitcoin_reveal_8020" as const };
    const revealConcept = {
      ...concept,
      bitcoinBridge:
        "Mom later calmly names Bitcoin as one grown-up saving idea for protecting patient effort over time."
    };
    const writerPrompt = buildPageWriterPrompt(revealContext, revealConcept, beatSheet, 12);
    const criticPrompt = buildCriticPrompt(revealContext, revealConcept, "{\"pages\":[]}");

    expectSignals(writerPrompt, [
      "story-mode anchor",
      "reveal bitcoin late in caregiver or narrator framing",
      "title should center the child's concrete money problem and should not spoil the late bitcoin reveal",
      "if bitcoin is mentioned there, it must echo the late reveal softly"
    ]);
    expectSignals(criticPrompt, [
      "story-mode anchor",
      "flag stories that spoil bitcoin too early",
      "title keep the late bitcoin reveal hidden",
      "prefer one warm reveal beat plus, at most, one brief emotional echo"
    ]);
  });

  it("montessori critic no longer treats Bitcoin as merely secondary", () => {
    const prompt = buildMontessoriCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );

    expectSignals(prompt, [
      "bitcoin should be clearly named in caregiver or narrator framing before the ending",
      "never technical",
      "never a child explanation task"
    ]);
    expect(prompt.toLowerCase()).not.toContain("secondary to the child's concrete arc");
  });

  it("sor critic preserves child-safe Bitcoin expectations", () => {
    const prompt = buildScienceOfReadingCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );
    expectSignals(prompt, [
      "bitcoin should be clearly named in caregiver or narrator framing before the ending",
      "do not decode or repeat the word bitcoin",
      "do not ask the child to decode, repeat, or explain it",
      "child-facing newwordsintroduced item",
      "technical/device-first explanation"
    ]);
  });

  it("writer prompt preserves grounding signals", () => {
    const prompt = buildPageWriterPrompt(context, concept, beatSheet, 1);
    const [principle] = principlesFor("writer");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("writer prompt allows generic class words while keeping Bitcoin child-safe", () => {
    const prompt = buildPageWriterPrompt(context, concept, beatSheet, 1);
    expectSignals(prompt, [
      "generic terms like people, adults, or grown-ups are fine",
      "story-mode anchor",
      "thematic guidance",
      "investment promises",
      "child should not say, decode, or explain bitcoin",
      "avoid generic fallback titles like 'bitcoin adventure'"
    ]);
  });

  it("writer prompt includes explicit reading-profile page-length guardrails", () => {
    const readAloudPrompt = buildPageWriterPrompt(
      { ...context, ageYears: 4, profile: "read_aloud_3_4", lesson: "better_rules", interests: ["soccer"] },
      {
        premise: "Maya wants fair rules for a backyard game.",
        caregiverLabel: "Mom" as const,
        bitcoinBridge: "Bitcoin can reinforce trusted shared rules.",
        emotionalPromise: "Maya moves from frustration to calm relief.",
        caregiverWarmthMoment: "Mom kneels beside Maya and helps her feel steady.",
        bitcoinValueThread: "fair rules and shared trust",
        requiredSetups: ["ball", "friends", "rule talk"],
        requiredPayoffs: ["fair rule agreed", "game feels calm again"],
        forbiddenLateIntroductions: ["new coach"],
        lessonScenario: {
          moneyLessonKey: "better_rules",
          gameName: "Backyard Ball",
          brokenRule: "one child keeps changing the score",
          fairRule: "every goal counts once for everyone",
          sharedGoal: "play together under one fair rule",
          deadlineEvent: null
        }
      },
      beatSheet,
      12
    );
    const earlyDecoderPrompt = buildPageWriterPrompt(context, concept, beatSheet, 1);

    expectSignals(readAloudPrompt, [
      "every page must stay at 4 sentences or fewer",
      "prefer 2-3 short sentences",
      "one short quoted sentence plus narration",
      "before page 10",
      "reserve page 10 for a brief caregiver or narrator bitcoin echo",
      "keep page 11 for emotional resolution only"
    ]);
    expectSignals(earlyDecoderPrompt, [
      "every page must stay at 45 words or fewer",
      "2-4 short decodable sentences"
    ]);
  });

  it("better_rules read-aloud planner and critic prompts protect the final emotional page", () => {
    const betterRulesContext: StoryTemplateContext = {
      ...context,
      ageYears: 4,
      profile: "read_aloud_3_4",
      lesson: "better_rules",
      interests: ["soccer"]
    };
    const betterRulesConcept = {
      premise: "Maya wants fair rules for a backyard game.",
      caregiverLabel: "Mom" as const,
      bitcoinBridge: "Bitcoin can reinforce trusted shared rules.",
      emotionalPromise: "Maya moves from frustration to calm relief.",
      caregiverWarmthMoment: "Mom kneels beside Maya and helps her feel steady.",
      bitcoinValueThread: "fair rules and shared trust",
      requiredSetups: ["ball", "friends", "rule talk"],
      requiredPayoffs: ["fair rule agreed", "game feels calm again"],
      forbiddenLateIntroductions: ["new coach"],
      lessonScenario: {
        moneyLessonKey: "better_rules" as const,
        gameName: "Backyard Ball",
        brokenRule: "one child keeps changing the score",
        fairRule: "every goal counts once for everyone",
        sharedGoal: "play together under one fair rule",
        deadlineEvent: null
      }
    };

    const plannerPrompt = buildBeatPlannerPrompt(betterRulesContext, betterRulesConcept, 12);
    const criticPrompt = buildCriticPrompt(betterRulesContext, betterRulesConcept, "{\"pages\":[]}");

    expectSignals(plannerPrompt, [
      "before page 10",
      "reserve page 10 for a brief caregiver or narrator bitcoin echo",
      "keep page 11 for emotional resolution only"
    ]);
    expectSignals(criticPrompt, [
      "expect bitcoin more than once",
      "penultimate page",
      "do not push every bitcoin line earlier",
      "final page should close emotionally",
      "late, verbose bitcoin explanation overloads the ending"
    ]);
  });

  it("new_money_unfair early-decoder prompts preserve an earlier bridge plus penultimate echo", () => {
    const unfairContext: StoryTemplateContext = {
      ...context,
      ageYears: 7,
      lesson: "new_money_unfair",
      interests: ["soccer"],
      profile: "early_decoder_5_7"
    };
    const unfairConcept = {
      premise: "Maya feels upset when extra tickets appear in the fair game.",
      caregiverLabel: "Mom" as const,
      bitcoinBridge: "Bitcoin can reinforce steady fair rules in grown-up money.",
      emotionalPromise: "Maya moves from confusion to calm relief.",
      caregiverWarmthMoment: "Mom kneels beside Maya and helps her feel steady.",
      bitcoinValueThread: "fairness, honest rules, and trust",
      requiredSetups: ["ticket game", "same starting tickets", "bell prize"],
      requiredPayoffs: ["the unfair feeling is named", "a calmer fair rule is understood"],
      forbiddenLateIntroductions: ["surprise app"],
      lessonScenario: {
        moneyLessonKey: "new_money_unfair" as const,
        gameName: "Star Ticket Game",
        tokenName: "blue tickets",
        childGoal: "ring the bell first",
        ruleDisruption: "extra tickets appear halfway through the game",
        fairnessRepair: "Mom explains the ticket count should stay steady for everyone",
        deadlineEvent: "before cleanup time"
      }
    };

    const plannerPrompt = buildBeatPlannerPrompt(unfairContext, unfairConcept, 12);
    const writerPrompt = buildPageWriterPrompt(unfairContext, unfairConcept, beatSheet, 12);
    const criticPrompt = buildCriticPrompt(unfairContext, unfairConcept, "{\"pages\":[]}");

    expectSignals(plannerPrompt, [
      "before page 10",
      "page 10",
      "page 11"
    ]);
    expectSignals(writerPrompt, [
      "before page 10",
      "page 10",
      "page 11"
    ]);
    expectSignals(criticPrompt, [
      "expect bitcoin more than once",
      "penultimate page",
      "one late bitcoin page",
      "final page should land on calm or pride"
    ]);
  });

  it("narrative freshness and rewrite prompts preserve story-forward Bitcoin plus warm endings", () => {
    const narrativePrompt = buildNarrativeFreshnessCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );
    const rewritePrompt = buildBeatRewritePrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet),
      "Fix beat 0 only."
    );

    expectSignals(narrativePrompt, [
      "story-mode anchor",
      "last-page add-on",
      "meaningfully bitcoin-forward"
    ]);
    expectSignals(rewritePrompt, [
      "story-mode anchor",
      "emotionally warm, not lecture-like",
      "echo an earlier idea"
    ]);
  });
});
