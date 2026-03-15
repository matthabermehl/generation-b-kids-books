import { describe, expect, it } from "vitest";
import {
  pageSeed,
  validateMontessoriRealism,
  validateNarrativeRatio,
  validatePageVariation,
  validateReadingProfile
} from "../src/index.js";

describe("seed", () => {
  it("returns deterministic page seed", () => {
    expect(pageSeed("book-1", 2, "v1")).toBe(pageSeed("book-1", 2, "v1"));
  });
});

describe("narrative ratio", () => {
  it("fails when bitcoin appears too early", () => {
    const result = validateNarrativeRatio([
      { pageIndex: 0, pageText: "Bitcoin is everywhere.", illustrationBrief: "", sceneId: "scene-1", sceneVisualDescription: "Kitchen table", newWordsIntroduced: [], repetitionTargets: [] },
      { pageIndex: 1, pageText: "Page two.", illustrationBrief: "", sceneId: "scene-1", sceneVisualDescription: "Kitchen table", newWordsIntroduced: [], repetitionTargets: [] },
      { pageIndex: 2, pageText: "Page three.", illustrationBrief: "", sceneId: "scene-2", sceneVisualDescription: "Store shelf", newWordsIntroduced: [], repetitionTargets: [] },
      { pageIndex: 3, pageText: "Page four.", illustrationBrief: "", sceneId: "scene-2", sceneVisualDescription: "Store shelf", newWordsIntroduced: [], repetitionTargets: [] }
    ]);

    expect(result.ok).toBe(false);
  });
});

describe("reading profile", () => {
  it("flags overly long early decoder pages", () => {
    const longText = Array.from({ length: 60 }, () => "word").join(" ");
    const result = validateReadingProfile("early_decoder_5_7", [
      { pageIndex: 1, pageText: longText, illustrationBrief: "", sceneId: "scene-1", sceneVisualDescription: "Kitchen table", newWordsIntroduced: [], repetitionTargets: [] }
    ]);

    expect(result.ok).toBe(false);
  });
});

describe("montessori realism", () => {
  it("flags fantasy terms for read-aloud profile", () => {
    const result = validateMontessoriRealism("read_aloud_3_4", [
      { pageIndex: 0, pageText: "A dragon flew over town.", illustrationBrief: "", sceneId: "scene-1", sceneVisualDescription: "Town square", newWordsIntroduced: [], repetitionTargets: [] }
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
