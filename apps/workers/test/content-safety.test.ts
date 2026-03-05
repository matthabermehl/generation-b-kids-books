import { afterEach, describe, expect, it, vi } from "vitest";
import { blockedTermsInText, moderateTexts } from "../src/lib/content-safety.js";

describe("content safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds blocked safety terms in text", () => {
    expect(blockedTermsInText("A dragon used a knife.")).toContain("knife");
  });

  it("returns flagged when deterministic safety checks fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const verdict = await moderateTexts("oa", ["There was blood on the wall."]);
    expect(verdict.ok).toBe(false);
    expect(verdict.flagged).toBe(true);
    expect(verdict.reasons.some((reason) => reason.includes("blood"))).toBe(true);
  });
});
