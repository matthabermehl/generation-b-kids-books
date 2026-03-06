import { describe, expect, it } from "vitest";
import {
  computeBitcoinBeatTargets,
  runDeterministicBeatChecks,
  type BeatValidationContext
} from "../src/beat-quality.js";

function makeContext(overrides: Partial<BeatValidationContext> = {}): BeatValidationContext {
  return {
    profile: "early_decoder_5_7",
    ageYears: 6,
    pageCount: 10,
    ...overrides
  };
}

function makeBeat(index: number, highBitcoin = false) {
  return {
    purpose: `Beat ${index}`,
    conflict: "A real-world saving challenge at the grocery store.",
    sceneLocation: "Grocery store",
    emotionalTarget: "Curious",
    pageIndexEstimate: index,
    decodabilityTags: ["controlled_vocab", "repetition"],
    newWordsIntroduced: index >= 8 ? ["bitcoin"] : ["save"],
    bitcoinRelevanceScore: highBitcoin ? 0.8 : 0.2
  };
}

describe("runDeterministicBeatChecks", () => {
  it("computes explicit bitcoin target bounds", () => {
    const targets = computeBitcoinBeatTargets(12);
    expect(targets.minHighBeats).toBe(2);
    expect(targets.maxHighBeats).toBe(3);
    expect(targets.allowedHighStartIndex).toBe(8);
    expect(targets.highScoreThreshold).toBe(0.65);
  });

  it("passes a compliant beat sheet", () => {
    const beats = Array.from({ length: 10 }, (_, index) => makeBeat(index, index >= 8));
    const result = runDeterministicBeatChecks(makeContext(), { beats });
    expect(result.ok).toBe(true);
  });

  it("returns actionable ratio diagnostics when bitcoin ratio fails", () => {
    const beats = Array.from({ length: 10 }, (_, index) => makeBeat(index, false));
    const result = runDeterministicBeatChecks(makeContext(), { beats });
    const ratioIssue = result.issues.find((issue) => issue.code === "BITCOIN_RATIO");
    expect(result.ok).toBe(false);
    expect(ratioIssue).toBeDefined();
    expect(ratioIssue?.details?.requiredMinHighBeats).toBe(2);
    expect(ratioIssue?.details?.requiredMaxHighBeats).toBe(3);
    expect(ratioIssue?.details?.highBeatCount).toBe(0);
  });

  it("fails when bitcoin appears too early", () => {
    const beats = Array.from({ length: 10 }, (_, index) => makeBeat(index, index === 3 || index >= 8));
    const result = runDeterministicBeatChecks(makeContext(), { beats });
    expect(result.ok).toBe(false);
    const positionIssue = result.issues.find((issue) => issue.code === "BITCOIN_POSITION");
    expect(positionIssue).toBeDefined();
    expect(positionIssue?.details?.allowedHighStartIndex).toBe(7);
  });

  it("fails montessori realism for under-6 fantasy beats", () => {
    const beats = Array.from({ length: 10 }, (_, index) => ({
      ...makeBeat(index, index >= 8),
      conflict: index === 1 ? "A wizard gives magical coins." : "A practical-life money choice."
    }));

    const result = runDeterministicBeatChecks(makeContext({ profile: "read_aloud_3_4", ageYears: 4 }), {
      beats
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "MONTESSORI_REALISM")).toBe(true);
  });

  it("fails when taught words are introduced too early", () => {
    const beats = Array.from({ length: 10 }, (_, index) => ({
      ...makeBeat(index, index >= 8),
      newWordsIntroduced: index === 2 ? ["bitcoin"] : ["save"]
    }));

    const result = runDeterministicBeatChecks(makeContext(), { beats });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "TAUGHT_WORD_POSITION")).toBe(true);
  });
});
