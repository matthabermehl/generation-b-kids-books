import { describe, expect, it } from "vitest";
import { isReviewerEmailAllowed } from "../src/lib/reviewer.js";

describe("reviewer allowlist", () => {
  it("matches allowlisted emails case-insensitively", () => {
    expect(isReviewerEmailAllowed("Reviewer@Example.com", ["reviewer@example.com"])).toBe(true);
  });

  it("rejects emails outside the allowlist", () => {
    expect(isReviewerEmailAllowed("parent@example.com", ["reviewer@example.com"])).toBe(false);
    expect(isReviewerEmailAllowed("reviewer@example.com", [])).toBe(false);
  });
});
