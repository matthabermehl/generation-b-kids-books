#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import jwt from "jsonwebtoken";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const smokeEmail = process.env.SMOKE_EMAIL ?? "story-only-markdown@example.com";
const readingProfileId = process.env.READING_PROFILE_ID ?? "early_decoder_5_7";
const storyMode = process.env.STORY_MODE ?? "bitcoin_forward";
const childFirstName = process.env.CHILD_FIRST_NAME ?? "Ava";
const pronouns = process.env.PRONOUNS ?? "she/her";
const ageYears = parseIntegerEnv("AGE_YEARS", 7);
const moneyLessonKey = process.env.MONEY_LESSON_KEY ?? "jar_saving_limits";
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
const outputPathOverride = process.env.OUTPUT_PATH;
const mockRunTag = (process.env.MOCK_RUN_TAG ?? "").trim();
const keepDraft = parseBooleanEnv("KEEP_DRAFT", false);
const maxAttempts = keepDraft ? 1 : parseIntegerEnv("MAX_ATTEMPTS", 2);
const storyReadyTimeoutSeconds = parseIntegerEnv("STORY_READY_TIMEOUT_SECONDS", 30);
const supportedStoryModes = ["sound_money_implicit", "bitcoin_reveal_8020", "bitcoin_forward"];
const supportedReadingProfiles = ["read_aloud_3_4", "early_decoder_5_7", "independent_8_10"];

if (!supportedReadingProfiles.includes(readingProfileId)) {
  throw new Error(`Unsupported READING_PROFILE_ID=${readingProfileId}`);
}

if (!supportedStoryModes.includes(storyMode)) {
  throw new Error(`Unsupported STORY_MODE=${storyMode}`);
}

if (!Number.isFinite(storyReadyTimeoutSeconds) || storyReadyTimeoutSeconds <= 0) {
  throw new Error(
    `Unsupported STORY_READY_TIMEOUT_SECONDS=${process.env.STORY_READY_TIMEOUT_SECONDS ?? String(storyReadyTimeoutSeconds)}`
  );
}

if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
  throw new Error(`Unsupported MAX_ATTEMPTS=${process.env.MAX_ATTEMPTS ?? String(maxAttempts)}`);
}

if (!Number.isFinite(ageYears) || ageYears < 2 || ageYears > 12) {
  throw new Error(`Unsupported AGE_YEARS=${process.env.AGE_YEARS ?? String(ageYears)}`);
}

const ssm = new SSMClient({ region });
const cloudFormation = new CloudFormationClient({ region });

function parseBooleanEnv(name, fallback) {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`Unsupported ${name}=${process.env[name]}`);
}

function parseIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unsupported ${name}=${raw}`);
  }
  return parsed;
}

function normalizeName(name) {
  return name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1).toLowerCase() : name.toLowerCase();
}

function outputPath(timestamp) {
  if (outputPathOverride) {
    return resolve(outputPathOverride);
  }
  return resolve(".agent/artifacts/story-only", `${timestamp}-${storyMode}.md`);
}

function markdownForBook(book, orderId) {
  const lines = [
    "# Story Draft",
    "",
    `- Child: ${book.childFirstName}`,
    `- Story mode: ${book.storyMode}`,
    `- Lesson: ${book.moneyLessonKey}`,
    `- Reading profile: ${book.readingProfileId}`,
    `- Book id: ${book.bookId}`,
    `- Order id: ${orderId}`,
    `- Spread count: ${book.spreadCount}`,
    ""
  ];

  for (const page of book.pages ?? []) {
    lines.push(`## Spread ${page.spreadIndex + 1}`);
    lines.push("");
    lines.push(page.text);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function sleep(ms) {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
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

async function loadStackMetadata() {
  const stack = await cloudFormation.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = stack.Stacks?.[0]?.Outputs ?? [];
  const outputValue = (key) => outputs.find((output) => output.OutputKey === key)?.OutputValue ?? null;
  const apiBaseUrl = process.env.API_BASE_URL ?? outputValue("ApiUrl");
  const artifactBucket = outputValue("ArtifactBucketName");
  const dbClusterArn = outputValue("DbClusterArn");
  const dbSecretArn = outputValue("DbSecretArn");

  if (!apiBaseUrl) {
    throw new Error("API_BASE_URL is required or Stack Output ApiUrl must be present");
  }
  if (!artifactBucket || !dbClusterArn || !dbSecretArn) {
    throw new Error(`Missing ArtifactBucketName/DbClusterArn/DbSecretArn outputs on stack ${stackName}`);
  }

  return { apiBaseUrl, artifactBucket, dbClusterArn, dbSecretArn };
}

async function request(apiBaseUrl, path, { method = "GET", body, token, headers = {} } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function requestWithIdempotency(apiBaseUrl, path, body, token) {
  return request(apiBaseUrl, path, {
    method: "POST",
    body,
    token,
    headers: {
      "idempotency-key": randomUUID()
    }
  });
}

async function authenticate(apiBaseUrl, jwtSecret, ttlMinutes) {
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

  await requestWithIdempotency(apiBaseUrl, "/v1/auth/request-link", { email: smokeEmail });
  return requestWithIdempotency(apiBaseUrl, "/v1/auth/verify-link", { token: loginToken });
}

let localPipelineHandlerPromise = null;

async function invokePrepareStory(stackMetadata, bookId) {
  process.env.ARTIFACT_BUCKET = stackMetadata.artifactBucket;
  process.env.DB_CLUSTER_ARN = stackMetadata.dbClusterArn;
  process.env.DB_SECRET_ARN = stackMetadata.dbSecretArn;
  process.env.DB_NAME = process.env.DB_NAME ?? "bookapp";

  localPipelineHandlerPromise ??= import(new URL("../../apps/workers/dist/pipeline.js", import.meta.url).href).then(
    (module) => module.handler
  ).catch(async () =>
    import(new URL("../../apps/workers/dist/apps/workers/src/pipeline.js", import.meta.url).href).then(
      (module) => module.handler
    )
  );
  const handler = await localPipelineHandlerPromise;
  return handler({
    action: "prepare_story",
    bookId,
    mockRunTag: mockRunTag || null
  });
}

async function waitForStory(apiBaseUrl, token, bookId) {
  const timeoutAt = Date.now() + storyReadyTimeoutSeconds * 1000;
  while (Date.now() < timeoutAt) {
    const book = await request(apiBaseUrl, `/v1/books/${bookId}`, { token });
    if (Array.isArray(book.pages) && book.pages.length > 0) {
      return book;
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for /v1/books/${bookId} to expose story pages after ${storyReadyTimeoutSeconds}s`);
}

async function cleanupDraft(apiBaseUrl, token, childProfileId) {
  return request(apiBaseUrl, `/v1/child-profiles/${childProfileId}`, {
    method: "DELETE",
    token
  });
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const ssmConfig = await loadSsmConfig();
  const stackMetadata = await loadStackMetadata();
  const { apiBaseUrl } = stackMetadata;
  const jwtSecret = ssmConfig.jwt_signing_secret;
  const ttlMinutes = Number(ssmConfig.auth_link_ttl_minutes ?? "15");
  const mockProvidersEnabled =
    parseBooleanEnvFromValue(ssmConfig.enable_mock_llm, false)
    || parseBooleanEnvFromValue(ssmConfig.enable_mock_image, false);

  if (!jwtSecret) {
    throw new Error("Missing /jwt_signing_secret in SSM");
  }
  if (mockProvidersEnabled && !mockRunTag) {
    throw new Error("MOCK_RUN_TAG is required when mock LLM or image providers are enabled");
  }

  const verified = await authenticate(apiBaseUrl, jwtSecret, ttlMinutes);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let childProfileId = null;
    let cleanupError = null;
    let order = null;
    let success = false;

    try {
      order = await requestWithIdempotency(
        apiBaseUrl,
        "/v1/orders",
        {
          childFirstName,
          pronouns,
          ageYears,
          moneyLessonKey,
          storyMode,
          interestTags,
          readingProfileId,
          characterDescription
        },
        verified.token
      );
      childProfileId = order.childProfileId;

      const prepareStory = await invokePrepareStory(stackMetadata, order.bookId);
      const book = await waitForStory(apiBaseUrl, verified.token, order.bookId);
      const markdownPath = outputPath(timestamp);
      mkdirSync(dirname(markdownPath), { recursive: true });
      writeFileSync(markdownPath, markdownForBook(book, order.orderId), "utf8");

      console.log(
        `STORY_MARKDOWN_READY file=${markdownPath} order=${order.orderId} book=${order.bookId} spreads=${book.pages.length} pageCount=${prepareStory?.pageCount ?? book.pages.length} attempt=${attempt}`
      );
      if (keepDraft) {
        console.log(`STORY_DRAFT_PRESERVED childProfile=${childProfileId}`);
      }
      success = true;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(
          `STORY_MARKDOWN_RETRY attempt=${attempt} reason=${error instanceof Error ? error.message : String(error)}`
        );
      }
    } finally {
      if (!keepDraft && verified.token && childProfileId) {
        try {
          const cleanup = await cleanupDraft(apiBaseUrl, verified.token, childProfileId);
          console.log(
            `STORY_DRAFT_CLEANUP_QUEUED childProfile=${cleanup.childProfileId} privacyEventId=${cleanup.privacyEventId} queuedArtifacts=${cleanup.queuedArtifacts}`
          );
        } catch (error) {
          cleanupError = error;
        }
      }
    }

    if (cleanupError) {
      throw cleanupError;
    }
    if (success) {
      return;
    }
    if (attempt === maxAttempts && lastError) {
      throw lastError;
    }
  }
}

function parseBooleanEnvFromValue(value, fallback) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`Unsupported boolean value=${value}`);
}

main().catch((error) => {
  console.error(`FAIL story markdown: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
