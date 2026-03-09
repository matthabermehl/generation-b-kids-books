import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function buildFetchStub({
  canReview = false,
  queueCases = [],
  orderStatus
}: {
  canReview?: boolean;
  queueCases?: Array<Record<string, unknown>>;
  orderStatus?: Record<string, unknown>;
} = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/v1/session")) {
      return jsonResponse({
        user: { id: canReview ? "reviewer-1" : "parent-1", email: canReview ? "reviewer@example.com" : "parent@example.com" },
        capabilities: { canReview }
      });
    }

    if (url.includes("/v1/review/cases?status=open")) {
      return jsonResponse({ cases: queueCases });
    }

    if (url.includes("/v1/orders/order-1")) {
      return jsonResponse(
        orderStatus ?? {
          orderId: "order-1",
          status: "paid",
          bookId: "book-1",
          childProfileId: "child-1",
          bookStatus: "building",
          createdAt: "2026-03-08T12:00:00.000Z"
        }
      );
    }

    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
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

  it("renders the landing page when signed out", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /personalized bitcoin stories without turning the experience into an admin tool/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send magic link/i })).toBeInTheDocument();
  });

  it("redirects authenticated parents from review routes into the create flow", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/review");

    vi.stubGlobal("fetch", buildFetchStub());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /create a child-safe order/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /manual qa queue/i })).not.toBeInTheDocument();
  });

  it("redirects authenticated parents away from checkout without an active order", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/checkout");

    vi.stubGlobal("fetch", buildFetchStub());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /create a child-safe order/i })).toBeInTheDocument();
    });
  });

  it("redirects authenticated parents away from current book without an active order", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/books/current");

    vi.stubGlobal("fetch", buildFetchStub());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /create a child-safe order/i })).toBeInTheDocument();
    });
  });

  it("routes checkout success callbacks into the current book workspace", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    localStorage.setItem(storageKeys.activeOrder, JSON.stringify({ orderId: "order-1", bookId: "book-1", childProfileId: "child-1" }));
    localStorage.setItem(
      storageKeys.activeOrderStatus,
      JSON.stringify({
        orderId: "order-1",
        status: "paid",
        bookId: "book-1",
        childProfileId: "child-1",
        bookStatus: "building",
        createdAt: "2026-03-08T12:00:00.000Z"
      })
    );
    window.history.pushState({}, "", "/?checkout=success");

    vi.stubGlobal("fetch", buildFetchStub());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /current book workspace/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/checkout received/i)).toBeInTheDocument();
  });

  it("clears persisted parent flow state on sign out", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    localStorage.setItem(storageKeys.activeOrder, JSON.stringify({ orderId: "order-1", bookId: "book-1", childProfileId: "child-1" }));
    localStorage.setItem(
      storageKeys.activeOrderStatus,
      JSON.stringify({
        orderId: "order-1",
        status: "created",
        bookId: "book-1",
        childProfileId: "child-1",
        bookStatus: "draft",
        createdAt: "2026-03-08T12:00:00.000Z"
      })
    );
    localStorage.setItem(storageKeys.activeCheckoutUrl, "https://checkout.example.com");
    localStorage.setItem(storageKeys.activeDownloadUrl, "https://download.example.com");
    localStorage.setItem(storageKeys.activeBookPayload, JSON.stringify({ pages: [] }));
    window.history.pushState({}, "", "/create");

    vi.stubGlobal("fetch", buildFetchStub());

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /create a child-safe order/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /personalized bitcoin stories without turning the experience into an admin tool/i
        })
      ).toBeInTheDocument();
    });

    expect(localStorage.getItem(storageKeys.authToken)).toBeNull();
    expect(localStorage.getItem(storageKeys.activeOrder)).toBeNull();
    expect(localStorage.getItem(storageKeys.activeOrderStatus)).toBeNull();
    expect(localStorage.getItem(storageKeys.activeCheckoutUrl)).toBeNull();
    expect(localStorage.getItem(storageKeys.activeDownloadUrl)).toBeNull();
    expect(localStorage.getItem(storageKeys.activeBookPayload)).toBeNull();
  });

  it("loads the review queue for reviewer sessions", async () => {
    localStorage.setItem(storageKeys.authToken, "session-token");
    window.history.pushState({}, "", "/review");

    vi.stubGlobal(
      "fetch",
      buildFetchStub({
        canReview: true,
        queueCases: [
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
