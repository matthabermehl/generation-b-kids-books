import { afterEach, describe, expect, it } from "vitest";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { setIdempotencyClient, withIdempotency } from "../src/lib/idempotency.js";

describe("withIdempotency", () => {
  afterEach(() => {
    setIdempotencyClient(null);
    delete process.env.IDEMPOTENCY_TABLE;
    delete process.env.IDEMPOTENCY_TTL_SECONDS;
  });

  it("returns stored response when key already exists", async () => {
    process.env.IDEMPOTENCY_TABLE = "idempotency";
    const sent: unknown[] = [];

    setIdempotencyClient({
      async send(command) {
        sent.push(command);
        if (command instanceof GetCommand) {
          return { Item: { response: { ok: true, source: "cache" } } };
        }

        return {};
      }
    });

    let handlerCalls = 0;
    const response = await withIdempotency("user-1", "abc12345", async () => {
      handlerCalls += 1;
      return { ok: true, source: "fresh" };
    });

    expect(response).toEqual({ ok: true, source: "cache" });
    expect(handlerCalls).toBe(0);
    expect(sent.length).toBe(1);
    expect(sent[0]).toBeInstanceOf(GetCommand);
  });

  it("stores response when key is new", async () => {
    process.env.IDEMPOTENCY_TABLE = "idempotency";
    process.env.IDEMPOTENCY_TTL_SECONDS = "120";

    const sent: unknown[] = [];
    setIdempotencyClient({
      async send(command) {
        sent.push(command);
        if (command instanceof GetCommand) {
          return {};
        }

        return {};
      }
    });

    const response = await withIdempotency("user-2", "xyz98765", async () => ({ ok: true, source: "fresh" }));

    expect(response).toEqual({ ok: true, source: "fresh" });
    expect(sent.length).toBe(2);
    expect(sent[0]).toBeInstanceOf(GetCommand);
    expect(sent[1]).toBeInstanceOf(PutCommand);
  });
});
