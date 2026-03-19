import { describe, expect, it } from "vitest";
import {
  pageSeed,
  validateBitcoinUsage,
  validateCaregiverConsistency,
  validateCountSequences,
  validateMontessoriRealism,
  validateNarrativeRatio,
  validatePageVariation,
  validateReadingProfile
} from "../src/index.js";

const concept = {
  premise: "Mia saves for a scooter.",
  caregiverLabel: "Mom" as const,
  targetItem: "scooter",
  targetPrice: 12,
  startingAmount: 7,
  gapAmount: 5,
  earningOptions: [
    { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
    { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
  ] as const,
  temptation: "candy bar",
  deadlineEvent: "Saturday ride",
  bitcoinBridge: "Bitcoin can be one grown-up saving idea that matches Mia's patient plan.",
  requiredSetups: ["price tag", "coin jar", "Saturday ride"],
  requiredPayoffs: ["reach 12 coins", "buy the scooter"],
  forbiddenLateIntroductions: ["sale", "third chore"]
};

describe("seed", () => {
  it("returns deterministic page seed", () => {
    expect(pageSeed("book-1", 2, "v1")).toBe(pageSeed("book-1", 2, "v1"));
  });
});

describe("narrative ratio", () => {
  it("no longer fails for earlier recurring Bitcoin mentions", () => {
    const result = validateNarrativeRatio([
      {
        pageIndex: 0,
        pageText: "Mom says careful saving can include Bitcoin for grown-ups.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 1,
        pageText: "Mia counts coins in her jar.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });
});

describe("reading profile", () => {
  it("flags overly long early decoder pages", () => {
    const longText = Array.from({ length: 60 }, () => "word").join(" ");
    const result = validateReadingProfile("early_decoder_5_7", [
      {
        pageIndex: 1,
        pageText: longText,
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
  });

  it("normalizes punctuation and hyphenation before decodability checks", () => {
    const result = validateReadingProfile("early_decoder_5_7", [
      {
        pageIndex: 1,
        pageText: `Mia said, "I can wait." Mom smiled at the coin-jar and the note-card by the door.`,
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Hallway table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });
});

describe("count sequence", () => {
  it("checks only contiguous spoken counting runs", () => {
    const result = validateCountSequences([
      {
        pageIndex: 3,
        pageText: `She counted, "One, two, three." She needed eight coins for the scooter.`,
        illustrationBrief: "",
        sceneId: "scene-2",
        sceneVisualDescription: "Store shelf",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });
});

describe("caregiver consistency", () => {
  it("allows generic grown-ups language when it does not rename the caregiver", () => {
    const result = validateCaregiverConsistency(concept, [
      {
        pageIndex: 2,
        pageText: "Mom said some grown-ups save for later in different ways.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });
});

describe("bitcoin usage", () => {
  it("allows recurring safe Bitcoin mentions that support the theme", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", concept, [
      {
        pageIndex: 0,
        pageText: "Mom said Bitcoin can be one way grown-ups save for later.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 1,
        pageText: "The narrator said Mia liked careful saving, and Bitcoin fit that long plan for grown-ups.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });

  it("rejects technical or child-facing Bitcoin framing", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", concept, [
      {
        pageIndex: 0,
        pageText: "Mia opened an app to read Bitcoin on the phone.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: ["bitcoin"],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "BITCOIN_CHILD_LANGUAGE")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "BITCOIN_POLICY")).toBe(true);
  });
});

describe("montessori realism", () => {
  it("flags fantasy terms for read-aloud profile", () => {
    const result = validateMontessoriRealism("read_aloud_3_4", [
      {
        pageIndex: 0,
        pageText: "A dragon flew over town.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Town square",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
  });
});

describe("page variation", () => {
  it("flags repetitive boilerplate pages", () => {
    const repeated = "Maya notices prices changing and plans ahead.";
    const pages = Array.from({ length: 10 }, (_, index) => ({
      pageIndex: index,
      pageText: repeated,
      illustrationBrief: "",
      sceneId: `scene-${Math.floor(index / 2) + 1}`,
      sceneVisualDescription: "Calm room scene",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = validatePageVariation(pages);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "LOW_VARIATION_TEMPLATE")).toBe(true);
  });
});
