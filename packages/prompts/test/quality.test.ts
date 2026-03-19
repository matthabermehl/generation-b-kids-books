import { describe, expect, it } from "vitest";
import { runDeterministicStoryChecks } from "../src/quality.js";

describe("runDeterministicStoryChecks", () => {
  const concept = {
    premise: "Mia saves for a soccer ball.",
    caregiverLabel: "Mom" as const,
    targetItem: "soccer ball",
    targetPrice: 12,
    startingAmount: 7,
    gapAmount: 5,
    earningOptions: [
      { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
      { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
    ] as const,
    temptation: "candy bar",
    deadlineEvent: "Saturday game",
    bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Mia's jar choice.",
    requiredSetups: ["price tag", "coin jar", "Saturday game"],
    requiredPayoffs: ["reach 12 coins", "buy the ball"],
    forbiddenLateIntroductions: ["tournament", "sale"]
  };

  const beats = Array.from({ length: 12 }, (_, idx) => ({
    purpose: `Beat ${idx + 1}`,
    conflict: "Mia keeps saving for the soccer ball.",
    sceneLocation: idx < 6 ? "home" : "store",
    sceneId: `scene-${Math.floor(idx / 2) + 1}`,
    sceneVisualDescription: "Calm room scene with a small coin jar.",
    emotionalTarget: "determined",
    pageIndexEstimate: idx,
    decodabilityTags: ["controlled_vocab", "repetition"],
    newWordsIntroduced: ["save"],
    bitcoinRelevanceScore: idx >= 10 ? 0.8 : 0.2,
    introduces: idx === 0 ? ["price tag", "coin jar", "Saturday game"] : [],
    paysOff: idx === 11 ? ["reach 12 coins", "buy the ball"] : [],
    continuityFacts: [
      "caregiver_label:Mom",
      "deadline_event:Saturday game",
      ...(idx === 1 ? ["count_target:12"] : [])
    ]
  }));

  it("passes a compliant story", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 2
          ? `Mom said Bitcoin can be one way grown-ups save for later, too.`
          : idx === 10
            ? `Mia counted, "One, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve."`
            : idx === 11
              ? `Mom said the same patient saving theme can fit Bitcoin for grown-ups. Mia smiled and bought the soccer ball.`
              : `Mia saves one coin after task ${idx + 1}.`,
      illustrationBrief: "Calm room scene",
      sceneId: `scene-${Math.floor(idx / 2) + 1}`,
      sceneVisualDescription: "Calm room scene with a small coin jar.",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = runDeterministicStoryChecks(
      "read_aloud_3_4",
      {
        title: "Mia Saves",
        concept,
        beats,
        pages,
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "saving_later"
      },
      concept,
      true
    );
    expect(result.ok).toBe(true);
  });

  it("fails repetitive low-variation stories", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText: "Mia notices prices changing and plans ahead.",
      illustrationBrief: "Calm room scene",
      sceneId: `scene-${Math.floor(idx / 2) + 1}`,
      sceneVisualDescription: "Calm room scene with a small coin jar.",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = runDeterministicStoryChecks(
      "read_aloud_3_4",
      {
        title: "Mia Saves",
        concept,
        beats,
        pages,
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "saving_later"
      },
      concept,
      true
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes("near-identical text"))).toBe(true);
  });
});
