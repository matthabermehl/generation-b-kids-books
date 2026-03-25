import { describe, expect, it } from "vitest";
import {
  buildBeatPlannerPrompt,
  buildBeatPlannerSystemPrompt,
  buildBeatRewritePrompt,
  buildCriticPrompt,
  buildNarrativeFreshnessCriticPrompt,
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
      "thematic salience",
      "positive bitcoin connection"
    ]);
  });

  it("planner prompt adds young-profile Bitcoin guardrails", () => {
    const prompt = buildBeatPlannerPrompt(context, concept, 12);

    expectSignals(prompt, [
      "bitcoin must positively support the story's money values",
      "caregiver or narrator language",
      "device-first",
      "chosen_earning_option",
      "count_target"
    ]);
  });

  it("sor critic preserves child-safe Bitcoin expectations", () => {
    const prompt = buildScienceOfReadingCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );
    expectSignals(prompt, [
      "bitcoin may recur",
      "do not decode or repeat the word bitcoin",
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
      "thematic guidance",
      "bitcoin may recur briefly",
      "investment promises",
      "child should not say, decode, or explain bitcoin"
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
      "reserve page 10 for the clearest explicit bitcoin bridge",
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
      "reserve page 10 for the clearest explicit bitcoin bridge",
      "keep page 11 for emotional resolution only"
    ]);
    expectSignals(criticPrompt, [
      "penultimate page",
      "final page should close emotionally",
      "late, verbose bitcoin explanation overloads the ending"
    ]);
  });
});
