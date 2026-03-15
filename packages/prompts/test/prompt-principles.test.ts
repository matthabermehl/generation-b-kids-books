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
      bitcoinRelevanceScore: 0.1
    }
  ]
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
    const prompt = buildNarrativeFreshnessCriticPrompt(context, JSON.stringify(beatSheet));
    const [principle] = principlesFor("critic");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("rewrite prompt preserves surgical rewrite signals", () => {
    const prompt = buildBeatRewritePrompt(context, JSON.stringify(beatSheet), "Fix beat 0 only.", {
      highScoreThreshold: 0.65,
      minHighBeats: 1,
      maxHighBeats: 1,
      allowedHighStartIndex: 0
    });
    const [principle] = principlesFor("rewrite");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("planner prompt includes canonical tag and bitcoin-threshold constraints", () => {
    const prompt = buildBeatPlannerPrompt(context, 12, {
      highScoreThreshold: 0.65,
      minHighBeats: 2,
      maxHighBeats: 3,
      allowedHighStartIndex: 8
    });
    expectSignals(prompt, ["controlled_vocab", "repetition", "taught_words", ">= 0.65", "index >= 8"]);
  });

  it("planner prompt adds young-profile bitcoin guardrails", () => {
    const prompt = buildBeatPlannerPrompt(context, 12, {
      highScoreThreshold: 0.65,
      minHighBeats: 2,
      maxHighBeats: 3,
      allowedHighStartIndex: 8
    });

    expectSignals(prompt, [
      "one brief caregiver/adult line",
      "digital jar",
      "transfer",
      "same coins buy",
      "do not add taught_words solely"
    ]);
  });

  it("sor critic preserves late-stage bitcoin invariant", () => {
    const prompt = buildScienceOfReadingCriticPrompt(context, JSON.stringify(beatSheet));
    expectSignals(prompt, [
      "preserve",
      "bitcoin",
      "late-stage",
      "adult/caregiver label",
      "do not require extra taught_words tags",
      "must not be treated as a child taught word",
      "at most a soft issue"
    ]);
  });

  it("writer prompt preserves grounding signals", () => {
    const prompt = buildPageWriterPrompt(context, beatSheet, 1);
    const [principle] = principlesFor("writer");
    expectSignals(prompt, principle.requiredSignals);
  });

  it("writer prompt forbids device-led bitcoin exposition for young readers", () => {
    const prompt = buildPageWriterPrompt(context, beatSheet, 1);
    expectSignals(prompt, [
      "device or fintech jargon",
      "digital jar",
      "wallet",
      "password",
      "one short caregiver/adult line"
    ]);
  });
});
