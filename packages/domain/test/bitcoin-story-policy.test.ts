import { describe, expect, it } from "vitest";
import {
  buildBitcoinStoryBridgeText,
  buildBitcoinStoryFallbackTitle,
  resolveBitcoinStoryPolicy
} from "../src/index.js";

describe("bitcoin story policy", () => {
  it("resolves the shipped recurring Bitcoin-forward posture for long picture books", () => {
    const policy = resolveBitcoinStoryPolicy({
      lesson: "better_rules",
      profile: "read_aloud_3_4",
      ageYears: 4,
      pageCount: 12
    });

    expect(policy.postureId).toBe("bitcoin_forward");
    expect(policy.protectedEndingPageCount).toBe(2);
    expect(policy.minimumBitcoinMentions).toBe(2);
    expect(policy.minimumHighRelevanceBeats).toBe(2);
    expect(policy.requireMentionBeforeEnding).toBe(true);
    expect(policy.lessonPlacementRules.join(" ")).toContain("before page 10");
    expect(policy.lessonPlacementRules.join(" ")).toContain("page 10");
    expect(policy.lessonPlacementRules.join(" ")).toContain("page 11");
    expect(policy.criticEndingRules.join(" ")).toContain("more than once");
    expect(policy.criticEndingRules.join(" ")).toContain("penultimate page");
  });

  it("adds an earlier bridge and penultimate echo for new_money_unfair early decoders", () => {
    const policy = resolveBitcoinStoryPolicy({
      lesson: "new_money_unfair",
      profile: "early_decoder_5_7",
      ageYears: 7,
      pageCount: 12
    });

    expect(policy.lessonPlacementRules.join(" ")).toContain("before page 10");
    expect(policy.lessonPlacementRules.join(" ")).toContain("page 10");
    expect(policy.lessonPlacementRules.join(" ")).toContain("page 11");
    expect(policy.criticEndingRules.join(" ")).toContain("more than once");
    expect(policy.criticEndingRules.join(" ")).toContain("penultimate page");
    expect(policy.criticEndingRules.join(" ")).toContain("one late Bitcoin page");
  });

  it("provides warm problem-led fallback titles and caregiver bridge text", () => {
    expect(buildBitcoinStoryFallbackTitle("Ava", "jar_saving_limits")).toBe("Ava's Saving Plan");
    expect(buildBitcoinStoryFallbackTitle("Ava", "better_rules")).toBe("Ava and the Fair Rule");
    expect(buildBitcoinStoryBridgeText("Mom", "keep_what_you_earn")).toContain("protecting the value of work");
  });
});
