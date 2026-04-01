import { describe, expect, it } from "vitest";
import {
  pageSeed,
  validateBitcoinStoryConcept,
  validateBitcoinStoryTitle,
  validateBitcoinUsage,
  validateCaregiverConsistency,
  validateCountSequences,
  validateMontessoriRealism,
  validateNarrativeRatio,
  validatePageVariation,
  validateReadingProfile,
  validateStoryTone
} from "../src/index.js";

const concept = {
  premise: "Mia saves for a scooter.",
  caregiverLabel: "Mom" as const,
  bitcoinBridge: "Bitcoin can be one grown-up saving idea that matches Mia's patient plan.",
  emotionalPromise: "Mia moves from wanting the scooter to feeling calm and proud.",
  caregiverWarmthMoment: "Mom kneels beside Mia and names the feeling before helping her choose.",
  bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
  requiredSetups: ["price tag", "coin jar", "Saturday ride"],
  requiredPayoffs: ["reach 12 coins", "buy the scooter"],
  forbiddenLateIntroductions: ["sale", "third chore"],
  lessonScenario: {
    moneyLessonKey: "jar_saving_limits",
    targetItem: "scooter",
    targetPrice: 12,
    startingAmount: 7,
    gapAmount: 5,
    earningOptions: [
      { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
      { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
    ] as const,
    temptation: "candy bar",
    deadlineEvent: "Saturday ride"
  }
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

  it("does not count trailing quote marks as extra read-aloud sentences", () => {
    const result = validateReadingProfile("read_aloud_3_4", [
      {
        pageIndex: 6,
        pageText:
          'Mom sees Ava is upset and comes over. She kneels beside Ava and hugs her gently. Mom says, "It is okay to feel upset. Let us find a way to make the game fair for everyone."',
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Backyard grass",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });

  it("treats quoted dialogue with attribution as one read-aloud sentence", () => {
    const result = validateReadingProfile("read_aloud_3_4", [
      {
        pageIndex: 1,
        pageText:
          '“Let us play soccer!” says Ava. Mom reminds everyone, “We take turns.” Each friend gets a turn. The children feel ready to play.',
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Backyard grass",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 8,
        pageText:
          'The friends nod and smile. “We agree!” they say. Everyone puts their hands in together. The soccer ball is ready again.',
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Backyard grass",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });

  it("records the real page index for read-aloud sentence-budget failures", () => {
    const result = validateReadingProfile("read_aloud_3_4", [
      {
        pageIndex: 11,
        pageText:
          'After the game, Ava and Mom sit in the grass. The rocket is full of stars. A soft breeze moves the grass. Mom says, "Fair rules help us trust and play together. Bitcoin is special because its rules stay the same for everyone, too." Ava feels safe and proud inside.',
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Backyard grass",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "SENTENCE_COUNT",
        message: "Page 11 exceeds read-aloud sentence budget.",
        pageStart: 11,
        pageEnd: 11
      })
    );
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
  it("rejects sound_money_implicit concepts that still name Bitcoin", () => {
    const result = validateBitcoinStoryConcept("early_decoder_5_7", "sound_money_implicit", concept, 12);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "BITCOIN_POLICY"
      })
    );
    expect(result.issues[0]?.message).toContain("story concept");
    expect(result.issues[0]?.message).toContain("bitcoinBridge");
  });

  it("rejects generic Bitcoin Adventure fallback titles", () => {
    const result = validateBitcoinStoryTitle(
      "early_decoder_5_7",
      "bitcoin_forward",
      concept,
      "Mia's Bitcoin Adventure",
      12
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "BITCOIN_TITLE"
      })
    );
  });

  it("allows recurring safe Bitcoin mentions that support the theme", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", "bitcoin_forward", concept, [
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
    const result = validateBitcoinUsage("early_decoder_5_7", "bitcoin_forward", concept, [
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

  it("does not treat happened or appear as app-based Bitcoin framing", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", "bitcoin_forward", concept, [
      {
        pageIndex: 0,
        pageText:
          'Mom asked what happened at the fair. Mia said it felt unfair. Mom said, "Have you heard of Bitcoin?"',
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "School hallway",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 1,
        pageText:
          'Mom said, "Bitcoin has rules that do not let surprise coins appear, so the game can stay fair for grown-ups."',
        illustrationBrief: "",
        sceneId: "scene-2",
        sceneVisualDescription: "Bedroom with warm lamp light",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });

  it("requires Bitcoin to appear before the final page in longer stories", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", "bitcoin_forward", concept, Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 11
          ? "Mom says Bitcoin can be one way grown-ups save for later."
          : `Mia saves coin ${idx + 1}.`,
      illustrationBrief: "",
      sceneId: `scene-${idx}`,
      sceneVisualDescription: "Kitchen table",
      newWordsIntroduced: [],
      repetitionTargets: []
    })));

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("before the final page"))).toBe(true);
  });

  it("requires Bitcoin to appear before the final ending window in longer stories", () => {
    const result = validateBitcoinUsage(
      "early_decoder_5_7",
      "bitcoin_forward",
      concept,
      Array.from({ length: 12 }, (_, idx) => ({
        pageIndex: idx,
        pageText:
          idx === 10
            ? "Mom says Bitcoin can be one grown-up saving idea."
            : idx === 11
              ? "Mia feels calm as Bitcoin echoes the same patient plan for grown-ups."
              : `Mia saves coin ${idx + 1}.`,
        illustrationBrief: "",
        sceneId: `scene-${idx}`,
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }))
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("final 2 pages"))).toBe(true);
  });

  it("requires caregiver or grown-up framing for Bitcoin mentions", () => {
    const result = validateBitcoinUsage("early_decoder_5_7", "bitcoin_forward", concept, [
      {
        pageIndex: 0,
        pageText: "Bitcoin was there when Mia looked at her jar.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("grown-up language"))).toBe(true);
  });

  it("rejects reveal mode stories that name Bitcoin before the reveal window", () => {
    const result = validateBitcoinUsage(
      "read_aloud_3_4",
      "bitcoin_reveal_8020",
      concept,
      Array.from({ length: 12 }, (_, idx) => ({
        pageIndex: idx,
        pageText:
          idx === 3
            ? "Mom said Bitcoin can help grown-ups save for later."
            : idx === 10
              ? "Mom said Bitcoin can be one steady grown-up money idea for later."
              : idx === 11
                ? "Mom held Mia close and softly echoed the same calm Bitcoin idea. Mia felt safe and proud."
                : `Mia saves coin ${idx + 1}.`,
        illustrationBrief: "",
        sceneId: `scene-${idx}`,
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }))
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("must not name Bitcoin before page 10"))).toBe(true);
  });
});

describe("story tone", () => {
  it("allows a warm ending that echoes Bitcoin without turning into a lecture", () => {
    const result = validateStoryTone("read_aloud_3_4", "bitcoin_forward", concept, [
      {
        pageIndex: 0,
        pageText: "Mom gives Mia a warm hug while they count coins together.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 1,
        pageText: "Mom says the same patient saving idea can fit Bitcoin for grown-ups, too, and Mia feels calm and safe.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(true);
  });

  it("flags lecture-like Bitcoin endings separately from warm endings", () => {
    const result = validateStoryTone("read_aloud_3_4", "bitcoin_forward", concept, [
      {
        pageIndex: 0,
        pageText: "Mom sits close and keeps Mia steady at the table.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      },
      {
        pageIndex: 1,
        pageText: "Always remember that is why Bitcoin proves the right lesson.",
        illustrationBrief: "",
        sceneId: "scene-1",
        sceneVisualDescription: "Kitchen table",
        newWordsIntroduced: [],
        repetitionTargets: []
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "PREACHY_TONE")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "ENDING_EMOTION")).toBe(true);
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
