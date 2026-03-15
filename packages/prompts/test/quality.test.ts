import { describe, expect, it } from "vitest";
import { runDeterministicStoryChecks } from "../src/quality.js";

describe("runDeterministicStoryChecks", () => {
  it("passes a compliant story", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText:
        idx < 8
          ? `Mia saves one coin after task ${idx + 1}.`
          : `Mia learns Bitcoin can help save value in step ${idx + 1}.`,
      illustrationBrief: "Calm room scene",
      sceneId: `scene-${Math.floor(idx / 2) + 1}`,
      sceneVisualDescription: "Calm room scene with a small coin jar.",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = runDeterministicStoryChecks("read_aloud_3_4", pages, true);
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

    const result = runDeterministicStoryChecks("read_aloud_3_4", pages, true);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes("near-identical text"))).toBe(true);
  });
});
