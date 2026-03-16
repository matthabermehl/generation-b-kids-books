import { createHash, randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import type Stripe from "stripe";
import {
  maxCharacterGenerationsPerBook,
  moneyLessonKeys,
  pictureBookLayoutProfileId,
  readingProfiles,
  type BookProductFamily,
  type MoneyLessonKey,
  type ReviewAction,
  type ReviewCaseStatus,
  type ReviewStage,
  type ReadingProfile
} from "@book/domain";
import {
  createLoginToken,
  createSessionToken,
  verifyLoginToken,
  verifySessionToken,
  type SessionTokenPayload
} from "./lib/auth.js";
import { requiredEnv } from "./lib/env.js";
import { sendLoginLink } from "./lib/email.js";
import { withIdempotency } from "./lib/idempotency.js";
import { redactText, sanitizeForLog } from "./lib/log-redaction.js";
import { execute, query, txExecute, withTransaction } from "./lib/rds.js";
import { json } from "./lib/response.js";
import { isReviewerEmailAllowed } from "./lib/reviewer.js";
import { getRuntimeConfig } from "./lib/ssm-config.js";
import { publicArtifactUrl, putBuffer, signPdfDownload } from "./lib/storage.js";
import { createStripeCheckoutSession, verifyStripeWebhook } from "./lib/stripe.js";
import { generateCharacterCandidateImage } from "./lib/character-images.js";

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
  readingProfileId: z.enum(readingProfiles),
  characterDescription: z.string().trim().min(1).max(1000)
});

const generateCharacterCandidateSchema = z.object({
  characterDescription: z.string().trim().min(1).max(1000).optional()
});

const selectCharacterSchema = z.object({
  imageId: z.string().uuid()
});

const reviewNoteSchema = z.object({
  notes: z.string().trim().min(1).max(2000)
});

const reviewApproveSchema = z.object({
  notes: z.string().trim().max(2000).optional()
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

function parseJsonText<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function requireSession(event: APIGatewayProxyEventV2): Promise<SessionTokenPayload> {
  try {
    return await verifySessionToken(event.headers.authorization ?? event.headers.Authorization);
  } catch (error) {
    throw Object.assign(new Error(error instanceof Error ? error.message : "Unauthorized"), { statusCode: 401 });
  }
}

async function requireReviewerSession(
  event: APIGatewayProxyEventV2
): Promise<{ auth: SessionTokenPayload; runtimeConfig: Awaited<ReturnType<typeof getRuntimeConfig>> }> {
  const auth = await requireSession(event);
  const runtimeConfig = await getRuntimeConfig();
  if (!isReviewerEmailAllowed(auth.email, runtimeConfig.reviewerEmailAllowlist)) {
    throw Object.assign(new Error("Reviewer access denied"), { statusCode: 403 });
  }

  return { auth, runtimeConfig };
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
    characterDescription: string;
  },
  bookConfig: { productFamily: BookProductFamily; layoutProfileId: string | null }
): Promise<{ orderId: string; bookId: string; childProfileId: string; status: string; checkoutMode: string }> {
  const childProfileId = randomUUID();
  const orderId = randomUUID();
  const bookId = randomUUID();

  await withTransaction(async (transactionId) => {
    await txExecute(
      transactionId,
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

    await txExecute(
      transactionId,
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

    await txExecute(
      transactionId,
      `
        INSERT INTO books (
          id,
          order_id,
          money_lesson_key,
          interest_tags,
          reading_profile_id,
          product_family,
          layout_profile_id,
          character_description,
          book_version,
          status
        )
        VALUES (
          CAST(:id AS uuid),
          CAST(:orderId AS uuid),
          :lesson,
          string_to_array(:interests, ','),
          :profile,
          :productFamily,
          :layoutProfileId,
          :characterDescription,
          'v1',
          'draft'
        )
      `,
      [
        { name: "id", value: { stringValue: bookId } },
        { name: "orderId", value: { stringValue: orderId } },
        { name: "lesson", value: { stringValue: input.moneyLessonKey } },
        { name: "interests", value: { stringValue: input.interestTags.join(",") } },
        { name: "profile", value: { stringValue: input.readingProfileId } },
        { name: "productFamily", value: { stringValue: bookConfig.productFamily } },
        { name: "layoutProfileId", value: { stringValue: bookConfig.layoutProfileId ?? "" } },
        { name: "characterDescription", value: { stringValue: input.characterDescription.trim() } }
      ]
    );
  });

  return {
    orderId,
    bookId,
    childProfileId,
    status: "created",
    checkoutMode: "stripe"
  };
}

function resolveBookConfig(
  readingProfileId: ReadingProfile
): { productFamily: BookProductFamily; layoutProfileId: string | null } {
  if (readingProfileId === "independent_8_10") {
    return {
      productFamily: "chapter_book_reflowable",
      layoutProfileId: pictureBookLayoutProfileId()
    };
  }

  return {
    productFamily: "picture_book_fixed_layout",
    layoutProfileId: pictureBookLayoutProfileId()
  };
}

interface OrderContextRow {
  order_id: string;
  order_status: string;
  book_id: string;
  book_status: string;
  child_profile_id: string;
  selected_character_image_id: string | null;
}

interface CharacterContextRow {
  book_id: string;
  book_status: string;
  order_id: string;
  order_status: string;
  character_description: string;
  selected_character_image_id: string | null;
}

interface CharacterCandidateRow {
  image_id: string;
  s3_url: string | null;
  created_at: string;
}

type ResumeStage = "text_moderation" | "prepare_render" | "retry_page" | "finalize_gate";

interface ReviewCaseRow {
  review_case_id: string;
  review_case_status: ReviewCaseStatus;
  review_stage: ReviewStage;
  reason_summary: string;
  reason_json: string;
  created_at: string;
  resolved_at: string | null;
  book_id: string;
  book_status: string;
  order_id: string;
  order_status: string;
  child_first_name: string;
  reading_profile_id: string;
  money_lesson_key: string;
}

interface ReviewCaseQueueRow extends ReviewCaseRow {
  page_count: number;
  latest_action: ReviewAction | null;
  latest_reviewer_email: string | null;
}

async function loadOrderContext(orderId: string): Promise<OrderContextRow | null> {
  const rows = await query<OrderContextRow>(
    `
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        b.id AS book_id,
        b.status AS book_status,
        o.child_profile_id::text AS child_profile_id,
        b.selected_character_image_id::text AS selected_character_image_id
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
        o.child_profile_id::text AS child_profile_id,
        b.selected_character_image_id::text AS selected_character_image_id
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

async function loadCharacterContextForUser(bookId: string, userId: string): Promise<CharacterContextRow | null> {
  const rows = await query<CharacterContextRow>(
    `
      SELECT
        b.id::text AS book_id,
        b.status AS book_status,
        o.id::text AS order_id,
        o.status AS order_status,
        COALESCE(b.character_description, '') AS character_description,
        b.selected_character_image_id::text AS selected_character_image_id
      FROM books b
      INNER JOIN orders o ON o.id = b.order_id
      WHERE b.id = CAST(:bookId AS uuid)
        AND o.user_id = CAST(:userId AS uuid)
      LIMIT 1
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      { name: "userId", value: { stringValue: userId } }
    ]
  );

  return rows[0] ?? null;
}

async function loadCharacterCandidateRows(bookId: string): Promise<CharacterCandidateRow[]> {
  return query<CharacterCandidateRow>(
    `
      SELECT id::text AS image_id, s3_url, created_at::text AS created_at
      FROM images
      WHERE book_id = CAST(:bookId AS uuid)
        AND role = 'character_candidate'
        AND is_current = TRUE
      ORDER BY created_at DESC
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );
}

async function loadCharacterStateForUser(bookId: string, userId: string): Promise<{
  bookId: string;
  characterDescription: string;
  selectedCharacterImageId: string | null;
  selectedCharacterImageUrl: string | null;
  generationCount: number;
  maxGenerations: number;
  remainingGenerations: number;
  canGenerateMore: boolean;
  candidates: Array<{
    imageId: string;
    imageUrl: string | null;
    createdAt: string;
    isSelected: boolean;
  }>;
} | null> {
  const context = await loadCharacterContextForUser(bookId, userId);
  if (!context) {
    return null;
  }

  const candidates = await loadCharacterCandidateRows(bookId);
  const selectedCandidate = candidates.find((candidate) => candidate.image_id === context.selected_character_image_id) ?? null;
  const generationCount = candidates.length;

  return {
    bookId: context.book_id,
    characterDescription: context.character_description,
    selectedCharacterImageId: context.selected_character_image_id,
    selectedCharacterImageUrl: publicArtifactUrl(selectedCandidate?.s3_url ?? null),
    generationCount,
    maxGenerations: maxCharacterGenerationsPerBook,
    remainingGenerations: Math.max(maxCharacterGenerationsPerBook - generationCount, 0),
    canGenerateMore: generationCount < maxCharacterGenerationsPerBook,
    candidates: candidates.map((candidate) => ({
      imageId: candidate.image_id,
      imageUrl: publicArtifactUrl(candidate.s3_url),
      createdAt: candidate.created_at,
      isSelected: candidate.image_id === context.selected_character_image_id
    }))
  };
}

async function loadReviewCase(caseId: string): Promise<ReviewCaseRow | null> {
  const rows = await query<ReviewCaseRow>(
    `
      SELECT
        rc.id::text AS review_case_id,
        rc.status AS review_case_status,
        rc.stage AS review_stage,
        rc.reason_summary,
        rc.reason_json::text AS reason_json,
        rc.created_at::text,
        rc.resolved_at::text,
        b.id::text AS book_id,
        b.status AS book_status,
        o.id::text AS order_id,
        o.status AS order_status,
        cp.child_first_name,
        b.reading_profile_id,
        b.money_lesson_key
      FROM review_cases rc
      INNER JOIN books b ON b.id = rc.book_id
      INNER JOIN orders o ON o.id = rc.order_id
      INNER JOIN child_profiles cp ON cp.id = o.child_profile_id
      WHERE rc.id = CAST(:caseId AS uuid)
      LIMIT 1
    `,
    [{ name: "caseId", value: { stringValue: caseId } }]
  );

  return rows[0] ?? null;
}

async function insertReviewEvent(input: {
  reviewCaseId: string;
  bookId: string;
  reviewerEmail: string;
  action: ReviewAction;
  notes?: string | null;
  pageId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await execute(
    `
      INSERT INTO review_events (id, review_case_id, book_id, page_id, reviewer_email, action, notes, metadata_json)
      VALUES (
        CAST(:id AS uuid),
        CAST(:reviewCaseId AS uuid),
        CAST(:bookId AS uuid),
        NULLIF(:pageId, '')::uuid,
        :reviewerEmail,
        :action,
        NULLIF(:notes, ''),
        CAST(:metadata AS jsonb)
      )
    `,
    [
      { name: "id", value: { stringValue: randomUUID() } },
      { name: "reviewCaseId", value: { stringValue: input.reviewCaseId } },
      { name: "bookId", value: { stringValue: input.bookId } },
      { name: "pageId", value: { stringValue: input.pageId ?? "" } },
      { name: "reviewerEmail", value: { stringValue: input.reviewerEmail.toLowerCase() } },
      { name: "action", value: { stringValue: input.action } },
      { name: "notes", value: { stringValue: input.notes ?? "" } },
      { name: "metadata", value: { stringValue: JSON.stringify(input.metadata ?? {}) } }
    ]
  );
}

async function updateReviewCaseStatus(caseId: string, status: ReviewCaseStatus): Promise<void> {
  await execute(
    `
      UPDATE review_cases
      SET status = :status,
          resolved_at = CASE WHEN :status IN ('resolved', 'rejected') THEN NOW() ELSE NULL END
      WHERE id = CAST(:caseId AS uuid)
    `,
    [
      { name: "caseId", value: { stringValue: caseId } },
      { name: "status", value: { stringValue: status } }
    ]
  );
}

async function startExecution(
  requestId: string,
  input: {
    orderId: string;
    bookId: string;
    source: string;
    mockRunTag?: string | null;
    resumeStage?: ResumeStage;
    pageId?: string;
  }
): Promise<string | null> {
  const stateMachineArn = requiredEnv("BOOK_BUILD_STATE_MACHINE_ARN");
  const started = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      name: executionName(input.orderId, input.source),
      input: JSON.stringify({
        orderId: input.orderId,
        bookId: input.bookId,
        mockRunTag: input.mockRunTag ?? null,
        resumeStage: input.resumeStage ?? null,
        pageId: input.pageId ?? null
      })
    })
  );

  logWithContext(requestId, "OrderPipelineExecutionStarted", {
    orderId: input.orderId,
    bookId: input.bookId,
    executionArn: started.executionArn ?? null,
    source: input.source,
    resumeStage: input.resumeStage ?? null,
    pageId: input.pageId ?? null
  });

  return started.executionArn ?? null;
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
  source: string,
  mockRunTag?: string
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

  return {
    started: true,
    executionArn: await startExecution(requestId, { orderId, bookId, source, mockRunTag })
  };
}

async function startReviewResumeExecution(
  requestId: string,
  input: {
    orderId: string;
    bookId: string;
    source: string;
    resumeStage: ResumeStage;
    pageId?: string;
  }
): Promise<{ executionArn: string | null }> {
  const context = await loadOrderContext(input.orderId);
  if (!context || context.book_id !== input.bookId) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  if (context.order_status !== "building") {
    await transitionOrderStatus(input.orderId, "building");
  }
  if (context.book_status !== "building") {
    await transitionBookStatus(input.bookId, "building");
  }

  return {
    executionArn: await startExecution(requestId, input)
  };
}

function resumeStageForCase(stage: ReviewStage): ResumeStage {
  if (stage === "text_moderation") {
    return "text_moderation";
  }
  if (stage === "finalize_gate") {
    return "finalize_gate";
  }

  return "prepare_render";
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

    if (method === "GET" && path === "/v1/session") {
      const auth = await requireSession(event);
      const runtimeConfig = await getRuntimeConfig();
      return json(200, {
        user: {
          id: auth.userId,
          email: auth.email
        },
        capabilities: {
          canReview: isReviewerEmailAllowed(auth.email, runtimeConfig.reviewerEmailAllowlist)
        }
      });
    }

    if (method === "POST" && path === "/v1/orders") {
      const auth = await requireSession(event);
      const idempotencyKey = readIdempotencyKey(event);

      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const payload = await parseBody(event, createOrderSchema);
      const runtimeConfig = await getRuntimeConfig();
      if (payload.readingProfileId === "independent_8_10" && !runtimeConfig.featureFlags.enableIndependent8To10) {
        return json(422, {
          error: "Reading profile independent_8_10 is not enabled yet."
        });
      }

      const created = await withIdempotency(auth.userId, idempotencyKey, async () =>
        createOrder(auth.userId, payload, resolveBookConfig(payload.readingProfileId))
      );
      return json(200, created);
    }

    const bookCharacterMatch = pathMatch(path, /^\/v1\/books\/([^/]+)\/character$/);
    if (method === "GET" && bookCharacterMatch) {
      const auth = await requireSession(event);
      const bookId = bookCharacterMatch[1];
      const state = await loadCharacterStateForUser(bookId, auth.userId);
      if (!state) {
        return json(404, { error: "Book not found" });
      }

      return json(200, state);
    }

    const characterCandidatesMatch = pathMatch(path, /^\/v1\/books\/([^/]+)\/character\/candidates$/);
    if (method === "POST" && characterCandidatesMatch) {
      const auth = await requireSession(event);
      const bookId = characterCandidatesMatch[1];
      const bookContext = await loadCharacterContextForUser(bookId, auth.userId);
      if (!bookContext) {
        return json(404, { error: "Book not found" });
      }
      if (bookContext.book_status !== "draft" || !["created", "checkout_pending"].includes(bookContext.order_status)) {
        return json(409, { error: "Character approval is only available before the book build starts" });
      }

      const payload = await parseBody(event, generateCharacterCandidateSchema);
      const characterDescription = (payload.characterDescription ?? bookContext.character_description).trim();
      if (!characterDescription) {
        return json(422, { error: "Character description is required" });
      }

      const existingCandidates = await loadCharacterCandidateRows(bookId);
      if (existingCandidates.length >= maxCharacterGenerationsPerBook) {
        return json(409, {
          error: `Character generation is limited to ${maxCharacterGenerationsPerBook} attempts per book`
        });
      }

      const attemptNumber = existingCandidates.length + 1;
      const runtimeConfig = await getRuntimeConfig();
      const generated = await generateCharacterCandidateImage({
        apiKey: runtimeConfig.secrets.openaiApiKey,
        model: runtimeConfig.models.openaiImage,
        characterDescription,
        bookId,
        userId: auth.userId,
        attemptNumber,
        useMock: runtimeConfig.featureFlags.enableMockImage
      });
      const extension = generated.contentType === "image/svg+xml" ? "svg" : "png";
      const s3Url = await putBuffer(
        `books/${bookId}/characters/candidate-${String(attemptNumber).padStart(2, "0")}.${extension}`,
        generated.bytes,
        generated.contentType
      );

      await withTransaction(async (transactionId) => {
        await txExecute(
          transactionId,
          `
            UPDATE books
            SET character_description = :characterDescription
            WHERE id = CAST(:bookId AS uuid)
          `,
          [
            { name: "bookId", value: { stringValue: bookId } },
            { name: "characterDescription", value: { stringValue: characterDescription } }
          ]
        );

        await txExecute(
          transactionId,
          `
            INSERT INTO images (
              id,
              book_id,
              page_id,
              role,
              model_endpoint,
              prompt,
              seed,
              provider_request_id,
              width,
              height,
              s3_url,
              qa_json,
              status,
              input_assets_json,
              is_current
            )
            VALUES (
              CAST(:id AS uuid),
              CAST(:bookId AS uuid),
              NULL,
              'character_candidate',
              :endpoint,
              :prompt,
              :seed,
              :requestId,
              :width,
              :height,
              :s3Url,
              CAST(:qaJson AS jsonb),
              'ready',
              CAST(:inputAssets AS jsonb),
              TRUE
            )
          `,
          [
            { name: "id", value: { stringValue: randomUUID() } },
            { name: "bookId", value: { stringValue: bookId } },
            { name: "endpoint", value: { stringValue: generated.endpoint } },
            { name: "prompt", value: { stringValue: generated.prompt } },
            { name: "seed", value: { longValue: attemptNumber } },
            { name: "requestId", value: { stringValue: generated.providerRequestId ?? "" } },
            { name: "width", value: { longValue: generated.width } },
            { name: "height", value: { longValue: generated.height } },
            { name: "s3Url", value: { stringValue: s3Url } },
            { name: "qaJson", value: { stringValue: JSON.stringify({ passed: true, issues: [] }) } },
            {
              name: "inputAssets",
              value: {
                stringValue: JSON.stringify({
                  characterDescription,
                  attemptNumber
                })
              }
            }
          ]
        );
      });

      const state = await loadCharacterStateForUser(bookId, auth.userId);
      return json(200, state);
    }

    const selectCharacterMatch = pathMatch(path, /^\/v1\/books\/([^/]+)\/character\/select$/);
    if (method === "POST" && selectCharacterMatch) {
      const auth = await requireSession(event);
      const bookId = selectCharacterMatch[1];
      const bookContext = await loadCharacterContextForUser(bookId, auth.userId);
      if (!bookContext) {
        return json(404, { error: "Book not found" });
      }
      if (bookContext.book_status !== "draft" || !["created", "checkout_pending"].includes(bookContext.order_status)) {
        return json(409, { error: "Character approval is only available before the book build starts" });
      }

      const payload = await parseBody(event, selectCharacterSchema);
      const candidateRows = await query<{
        image_id: string;
        model_endpoint: string;
        prompt: string;
        seed: number;
        provider_request_id: string | null;
        width: number | null;
        height: number | null;
        s3_url: string | null;
        qa_json: string | null;
        status: string;
      }>(
        `
          SELECT
            id::text AS image_id,
            model_endpoint,
            prompt,
            seed,
            provider_request_id,
            width,
            height,
            s3_url,
            qa_json::text AS qa_json,
            status
          FROM images
          WHERE id = CAST(:imageId AS uuid)
            AND book_id = CAST(:bookId AS uuid)
            AND role = 'character_candidate'
            AND is_current = TRUE
          LIMIT 1
        `,
        [
          { name: "imageId", value: { stringValue: payload.imageId } },
          { name: "bookId", value: { stringValue: bookId } }
        ]
      );

      const candidate = candidateRows[0];
      if (!candidate) {
        return json(404, { error: "Character candidate not found" });
      }

      await withTransaction(async (transactionId) => {
        await txExecute(
          transactionId,
          `
            UPDATE books
            SET selected_character_image_id = CAST(:imageId AS uuid)
            WHERE id = CAST(:bookId AS uuid)
          `,
          [
            { name: "bookId", value: { stringValue: bookId } },
            { name: "imageId", value: { stringValue: candidate.image_id } }
          ]
        );

        await txExecute(
          transactionId,
          `
            UPDATE images
            SET is_current = FALSE
            WHERE book_id = CAST(:bookId AS uuid)
              AND page_id IS NULL
              AND role = 'character_reference'
              AND is_current = TRUE
          `,
          [{ name: "bookId", value: { stringValue: bookId } }]
        );

        await txExecute(
          transactionId,
          `
            INSERT INTO images (
              id,
              book_id,
              page_id,
              role,
              model_endpoint,
              prompt,
              seed,
              provider_request_id,
              width,
              height,
              s3_url,
              qa_json,
              status,
              parent_image_id,
              input_assets_json,
              is_current
            )
            VALUES (
              CAST(:id AS uuid),
              CAST(:bookId AS uuid),
              NULL,
              'character_reference',
              :endpoint,
              :prompt,
              :seed,
              :requestId,
              :width,
              :height,
              :s3Url,
              CAST(:qaJson AS jsonb),
              :status,
              CAST(:parentImageId AS uuid),
              CAST(:inputAssets AS jsonb),
              TRUE
            )
          `,
          [
            { name: "id", value: { stringValue: randomUUID() } },
            { name: "bookId", value: { stringValue: bookId } },
            { name: "endpoint", value: { stringValue: candidate.model_endpoint } },
            { name: "prompt", value: { stringValue: candidate.prompt } },
            { name: "seed", value: { longValue: Number(candidate.seed) } },
            { name: "requestId", value: { stringValue: candidate.provider_request_id ?? "" } },
            { name: "width", value: { longValue: Number(candidate.width ?? 1024) } },
            { name: "height", value: { longValue: Number(candidate.height ?? 1536) } },
            { name: "s3Url", value: { stringValue: candidate.s3_url ?? "" } },
            { name: "qaJson", value: { stringValue: candidate.qa_json ?? "{}" } },
            { name: "status", value: { stringValue: candidate.status } },
            { name: "parentImageId", value: { stringValue: candidate.image_id } },
            {
              name: "inputAssets",
              value: {
                stringValue: JSON.stringify({
                  selectedFromCandidateImageId: candidate.image_id
                })
              }
            }
          ]
        );
      });

      const state = await loadCharacterStateForUser(bookId, auth.userId);
      return json(200, state);
    }

    const checkoutMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const auth = await requireSession(event);
      const orderId = checkoutMatch[1];
      const idempotencyKey = readIdempotencyKey(event);
      if (!idempotencyKey) {
        return json(400, { error: "Idempotency-Key header is required" });
      }

      const order = await loadOrderContextForUser(orderId, auth.userId);
      if (!order) {
        return json(404, { error: "Order not found" });
      }
      if (!order.selected_character_image_id) {
        return json(409, { error: "Select a character before checkout" });
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
      const auth = await requireSession(event);
      const runtimeConfig = await getRuntimeConfig();
      if (!runtimeConfig.featureFlags.enableMockCheckout) {
        return json(403, { error: "Mock checkout disabled" });
      }
      const mockRunTag = (readHeader(event, "x-mock-run-tag") ?? "").trim();
      const requiresMockRunTag =
        runtimeConfig.featureFlags.enableMockLlm || runtimeConfig.featureFlags.enableMockImage;
      if (requiresMockRunTag && mockRunTag.length === 0) {
        return json(400, {
          error: "X-Mock-Run-Tag header is required when mock LLM or image providers are enabled"
        });
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
        const started = await startBookBuild(
          requestId,
          orderId,
          order.book_id,
          mockCheckoutSource,
          mockRunTag
        );
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

    if (method === "GET" && path === "/v1/review/cases") {
      await requireReviewerSession(event);
      const status = (event.queryStringParameters?.status ?? "open").trim().toLowerCase();
      const stageFilter = (event.queryStringParameters?.stage ?? "").trim();
      const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit ?? "50"), 1), 100);
      const cases = await query<ReviewCaseQueueRow>(
        `
          SELECT
            rc.id::text AS review_case_id,
            rc.status AS review_case_status,
            rc.stage AS review_stage,
            rc.reason_summary,
            rc.reason_json::text AS reason_json,
            rc.created_at::text,
            rc.resolved_at::text,
            b.id::text AS book_id,
            b.status AS book_status,
            o.id::text AS order_id,
            o.status AS order_status,
            cp.child_first_name,
            b.reading_profile_id,
            b.money_lesson_key,
            COUNT(p.*)::int AS page_count,
            (
              SELECT re.action
              FROM review_events re
              WHERE re.review_case_id = rc.id
              ORDER BY re.created_at DESC
              LIMIT 1
            ) AS latest_action,
            (
              SELECT re.reviewer_email
              FROM review_events re
              WHERE re.review_case_id = rc.id
              ORDER BY re.created_at DESC
              LIMIT 1
            ) AS latest_reviewer_email
          FROM review_cases rc
          INNER JOIN books b ON b.id = rc.book_id
          INNER JOIN orders o ON o.id = rc.order_id
          INNER JOIN child_profiles cp ON cp.id = o.child_profile_id
          LEFT JOIN pages p ON p.book_id = b.id
          WHERE rc.status = :status
            AND (:stage = '' OR rc.stage = :stage)
          GROUP BY rc.id, b.id, o.id, cp.id
          ORDER BY rc.created_at DESC
          LIMIT ${limit}
        `,
        [
          { name: "status", value: { stringValue: status } },
          { name: "stage", value: { stringValue: stageFilter } }
        ]
      );

      return json(200, {
        cases: cases.map((row) => ({
          caseId: row.review_case_id,
          status: row.review_case_status,
          stage: row.review_stage,
          reasonSummary: row.reason_summary,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
          orderId: row.order_id,
          orderStatus: row.order_status,
          bookId: row.book_id,
          bookStatus: row.book_status,
          childFirstName: row.child_first_name,
          readingProfileId: row.reading_profile_id,
          moneyLessonKey: row.money_lesson_key,
          pageCount: Number(row.page_count),
          latestAction: row.latest_action,
          latestReviewerEmail: row.latest_reviewer_email
        }))
      });
    }

    const reviewCaseMatch = pathMatch(path, /^\/v1\/review\/cases\/([^/]+)$/);
    if (method === "GET" && reviewCaseMatch) {
      await requireReviewerSession(event);
      const caseId = reviewCaseMatch[1];
      const reviewCase = await loadReviewCase(caseId);
      if (!reviewCase) {
        return json(404, { error: "Review case not found" });
      }

      const [events, evaluations, artifacts, pages] = await Promise.all([
        query<{
          id: string;
          reviewer_email: string;
          action: ReviewAction;
          notes: string | null;
          page_id: string | null;
          metadata_json: string;
          created_at: string;
        }>(
          `
            SELECT
              id::text AS id,
              reviewer_email,
              action,
              notes,
              page_id::text AS page_id,
              metadata_json::text AS metadata_json,
              created_at::text
            FROM review_events
            WHERE review_case_id = CAST(:caseId AS uuid)
            ORDER BY created_at DESC
          `,
          [{ name: "caseId", value: { stringValue: caseId } }]
        ),
        query<{
          stage: string;
          model_used: string;
          verdict: string;
          notes: string | null;
          score_json: string;
          created_at: string;
        }>(
          `
            SELECT stage, model_used, verdict, notes, score_json::text AS score_json, created_at::text
            FROM evaluations
            WHERE book_id = CAST(:bookId AS uuid)
            ORDER BY created_at DESC
          `,
          [{ name: "bookId", value: { stringValue: reviewCase.book_id } }]
        ),
        query<{
          artifact_type: string;
          s3_url: string;
          created_at: string;
        }>(
          `
            SELECT artifact_type, s3_url, created_at::text
            FROM book_artifacts
            WHERE book_id = CAST(:bookId AS uuid)
              AND is_current = TRUE
              AND artifact_type IN ('pdf', 'beat_plan_report', 'beat_plan', 'prompt_pack', 'scene_plan', 'image_plan')
            ORDER BY created_at DESC
          `,
          [{ name: "bookId", value: { stringValue: reviewCase.book_id } }]
        ),
        query<{
          page_id: string;
          page_index: number;
          status: string;
          text: string;
          template_id: string | null;
          preview_image_url: string | null;
          page_art_url: string | null;
          qa_json: string | null;
          input_assets_json: string | null;
          retry_count: number;
        }>(
          `
            SELECT
              p.id::text AS page_id,
              p.page_index,
              p.status,
              p.text,
              p.composition_json->>'templateId' AS template_id,
              preview.s3_url AS preview_image_url,
              art.s3_url AS page_art_url,
              art.qa_json::text AS qa_json,
              art.input_assets_json::text AS input_assets_json,
              COALESCE(
                (
                  SELECT COUNT(*)
                  FROM images history
                  WHERE history.page_id = p.id
                    AND history.role = 'page_art'
                ),
                0
              )::int AS retry_count
            FROM pages p
            LEFT JOIN images preview ON preview.page_id = p.id AND preview.role = 'page_preview' AND preview.is_current = TRUE
            LEFT JOIN images art ON art.page_id = p.id AND art.role = 'page_art' AND art.is_current = TRUE
            WHERE p.book_id = CAST(:bookId AS uuid)
            ORDER BY p.page_index
          `,
          [{ name: "bookId", value: { stringValue: reviewCase.book_id } }]
        )
      ]);

      const pdfArtifact = artifacts.find((artifact) => artifact.artifact_type === "pdf");
      const scenePlanArtifact = artifacts.find((artifact) => artifact.artifact_type === "scene_plan");
      const imagePlanArtifact = artifacts.find((artifact) => artifact.artifact_type === "image_plan");
      return json(200, {
        caseId: reviewCase.review_case_id,
        status: reviewCase.review_case_status,
        stage: reviewCase.review_stage,
        reasonSummary: reviewCase.reason_summary,
        reason: parseJsonText<Record<string, unknown>>(reviewCase.reason_json, {}),
        createdAt: reviewCase.created_at,
        resolvedAt: reviewCase.resolved_at,
        order: {
          orderId: reviewCase.order_id,
          status: reviewCase.order_status
        },
        book: {
          bookId: reviewCase.book_id,
          status: reviewCase.book_status,
          childFirstName: reviewCase.child_first_name,
          readingProfileId: reviewCase.reading_profile_id,
          moneyLessonKey: reviewCase.money_lesson_key,
          spreadCount: pages.length,
          physicalPageCount: pages.length * 2
        },
        pdfUrl: publicArtifactUrl(pdfArtifact?.s3_url ?? null),
        scenePlan: scenePlanArtifact
          ? {
              url: publicArtifactUrl(scenePlanArtifact.s3_url),
              createdAt: scenePlanArtifact.created_at
            }
          : null,
        imagePlan: imagePlanArtifact
          ? {
              url: publicArtifactUrl(imagePlanArtifact.s3_url),
              createdAt: imagePlanArtifact.created_at
            }
          : null,
        artifacts: artifacts.map((artifact) => ({
          artifactType: artifact.artifact_type,
          url: publicArtifactUrl(artifact.s3_url),
          createdAt: artifact.created_at
        })),
        evaluations: evaluations.map((row) => ({
          stage: row.stage,
          modelUsed: row.model_used,
          verdict: row.verdict,
          notes: row.notes,
          score: parseJsonText<Record<string, unknown>>(row.score_json, {}),
          createdAt: row.created_at
        })),
        events: events.map((row) => ({
          id: row.id,
          reviewerEmail: row.reviewer_email,
          action: row.action,
          notes: row.notes,
          pageId: row.page_id,
          metadata: parseJsonText<Record<string, unknown>>(row.metadata_json, {}),
          createdAt: row.created_at
        })),
        pages: pages.map((page) => {
          const qa = parseJsonText<Record<string, unknown>>(page.qa_json, {});
          const provenance = parseJsonText<Record<string, unknown>>(page.input_assets_json, {});
          const issues = Array.isArray(qa.issues) ? qa.issues.filter((issue): issue is string => typeof issue === "string") : [];
          return {
            pageId: page.page_id,
            pageIndex: Number(page.page_index),
            spreadIndex: Number(page.page_index),
            status: page.status,
            text: page.text,
            templateId: page.template_id,
            previewImageUrl: publicArtifactUrl(page.preview_image_url),
            pageArtUrl: publicArtifactUrl(page.page_art_url),
            latestQaIssues: issues,
            qaMetrics: qa.metrics ?? null,
            provenance,
            retryCount: Math.max(Number(page.retry_count) - 1, 0)
          };
        })
      });
    }

    const approveReviewCaseMatch = pathMatch(path, /^\/v1\/review\/cases\/([^/]+)\/approve$/);
    if (method === "POST" && approveReviewCaseMatch) {
      const { auth } = await requireReviewerSession(event);
      const payload = await parseBody(event, reviewApproveSchema);
      const caseId = approveReviewCaseMatch[1];
      const reviewCase = await loadReviewCase(caseId);
      if (!reviewCase) {
        return json(404, { error: "Review case not found" });
      }
      if (reviewCase.review_case_status !== "open") {
        return json(409, { error: "Review case is not open" });
      }

      const resumeStage = resumeStageForCase(reviewCase.review_stage);
      const started = await startReviewResumeExecution(requestId, {
        orderId: reviewCase.order_id,
        bookId: reviewCase.book_id,
        source: `review-approve-${reviewCase.review_stage}`,
        resumeStage
      });
      await updateReviewCaseStatus(caseId, "retrying");
      await insertReviewEvent({
        reviewCaseId: caseId,
        bookId: reviewCase.book_id,
        reviewerEmail: auth.email,
        action: "approve_continue",
        notes: payload.notes ?? null,
        metadata: {
          resumeStage,
          executionArn: started.executionArn
        }
      });

      return json(200, {
        ok: true,
        caseId,
        status: "retrying",
        executionArn: started.executionArn
      });
    }

    const rejectReviewCaseMatch = pathMatch(path, /^\/v1\/review\/cases\/([^/]+)\/reject$/);
    if (method === "POST" && rejectReviewCaseMatch) {
      const { auth } = await requireReviewerSession(event);
      const payload = await parseBody(event, reviewNoteSchema);
      const caseId = rejectReviewCaseMatch[1];
      const reviewCase = await loadReviewCase(caseId);
      if (!reviewCase) {
        return json(404, { error: "Review case not found" });
      }
      if (reviewCase.review_case_status !== "open") {
        return json(409, { error: "Review case is not open" });
      }

      await transitionBookStatus(reviewCase.book_id, "failed");
      await transitionOrderStatus(reviewCase.order_id, "failed");
      await updateReviewCaseStatus(caseId, "rejected");
      await insertReviewEvent({
        reviewCaseId: caseId,
        bookId: reviewCase.book_id,
        reviewerEmail: auth.email,
        action: "reject",
        notes: payload.notes,
        metadata: {
          stage: reviewCase.review_stage
        }
      });

      return json(200, {
        ok: true,
        caseId,
        status: "rejected"
      });
    }

    const retryPageMatch = pathMatch(path, /^\/v1\/review\/cases\/([^/]+)\/pages\/([^/]+)\/retry$/);
    if (method === "POST" && retryPageMatch) {
      const { auth } = await requireReviewerSession(event);
      const payload = await parseBody(event, reviewNoteSchema);
      const caseId = retryPageMatch[1];
      const pageId = retryPageMatch[2];
      const reviewCase = await loadReviewCase(caseId);
      if (!reviewCase) {
        return json(404, { error: "Review case not found" });
      }
      if (reviewCase.review_case_status !== "open") {
        return json(409, { error: "Review case is not open" });
      }
      if (!["image_qa", "image_safety"].includes(reviewCase.review_stage)) {
        return json(409, { error: "Page retry is only allowed for image review cases" });
      }

      const pageRows = await query<{ id: string }>(
        `SELECT id::text AS id FROM pages WHERE id = CAST(:pageId AS uuid) AND book_id = CAST(:bookId AS uuid) LIMIT 1`,
        [
          { name: "pageId", value: { stringValue: pageId } },
          { name: "bookId", value: { stringValue: reviewCase.book_id } }
        ]
      );
      if (!pageRows[0]) {
        return json(404, { error: "Page not found" });
      }

      const started = await startReviewResumeExecution(requestId, {
        orderId: reviewCase.order_id,
        bookId: reviewCase.book_id,
        source: `review-retry-page-${pageId.slice(0, 8)}`,
        resumeStage: "retry_page",
        pageId
      });

      await execute(
        `
          UPDATE images
          SET is_current = FALSE
          WHERE page_id = CAST(:pageId AS uuid)
            AND role IN ('page', 'page_art', 'page_preview')
            AND is_current = TRUE
        `,
        [{ name: "pageId", value: { stringValue: pageId } }]
      );
      await execute(`UPDATE pages SET status = 'pending' WHERE id = CAST(:pageId AS uuid)`, [
        { name: "pageId", value: { stringValue: pageId } }
      ]);
      await execute(
        `
          UPDATE book_artifacts
          SET is_current = FALSE
          WHERE book_id = CAST(:bookId AS uuid) AND artifact_type = 'pdf' AND is_current = TRUE
        `,
        [{ name: "bookId", value: { stringValue: reviewCase.book_id } }]
      );
      await updateReviewCaseStatus(caseId, "retrying");
      await insertReviewEvent({
        reviewCaseId: caseId,
        bookId: reviewCase.book_id,
        pageId,
        reviewerEmail: auth.email,
        action: "retry_page",
        notes: payload.notes,
        metadata: {
          executionArn: started.executionArn
        }
      });

      return json(200, {
        ok: true,
        caseId,
        pageId,
        status: "retrying",
        executionArn: started.executionArn
      });
    }

    const orderMatch = pathMatch(path, /^\/v1\/orders\/([^/]+)$/);
    if (method === "GET" && orderMatch) {
      const auth = await requireSession(event);
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
      const auth = await requireSession(event);
      const bookId = bookMatch[1];

      const bookRows = await query<{
        id: string;
        status: string;
        reading_profile_id: string;
        money_lesson_key: string;
        child_first_name: string;
        product_family: BookProductFamily;
      }>(
        `
          SELECT b.id, b.status, b.reading_profile_id, b.money_lesson_key, cp.child_first_name, COALESCE(b.product_family, 'picture_book_fixed_layout') AS product_family
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
        preview_image_url: string | null;
        template_id: string | null;
      }>(
        `
          SELECT
            p.page_index,
            p.text,
            p.status,
            i.s3_url AS image_url,
            preview.s3_url AS preview_image_url,
            p.composition_json->>'templateId' AS template_id
          FROM pages p
          LEFT JOIN images i ON i.page_id = p.id AND i.role = 'page_art' AND i.is_current = TRUE
          LEFT JOIN images preview ON preview.page_id = p.id AND preview.role = 'page_preview' AND preview.is_current = TRUE
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
        productFamily: bookRows[0].product_family,
        spreadCount: pages.length,
        physicalPageCount: pages.length * 2,
        pages: pages.map((page) => ({
          pageIndex: Number(page.page_index),
          spreadIndex: Number(page.page_index),
          text: page.text,
          status: page.status,
          imageUrl: publicArtifactUrl(page.preview_image_url ?? page.image_url),
          previewImageUrl: publicArtifactUrl(page.preview_image_url),
          templateId: page.template_id ?? undefined,
          productFamily: bookRows[0].product_family
        }))
      });
    }

    const downloadMatch = pathMatch(path, /^\/v1\/books\/([^/]+)\/download$/);
    if (method === "GET" && downloadMatch) {
      const auth = await requireSession(event);
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
          WHERE ba.book_id = CAST(:bookId AS uuid)
            AND ba.artifact_type = 'pdf'
            AND ba.is_current = TRUE
            AND o.user_id = CAST(:userId AS uuid)
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
      const auth = await requireSession(event);
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
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    console.error("API_REQUEST_FAILURE", {
      requestId,
      statusCode,
      message: redactText(error instanceof Error ? error.message : String(error))
    });
    return json(statusCode, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
