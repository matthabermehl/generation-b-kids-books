import { describe, expect, it } from "vitest";
import { redactText, sanitizeForLog } from "../src/lib/helpers.js";

describe("worker log redaction", () => {
  it("redacts key-like credentials in strings", () => {
    const input = "stripe=sk_live_abc123 sendgrid=SG.aaa.bbb auth=Bearer token123";
    const output = redactText(input);
    expect(output).not.toContain("sk_live_abc123");
    expect(output).not.toContain("SG.aaa.bbb");
    expect(output).not.toContain("Bearer token123");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts sensitive keys in objects", () => {
    const output = sanitizeForLog({
      authorization: "Bearer abc",
      nested: {
        jwt: "jwt-token",
        message: "ok"
      }
    }) as {
      authorization: string;
      nested: { jwt: string; message: string };
    };

    expect(output.authorization).toBe("[REDACTED]");
    expect(output.nested.jwt).toBe("[REDACTED]");
    expect(output.nested.message).toBe("ok");
  });
});
