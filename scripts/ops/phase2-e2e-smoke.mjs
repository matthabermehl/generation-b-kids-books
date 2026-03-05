#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const apiBaseUrl = process.env.API_BASE_URL;
const smokeEmail = process.env.SMOKE_EMAIL ?? "phase2-smoke@example.com";
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

async function post(path, body, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`POST ${path} failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json;
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
  if (!jwtSecret) {
    throw new Error("Missing /jwt_signing_secret in SSM");
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

  await post("/v1/auth/request-link", { email: smokeEmail });
  const verified = await post("/v1/auth/verify-link", { token: loginToken });
  const sessionToken = verified.token;

  const order = await post(
    "/v1/orders",
    {
      childFirstName: "Ava",
      pronouns: "she/her",
      ageYears: 7,
      moneyLessonKey: "saving_later",
      interestTags: ["soccer", "baking", "space"],
      readingProfileId: "early_decoder_5_7"
    },
    sessionToken
  );

  const paid = await post(`/v1/orders/${order.orderId}/mark-paid`, {}, sessionToken);
  console.log(`Started execution ${paid.executionArn ?? "unknown"} for order=${order.orderId} book=${order.bookId}`);

  const readyStatus = await waitForReady(order.orderId, sessionToken);
  const book = await get(`/v1/books/${readyStatus.bookId}`, sessionToken);
  const download = await get(`/v1/books/${readyStatus.bookId}/download?format=pdf`, sessionToken);

  console.log(`READY order=${order.orderId} book=${readyStatus.bookId} pages=${book.pages?.length ?? 0}`);
  console.log(`PDF ${download.url}`);
}

main().catch((error) => {
  console.error(`FAIL phase2 smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
