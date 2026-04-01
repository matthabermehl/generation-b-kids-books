import { describe, expect, it } from "vitest";
import { runDeterministicStoryChecks } from "../src/quality.js";

describe("runDeterministicStoryChecks", () => {
  const concept = {
    premise: "Mia saves for a soccer ball.",
    caregiverLabel: "Mom" as const,
    bitcoinBridge: "Mom says Bitcoin is one adult saving idea tied to Mia's jar choice.",
    emotionalPromise: "Mia moves from wanting the ball to calm pride.",
    caregiverWarmthMoment: "Mom sits beside Mia and helps her feel steady.",
    bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
    requiredSetups: ["price tag", "coin jar", "Saturday game"],
    requiredPayoffs: ["reach 12 coins", "buy the ball"],
    forbiddenLateIntroductions: ["tournament", "sale"],
    lessonScenario: {
      moneyLessonKey: "jar_saving_limits",
      targetItem: "soccer ball",
      targetPrice: 12,
      startingAmount: 7,
      gapAmount: 5,
      earningOptions: [
        { label: "rake leaves", action: "rake leaves in the yard", sceneLocation: "yard" },
        { label: "help bake cookies", action: "help bake cookies in the kitchen", sceneLocation: "kitchen" }
      ] as const,
      temptation: "candy bar",
      deadlineEvent: "Saturday game"
    }
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
              ? `Mom held Mia close and said the same patient saving theme can fit Bitcoin for grown-ups. Mia felt calm, proud, and safe with the soccer ball in her hands.`
              : idx === 5
                ? `Mom sat beside Mia with a warm smile while Mia saved one coin after task ${idx + 1}.`
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );
    expect(result.ok).toBe(true);
  });

  it("passes sound_money_implicit stories when Bitcoin stays fully unnamed", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 10
          ? `Mia counted, "One, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve."`
          : idx === 11
            ? `Mom held Mia close and said patient saving can protect careful effort. Mia felt calm, proud, and safe with the soccer ball in her hands.`
            : idx === 5
              ? `Mom sat beside Mia with a warm smile while Mia saved one coin after task ${idx + 1}.`
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
        title: "Mia's Saving Plan",
        concept: {
          ...concept,
          bitcoinBridge: "Mom names the grown-up habit of protecting patient effort over time."
        },
        beats: beats.map((beat) => ({ ...beat, bitcoinRelevanceScore: 0.2 })),
        pages,
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "jar_saving_limits",
        storyMode: "sound_money_implicit"
      },
      {
        ...concept,
        bitcoinBridge: "Mom names the grown-up habit of protecting patient effort over time."
      },
      true
    );

    expect(result.ok).toBe(true);
  });

  it("fails sound_money_implicit stories that name Bitcoin", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 4
          ? "Mom said Bitcoin can help grown-ups save for later."
          : idx === 11
            ? "Mom held Mia close and Mia felt calm, proud, and safe."
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "sound_money_implicit"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.message.includes("must not name Bitcoin anywhere"))
    ).toBe(true);
  });

  it("fails sound_money_implicit stories when the story concept still names Bitcoin", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 11
          ? "Mom held Mia close and Mia felt calm, proud, and safe."
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
        title: "Mia's Saving Plan",
        concept,
        beats: beats.map((beat) => ({ ...beat, bitcoinRelevanceScore: 0.2 })),
        pages,
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "jar_saving_limits",
        storyMode: "sound_money_implicit"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.message.includes("story concept") && issue.message.includes("bitcoinBridge"))
    ).toBe(true);
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("near-identical text"))).toBe(true);
    expect(result.issues.some((issue) => issue.pageStart === 0 && issue.pageEnd === 11)).toBe(true);
  });

  it("flags generic Bitcoin Adventure fallback titles", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 2
          ? "Mom said Bitcoin can be one way grown-ups save for later, too."
          : idx === 10
            ? 'Mia counted, "One, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve."'
            : idx === 11
              ? "Mom held Mia close. Mia felt calm, proud, and safe."
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
        title: "Mia's Bitcoin Adventure",
        concept,
        beats,
        pages,
        readingProfileId: "read_aloud_3_4",
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("generic Bitcoin Adventure label"))).toBe(true);
  });

  it("fails reveal mode when Bitcoin is named before the late reveal window", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 3
          ? "Mom said Bitcoin can help grown-ups save for later."
          : idx === 10
            ? "Mom said Bitcoin can be one steady grown-up money idea for later."
            : idx === 11
              ? "Mom held Mia close and softly echoed the same calm Bitcoin idea. Mia felt safe and proud."
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_reveal_8020"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.message.includes("must not name Bitcoin before page 10"))
    ).toBe(true);
  });

  it("preserves the real page index for read-aloud sentence-budget failures", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 11
          ? 'After the game, Ava and Mom sit in the grass. The rocket is full of stars. A soft breeze moves the grass. Mom says, "Fair rules help us trust and play together. Bitcoin is special because its rules stay the same for everyone, too." Ava feels safe and proud inside.'
          : `Ava plays by the fair rule on turn ${idx + 1}.`,
      illustrationBrief: "Calm yard scene",
      sceneId: `scene-${idx}`,
      sceneVisualDescription: "Calm yard scene with a ball and soft evening light.",
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
        moneyLessonKey: "better_rules",
        storyMode: "bitcoin_forward"
      },
      {
        ...concept,
        premise: "Ava wants fair rules for a backyard game.",
        emotionalPromise: "Ava moves from frustration to calm relief.",
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
      true
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        issueType: "reading_level",
        pageStart: 11,
        pageEnd: 11,
        message: "Page 11 exceeds read-aloud sentence budget."
      })
    );
  });

  it("surfaces hype phrases as bitcoin-fit failures", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 2
          ? "Mom said Bitcoin has guaranteed returns for families."
          : idx === 11
            ? "Mom held Mia close and Mia felt calm and safe."
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.issueType === "bitcoin_fit" && issue.message.includes("guaranteed returns")
      )
    ).toBe(true);
  });

  it("does not surface false app matches from happened or appear", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 5
          ? "Mom sat beside Mia with a warm smile while Mia saved one coin after task 6."
          : idx === 9
            ? 'Mia told Mom what happened at the fair. Mom listened and asked, "Have you heard of Bitcoin?"'
            : idx === 10
              ? 'Mom said, "Bitcoin has rules that do not let surprise coins appear, so the game can stay fair for grown-ups."'
              : idx === 11
                ? "Mom held Mia close and Mia felt calm, proud, and safe."
                : `Mia saves one coin after task ${idx + 1}.`,
      illustrationBrief: "Calm room scene",
      sceneId: `scene-${Math.floor(idx / 2) + 1}`,
      sceneVisualDescription: "Calm room scene with a small coin jar.",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = runDeterministicStoryChecks(
      "early_decoder_5_7",
      {
        title: "Mia Saves",
        concept,
        beats,
        pages,
        readingProfileId: "early_decoder_5_7",
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );

    expect(result.ok).toBe(true);
  });

  it("flags lecture-like Bitcoin endings as ending-emotion failures", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx === 2
          ? "Mom said Bitcoin can be one way grown-ups save for later, too."
          : idx === 11
            ? "Always remember that is why Bitcoin proves the lesson."
            : idx === 5
              ? "Mom sat beside Mia with a warm smile."
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
        moneyLessonKey: "jar_saving_limits",
        storyMode: "bitcoin_forward"
      },
      concept,
      true
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.issueType === "ending_emotion" && issue.message.includes("warm")
      )
    ).toBe(true);
  });
});
