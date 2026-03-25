#!/usr/bin/env node
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const apiBaseUrl = process.env.API_BASE_URL;
const smokeEmail = process.env.SMOKE_EMAIL ?? "phase3-smoke@example.com";
const region = process.env.AWS_REGION ?? "us-east-1";
const prefix = process.env.SSM_PREFIX ?? "/ai-childrens-book/dev";

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL is required");
}

const ssm = new SSMClient({ region });

function normalizeName(name) {
  return name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1).toLowerCase() : name.toLowerCase();
}

async function loadSsmConfig() {
  let nextToken;
  const byName = {};

  do {
    const response = await ssm.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken
      })
    );

    for (const parameter of response.Parameters ?? []) {
      if (!parameter.Name || parameter.Value === undefined) {
        continue;
      }
      byName[normalizeName(parameter.Name)] = parameter.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return byName;
}

async function post(path, body, token, extraHeaders = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`POST ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function postWithIdempotency(path, body, token) {
  return post(path, body, token, {
    "idempotency-key": randomUUID()
  });
}

async function get(path, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

function stripeSignatureHeader(payload, webhookSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForReady(orderId, token) {
  const timeoutAt = Date.now() + 20 * 60_000;
  while (Date.now() < timeoutAt) {
    const status = await get(`/v1/orders/${orderId}`, token);
    console.log(`order=${orderId} status=${status.status} bookStatus=${status.bookStatus}`);
    if (status.status === "ready" && status.bookStatus === "ready") {
      return status;
    }
    if (status.status === "failed" || status.bookStatus === "failed") {
      throw new Error(`Order ${orderId} failed during pipeline execution`);
    }
    await sleep(10_000);
  }

  throw new Error(`Timed out waiting for order ${orderId} to become ready`);
}

async function main() {
  const ssmConfig = await loadSsmConfig();
  const jwtSecret = ssmConfig.jwt_signing_secret;
  const webhookSecret = ssmConfig.stripe_webhook_secret;

  if (!jwtSecret) {
    throw new Error("Missing /jwt_signing_secret in SSM");
  }
  if (!webhookSecret) {
    throw new Error("Missing /stripe_webhook_secret in SSM");
  }

  const ttlMinutes = Number(ssmConfig.auth_link_ttl_minutes ?? "15");
  const loginToken = jwt.sign(
    {
      email: smokeEmail,
      purpose: "login"
    },
    jwtSecret,
    {
      expiresIn: `${ttlMinutes}m`
    }
  );

  await postWithIdempotency("/v1/auth/request-link", { email: smokeEmail });
  const verified = await postWithIdempotency("/v1/auth/verify-link", { token: loginToken });
  const sessionToken = verified.token;

  const order = await postWithIdempotency(
    "/v1/orders",
    {
      childFirstName: "Ava",
      pronouns: "she/her",
      ageYears: 7,
      moneyLessonKey: "jar_saving_limits",
      interestTags: ["soccer", "baking", "space"],
      readingProfileId: "early_decoder_5_7"
    },
    sessionToken
  );

  const checkout = await postWithIdempotency(`/v1/orders/${order.orderId}/checkout`, {}, sessionToken);
  if (!checkout.stripeSessionId) {
    throw new Error(`Checkout did not return stripeSessionId: ${JSON.stringify(checkout)}`);
  }

  const stripeEvent = {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: checkout.stripeSessionId,
        object: "checkout.session",
        metadata: {
          orderId: order.orderId,
          bookId: order.bookId,
          userId: verified.user.id
        }
      }
    }
  };
  const payload = JSON.stringify(stripeEvent);
  const webhookResult = await post(
    "/v1/webhooks/stripe",
    payload,
    null,
    {
      "stripe-signature": stripeSignatureHeader(payload, webhookSecret)
    }
  );

  console.log(
    `Webhook processed status=${webhookResult.processingStatus} event=${webhookResult.stripeEventId} executionArn=${webhookResult.executionArn ?? "none"}`
  );

  const readyStatus = await waitForReady(order.orderId, sessionToken);
  const book = await get(`/v1/books/${readyStatus.bookId}`, sessionToken);
  const download = await get(`/v1/books/${readyStatus.bookId}/download?format=pdf`, sessionToken);

  console.log(`READY order=${order.orderId} book=${readyStatus.bookId} pages=${book.pages?.length ?? 0}`);
  console.log(`PDF ${download.url}`);
}

main().catch((error) => {
  console.error(`FAIL phase smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
