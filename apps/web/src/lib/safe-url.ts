import type { BookResponse, ReviewCaseDetailResponse } from "@/lib/api/client";

const safeProtocols = new Set(["http:", "https:"]);

function parseSafeHttpUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (!safeProtocols.has(url.protocol)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function toSafeCheckoutUrl(value: string | null | undefined) {
  const url = parseSafeHttpUrl(value);
  if (!url || url.protocol !== "https:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "checkout.stripe.com" || hostname.endsWith(".stripe.com")) {
    return url.toString();
  }

  return null;
}

export function toSafeAssetUrl(value: string | null | undefined) {
  return parseSafeHttpUrl(value)?.toString() ?? null;
}

export function sanitizeBookPayload(payload: BookResponse): BookResponse {
  return {
    ...payload,
    pages: payload.pages.map((page) => ({
      ...page,
      imageUrl: toSafeAssetUrl(page.imageUrl),
      previewImageUrl: toSafeAssetUrl(page.previewImageUrl)
    }))
  };
}

export function sanitizeReviewCaseDetail(payload: ReviewCaseDetailResponse): ReviewCaseDetailResponse {
  return {
    ...payload,
    pdfUrl: toSafeAssetUrl(payload.pdfUrl),
    storyProofPdfUrl: toSafeAssetUrl(payload.storyProofPdfUrl),
    scenePlan: payload.scenePlan
      ? {
          ...payload.scenePlan,
          url: toSafeAssetUrl(payload.scenePlan.url)
        }
      : null,
    imagePlan: payload.imagePlan
      ? {
          ...payload.imagePlan,
          url: toSafeAssetUrl(payload.imagePlan.url)
        }
      : null,
    artifacts: payload.artifacts.map((artifact) => ({
      ...artifact,
      url: toSafeAssetUrl(artifact.url)
    })),
    pages: payload.pages.map((page) => ({
      ...page,
      previewImageUrl: toSafeAssetUrl(page.previewImageUrl),
      pageArtUrl: toSafeAssetUrl(page.pageArtUrl)
    }))
  };
}
