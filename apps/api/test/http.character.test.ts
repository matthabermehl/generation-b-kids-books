import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createStripeCheckoutSessionMock,
  executeMock,
  generateCharacterCandidateImageMock,
  getRuntimeConfigMock,
  publicArtifactUrlMock,
  putBufferMock,
  queryMock,
  txExecuteMock,
  verifySessionTokenMock,
  withIdempotencyMock,
  withTransactionMock
} = vi.hoisted(() => ({
  createStripeCheckoutSessionMock: vi.fn(),
  executeMock: vi.fn(),
  generateCharacterCandidateImageMock: vi.fn(),
  getRuntimeConfigMock: vi.fn(),
  publicArtifactUrlMock: vi.fn((value: string | null) => (value ? value.replace("s3://bucket", "https://cdn.example.com") : null)),
  putBufferMock: vi.fn(),
  queryMock: vi.fn(),
  txExecuteMock: vi.fn(),
  verifySessionTokenMock: vi.fn(),
  withIdempotencyMock: vi.fn(async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()),
  withTransactionMock: vi.fn(async (fn: (transactionId: string) => Promise<unknown>) => fn("tx-1"))
}));

vi.mock("@aws-sdk/client-sfn", () => {
  class SFNClient {
    send = vi.fn();
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
  withIdempotency: withIdempotencyMock
}));

vi.mock("../src/lib/rds.js", () => ({
  execute: executeMock,
  query: queryMock,
  txExecute: txExecuteMock,
  withTransaction: withTransactionMock
}));

vi.mock("../src/lib/ssm-config.js", () => ({
  getRuntimeConfig: getRuntimeConfigMock
}));

vi.mock("../src/lib/storage.js", () => ({
  publicArtifactUrl: publicArtifactUrlMock,
  putBuffer: putBufferMock,
  signPdfDownload: vi.fn()
}));

vi.mock("../src/lib/stripe.js", () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock,
  verifyStripeWebhook: vi.fn()
}));

vi.mock("../src/lib/character-images.js", () => ({
  generateCharacterCandidateImage: generateCharacterCandidateImageMock
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

describe("character approval http routes", () => {
  beforeEach(() => {
    queryMock.mockReset();
    executeMock.mockReset();
    txExecuteMock.mockReset();
    withTransactionMock.mockClear();
    withIdempotencyMock.mockClear();
    createStripeCheckoutSessionMock.mockReset();
    generateCharacterCandidateImageMock.mockReset();
    putBufferMock.mockReset();
    publicArtifactUrlMock.mockClear();
    verifySessionTokenMock.mockResolvedValue({
      userId: "user-1",
      email: "parent@example.com"
    });
    getRuntimeConfigMock.mockResolvedValue({
      reviewerEmailAllowlist: [],
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
        enablePictureBookPipeline: false,
        enableIndependent8To10: false
      }
    });
  });

  it("rejects checkout until a character is selected", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("FROM orders o INNER JOIN books b ON b.order_id = o.id")) {
        return [
          {
            order_id: "order-1",
            order_status: "created",
            book_id: "book-1",
            book_status: "draft",
            child_profile_id: "child-1",
            selected_character_image_id: null
          }
        ];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/orders/order-1/checkout",
        headers: {
          authorization: "Bearer session-token",
          "idempotency-key": "idem-12345678"
        }
      }) as never
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? "{}")).toEqual({ error: "Select a character before checkout" });
    expect(createStripeCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("caps character generation at ten attempts per book", async () => {
    queryMock.mockImplementation(async () => {
      const callNumber = queryMock.mock.calls.length;
      if (callNumber === 1) {
        return [
          {
            book_id: "book-1",
            book_status: "draft",
            order_id: "order-1",
            order_status: "created",
            character_description: "A curious child with a backpack and muddy boots.",
            selected_character_image_id: null
          }
        ];
      }

      return Array.from({ length: 10 }, (_, index) => ({
        image_id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        s3_url: `s3://bucket/books/book-1/characters/candidate-${index + 1}.png`,
        created_at: `2026-03-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`
      }));
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/books/book-1/character/candidates",
        headers: {
          authorization: "Bearer session-token"
        },
        body: {}
      }) as never
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? "{}")).toEqual({
      error: "Character generation is limited to 10 attempts per book"
    });
    expect(generateCharacterCandidateImageMock).not.toHaveBeenCalled();
  });

  it("selects a character candidate and returns the updated approval state", async () => {
    let contextLoads = 0;
    queryMock.mockImplementation(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (normalized.includes("COALESCE(b.character_description, '') AS character_description")) {
        contextLoads += 1;
        return [
          {
            book_id: "book-1",
            book_status: "draft",
            order_id: "order-1",
            order_status: "created",
            character_description: "A curious child with a backpack and muddy boots.",
            selected_character_image_id: contextLoads > 1 ? "11111111-1111-4111-8111-111111111111" : null
          }
        ];
      }

      if (normalized.includes("FROM images WHERE id = CAST(:imageId AS uuid)")) {
        return [
          {
            image_id: "11111111-1111-4111-8111-111111111111",
            model_endpoint: "openai:gpt-image-1.5",
            prompt: "Character prompt",
            seed: 1,
            provider_request_id: "req-123",
            width: 1024,
            height: 1536,
            s3_url: "s3://bucket/books/book-1/characters/candidate-01.png",
            qa_json: "{\"passed\":true,\"issues\":[]}",
            status: "ready"
          }
        ];
      }

      if (normalized.includes("character_candidate") && normalized.includes("ORDER BY created_at DESC")) {
        return [
          {
            image_id: "11111111-1111-4111-8111-111111111111",
            s3_url: "s3://bucket/books/book-1/characters/candidate-01.png",
            created_at: "2026-03-15T12:00:00.000Z"
          },
          {
            image_id: "22222222-2222-4222-8222-222222222222",
            s3_url: "s3://bucket/books/book-1/characters/candidate-02.png",
            created_at: "2026-03-15T12:05:00.000Z"
          }
        ];
      }

      return [];
    });

    const response = await handler(
      makeEvent({
        method: "POST",
        path: "/v1/books/book-1/character/select",
        headers: {
          authorization: "Bearer session-token"
        },
        body: {
          imageId: "11111111-1111-4111-8111-111111111111"
        }
      }) as never
    );

    expect(response.statusCode).toBe(200);
    expect(txExecuteMock).toHaveBeenCalled();
    const payload = JSON.parse(response.body ?? "{}");
    expect(payload.selectedCharacterImageId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.selectedCharacterImageUrl).toBe("https://cdn.example.com/books/book-1/characters/candidate-01.png");
    expect(payload.candidates[0]).toMatchObject({
      imageId: "11111111-1111-4111-8111-111111111111",
      isSelected: true
    });
  });
});
