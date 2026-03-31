import { describe, expect, it } from "vitest";
import {
  buildBitcoinStoryBridgeText,
  buildBitcoinStoryFallbackTitle,
  resolveBitcoinStoryPolicy
} from "../src/index.js";

describe("bitcoin story policy", () => {
  it("keeps sound_money_implicit fully unspoken while preserving the lesson", () => {
    const policy = resolveBitcoinStoryPolicy({
      lesson: "jar_saving_limits",
      profile: "early_decoder_5_7",
      storyMode: "sound_money_implicit",
      ageYears: 6,
      pageCount: 12
    });

    expect(policy.postureId).toBe("sound_money_implicit");
    expect(policy.minimumBitcoinMentions).toBe(0);
    expect(policy.maximumBitcoinMentions).toBe(0);
    expect(policy.minimumHighRelevanceBeats).toBe(0);
    expect(policy.maximumHighRelevanceBeats).toBe(0);
    expect(policy.titleShouldHideBitcoin).toBe(true);
    expect(policy.storyConceptBridgeLine).toContain("without naming Bitcoin");
    expect(policy.youngProfileGuardrails.join(" ")).toContain("Do not name Bitcoin");
    expect(buildBitcoinStoryBridgeText("Mom", "jar_saving_limits", "sound_money_implicit")).not.toContain("Bitcoin");
  });

  it("delays Bitcoin until the late reveal window in bitcoin_reveal_8020 mode", () => {
    const policy = resolveBitcoinStoryPolicy({
      lesson: "prices_change",
      profile: "read_aloud_3_4",
      storyMode: "bitcoin_reveal_8020",
      ageYears: 4,
      pageCount: 12
    });

    expect(policy.postureId).toBe("bitcoin_reveal_8020");
    expect(policy.minimumBitcoinMentions).toBe(2);
    expect(policy.minimumHighRelevanceBeats).toBe(1);
    expect(policy.revealStartPageIndex).toBe(9);
    expect(policy.maximumBitcoinMentionsBeforePageIndex).toBe(0);
    expect(policy.maximumHighRelevanceBeatsBeforePageIndex).toBe(0);
    expect(policy.storyConceptBridgeLine).toContain("late, warm caregiver or narrator Bitcoin answer");
    expect(policy.lessonPlacementRules.join(" ")).toContain("do not name Bitcoin before page 10");
    expect(policy.criticEndingRules.join(" ")).toContain("prefer one warm reveal beat");
    expect(buildBitcoinStoryBridgeText("Dad", "prices_change", "bitcoin_reveal_8020")).toContain(
      "later calmly names Bitcoin"
    );
  });

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
