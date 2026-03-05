#!/usr/bin/env node
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const apiBaseUrl = process.env.API_BASE_URL;
const smokeEmail = process.env.SMOKE_EMAIL ?? "stripe-smoke@example.com";
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

function stripeSignatureHeader(payload, webhookSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function post(path, body, token, headers = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
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
  return post(path, body, token, { "idempotency-key": randomUUID() });
}

async function main() {
  const ssmConfig = await loadSsmConfig();
  const jwtSecret = ssmConfig.jwt_signing_secret;
  const webhookSecret = ssmConfig.stripe_webhook_secret;

  if (!jwtSecret || !webhookSecret) {
    throw new Error("Missing required SSM keys jwt_signing_secret or stripe_webhook_secret");
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
      childFirstName: "Noah",
      pronouns: "he/him",
      ageYears: 6,
      moneyLessonKey: "inflation_candy",
      interestTags: ["dinosaurs", "lego"],
      readingProfileId: "early_decoder_5_7"
    },
    sessionToken
  );

  const checkout = await postWithIdempotency(`/v1/orders/${order.orderId}/checkout`, {}, sessionToken);
  if (!checkout.stripeSessionId || !checkout.checkoutUrl) {
    throw new Error(`Checkout did not return session details: ${JSON.stringify(checkout)}`);
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
  const signature = stripeSignatureHeader(payload, webhookSecret);

  const first = await post("/v1/webhooks/stripe", payload, null, { "stripe-signature": signature });
  const second = await post("/v1/webhooks/stripe", payload, null, { "stripe-signature": signature });

  if (first.processingStatus !== "processed" && first.processingStatus !== "duplicate") {
    throw new Error(`Unexpected first webhook processingStatus: ${first.processingStatus}`);
  }
  if (second.processingStatus !== "duplicate") {
    throw new Error(`Expected duplicate webhook processingStatus, received: ${second.processingStatus}`);
  }

  console.log(`PASS checkout_url=${checkout.checkoutUrl}`);
  console.log(`PASS webhook_first=${first.processingStatus}`);
  console.log(`PASS webhook_second_duplicate=true`);
}

main().catch((error) => {
  console.error(`FAIL stripe smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
