import { describe, expect, it } from "vitest";
import { validateAgeYears } from "../src/lib/parent-flow";
import { sanitizeBookPayload, sanitizeReviewCaseDetail, toSafeAssetUrl, toSafeCheckoutUrl } from "../src/lib/safe-url";

describe("safe url helpers", () => {
  it("only accepts Stripe checkout URLs for external checkout navigation", () => {
    expect(toSafeCheckoutUrl("https://checkout.stripe.com/pay/test-session")).toBe(
      "https://checkout.stripe.com/pay/test-session"
    );
    expect(toSafeCheckoutUrl("https://evil.example.com/pay/test-session")).toBeNull();
    expect(toSafeCheckoutUrl("javascript:alert(1)")).toBeNull();
  });

  it("only accepts http and https asset URLs", () => {
    expect(toSafeAssetUrl("https://dazfa7oc8fu6h.cloudfront.net/books/book-1.pdf")).toBe(
      "https://dazfa7oc8fu6h.cloudfront.net/books/book-1.pdf"
    );
    expect(toSafeAssetUrl("/books/book-1.pdf")).toBe(`${window.location.origin}/books/book-1.pdf`);
    expect(toSafeAssetUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("sanitizes book preview URLs before rendering", () => {
    const payload = sanitizeBookPayload({
      title: "Book",
      pages: [
        {
          pageIndex: 0,
          text: "Hello",
          imageUrl: "javascript:alert(1)",
          previewImageUrl: "https://dazfa7oc8fu6h.cloudfront.net/books/page-1.png",
          status: "ready"
        }
      ]
    } as any);

    expect(payload.pages[0].imageUrl).toBeNull();
    expect(payload.pages[0].previewImageUrl).toBe("https://dazfa7oc8fu6h.cloudfront.net/books/page-1.png");
  });

  it("sanitizes reviewer artifact and image URLs before rendering", () => {
    const payload = sanitizeReviewCaseDetail({
      pdfUrl: "javascript:alert(1)",
      scenePlan: {
        createdAt: "2026-03-08T09:59:00.000Z",
        url: "/books/book-1/scene-plan.json"
      },
      imagePlan: {
        createdAt: "2026-03-08T09:59:01.000Z",
        url: "javascript:alert(1)"
      },
      artifacts: [{ artifactType: "preview", createdAt: "2026-03-08T10:00:00.000Z", url: "data:text/html,boom" }],
      pages: [
        {
          pageId: "page-1",
          pageIndex: 0,
          text: "Hello",
          templateId: "band_top_soft",
          retryCount: 0,
          latestQaIssues: [],
          qaMetrics: {},
          provenance: {},
          previewImageUrl: "https://dazfa7oc8fu6h.cloudfront.net/books/page-1.png",
          pageArtUrl: "https://dazfa7oc8fu6h.cloudfront.net/books/page-1-art.png"
        }
      ]
    } as any);

    expect(payload.pdfUrl).toBeNull();
    expect(payload.scenePlan?.url).toBe(`${window.location.origin}/books/book-1/scene-plan.json`);
    expect(payload.imagePlan?.url).toBeNull();
    expect(payload.artifacts[0].url).toBeNull();
    expect(payload.pages[0].previewImageUrl).toBe("https://dazfa7oc8fu6h.cloudfront.net/books/page-1.png");
    expect(payload.pages[0].pageArtUrl).toBe("https://dazfa7oc8fu6h.cloudfront.net/books/page-1-art.png");
  });
});

describe("parent draft validation", () => {
  it("rejects ages outside the selected reading profile range", () => {
    expect(validateAgeYears(4, "early_decoder_5_7")).toMatch(/ages 5-7/i);
    expect(validateAgeYears(5, "read_aloud_3_4")).toMatch(/ages 3-4/i);
  });

  it("accepts ages inside the selected reading profile range", () => {
    expect(validateAgeYears(4, "read_aloud_3_4")).toBeNull();
    expect(validateAgeYears(6, "early_decoder_5_7")).toBeNull();
  });
});
