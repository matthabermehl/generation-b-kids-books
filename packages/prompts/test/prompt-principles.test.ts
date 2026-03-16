import { describe, expect, it } from "vitest";
import {
  buildBeatPlannerPrompt,
  buildBeatPlannerSystemPrompt,
  buildBeatRewritePrompt,
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
  lesson: "saving_later",
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
      bitcoinRelevanceScore: 0.1,
      introduces: ["price tag", "coin jar"],
      paysOff: [],
      continuityFacts: [
        "caregiver_label:Mom",
        "deadline_event:Saturday game",
        "forbid_term:grown-up",
        "bitcoin_bridge_required:false"
      ]
    }
  ]
};

const concept = {
  premise: "Maya wants a puzzle and must decide how to save for it.",
  caregiverLabel: "Mom" as const,
  targetItem: "puzzle set",
  targetPrice: 12,
  startingAmount: 7,
  gapAmount: 5,
  earningOptions: [
    { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
    { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
  ] as const,
  temptation: "sticker pack",
  deadlineEvent: "Saturday game",
  bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Maya's jar choice.",
  requiredSetups: ["price tag", "coin jar"],
  requiredPayoffs: ["reach 12 coins", "buy the puzzle"],
  forbiddenLateIntroductions: ["tournament", "sale", "third chore"]
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
      "Fix beat 0 only.",
      {
        highScoreThreshold: 0.65,
        minHighBeats: 1,
        maxHighBeats: 1,
        allowedHighStartIndex: 0
      }
    );
    const [principle] = principlesFor("rewrite");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("planner prompt includes canonical tag and bitcoin-threshold constraints", () => {
    const prompt = buildBeatPlannerPrompt(context, concept, 12, {
      highScoreThreshold: 0.65,
      minHighBeats: 2,
      maxHighBeats: 3,
      allowedHighStartIndex: 8
    });
    expectSignals(prompt, ["controlled_vocab", "repetition", "taught_words", ">= 0.65", "index >= 8"]);
  });

  it("planner prompt adds young-profile bitcoin guardrails", () => {
    const prompt = buildBeatPlannerPrompt(context, concept, 12, {
      highScoreThreshold: 0.65,
      minHighBeats: 2,
      maxHighBeats: 3,
      allowedHighStartIndex: 8
    });

    expectSignals(prompt, [
      "exact word bitcoin",
      "device-first",
      "same coins buy",
      "forbid_term:grown-up",
      "chosen_earning_option"
    ]);
  });

  it("sor critic preserves late-stage bitcoin invariant", () => {
    const prompt = buildScienceOfReadingCriticPrompt(
      context,
      JSON.stringify(concept),
      JSON.stringify(beatSheet)
    );
    expectSignals(prompt, [
      "bitcoin",
      "single caregiver line",
      "extra or early mentions are hard issues",
      "do not decode or repeat the word bitcoin"
    ]);
  });

  it("writer prompt preserves grounding signals", () => {
    const prompt = buildPageWriterPrompt(context, concept, beatSheet, 1);
    const [principle] = principlesFor("writer");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("writer prompt forbids device-led bitcoin exposition for young readers", () => {
    const prompt = buildPageWriterPrompt(context, concept, beatSheet, 1);
    expectSignals(prompt, [
      "use the caregiverlabel",
      "do not emit 'grown-up'",
      "exactly once",
      "investment promises",
      "bitcoinbridge"
    ]);
  });
});
