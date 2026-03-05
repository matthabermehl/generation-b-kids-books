import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import { moneyLessonKeys, readingProfiles, type MoneyLessonKey, type ReadingProfile } from "@book/domain";
import { createLoginToken, createSessionToken, verifyLoginToken, verifySessionToken } from "./lib/auth.js";
import { getOperationalEnv, requiredEnv } from "./lib/env.js";
import { sendLoginLink } from "./lib/email.js";
import { withIdempotency } from "./lib/idempotency.js";
import { execute, query } from "./lib/rds.js";
import { json } from "./lib/response.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { signPdfDownload } from "./lib/storage.js";

const sfn = new SFNClient({});

const requestLinkSchema = z.object({
  email: z.string().email()
});

const verifyLinkSchema = z.object({
  token: z.string().min(8)
});

const createOrderSchema = z.object({
  childFirstName: z.string().min(1),
  pronouns: z.string().min(1),
  ageYears: z.number().int().min(2).max(12),
  moneyLessonKey: z.enum(moneyLessonKeys),
  interestTags: z.array(z.string().min(1)).max(10),
  readingProfileId: z.enum(readingProfiles)
});

function s3ToPublicUrl(s3Url: string | null): string | null {
  if (!s3Url) {
    return null;
  }

  const base = process.env.ARTIFACT_PUBLIC_BASE_URL ?? "";
  if (!base || !s3Url.startsWith("s3://")) {
    return s3Url;
  }

  const stripped = s3Url.slice("s3://".length);
  const firstSlash = stripped.indexOf("/");
  const key = firstSlash >= 0 ? stripped.slice(firstSlash + 1) : stripped;
  return `${base.replace(/\/$/, "")}/artifacts/${key}`;
}

function logWithContext(
  requestId: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      message,
      ...context
    })
  );
}

async function parseBody<T>(event: APIGatewayProxyEventV2, schema: z.ZodSchema<T>): Promise<T> {
  const raw = event.body ?? "{}";
  const parsed = JSON.parse(raw);
  return schema.parse(parsed);
}

function pathMatch(path: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(path);
}

function readIdempotencyKey(event: APIGatewayProxyEventV2): string | null {
  return event.headers["idempotency-key"] ?? event.headers["Idempotency-Key"] ?? null;
}

async function upsertUser(email: string): Promise<{ id: string; email: string }> {
  const existing = await query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = :email LIMIT 1`,
    [{ name: "email", value: { stringValue: email.toLowerCase() } }]
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = randomUUID();
  await execute(
    `
      INSERT INTO users (id, email)
      VALUES (CAST(:id AS uuid), :email)
    `,
    [
      { name: "id", value: { stringValue: id } },
      { name: "email", value: { stringValue: email.toLowerCase() } }
    ]
  );

  return { id, email: email.toLowerCase() };
}

async function createOrder(
  userId: string,
  input: {
    childFirstName: string;
    pronouns: string;
    ageYears: number;
    moneyLessonKey: MoneyLessonKey;
    interestTags: string[];
    readingProfileId: ReadingProfile;
  }
): Promise<{ orderId: string; bookId: string; status: string; checkoutMode: string }> {
  const childProfileId = randomUUID();
  const orderId = randomUUID();
  const bookId = randomUUID();

  await execute(
    `
      INSERT INTO child_profiles (id, user_id, child_first_name, pronouns, age_years, reading_profile_id)
      VALUES (CAST(:id AS uuid), CAST(:userId AS uuid), :name, :pronouns, :age, :profile)
    `,
    [
      { name: "id", value: { stringValue: childProfileId } },
      { name: "userId", value: { stringValue: userId } },
      { name: "name", value: { stringValue: input.childFirstName } },
      { name: "pronouns", value: { stringValue: input.pronouns } },
      { name: "age", value: { longValue: input.ageYears } },
      { name: "profile", value: { stringValue: input.readingProfileId } }
    ]
  );

  await execute(
    `
      INSERT INTO orders (id, user_id, child_profile_id, status, price_cents, currency)
      VALUES (CAST(:id AS uuid), CAST(:userId AS uuid), CAST(:childProfileId AS uuid), 'created', 2999, 'USD')
    `,
    [
      { name: "id", value: { stringValue: orderId } },
      { name: "userId", value: { stringValue: userId } },
      { name: "childProfileId", value: { stringValue: childProfileId } }
    ]
  );

  await execute(
    `
      INSERT INTO books (id, order_id, money_lesson_key, interest_tags, reading_profile_id, book_version, status)
      VALUES (CAST(:id AS uuid), CAST(:orderId AS uuid), :lesson, string_to_array(:interests, ','), :profile, 'v1', 'draft')
    `,
    [
      { name: "id", value: { stringValue: bookId } },
      { name: "orderId", value: { stringValue: orderId } },
      { name: "lesson", value: { stringValue: input.moneyLessonKey } },
      { name: "interests", value: { stringValue: input.interestTags.join(",") } },
      { name: "profile", value: { stringValue: input.readingProfileId } }
    ]
  );

  return {
    orderId,
    bookId,
    status: "created",
    checkoutMode: "mock"
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const requestId = event.requestContext.requestId ?? randomUUID();

  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "POST" && path === "/v1/auth/request-link") {
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const payload = await parseBody(event, requestLinkSchema);
      const response = await withIdempotency(
        `REQUEST_LINK#${payload.email.toLowerCase()}`,
        idempotencyKey,
        async () => {
          const runtimeConfig = await getRuntimeConfig();
          const ttlMinutes = runtimeConfig.authLinkTtlMinutes;
          const token = await createLoginToken(payload.email, ttlMinutes);
          const link = `${runtimeConfig.webBaseUrl}/verify?token=${encodeURIComponent(token)}`;
          await sendLoginLink(payload.email, link);
          logWithContext(requestId, "AuthLoginLinkSent", { email: payload.email.toLowerCase() });
          return { ok: true, sent: true };
        }
      );

      return json(200, response);
    }

    if (method === "POST" && path === "/v1/auth/verify-link") {
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const payload = await parseBody(event, verifyLinkSchema);
      const loginPayload = await verifyLoginToken(payload.token);
      const response = await withIdempotency(
        `VERIFY_LINK#${loginPayload.email.toLowerCase()}`,
        idempotencyKey,
        async () => {
          const user = await upsertUser(loginPayload.email);
          const sessionToken = await createSessionToken(user.id, user.email);
          return { token: sessionToken, user };
        }
      );

      return json(200, response);
    }

    if (method === "POST" && path === "/v1/orders") {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const idempotencyKey = readIdempotencyKey(event);

      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const payload = await parseBody(event, createOrderSchema);
      const created = await withIdempotency(auth.userId, idempotencyKey, async () => createOrder(auth.userId, payload));
      return json(200, created);
    }

    const paidMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)\/mark-paid$/);
    if (method === "POST" && paidMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const operational = getOperationalEnv();
      if (!operational.enableMockCheckout) {
        return json(403, { error: "Mock checkout disabled" });
      }

      const orderId = paidMatch[1];
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const response = await withIdempotency(auth.userId, idempotencyKey, async () => {
        await execute(`UPDATE orders SET status = 'paid' WHERE id = CAST(:orderId AS uuid) AND user_id = CAST(:userId AS uuid)`, [
          { name: "orderId", value: { stringValue: orderId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]);

        const book = await query<{ id: string }>(
          `SELECT id FROM books WHERE order_id = CAST(:orderId AS uuid) LIMIT 1`,
          [{ name: "orderId", value: { stringValue: orderId } }]
        );

        const bookId = book[0]?.id;
        if (!bookId) {
          throw new Error(`Book not found for order ${orderId}`);
        }

        await execute(`UPDATE orders SET status = 'building' WHERE id = CAST(:orderId AS uuid)`, [
          { name: "orderId", value: { stringValue: orderId } }
        ]);
        await execute(`UPDATE books SET status = 'building' WHERE id = CAST(:bookId AS uuid)`, [
          { name: "bookId", value: { stringValue: bookId } }
        ]);

        const stateMachineArn = requiredEnv("BOOK_BUILD_STATE_MACHINE_ARN");
        const started = await sfn.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: `book-${orderId}-${Date.now()}`,
            input: JSON.stringify({ orderId, bookId })
          })
        );

        logWithContext(requestId, "OrderPipelineExecutionStarted", {
          orderId,
          bookId,
          executionArn: started.executionArn ?? null
        });

        return {
          ok: true,
          orderId,
          bookId,
          executionArn: started.executionArn
        };
      });

      return json(200, response);
    }

    const orderMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)$/);
    if (method === "GET" && orderMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const orderId = orderMatch[1];

      const rows = await query<{
        id: string;
        status: string;
        created_at: string;
        book_id: string;
        book_status: string;
      }>(
        `
          SELECT o.id, o.status, o.created_at::text, b.id AS book_id, b.status AS book_status
          FROM orders o
          INNER JOIN books b ON b.order_id = o.id
          WHERE o.id = CAST(:orderId AS uuid) AND o.user_id = CAST(:userId AS uuid)
          LIMIT 1
        `,
        [
          { name: "orderId", value: { stringValue: orderId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );

      const row = rows[0];
      if (!row) {
        return json(404, { error: "Order not found" });
      }

      return json(200, {
        orderId: row.id,
        status: row.status,
        createdAt: row.created_at,
        bookId: row.book_id,
        bookStatus: row.book_status
      });
    }

    const bookMatch = pathMatch(path, /^\/v1\/books\/([^/]+)$/);
    if (method === "GET" && bookMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const bookId = bookMatch[1];

      const bookRows = await query<{
        id: string;
        status: string;
        reading_profile_id: string;
        money_lesson_key: string;
        child_first_name: string;
      }>(
        `
          SELECT b.id, b.status, b.reading_profile_id, b.money_lesson_key, cp.child_first_name
          FROM books b
          INNER JOIN orders o ON o.id = b.order_id
          INNER JOIN child_profiles cp ON cp.id = o.child_profile_id
          WHERE b.id = CAST(:bookId AS uuid) AND o.user_id = CAST(:userId AS uuid)
          LIMIT 1
        `,
        [
          { name: "bookId", value: { stringValue: bookId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );

      if (!bookRows[0]) {
        return json(404, { error: "Book not found" });
      }

      const pages = await query<{
        page_index: number;
        text: string;
        status: string;
        image_url: string | null;
      }>(
        `
          SELECT p.page_index, p.text, p.status, i.s3_url AS image_url
          FROM pages p
          LEFT JOIN images i ON i.page_id = p.id AND i.role = 'page'
          WHERE p.book_id = CAST(:bookId AS uuid)
          ORDER BY p.page_index
        `,
        [{ name: "bookId", value: { stringValue: bookId } }]
      );

      return json(200, {
        bookId,
        status: bookRows[0].status,
        childFirstName: bookRows[0].child_first_name,
        readingProfileId: bookRows[0].reading_profile_id,
        moneyLessonKey: bookRows[0].money_lesson_key,
        pages: pages.map((page) => ({
          pageIndex: Number(page.page_index),
          text: page.text,
          status: page.status,
          imageUrl: s3ToPublicUrl(page.image_url)
        }))
      });
    }

    const downloadMatch = pathMatch(path, /^\/v1\/books\/([^/]+)\/download$/);
    if (method === "GET" && downloadMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const bookId = downloadMatch[1];
      const format = event.queryStringParameters?.format ?? "pdf";

      if (format !== "pdf") {
        return json(400, { error: "Only pdf format supported in 80% pass" });
      }

      const artifact = await query<{ s3_url: string }>(
        `
          SELECT ba.s3_url
          FROM book_artifacts ba
          INNER JOIN books b ON b.id = ba.book_id
          INNER JOIN orders o ON o.id = b.order_id
          WHERE ba.book_id = CAST(:bookId AS uuid) AND ba.artifact_type = 'pdf' AND o.user_id = CAST(:userId AS uuid)
          ORDER BY ba.created_at DESC
          LIMIT 1
        `,
        [
          { name: "bookId", value: { stringValue: bookId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );

      const latest = artifact[0]?.s3_url;
      if (!latest) {
        return json(404, { error: "PDF not ready" });
      }

      const prefix = `s3://${requiredEnv("ARTIFACT_BUCKET")}/`;
      if (!latest.startsWith(prefix)) {
        return json(500, { error: "Unexpected artifact location" });
      }

      const key = latest.slice(prefix.length);
      const signedUrl = await signPdfDownload(key);
      return json(200, { url: signedUrl, expiresInSeconds: 900 });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    console.error("API_REQUEST_FAILURE", {
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
