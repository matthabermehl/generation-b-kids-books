#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import jwt from "jsonwebtoken";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";

const apiBaseUrl = process.env.API_BASE_URL;
const smokeEmail = process.env.SMOKE_EMAIL ?? "picture-book-smoke@example.com";
const readingProfileId = process.env.READING_PROFILE_ID ?? "early_decoder_5_7";
const childFirstName = process.env.CHILD_FIRST_NAME ?? "Ava";
const moneyLessonKey = process.env.MONEY_LESSON_KEY ?? "saving_later";
const characterDescription =
  process.env.CHARACTER_DESCRIPTION
  ?? "A curious child with warm brown skin, a bright red raincoat, striped leggings, and a round yellow backpack.";
const interestTags = (process.env.INTEREST_TAGS ?? "soccer,baking,space")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const region = process.env.AWS_REGION ?? "us-east-1";
const prefix = process.env.SSM_PREFIX ?? "/ai-childrens-book/dev";
const stackName = process.env.STACK_NAME ?? "AiChildrensBookDevStack";

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL is required");
}

if (!["read_aloud_3_4", "early_decoder_5_7"].includes(readingProfileId)) {
  throw new Error(`Unsupported READING_PROFILE_ID=${readingProfileId}`);
}

const ssm = new SSMClient({ region });
const cloudFormation = new CloudFormationClient({ region });
const rds = new RDSDataClient({ region });

function normalizeName(name) {
  return name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1).toLowerCase() : name.toLowerCase();
}

function outputPath(timestamp) {
  return resolve(".agent/artifacts", `picture-book-smoke-${timestamp}.json`);
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
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function waitForTerminal(orderId, token) {
  const timeoutAt = Date.now() + 20 * 60_000;
  while (Date.now() < timeoutAt) {
    const status = await get(`/v1/orders/${orderId}`, token);
    console.log(`order=${orderId} status=${status.status} bookStatus=${status.bookStatus}`);
    if (["ready", "failed", "needs_review"].includes(status.status) || ["ready", "failed", "needs_review"].includes(status.bookStatus)) {
      return status;
    }
    await sleep(10_000);
  }

  throw new Error(`Timed out waiting for order ${orderId} to reach a terminal state`);
}

function fieldValue(field) {
  if (!field) {
    return null;
  }
  if (field.stringValue !== undefined) {
    return field.stringValue;
  }
  if (field.longValue !== undefined) {
    return Number(field.longValue);
  }
  if (field.doubleValue !== undefined) {
    return Number(field.doubleValue);
  }
  if (field.booleanValue !== undefined) {
    return Boolean(field.booleanValue);
  }
  if (field.isNull) {
    return null;
  }
  return null;
}

async function loadDatabaseTargets() {
  const response = await cloudFormation.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = response.Stacks?.[0]?.Outputs ?? [];
  const outputValue = (key) => outputs.find((output) => output.OutputKey === key)?.OutputValue ?? null;

  const resourceArn = outputValue("DbClusterArn");
  const secretArn = outputValue("DbSecretArn");
  const database = process.env.DB_NAME ?? "bookapp";

  if (!resourceArn || !secretArn) {
    throw new Error(`Missing DbClusterArn/DbSecretArn outputs on stack ${stackName}`);
  }

  return { resourceArn, secretArn, database };
}

async function loadLatestQaIssues(bookId) {
  const { resourceArn, secretArn, database } = await loadDatabaseTargets();
  const response = await rds.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT
          p.page_index,
          p.status,
          COALESCE(p.composition_json->>'templateId', '') AS template_id,
          COALESCE(
            (
              SELECT json_agg(issue)
              FROM jsonb_array_elements_text(COALESCE(i.qa_json->'issues', '[]'::jsonb)) AS issue
            )::text,
            '[]'
          ) AS issues_json
        FROM pages p
        LEFT JOIN LATERAL (
          SELECT qa_json
          FROM images i
          WHERE i.page_id = p.id AND i.role = 'page_art' AND i.is_current = TRUE
          ORDER BY i.created_at DESC, i.id DESC
          LIMIT 1
        ) i ON TRUE
        WHERE p.book_id = CAST(:bookId AS uuid)
        ORDER BY p.page_index
      `,
      parameters: [
        {
          name: "bookId",
          value: { stringValue: bookId }
        }
      ]
    })
  );

  return (response.records ?? []).map((record) => {
    const pageIndex = Number(fieldValue(record[0]));
    const status = String(fieldValue(record[1]) ?? "pending");
    const templateId = fieldValue(record[2]);
    const issuesJson = String(fieldValue(record[3]) ?? "[]");
    return {
      pageIndex,
      status,
      templateId: templateId ? String(templateId) : null,
      latestQaIssues: JSON.parse(issuesJson)
    };
  });
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const ssmConfig = await loadSsmConfig();
  const jwtSecret = ssmConfig.jwt_signing_secret;
  const webhookSecret = ssmConfig.stripe_webhook_secret;
  const enableMockLlm = String(ssmConfig.enable_mock_llm ?? "false").toLowerCase();

  if (enableMockLlm === "true" || enableMockLlm === "1" || enableMockLlm === "yes") {
    throw new Error("enable_mock_llm must be false before running picture-book smoke");
  }

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
      childFirstName,
      pronouns: "she/her",
      ageYears: readingProfileId === "read_aloud_3_4" ? 4 : 7,
      moneyLessonKey,
      interestTags,
      readingProfileId,
      characterDescription
    },
    sessionToken
  );

  const characterState = await postWithIdempotency(
    `/v1/books/${order.bookId}/character/candidates`,
    { characterDescription },
    sessionToken
  );
  const selectedCandidate = characterState.candidates?.[0];
  if (!selectedCandidate?.imageId) {
    throw new Error(`Character candidate generation did not return a selectable image: ${JSON.stringify(characterState)}`);
  }

  const selectedCharacterState = await postWithIdempotency(
    `/v1/books/${order.bookId}/character/select`,
    { imageId: selectedCandidate.imageId },
    sessionToken
  );
  if (selectedCharacterState.selectedCharacterImageId !== selectedCandidate.imageId) {
    throw new Error(`Character selection did not persist: ${JSON.stringify(selectedCharacterState)}`);
  }

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

  const terminalStatus = await waitForTerminal(order.orderId, sessionToken);
  const book = await get(`/v1/books/${terminalStatus.bookId}`, sessionToken);
  let pdfUrl = null;
  if (terminalStatus.status === "ready" && terminalStatus.bookStatus === "ready") {
    const download = await get(`/v1/books/${terminalStatus.bookId}/download?format=pdf`, sessionToken);
    pdfUrl = download.url ?? null;
  }

  const qaRows = await loadLatestQaIssues(terminalStatus.bookId);
  const qaByPage = new Map(qaRows.map((row) => [row.pageIndex, row]));
  const pages = (book.pages ?? []).map((page) => {
    const qaRow = qaByPage.get(page.pageIndex);
    return {
      pageIndex: page.pageIndex,
      status: page.status,
      templateId: page.templateId ?? qaRow?.templateId ?? null,
      previewImageUrl: page.previewImageUrl ?? page.imageUrl ?? null,
      latestQaIssues: qaRow?.latestQaIssues ?? []
    };
  });

  const artifact = {
    orderId: order.orderId,
    bookId: terminalStatus.bookId,
    selectedCharacterImageId: selectedCharacterState.selectedCharacterImageId ?? null,
    characterCandidateCount: selectedCharacterState.candidates?.length ?? 0,
    executionArn: webhookResult.executionArn ?? null,
    readingProfileId,
    llmMode: "real",
    terminalOrderStatus: terminalStatus.status,
    terminalBookStatus: terminalStatus.bookStatus,
    pageCount: pages.length,
    previewCount: pages.filter((page) => Boolean(page.previewImageUrl)).length,
    pdfUrl,
    pages,
    latestFailure:
      terminalStatus.bookStatus === "ready"
        ? undefined
        : {
            reason: terminalStatus.bookStatus,
            cause: pages.find((page) => page.latestQaIssues.length > 0)?.latestQaIssues.join(", ") ?? null
          }
  };

  const artifactPath = outputPath(timestamp);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(`ARTIFACT ${artifactPath}`);
  console.log(
    `RESULT order=${order.orderId} book=${terminalStatus.bookId} orderStatus=${terminalStatus.status} bookStatus=${terminalStatus.bookStatus} previews=${artifact.previewCount}/${artifact.pageCount}`
  );
}

main().catch((error) => {
  console.error(`FAIL picture-book smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
