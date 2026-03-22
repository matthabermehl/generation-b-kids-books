import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeConfigMock } = vi.hoisted(() => ({
  getRuntimeConfigMock: vi.fn()
}));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

import { evaluateVisualContinuity } from "../src/lib/visual-qa.js";

describe("visual continuity qa", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getRuntimeConfigMock.mockResolvedValue({
      secrets: {
        openaiApiKey: "oa"
      },
      featureFlags: {
        enableMockImage: false
      },
      models: {
        openaiVision: "gpt-5-mini-2025-08-07"
      }
    });
  });

  it("returns a skipped verdict when no page contract is available", async () => {
    const verdict = await evaluateVisualContinuity({
      imageUrl: "https://example.com/page.png",
      pageText: "Ava counts coins.",
      illustrationBrief: "Ava looks at the coin jar.",
      sceneVisualDescription: "Sunny table with a blue coin jar.",
      pageContract: null
    });

    expect(verdict.mode).toBe("skipped");
    expect(verdict.summary).toContain("No visual page contract");
  });

  it("accepts style_outlier_extra verdicts and includes identity anchors in the QA request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                passed: false,
                confidence: 0.91,
                summary: "A visually prominent anime-styled shopper breaks the watercolor language.",
                issues: [
                  {
                    code: "style_outlier_extra",
                    message: "A bright anime-styled shopper pulls focus and breaks the established watercolor realism.",
                    observed: "anime-styled shopper",
                    confidence: 0.91
                  }
                ]
              })
            }
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const verdict = await evaluateVisualContinuity({
      imageUrl: "https://example.com/page.png",
      pageText: "Ava pays for apples.",
      illustrationBrief: "Ava and Mom stand by the fruit display.",
      sceneVisualDescription: "Warm grocery aisle with baskets of apples and a cashier in the distance.",
      pageContract: {
        pageIndex: 4,
        sceneId: "grocery_store",
        settingEntityId: "setting_grocery_store",
        requiredCharacterIds: ["main_character", "supporting_character_mom"],
        supportingCharacterIds: ["supporting_character_mom"],
        requiredPropIds: [],
        exactCountConstraints: [],
        stateConstraints: [],
        settingAnchors: ["warm grocery aisle", "apple baskets"],
        continuityNotes: ["Mom stays beside Ava at the fruit display."],
        mustNotShow: []
      },
      visualGuidance: {
        mustShow: ["Mom: same caregiver on every page."],
        mustMatch: ["Mom role: same calm caregiver adult across every page"],
        showExactly: [],
        mustNotShow: [],
        settingAnchors: ["warm grocery aisle", "apple baskets"],
        continuityNotes: ["Mom stays beside Ava at the fruit display."]
      },
      mainCharacterReferenceUrl: "https://example.com/ava.png",
      supportingCharacterReferences: [
        {
          label: "Mom",
          identityAnchors: [
            { trait: "role", value: "same calm caregiver adult across every page" },
            { trait: "wardrobe", value: "practical everyday clothes with a consistent outfit palette" }
          ],
          url: "https://example.com/mom.png"
        }
      ],
      continuityReferenceImages: [{ label: "page-3", url: "https://example.com/page-3.png" }]
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.issues[0]?.code).toBe("style_outlier_extra");

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    const serializedContent = JSON.stringify(requestBody.messages?.[1]?.content ?? []);
    expect(serializedContent).toContain("Locked identity anchors");
    expect(serializedContent).toContain("style_outlier_extra");
  });
});
