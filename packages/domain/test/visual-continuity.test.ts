import { describe, expect, it } from "vitest";
import {
  buildPageArtPrompt,
  buildPageArtVisualGuidance,
  buildSupportingCharacterReferencePrompt,
  buildVisualStoryBible,
  extractExactCountConstraints,
  extractStateConstraints,
  type StoryPackage
} from "../src/index.js";

const story: StoryPackage = {
  title: "Ava Saves",
  concept: {
    premise: "Ava saves for a soccer ball.",
    caregiverLabel: "Mom",
    bitcoinBridge: "Mom mentions Bitcoin as an adult saving idea.",
    emotionalPromise: "Ava moves from wanting the ball to feeling calm and proud.",
    caregiverWarmthMoment: "Mom sits beside Ava and helps her take the next steady step.",
    bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
    requiredSetups: ["coin jar", "price tag"],
    requiredPayoffs: ["4 coins", "soccer ball"],
    forbiddenLateIntroductions: [],
    lessonScenario: {
      moneyLessonKey: "jar_saving_limits",
      targetItem: "soccer ball",
      targetPrice: 12,
      startingAmount: 8,
      gapAmount: 4,
      earningOptions: [
        { label: "help bake", action: "help bake in the kitchen", sceneLocation: "kitchen" },
        { label: "walk dog", action: "walk the dog outside", sceneLocation: "yard" }
      ],
      temptation: "stickers",
      deadlineEvent: "Saturday game"
    }
  },
  beats: [],
  pages: [
    {
      pageIndex: 0,
      pageText: "Ava and Mom count 4 coins by the jar.",
      illustrationBrief: "Mom points to a blue coin jar and a yellow note by the window.",
      sceneId: "kitchen_table",
      sceneVisualDescription: "Sunny kitchen table with a blue coin jar and yellow note by the window.",
      newWordsIntroduced: ["save"],
      repetitionTargets: ["save"]
    },
    {
      pageIndex: 1,
      pageText: "Mom smiles. The jar is empty now.",
      illustrationBrief: "Ava holds the soccer ball while Mom stands beside the empty jar.",
      sceneId: "kitchen_table",
      sceneVisualDescription: "Sunny kitchen table with a blue coin jar and yellow note by the window.",
      newWordsIntroduced: ["jar"],
      repetitionTargets: ["jar"]
    }
  ],
  readingProfileId: "early_decoder_5_7",
  moneyLessonKey: "jar_saving_limits"
};

describe("visual continuity builders", () => {
  it("extracts exact counts and states from story text", () => {
    expect(extractExactCountConstraints("Ava counts 4 coins into the jar.")).toEqual([
      {
        label: "coin",
        quantity: 4,
        sourceText: "Ava counts 4 coins into the jar"
      }
    ]);

    expect(extractStateConstraints("The jar is empty now.")).toEqual([
      {
        label: "jar",
        state: "empty",
        sourceText: "The jar is empty now"
      }
    ]);
  });

  it("marks recurring supporting characters and builds page guidance", () => {
    const visualBible = buildVisualStoryBible({
      bookId: "book-1",
      title: story.title,
      childFirstName: "Ava",
      story,
      generatedAt: "2026-03-17T12:00:00.000Z"
    });

    const mom = visualBible.entities.find((entity) => entity.entityId === "supporting_character_mom");
    expect(mom).toMatchObject({
      kind: "supporting_character",
      recurring: true,
      importance: "story_critical",
      referenceStrategy: "generated_supporting_reference"
    });
    expect(mom?.identityAnchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trait: "role" }),
        expect.objectContaining({ trait: "features" }),
        expect.objectContaining({ trait: "wardrobe" })
      ])
    );

    const page0 = visualBible.pages.find((page) => page.pageIndex === 0);
    expect(page0).toBeDefined();
    expect(page0?.supportingCharacterIds).toContain("supporting_character_mom");
    expect(page0?.exactCountConstraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "coin",
          quantity: 4
        })
      ])
    );

    const page1 = visualBible.pages.find((page) => page.pageIndex === 1);
    expect(page1?.stateConstraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "jar",
          state: "empty"
        })
      ])
    );

    const guidance = buildPageArtVisualGuidance(visualBible, page0!);
    expect(guidance.mustShow.some((item) => item.includes("Mom"))).toBe(true);
    expect(guidance.mustShow.some((item) => item.includes("Locked identity anchors"))).toBe(true);
    expect(guidance.showExactly).toContain("4 coins");
    expect(guidance.mustNotShow).toContain("more than 4 coins");
    expect(guidance.settingAnchors).toEqual(
      expect.arrayContaining(["sunny kitchen table", "a blue coin jar", "yellow note by the window"])
    );
    expect(guidance.mustMatch.some((item) => item.includes("Mom role:"))).toBe(true);
  });

  it("adds style-guide and locked-identity language to supporting reference prompts", () => {
    const visualBible = buildVisualStoryBible({
      bookId: "book-1",
      title: story.title,
      childFirstName: "Ava",
      story,
      generatedAt: "2026-03-17T12:00:00.000Z"
    });

    const mom = visualBible.entities.find((entity) => entity.entityId === "supporting_character_mom");
    expect(mom).toBeDefined();

    const prompt = buildSupportingCharacterReferencePrompt(mom!);
    expect(prompt).toContain("Locked identity anchors:");
    expect(prompt).toContain("- role:");
    expect(prompt).toContain("Style:");
    expect(prompt).toContain("Detailed children's book watercolor illustration on bright white paper.");
    expect(prompt).toContain("Keep the same visible identity anchors, face, hair, outfit palette, and proportions");
  });

  it("filters generic sentence-start labels and keeps generic roles prompt-only", () => {
    const visualBible = buildVisualStoryBible({
      bookId: "book-2",
      title: "Ava Plays Fair",
      childFirstName: "Ava",
      story: {
        ...story,
        concept: {
          ...story.concept,
          lessonScenario: {
            moneyLessonKey: "better_rules",
            gameName: "Space Soccer",
            brokenRule: "the goal keeps moving",
            fairRule: "the goal stays put",
            sharedGoal: "everyone gets a fair turn",
            deadlineEvent: null
          }
        },
        moneyLessonKey: "better_rules",
        pages: [
          {
            pageIndex: 0,
            pageText: "Everyone cheers. It is game time. Mom and Sam stand by a friend.",
            illustrationBrief: "Mom and Sam smile while a friend holds the ball.",
            sceneId: "yard_start",
            sceneVisualDescription: "Backyard grass with a soccer ball and a small goal.",
            newWordsIntroduced: ["goal"],
            repetitionTargets: ["goal"]
          },
          {
            pageIndex: 1,
            pageText: "Sam runs. Mom waves. The friend points to the goal.",
            illustrationBrief: "Sam and Mom stand near the same friend by the ball.",
            sceneId: "yard_start",
            sceneVisualDescription: "Backyard grass with a soccer ball and a small goal.",
            newWordsIntroduced: ["run"],
            repetitionTargets: ["run"]
          }
        ]
      },
      generatedAt: "2026-03-24T00:00:00.000Z"
    });

    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_everyone")).toBeUndefined();
    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_it")).toBeUndefined();
    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_children")).toBeUndefined();
    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_each")).toBeUndefined();
    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_let")).toBeUndefined();
    expect(visualBible.entities.find((entity) => entity.entityId === "supporting_character_now")).toBeUndefined();

    const sam = visualBible.entities.find((entity) => entity.entityId === "supporting_character_sam");
    expect(sam).toMatchObject({
      recurring: true,
      importance: "story_critical",
      referenceStrategy: "generated_supporting_reference"
    });

    const friend = visualBible.entities.find((entity) => entity.entityId === "supporting_character_friend");
    expect(friend).toMatchObject({
      recurring: true,
      importance: "story_critical",
      referenceStrategy: "prompt_only"
    });
  });

  it("renders structured visual guidance into the page art prompt", () => {
    const prompt = buildPageArtPrompt({
      pageText: "Ava and Mom count 4 coins by the jar.",
      illustrationBrief: "Mom points at the blue coin jar.",
      sceneVisualDescription: "Sunny kitchen table with a blue coin jar and yellow note by the window.",
      visualGuidance: {
        mustShow: ["Mom: Mom is the same caregiver on every page."],
        mustMatch: ["jar is empty"],
        showExactly: ["4 coins"],
        mustNotShow: ["more than 4 coins"],
        settingAnchors: ["sunny kitchen table", "blue coin jar"],
        continuityNotes: ["Keep the jar by the window."]
      }
    });

    expect(prompt).toContain("Must show:");
    expect(prompt).toContain("Must match:");
    expect(prompt).toContain("Show exactly:");
    expect(prompt).toContain("Must not show:");
    expect(prompt).toContain("Setting anchors:");
    expect(prompt).toContain("Continuity notes:");
    expect(prompt).toContain("Human continuity:");
    expect(prompt).toContain("new prominent humans");
    expect(prompt).toContain("style-outlier extras");
  });
});
