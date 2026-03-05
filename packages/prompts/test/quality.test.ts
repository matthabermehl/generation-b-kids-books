import { describe, expect, it } from "vitest";
import { runDeterministicStoryChecks } from "../src/quality.js";

describe("runDeterministicStoryChecks", () => {
  it("passes a compliant story", () => {
    const pages = Array.from({ length: 12 }, (_, idx) => ({
      pageIndex: idx,
      pageText: idx < 10 ? "Mia saves coins in a jar." : "Mia learns Bitcoin can help save value.",
      illustrationBrief: "Calm room scene",
      newWordsIntroduced: [],
      repetitionTargets: []
    }));

    const result = runDeterministicStoryChecks("read_aloud_3_4", pages, true);
    expect(result.ok).toBe(true);
  });
});
