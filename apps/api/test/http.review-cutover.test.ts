import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeMock,
  getRuntimeConfigMock,
  publicArtifactUrlMock,
  queryMock,
  sendMock,
  verifySessionTokenMock
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  getRuntimeConfigMock: vi.fn(),
  publicArtifactUrlMock: vi.fn((value: string | null) => (value ? value.replace("s3://bucket", "https://cdn.example.com") : null)),
  queryMock: vi.fn(),
  sendMock: vi.fn(),
  verifySessionTokenMock: vi.fn()
}));

vi.mock("@aws-sdk/client-sfn", () => {
  class SFNClient {
    send = sendMock;
  }
  class StartExecutionCommand {
    constructor(public input: unknown) {}
  }

  return { SFNClient, StartExecutionCommand };
});

vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    send = vi.fn();
  }
  class SendMessageCommand {
    constructor(public input: unknown) {}
  }

  return { SQSClient, SendMessageCommand };
});

vi.mock("../src/lib/auth.js", () => ({
  createLoginToken: vi.fn(),
  createSessionToken: vi.fn(),
  verifyLoginToken: vi.fn(),
  verifySessionToken: verifySessionTokenMock
}));

vi.mock("../src/lib/email.js", () => ({
  sendLoginLink: vi.fn()
}));

vi.mock("../src/lib/idempotency.js", () => ({
  withIdempotency: vi.fn(async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn())
}));

vi.mock("../src/lib/rds.js", () => ({
  execute: executeMock,
  query: queryMock,
  txExecute: vi.fn(),
  withTransaction: vi.fn(async (fn: (transactionId: string) => Promise<unknown>) => fn("tx-1"))
}));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

vi.mock("../src/lib/storage.js", () => ({
  publicArtifactUrl: publicArtifactUrlMock,
  putBuffer: vi.fn(),
  signPdfDownload: vi.fn()
}));

vi.mock("../src/lib/stripe.js", () => ({
  createStripeCheckoutSession: vi.fn(),
  verifyStripeWebhook: vi.fn()
}));

vi.mock("../src/lib/character-images.js", () => ({
  generateCharacterCandidateImage: vi.fn()
}));

import { handler } from "../src/http.js";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function makeEvent(input: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: input.path,
    rawQueryString: "",
    headers: input.headers ?? {},
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: input.method,
        path: input.path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest"
      },
      requestId: "req-1",
      routeKey: "$default",
      stage: "$default",
      time: "15/Mar/2026:12:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false,
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  };
}

describe("review and render cutover http routes", () => {
  beforeEach(() => {
    queryMock.mockReset();
    executeMock.mockReset();
    publicArtifactUrlMock.mockClear();
    sendMock.mockReset();
    verifySessionTokenMock.mockResolvedValue({
      userId: "user-1",
      email: "reviewer@example.com"
    });
    getRuntimeConfigMock.mockResolvedValue({
      reviewerEmailAllowlist: ["reviewer@example.com"],
      models: {
        openaiJson: "gpt-5-mini",
        openaiVision: "gpt-5-mini",
        openaiImage: "gpt-image-1.5",
        anthropicWriter: "claude-sonnet-4-5"
      },
      secrets: {
        openaiApiKey: "oa",
        sendgridApiKey: "sg",
        anthropicApiKey: "an",
        jwtSigningSecret: "x".repeat(32),
        stripeSecretKey: "sk",
        stripeWebhookSecret: "wh"
      },
      stripe: {
        priceId: "price_123",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel"
      },
      featureFlags: {
        enableMockLlm: false,
        enableMockImage: false,
        enableMockCheckout: false,
        enablePictureBookPipeline: true,
        enableIndependent8To10: false
      },
      sendgridFromEmail: "noreply@example.com",
      authLinkTtlMinutes: 30,
      webBaseUrl: "https://example.com"
    });
    sendMock.mockResolvedValue({ executionArn: "arn:aws:states:us-east-1:123:execution:test" });
    process.env.BOOK_BUILD_STATE_MACHINE_ARN = "arn:aws:states:us-east-1:123:stateMachine:test";
  });

  it("returns current-book pages from page_preview and page_art assets", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("SELECT b.id, b.status, b.reading_profile_id")) {
        return [
          {
            id: "book-1",
            status: "building",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later",
            child_first_name: "Ava",
            product_family: "picture_book_fixed_layout"
          }
        ];
      }
      if (normalized.includes("SELECT p.page_index, p.text, p.status")) {
        return [
          {
            page_index: 0,
            text: "Page one",
            status: "ready",
            image_url: "s3://bucket/books/book-1/page-art-1.png",
            preview_image_url: null,
            template_id: "band_top_soft"
          }
        ];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "GET",
        path: "/v1/books/book-1",
        headers: {
          authorization: "Bearer reviewer-session"
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      bookId: "book-1",
      pages: [
        {
          pageIndex: 0,
          imageUrl: "https://cdn.example.com/books/book-1/page-art-1.png",
          previewImageUrl: null
        }
      ]
    });
  });

  it("returns reviewer page payloads with pageArtUrl and plan metadata", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM review_cases rc")) {
        return [
          {
            review_case_id: "case-1",
            review_case_status: "open",
            review_stage: "image_qa",
            reason_summary: "Manual review needed",
            reason_json: "{\"failed\":1}",
            created_at: "2026-03-15T10:00:00.000Z",
            resolved_at: null,
            book_id: "book-1",
            book_status: "needs_review",
            order_id: "order-1",
            order_status: "needs_review",
            child_first_name: "Ava",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later"
          }
        ];
      }
      if (normalized.includes("FROM review_events")) {
        return [];
      }
      if (normalized.includes("FROM evaluations")) {
        return [];
      }
      if (normalized.includes("FROM book_artifacts")) {
        return [
          { artifact_type: "pdf", s3_url: "s3://bucket/books/book-1/render/book.pdf", created_at: "2026-03-15T10:00:00.000Z" },
          { artifact_type: "story_proof_pdf", s3_url: "s3://bucket/books/book-1/render/story-proof.pdf", created_at: "2026-03-15T09:30:00.000Z" },
          { artifact_type: "scene_plan", s3_url: "s3://bucket/books/book-1/scene-plan.json", created_at: "2026-03-15T09:00:00.000Z" },
          { artifact_type: "image_plan", s3_url: "s3://bucket/books/book-1/image-plan.json", created_at: "2026-03-15T09:00:01.000Z" }
        ];
      }
      if (normalized.includes("FROM pages p")) {
        return [
          {
            page_id: "page-1",
            page_index: 0,
            status: "failed",
            text: "Page one",
            template_id: "band_top_soft",
            preview_image_url: "s3://bucket/books/book-1/render/page-1.png",
            page_art_url: "s3://bucket/books/book-1/images/page-1-art.png",
            qa_json: "{\"issues\":[\"text_overflow\"],\"metrics\":{\"contrast\":9}}",
            input_assets_json:
              "{\"sceneId\":\"park_bench\",\"characterReferenceImageId\":\"char-ref-1\",\"sameSceneReferenceImageIds\":[\"img-1\"],\"priorSameScenePageIds\":[\"page-0\"]}",
            retry_count: 2
          }
        ];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "GET",
        path: "/v1/review/cases/case-1",
        headers: {
          authorization: "Bearer reviewer-session"
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      caseId: "case-1",
      pdfUrl: "https://cdn.example.com/books/book-1/render/book.pdf",
      storyProofPdfUrl: "https://cdn.example.com/books/book-1/render/story-proof.pdf",
      scenePlan: {
        url: "https://cdn.example.com/books/book-1/scene-plan.json"
      },
      imagePlan: {
        url: "https://cdn.example.com/books/book-1/image-plan.json"
      },
      pages: [
        {
          pageId: "page-1",
          previewImageUrl: "https://cdn.example.com/books/book-1/render/page-1.png",
          pageArtUrl: "https://cdn.example.com/books/book-1/images/page-1-art.png",
          retryCount: 1,
          provenance: {
            sceneId: "park_bench",
            characterReferenceImageId: "char-ref-1"
          }
        }
      ]
    });
  });

  it("invalidates page_art and page_preview assets when retrying a page", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM review_cases rc")) {
        return [
          {
            review_case_id: "case-1",
            review_case_status: "open",
            review_stage: "image_qa",
            reason_summary: "Manual review needed",
            reason_json: "{}",
            created_at: "2026-03-15T10:00:00.000Z",
            resolved_at: null,
            book_id: "book-1",
            book_status: "needs_review",
            order_id: "order-1",
            order_status: "needs_review",
            child_first_name: "Ava",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later"
          }
        ];
      }
      if (normalized.includes("SELECT id::text AS id FROM pages")) {
        return [{ id: "page-1" }];
      }
      if (normalized.includes("selected_character_image_id")) {
        return [
          {
            order_id: "order-1",
            order_status: "needs_review",
            book_id: "book-1",
            book_status: "needs_review",
            child_profile_id: "child-1",
            selected_character_image_id: "char-ref-1"
          }
        ];
      }
      if (normalized.includes("SELECT status FROM orders")) {
        return [{ status: "needs_review" }];
      }
      if (normalized.includes("SELECT status FROM books")) {
        return [{ status: "needs_review" }];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/review/cases/case-1/pages/page-1/retry",
        headers: {
          authorization: "Bearer reviewer-session"
        },
        body: {
          notes: "Try again with the fixed page-art flow."
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    const imageInvalidation = executeMock.mock.calls.find((call) =>
      normalizeSql(String(call[0])).includes("UPDATE images SET is_current = FALSE")
    );
    expect(imageInvalidation).toBeDefined();
    expect(normalizeSql(String(imageInvalidation?.[0]))).toContain("role IN ('page', 'page_art', 'page_preview')");
  });

  it("marks finalize-gate approvals retrying before resuming the pipeline", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM review_cases rc")) {
        return [
          {
            review_case_id: "case-1",
            review_case_status: "open",
            review_stage: "finalize_gate",
            reason_summary: "Finalize gate needs review",
            reason_json: "{\"artifactKey\":\"books/book-1/story-qa-report.json\"}",
            created_at: "2026-03-15T10:00:00.000Z",
            resolved_at: null,
            book_id: "book-1",
            book_status: "needs_review",
            order_id: "order-1",
            order_status: "needs_review",
            child_first_name: "Ava",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later"
          }
        ];
      }
      if (normalized.includes("FROM orders o INNER JOIN books b ON b.order_id = o.id")) {
        return [
          {
            order_id: "order-1",
            order_status: "needs_review",
            book_id: "book-1",
            book_status: "needs_review",
            child_profile_id: "child-1",
            selected_character_image_id: "char-ref-1"
          }
        ];
      }
      if (normalized.includes("SELECT status FROM orders")) {
        return [{ status: "needs_review" }];
      }
      if (normalized.includes("SELECT status FROM books")) {
        return [{ status: "needs_review" }];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/review/cases/case-1/approve",
        headers: {
          authorization: "Bearer reviewer-session"
        },
        body: {
          notes: "Manual review accepted. Continue finalization."
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          input: expect.stringContaining("\"resumeStage\":\"resume_story_review\"")
        })
      })
    );
    const reviewCaseUpdateIndex = executeMock.mock.calls.findIndex((call) =>
      normalizeSql(String(call[0])).includes("UPDATE review_cases SET status = :status")
    );
    expect(reviewCaseUpdateIndex).toBeGreaterThanOrEqual(0);
    const reviewCaseUpdateOrder = executeMock.mock.invocationCallOrder[reviewCaseUpdateIndex];
    expect(reviewCaseUpdateOrder).toBeLessThan(sendMock.mock.invocationCallOrder[0]);
  });

  it("resumes direct finalization for post-render finalize-gate approvals", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM review_cases rc")) {
        return [
          {
            review_case_id: "case-2",
            review_case_status: "open",
            review_stage: "finalize_gate",
            reason_summary: "Finalize gate blocked after render",
            reason_json: "{\"needsReviewCount\":1}",
            created_at: "2026-03-15T10:00:00.000Z",
            resolved_at: null,
            book_id: "book-2",
            book_status: "needs_review",
            order_id: "order-2",
            order_status: "needs_review",
            child_first_name: "Ava",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later"
          }
        ];
      }
      if (normalized.includes("FROM orders o INNER JOIN books b ON b.order_id = o.id")) {
        return [
          {
            order_id: "order-2",
            order_status: "needs_review",
            book_id: "book-2",
            book_status: "needs_review",
            child_profile_id: "child-2",
            selected_character_image_id: "char-ref-2"
          }
        ];
      }
      if (normalized.includes("SELECT status FROM orders")) {
        return [{ status: "needs_review" }];
      }
      if (normalized.includes("SELECT status FROM books")) {
        return [{ status: "needs_review" }];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/review/cases/case-2/approve",
        headers: {
          authorization: "Bearer reviewer-session"
        },
        body: {
          notes: "Release gate accepted after render."
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          input: expect.stringContaining("\"resumeStage\":\"finalize_gate\"")
        })
      })
    );
  });

  it("accepts the current image-review page and resumes page generation after image_qa approval", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM review_cases rc")) {
        return [
          {
            review_case_id: "case-3",
            review_case_status: "open",
            review_stage: "image_qa",
            reason_summary: "1 page images exhausted QA retry budget.",
            reason_json: "{\"pageId\":\"page-3\",\"failed\":1}",
            created_at: "2026-03-15T10:00:00.000Z",
            resolved_at: null,
            book_id: "book-3",
            book_status: "needs_review",
            order_id: "order-3",
            order_status: "needs_review",
            child_first_name: "Ava",
            reading_profile_id: "early_decoder_5_7",
            money_lesson_key: "saving_later"
          }
        ];
      }
      if (normalized.includes("FROM orders o INNER JOIN books b ON b.order_id = o.id")) {
        return [
          {
            order_id: "order-3",
            order_status: "needs_review",
            book_id: "book-3",
            book_status: "needs_review",
            child_profile_id: "child-3",
            selected_character_image_id: "char-ref-3"
          }
        ];
      }
      if (normalized.includes("SELECT status FROM orders")) {
        return [{ status: "needs_review" }];
      }
      if (normalized.includes("SELECT status FROM books")) {
        return [{ status: "needs_review" }];
      }
      if (normalized.includes("WITH selected_candidate AS")) {
        return [{ image_id: "img-3" }];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/review/cases/case-3/approve",
        headers: {
          authorization: "Bearer reviewer-session"
        },
        body: {
          notes: "Accept the current page art and continue."
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          input: expect.stringContaining("\"resumeStage\":\"resume_page_review\"")
        })
      })
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          input: expect.stringContaining("\"pageId\":\"page-3\"")
        })
      })
    );

    const promotionQuery = queryMock.mock.calls.find((call) =>
      normalizeSql(String(call[0])).includes("WITH selected_candidate AS")
    );
    expect(promotionQuery).toBeDefined();
    expect(normalizeSql(String(promotionQuery?.[0]))).toContain("s3_url IS NOT NULL");
    expect(promotionQuery?.[1]).toEqual([{ name: "pageId", value: { stringValue: "page-3" } }]);
  });
});
