import { describe, expect, it } from "vitest";
import { openApiSpec } from "../src/openapi/spec.js";

describe("openapi spec", () => {
  it("contains required endpoints", () => {
    expect(openApiSpec.paths["/v1/orders"]).toBeDefined();
    expect(openApiSpec.paths["/v1/books/{bookId}"]).toBeDefined();
    expect(openApiSpec.paths["/v1/orders/{orderId}/checkout"]).toBeDefined();
    expect(openApiSpec.paths["/v1/webhooks/stripe"]).toBeDefined();
    expect(openApiSpec.paths["/v1/child-profiles/{childProfileId}"]).toBeDefined();
  });

  it("documents idempotency requirement on POST routes", () => {
    expect(openApiSpec.paths["/v1/auth/request-link"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/auth/verify-link"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/orders"].post.parameters?.[0].name).toBe("Idempotency-Key");
    expect(openApiSpec.paths["/v1/orders/{orderId}/checkout"].post.parameters?.[0].name).toBe("Idempotency-Key");
  });
});
