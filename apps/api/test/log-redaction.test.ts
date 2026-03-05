import { describe, expect, it } from "vitest";
import { redactText, sanitizeForLog } from "../src/lib/log-redaction.js";

describe("log redaction", () => {
  it("redacts sensitive token-like strings", () => {
    const input =
      "Authorization: Bearer sk_test_123456 and Key SG.abcdefghijklmnopqrstuvwxyz.1234567890";
    const output = redactText(input);
    expect(output).not.toContain("sk_test_123456");
    expect(output).not.toContain("SG.abcdefghijklmnopqrstuvwxyz.1234567890");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts sensitive object keys", () => {
    const output = sanitizeForLog({
      apiKey: "secret-value",
      nested: {
        token: "another-secret",
        ok: "value"
      }
    }) as {
      apiKey: string;
      nested: { token: string; ok: string };
    };

    expect(output.apiKey).toBe("[REDACTED]");
    expect(output.nested.token).toBe("[REDACTED]");
    expect(output.nested.ok).toBe("value");
  });
});
