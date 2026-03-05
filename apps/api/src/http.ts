import { createHash, randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import type Stripe from "stripe";
import { moneyLessonKeys, readingProfiles, type MoneyLessonKey, type ReadingProfile } from "@book/domain";
import { createLoginToken, createSessionToken, verifyLoginToken, verifySessionToken } from "./lib/auth.js";
import { requiredEnv } from "./lib/env.js";
import { sendLoginLink } from "./lib/email.js";
import { withIdempotency } from "./lib/idempotency.js";
import { redactText, sanitizeForLog } from "./lib/log-redaction.js";
import { execute, query } from "./lib/rds.js";
import { json } from "./lib/response.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { signPdfDownload } from "./lib/storage.js";
import { createStripeCheckoutSession, verifyStripeWebhook } from "./lib/stripe.js";

const sfn = new SFNClient({});
const sqs = new SQSClient({});

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

const orderTransitions: Record<string, string[]> = {
  created: ["checkout_pending", "paid", "failed", "needs_review", "refunded"],
  checkout_pending: ["paid", "failed", "needs_review", "refunded"],
  paid: ["building", "failed", "needs_review", "refunded"],
  building: ["ready", "failed", "needs_review"],
  needs_review: ["building", "failed", "ready"],
  ready: ["refunded"],
  failed: [],
  refunded: []
};

const bookTransitions: Record<string, string[]> = {
  draft: ["building", "failed", "needs_review"],
  building: ["ready", "failed", "needs_review"],
  needs_review: ["building", "failed", "ready"],
  ready: ["failed"],
  failed: ["building"]
};

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
  eventName: string,
  context: Record<string, unknown> = {}
): void {
  const safeContext = sanitizeForLog(context) as Record<string, unknown>;
  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      event: eventName,
      ...safeContext
    })
  );
}

async function parseBody<T>(event: APIGatewayProxyEventV2, schema: z.ZodSchema<T>): Promise<T> {
  const raw = event.body ?? "{}";
  const decoded = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  const parsed = JSON.parse(decoded);
  return schema.parse(parsed);
}

function rawBody(event: APIGatewayProxyEventV2): string {
  const body = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function pathMatch(path: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(path);
}

function readIdempotencyKey(event: APIGatewayProxyEventV2): string | null {
  return event.headers["idempotency-key"] ?? event.headers["Idempotency-Key"] ?? null;
}

function readHeader(event: APIGatewayProxyEventV2, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers)) {
    if (key.toLowerCase() === target) {
      return value ?? null;
    }
  }
  return null;
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
): Promise<{ orderId: string; bookId: string; childProfileId: string; status: string; checkoutMode: string }> {
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
    childProfileId,
    status: "created",
    checkoutMode: "stripe"
  };
}

interface OrderContextRow {
  order_id: string;
  order_status: string;
  book_id: string;
  book_status: string;
  child_profile_id: string;
}

async function loadOrderContext(orderId: string): Promise<OrderContextRow | null> {
  const rows = await query<OrderContextRow>(
    `
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        b.id AS book_id,
        b.status AS book_status,
        o.child_profile_id::text AS child_profile_id
      FROM orders o
      INNER JOIN books b ON b.order_id = o.id
      WHERE o.id = CAST(:orderId AS uuid)
      LIMIT 1
    `,
    [{ name: "orderId", value: { stringValue: orderId } }]
  );

  return rows[0] ?? null;
}

async function loadOrderContextForUser(orderId: string, userId: string): Promise<OrderContextRow | null> {
  const rows = await query<OrderContextRow>(
    `
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        b.id AS book_id,
        b.status AS book_status,
        o.child_profile_id::text AS child_profile_id
      FROM orders o
      INNER JOIN books b ON b.order_id = o.id
      WHERE o.id = CAST(:orderId AS uuid) AND o.user_id = CAST(:userId AS uuid)
      LIMIT 1
    `,
    [
      { name: "orderId", value: { stringValue: orderId } },
      { name: "userId", value: { stringValue: userId } }
    ]
  );

  return rows[0] ?? null;
}

function assertTransition(
  current: string,
  next: string,
  allowedTransitions: Record<string, string[]>,
  entity: string
): void {
  if (current === next) {
    return;
  }

  const allowed = allowedTransitions[current] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid ${entity} status transition ${current} -> ${next}`);
  }
}

async function transitionOrderStatus(orderId: string, nextStatus: string): Promise<void> {
  const rows = await query<{ status: string }>(
    `SELECT status FROM orders WHERE id = CAST(:orderId AS uuid) LIMIT 1`,
    [{ name: "orderId", value: { stringValue: orderId } }]
  );
  const current = rows[0]?.status;
  if (!current) {
    throw new Error(`Order not found: ${orderId}`);
  }

  assertTransition(current, nextStatus, orderTransitions, "order");
  if (current === nextStatus) {
    return;
  }

  await execute(`UPDATE orders SET status = :status WHERE id = CAST(:orderId AS uuid)`, [
    { name: "status", value: { stringValue: nextStatus } },
    { name: "orderId", value: { stringValue: orderId } }
  ]);
}

async function transitionBookStatus(bookId: string, nextStatus: string): Promise<void> {
  const rows = await query<{ status: string }>(
    `SELECT status FROM books WHERE id = CAST(:bookId AS uuid) LIMIT 1`,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );
  const current = rows[0]?.status;
  if (!current) {
    throw new Error(`Book not found: ${bookId}`);
  }

  assertTransition(current, nextStatus, bookTransitions, "book");
  if (current === nextStatus) {
    return;
  }

  await execute(`UPDATE books SET status = :status WHERE id = CAST(:bookId AS uuid)`, [
    { name: "status", value: { stringValue: nextStatus } },
    { name: "bookId", value: { stringValue: bookId } }
  ]);
}

function executionName(orderId: string, suffix: string): string {
  const normalized = suffix.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24);
  return `book-${orderId.slice(0, 8)}-${Date.now()}-${normalized}`.slice(0, 80);
}

async function startBookBuild(
  requestId: string,
  orderId: string,
  bookId: string,
  source: string
): Promise<{ started: boolean; executionArn: string | null }> {
  const context = await loadOrderContext(orderId);
  if (!context) {
    throw new Error(`Order not found: ${orderId}`);
  }

  if (context.order_status === "building" || context.order_status === "ready") {
    return { started: false, executionArn: null };
  }

  if (context.order_status !== "paid") {
    throw new Error(`Cannot start build from order status ${context.order_status}`);
  }

  await transitionOrderStatus(orderId, "building");
  await transitionBookStatus(bookId, "building");

  const stateMachineArn = requiredEnv("BOOK_BUILD_STATE_MACHINE_ARN");
  const started = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      name: executionName(orderId, source),
      input: JSON.stringify({ orderId, bookId })
    })
  );

  logWithContext(requestId, "OrderPipelineExecutionStarted", {
    orderId,
    bookId,
    executionArn: started.executionArn ?? null,
    source
  });

  return {
    started: true,
    executionArn: started.executionArn ?? null
  };
}

async function hasPaymentEvent(stripeEventId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM payment_events WHERE stripe_event_id = :eventId LIMIT 1`,
    [{ name: "eventId", value: { stringValue: stripeEventId } }]
  );
  return Boolean(rows[0]?.id);
}

async function createPaymentEvent(params: {
  stripeEventId: string;
  stripeEventType: string;
  orderId: string | null;
  payload: string;
}): Promise<void> {
  const payloadHash = createHash("sha256").update(params.payload).digest("hex");

  await execute(
    `
      INSERT INTO payment_events (
        id,
        order_id,
        stripe_event_id,
        stripe_event_type,
        payload_sha256,
        payload_json,
        processed_status,
        created_at
      )
      VALUES (
        CAST(:id AS uuid),
        CASE WHEN :orderId = '' THEN NULL ELSE CAST(:orderId AS uuid) END,
        :eventId,
        :eventType,
        :payloadHash,
        CAST(:payload AS jsonb),
        'received',
        NOW()
      )
    `,
    [
      { name: "id", value: { stringValue: randomUUID() } },
      { name: "orderId", value: { stringValue: params.orderId ?? "" } },
      { name: "eventId", value: { stringValue: params.stripeEventId } },
      { name: "eventType", value: { stringValue: params.stripeEventType } },
      { name: "payloadHash", value: { stringValue: payloadHash } },
      { name: "payload", value: { stringValue: params.payload } }
    ]
  );
}

async function finalizePaymentEvent(stripeEventId: string, status: string, notes: string): Promise<void> {
  await execute(
    `
      UPDATE payment_events
      SET processed_status = :status,
          processing_notes = :notes,
          processed_at = NOW()
      WHERE stripe_event_id = :eventId
    `,
    [
      { name: "status", value: { stringValue: status } },
      { name: "notes", value: { stringValue: notes.slice(0, 1024) } },
      { name: "eventId", value: { stringValue: stripeEventId } }
    ]
  );
}

async function markPaymentSessionStatus(
  stripeSessionId: string,
  status: "completed" | "expired" | "created",
  payload: string
): Promise<void> {
  await execute(
    `
      UPDATE payment_sessions
      SET status = :status,
          payload_json = CAST(:payload AS jsonb),
          completed_at = CASE WHEN :status = 'completed' THEN NOW() ELSE completed_at END
      WHERE stripe_session_id = :sessionId
    `,
    [
      { name: "status", value: { stringValue: status } },
      { name: "payload", value: { stringValue: payload } },
      { name: "sessionId", value: { stringValue: stripeSessionId } }
    ]
  );
}

function eventOrderId(stripeEvent: Stripe.Event): string | null {
  const candidate = stripeEvent.data.object as { metadata?: Record<string, string> };
  return candidate.metadata?.orderId ?? null;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const requestId = event.requestContext.requestId ?? randomUUID();

  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "POST" && path === "/v1/webhooks/stripe") {
      const signature = readHeader(event, "stripe-signature");
      if (!signature) {
        return json(400, { error: "Missing Stripe signature" });
      }

      const body = rawBody(event);
      let stripeEvent: Stripe.Event;

      try {
        stripeEvent = await verifyStripeWebhook(body, signature);
      } catch (error) {
        console.error("STRIPE_WEBHOOK_FAILURE", {
          requestId,
          message: redactText(error instanceof Error ? error.message : String(error))
        });
        return json(400, { error: "Invalid webhook signature" });
      }

      if (await hasPaymentEvent(stripeEvent.id)) {
        console.log(
          JSON.stringify({
            event: "STRIPE_WEBHOOK_DUPLICATE",
            requestId,
            stripeEventId: stripeEvent.id,
            stripeEventType: stripeEvent.type
          })
        );
        return json(200, {
          ok: true,
          stripeEventId: stripeEvent.id,
          stripeEventType: stripeEvent.type,
          processingStatus: "duplicate",
          executionArn: null
        });
      }

      const orderId = eventOrderId(stripeEvent);
      await createPaymentEvent({
        stripeEventId: stripeEvent.id,
        stripeEventType: stripeEvent.type,
        orderId,
        payload: body
      });

      let processingStatus = "ignored";
      let notes = "event ignored";
      let executionArn: string | null = null;

      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object as unknown as Stripe.Checkout.Session;
        const sessionOrderId = session.metadata?.orderId ?? orderId;
        if (!sessionOrderId || !session.id) {
          processingStatus = "ignored";
          notes = "checkout session missing order metadata";
        } else {
          await markPaymentSessionStatus(session.id, "completed", body);
          await transitionOrderStatus(sessionOrderId, "paid");

          const orderContext = await loadOrderContext(sessionOrderId);
          if (!orderContext) {
            throw new Error(`Order not found for checkout completion: ${sessionOrderId}`);
          }

          const build = await startBookBuild(requestId, sessionOrderId, orderContext.book_id, `stripe-${stripeEvent.id}`);
          executionArn = build.executionArn;
          processingStatus = build.started ? "processed" : "duplicate";
          notes = build.started ? "checkout completed and build started" : "order already in build/ready state";
          logWithContext(requestId, "STRIPE_WEBHOOK_COMPLETED", {
            stripeEventId: stripeEvent.id,
            orderId: sessionOrderId,
            stripeSessionId: session.id,
            executionArn
          });
        }
      } else if (stripeEvent.type === "checkout.session.expired") {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        if (session.id) {
          await markPaymentSessionStatus(session.id, "expired", body);
          processingStatus = "processed";
          notes = "checkout session expired";
        }
      }

      await finalizePaymentEvent(stripeEvent.id, processingStatus, notes);
      return json(200, {
        ok: true,
        stripeEventId: stripeEvent.id,
        stripeEventType: stripeEvent.type,
        processingStatus,
        executionArn
      });
    }

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

    const checkoutMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const orderId = checkoutMatch[1];
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const order = await loadOrderContextForUser(orderId, auth.userId);
      if (!order) {
        return json(404, { error: "Order not found" });
      }

      const response = await withIdempotency(auth.userId, idempotencyKey, async () => {
        if (!["created", "checkout_pending"].includes(order.order_status)) {
          return {
            orderId,
            bookId: order.book_id,
            status: order.order_status,
            checkoutUrl: null,
            stripeSessionId: null,
            message: "Order is not eligible for checkout"
          };
        }

        const existingSession = await query<{ stripe_session_id: string; checkout_url: string }>(
          `
            SELECT stripe_session_id, checkout_url
            FROM payment_sessions
            WHERE order_id = CAST(:orderId AS uuid)
              AND status = 'created'
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [{ name: "orderId", value: { stringValue: orderId } }]
        );

        if (existingSession[0]?.checkout_url) {
          return {
            orderId,
            bookId: order.book_id,
            status: "checkout_pending",
            checkoutUrl: existingSession[0].checkout_url,
            stripeSessionId: existingSession[0].stripe_session_id
          };
        }

        const checkout = await createStripeCheckoutSession({
          orderId,
          bookId: order.book_id,
          userId: auth.userId,
          customerEmail: auth.email
        });

        await execute(
          `
            INSERT INTO payment_sessions (
              id,
              order_id,
              stripe_session_id,
              checkout_url,
              status,
              payload_json
            )
            VALUES (
              CAST(:id AS uuid),
              CAST(:orderId AS uuid),
              :stripeSessionId,
              :checkoutUrl,
              'created',
              CAST(:payload AS jsonb)
            )
          `,
          [
            { name: "id", value: { stringValue: randomUUID() } },
            { name: "orderId", value: { stringValue: orderId } },
            { name: "stripeSessionId", value: { stringValue: checkout.stripeSessionId } },
            { name: "checkoutUrl", value: { stringValue: checkout.checkoutUrl } },
            {
              name: "payload",
              value: {
                stringValue: JSON.stringify({ createdBy: "api", requestId })
              }
            }
          ]
        );

        await transitionOrderStatus(orderId, "checkout_pending");
        await execute(`UPDATE orders SET stripe_session_id = :sessionId WHERE id = CAST(:orderId AS uuid)`, [
          { name: "sessionId", value: { stringValue: checkout.stripeSessionId } },
          { name: "orderId", value: { stringValue: orderId } }
        ]);

        logWithContext(requestId, "STRIPE_CHECKOUT_CREATED", {
          orderId,
          bookId: order.book_id,
          stripeSessionId: checkout.stripeSessionId
        });

        return {
          orderId,
          bookId: order.book_id,
          status: "checkout_pending",
          checkoutUrl: checkout.checkoutUrl,
          stripeSessionId: checkout.stripeSessionId
        };
      });

      return json(200, response);
    }

    const paidMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)\/mark-paid$/);
    if (method === "POST" && paidMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const runtimeConfig = await getRuntimeConfig();
      if (!runtimeConfig.featureFlags.enableMockCheckout) {
        return json(403, { error: "Mock checkout disabled" });
      }

      const orderId = paidMatch[1];
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const order = await loadOrderContextForUser(orderId, auth.userId);
      if (!order) {
        return json(404, { error: "Order not found" });
      }

      const response = await withIdempotency(auth.userId, idempotencyKey, async () => {
        if (order.order_status !== "paid") {
          await transitionOrderStatus(orderId, "paid");
        }

        const mockCheckoutSource: string = "mock-checkout";
        const started = await startBookBuild(requestId, orderId, order.book_id, mockCheckoutSource);
        return {
          ok: true,
          orderId,
          bookId: order.book_id,
          executionArn: started.executionArn,
          started: started.started
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
        child_profile_id: string;
      }>(
        `
          SELECT o.id, o.status, o.created_at::text, b.id AS book_id, b.status AS book_status, o.child_profile_id::text AS child_profile_id
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
        bookStatus: row.book_status,
        childProfileId: row.child_profile_id
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
        return json(400, { error: "Only pdf format supported" });
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

    const deleteChildMatch = pathMatch(path, /^\/v1\/child-profiles\/([^/]+)$/);
    if (method === "DELETE" && deleteChildMatch) {
      const auth = await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
      const childProfileId = deleteChildMatch[1];

      const owned = await query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM child_profiles
          WHERE id = CAST(:childProfileId AS uuid) AND user_id = CAST(:userId AS uuid)
          LIMIT 1
        `,
        [
          { name: "childProfileId", value: { stringValue: childProfileId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );
      if (!owned[0]) {
        return json(404, { error: "Child profile not found" });
      }

      const artifactRows = await query<{ s3_url: string }>(
        `
          SELECT s3_url
          FROM (
            SELECT ba.s3_url
            FROM book_artifacts ba
            INNER JOIN books b ON b.id = ba.book_id
            INNER JOIN orders o ON o.id = b.order_id
            WHERE o.child_profile_id = CAST(:childProfileId AS uuid) AND o.user_id = CAST(:userId AS uuid)

            UNION ALL

            SELECT i.s3_url
            FROM images i
            INNER JOIN books b ON b.id = i.book_id
            INNER JOIN orders o ON o.id = b.order_id
            WHERE o.child_profile_id = CAST(:childProfileId AS uuid)
              AND o.user_id = CAST(:userId AS uuid)
              AND i.s3_url IS NOT NULL
          ) src
        `,
        [
          { name: "childProfileId", value: { stringValue: childProfileId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );

      const urls = artifactRows.map((row) => row.s3_url).filter(Boolean);
      const privacyEventId = randomUUID();
      await execute(
        `
          INSERT INTO privacy_events (id, user_id, child_profile_id, event_type, status, payload_json)
          VALUES (CAST(:id AS uuid), CAST(:userId AS uuid), CAST(:childProfileId AS uuid), 'child_profile_delete', 'queued', CAST(:payload AS jsonb))
        `,
        [
          { name: "id", value: { stringValue: privacyEventId } },
          { name: "userId", value: { stringValue: auth.userId } },
          { name: "childProfileId", value: { stringValue: childProfileId } },
          {
            name: "payload",
            value: {
              stringValue: JSON.stringify({
                artifactCount: urls.length,
                requestedAt: new Date().toISOString(),
                requestedBy: auth.email
              })
            }
          }
        ]
      );

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: requiredEnv("PRIVACY_PURGE_QUEUE_URL"),
          MessageBody: JSON.stringify({
            privacyEventId,
            userId: auth.userId,
            childProfileId,
            s3Urls: urls
          })
        })
      );

      await execute(
        `
          DELETE FROM child_profiles
          WHERE id = CAST(:childProfileId AS uuid)
            AND user_id = CAST(:userId AS uuid)
        `,
        [
          { name: "childProfileId", value: { stringValue: childProfileId } },
          { name: "userId", value: { stringValue: auth.userId } }
        ]
      );

      logWithContext(requestId, "CHILD_PROFILE_DELETE_REQUESTED", {
        childProfileId,
        userId: auth.userId,
        privacyEventId,
        artifactCount: urls.length
      });

      return json(202, {
        ok: true,
        childProfileId,
        privacyEventId,
        queuedArtifacts: urls.length
      });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    console.error("API_REQUEST_FAILURE", {
      requestId,
      message: redactText(error instanceof Error ? error.message : String(error))
    });
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
