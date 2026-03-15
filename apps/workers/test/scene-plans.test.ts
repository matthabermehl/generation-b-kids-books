import { describe, expect, it } from "vitest";
import { buildImagePlanArtifact, buildScenePlanArtifact } from "../src/lib/scene-plans.js";

describe("scene plan artifacts", () => {
  it("deduplicates repeated scene ids across beats and pages", () => {
    const artifact = buildScenePlanArtifact({
      bookId: "book-1",
      title: "Ava Saves",
      generatedAt: "2026-03-15T20:00:00.000Z",
      beatSheet: {
        beats: [
          {
            purpose: "Setup",
            conflict: "Ava wants candy now.",
            sceneLocation: "Kitchen",
            sceneId: "kitchen_morning",
            sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
            emotionalTarget: "curious",
            pageIndexEstimate: 0,
            decodabilityTags: ["controlled_vocab"],
            newWordsIntroduced: ["save"],
            bitcoinRelevanceScore: 0.1
          },
          {
            purpose: "Choice",
            conflict: "Ava counts coins again.",
            sceneLocation: "Kitchen",
            sceneId: "kitchen_morning",
            sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
            emotionalTarget: "determined",
            pageIndexEstimate: 1,
            decodabilityTags: ["controlled_vocab"],
            newWordsIntroduced: ["plan"],
            bitcoinRelevanceScore: 0.2
          },
          {
            purpose: "Payoff",
            conflict: "Ava sees the result of waiting.",
            sceneLocation: "Store",
            sceneId: "corner_store",
            sceneVisualDescription: "Warm corner store aisle with a small lamp on display.",
            emotionalTarget: "proud",
            pageIndexEstimate: 2,
            decodabilityTags: ["controlled_vocab"],
            newWordsIntroduced: ["bitcoin"],
            bitcoinRelevanceScore: 0.9
          }
        ]
      },
      pages: [
        {
          pageIndex: 0,
          pageText: "Ava saves one coin.",
          illustrationBrief: "Ava places a coin in the jar.",
          sceneId: "kitchen_morning",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
          newWordsIntroduced: ["save"],
          repetitionTargets: ["save"]
        },
        {
          pageIndex: 1,
          pageText: "Ava counts again.",
          illustrationBrief: "Ava taps coins beside the jar.",
          sceneId: "kitchen_morning",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
          newWordsIntroduced: ["plan"],
          repetitionTargets: ["plan"]
        },
        {
          pageIndex: 2,
          pageText: "Ava buys the small lamp.",
          illustrationBrief: "Ava smiles in the corner store.",
          sceneId: "corner_store",
          sceneVisualDescription: "Warm corner store aisle with a small lamp on display.",
          newWordsIntroduced: ["bitcoin"],
          repetitionTargets: ["save"]
        }
      ]
    });

    expect(artifact.scenes).toEqual([
      {
        sceneId: "kitchen_morning",
        sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
        beatIndices: [0, 1],
        pageIndices: [0, 1]
      },
      {
        sceneId: "corner_store",
        sceneVisualDescription: "Warm corner store aisle with a small lamp on display.",
        beatIndices: [2],
        pageIndices: [2]
      }
    ]);
  });
});

describe("image plan artifacts", () => {
  it("resolves up to two earlier same-scene page ids in page order", () => {
    const artifact = buildImagePlanArtifact({
      bookId: "book-1",
      title: "Ava Saves",
      generatedAt: "2026-03-15T20:00:00.000Z",
      pages: [
        {
          id: "page-1",
          pageIndex: 0,
          pageText: "Ava saves one coin.",
          illustrationBrief: "Ava places a coin in the jar.",
          sceneId: "kitchen_morning",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
          newWordsIntroduced: ["save"],
          repetitionTargets: ["save"]
        },
        {
          id: "page-2",
          pageIndex: 1,
          pageText: "Ava counts again.",
          illustrationBrief: "Ava taps coins beside the jar.",
          sceneId: "kitchen_morning",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
          newWordsIntroduced: ["plan"],
          repetitionTargets: ["plan"]
        },
        {
          id: "page-3",
          pageIndex: 2,
          pageText: "Ava checks the jar once more.",
          illustrationBrief: "Ava leans over the same jar.",
          sceneId: "kitchen_morning",
          sceneVisualDescription: "Sunny kitchen table with a blue coin jar.",
          newWordsIntroduced: ["wait"],
          repetitionTargets: ["wait"]
        },
        {
          id: "page-4",
          pageIndex: 3,
          pageText: "Ava sees the lamp in the store.",
          illustrationBrief: "Ava looks at the lamp shelf.",
          sceneId: "corner_store",
          sceneVisualDescription: "Warm corner store aisle with a small lamp on display.",
          newWordsIntroduced: ["bitcoin"],
          repetitionTargets: ["save"]
        }
      ]
    });

    expect(artifact.pages.map((page) => page.priorSameScenePageIds)).toEqual([
      [],
      ["page-1"],
      ["page-1", "page-2"],
      []
    ]);
    expect(artifact.pages[2]?.pageArtPromptInputs).toEqual({
      pageText: "Ava checks the jar once more.",
      illustrationBrief: "Ava leans over the same jar.",
      sceneVisualDescription: "Sunny kitchen table with a blue coin jar."
    });
  });
});
