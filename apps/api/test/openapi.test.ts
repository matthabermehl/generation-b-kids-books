import { describe, expect, it } from "vitest";
import { openApiSpec } from "../src/openapi/spec.js";

describe("openapi spec", () => {
  it("contains required endpoints", () => {
    expect(openApiSpec.paths["/v1/session"]).toBeDefined();
    expect(openApiSpec.paths["/v1/orders"]).toBeDefined();
    expect(openApiSpec.paths["/v1/books/{bookId}"]).toBeDefined();
    expect(openApiSpec.paths["/v1/books/{bookId}/character"]).toBeDefined();
    expect(openApiSpec.paths["/v1/books/{bookId}/character/candidates"]).toBeDefined();
    expect(openApiSpec.paths["/v1/books/{bookId}/character/select"]).toBeDefined();
    expect(openApiSpec.paths["/v1/orders/{orderId}/checkout"]).toBeDefined();
    expect(openApiSpec.paths["/v1/webhooks/stripe"]).toBeDefined();
    expect(openApiSpec.paths["/v1/child-profiles/{childProfileId}"]).toBeDefined();
    expect(openApiSpec.paths["/v1/review/cases"]).toBeDefined();
    expect(openApiSpec.paths["/v1/review/cases/{caseId}"]).toBeDefined();
    expect(openApiSpec.paths["/v1/review/cases/{caseId}/approve"]).toBeDefined();
    expect(openApiSpec.paths["/v1/review/cases/{caseId}/reject"]).toBeDefined();
    expect(openApiSpec.paths["/v1/review/cases/{caseId}/pages/{pageId}/retry"]).toBeDefined();
  });

  it("documents idempotency requirement on POST routes", () => {
    expect(openApiSpec.paths["/v1/auth/request-link"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/auth/verify-link"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/orders"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/orders/{orderId}/checkout"].post.parameters?.[0].name).toBe("Idempotency-Key");
  });

  it("documents additive preview fields on book pages", () => {
    const pageSchema = openApiSpec.components.schemas.BookResponse.properties.pages.items;
    expect(pageSchema.properties.previewImageUrl).toBeDefined();
    expect(pageSchema.properties.templateId).toBeDefined();
    expect(pageSchema.properties.productFamily).toBeDefined();
  });

  it("documents character approval request and response schemas", () => {
    const createOrderSchema = openApiSpec.components.schemas.CreateOrderRequest;
    expect(createOrderSchema.properties.characterDescription).toBeDefined();
    expect(createOrderSchema.properties.storyMode).toBeDefined();
    expect(createOrderSchema.required).toContain("characterDescription");
    expect(createOrderSchema.required).toContain("storyMode");
    expect(openApiSpec.components.schemas.BookCharacterResponse).toBeDefined();
    expect(openApiSpec.components.schemas.SelectCharacterRequest).toBeDefined();
  });

  it("documents optional mock run authorization header for mark-paid", () => {
    const parameters = openApiSpec.paths["/v1/orders/{orderId}/mark-paid"].post.parameters ?? [];
    const headerNames = parameters.map((parameter) => parameter.name);
    expect(headerNames).toContain("Idempotency-Key");
    expect(headerNames).toContain("X-Mock-Run-Tag");
  });

  it("documents reviewer session and case schemas", () => {
    expect(openApiSpec.components.schemas.SessionResponse).toBeDefined();
    expect(openApiSpec.components.schemas.ReviewQueueResponse).toBeDefined();
    expect(openApiSpec.components.schemas.ReviewCaseDetailResponse).toBeDefined();
    expect(openApiSpec.components.schemas.ReviewActionResponse).toBeDefined();
    expect(openApiSpec.components.schemas.ReviewCaseDetailResponse.properties.storyProofPdfUrl).toBeDefined();
    expect(openApiSpec.components.schemas.BookResponse.properties.spreadCount.description).toMatch(/spread/i);
    expect(openApiSpec.components.schemas.BookResponse.properties.storyMode).toBeDefined();
    expect(openApiSpec.components.schemas.OrderResponse.properties.storyMode).toBeDefined();
  });
});
