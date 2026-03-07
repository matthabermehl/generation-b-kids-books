import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { storageKeys } from "../src/lib/storage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    })
  );
}

describe("web app", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("unexpected fetch"))));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the parent flow when signed out", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /calm, personalized bitcoin stories/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /1\. parent login/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /review/i })).not.toBeInTheDocument();
  });

  it("redirects non-reviewers away from the review area", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/review");

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/v1/session")) {
          return jsonResponse({
            user: { id: "user-1", email: "parent@example.com" },
            capabilities: { canReview: false }
          });
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /1\. parent login/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /manual qa queue/i })).not.toBeInTheDocument();
  });

  it("loads the review queue for reviewer sessions", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/review");

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/v1/session")) {
          return jsonResponse({
            user: { id: "user-2", email: "reviewer@example.com" },
            capabilities: { canReview: true }
          });
        }
        if (url.includes("/v1/review/cases?status=open")) {
          return jsonResponse({
            cases: [
              {
                caseId: "case-1",
                status: "open",
                stage: "image_qa",
                reasonSummary: "Text zone spill on page 3",
                createdAt: "2026-03-06T10:00:00.000Z",
                resolvedAt: null,
                orderId: "order-1",
                orderStatus: "needs_review",
                bookId: "book-1",
                bookStatus: "needs_review",
                childFirstName: "Ava",
                readingProfileId: "early_decoder_5_7",
                moneyLessonKey: "saving_later",
                pageCount: 8,
                latestAction: null,
                latestReviewerEmail: null
              }
            ]
          });
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /manual qa queue/i })).toBeInTheDocument();
    });
    expect(screen.getByText("Ava")).toBeInTheDocument();
    expect(screen.getByText(/text zone spill on page 3/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/review/cases/case-1");
  });
});
