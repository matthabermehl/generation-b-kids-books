import { describe, expect, it } from "vitest";
import { runDeterministicBeatChecks, type BeatValidationContext } from "../src/beat-quality.js";

function makeContext(overrides: Partial<BeatValidationContext> = {}): BeatValidationContext {
  return {
    profile: "early_decoder_5_7",
    ageYears: 6,
    pageCount: 10,
    ...overrides
  };
}

function makeBeat(index: number, bitcoinScore = 0.1) {
  return {
    purpose: `Beat ${index}`,
    conflict: "A real-world saving challenge at the grocery store.",
    sceneLocation: "Grocery store",
    sceneId: `scene_${Math.floor(index / 2) + 1}`,
    sceneVisualDescription: "Watercolor grocery aisle with a small price sign and plenty of white paper.",
    emotionalTarget:
      index === 4 ? "Reassured and steady" : index >= 8 ? "Calm, relieved, and proud" : "Curious and determined",
    pageIndexEstimate: index,
    decodabilityTags: ["controlled_vocab", "repetition"],
    newWordsIntroduced: ["save"],
    bitcoinRelevanceScore: bitcoinScore,
    introduces: [],
    paysOff: [],
    continuityFacts: ["caregiver_label:Mom", "deadline_event:Saturday game"]
  };
}

describe("runDeterministicBeatChecks", () => {
  it("passes a compliant beat sheet with recurring thematic Bitcoin salience", () => {
    const beats = Array.from({ length: 10 }, (_, index) =>
      makeBeat(index, index === 3 || index >= 8 ? 0.5 : 0.1)
    );
    const result = runDeterministicBeatChecks(makeContext(), { beats });
    expect(result.ok).toBe(true);
  });

  it("requires at least one beat to tie Bitcoin positively into the theme", () => {
    const beats = Array.from({ length: 10 }, (_, index) => makeBeat(index, 0));
    const result = runDeterministicBeatChecks(makeContext(), { beats });
    const themeIssue = result.issues.find((issue) => issue.code === "BITCOIN_THEME_INTEGRATION");
    expect(result.ok).toBe(false);
    expect(themeIssue).toBeDefined();
    expect(themeIssue?.details?.requiredThreshold).toBe(0.35);
  });

  it("fails montessori realism for under-6 fantasy beats", () => {
    const beats = Array.from({ length: 10 }, (_, index) => ({
      ...makeBeat(index, index >= 8 ? 0.5 : 0.1),
      conflict: index === 1 ? "A wizard gives magical coins." : "A practical-life money choice."
    }));

    const result = runDeterministicBeatChecks(makeContext({ profile: "read_aloud_3_4", ageYears: 4 }), {
      beats
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "MONTESSORI_REALISM")).toBe(true);
  });

  it("fails when Bitcoin is introduced as a child-facing taught word", () => {
    const beats = Array.from({ length: 10 }, (_, index) => ({
      ...makeBeat(index, index >= 8 ? 0.5 : 0.1),
      newWordsIntroduced: index === 2 ? ["bitcoin"] : ["save"]
    }));

    const result = runDeterministicBeatChecks(makeContext(), { beats });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "BITCOIN_CHILD_LANGUAGE")).toBe(true);
  });
});
