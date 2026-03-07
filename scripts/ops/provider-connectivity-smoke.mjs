#!/usr/bin/env node
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const prefix = process.env.SSM_PREFIX ?? "/ai-childrens-book/dev";
const region = process.env.AWS_REGION ?? "us-east-1";

const ssm = new SSMClient({ region });

function normalizeName(name) {
  return name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1).toLowerCase() : name.toLowerCase();
}

async function loadSsmParams() {
  let nextToken;
  const params = {};

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
      params[normalizeName(parameter.Name)] = parameter.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return params;
}

async function checkOpenAi(config) {
  const model = config.openai_model_json ?? "gpt-5-mini-2025-08-07";
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${config.openai_api_key}`
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    detail: response.ok ? `model=${model}` : await response.text()
  };
}

async function checkAnthropic(config) {
  const model = config.anthropic_model_writer ?? "claude-sonnet-4-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropic_api_key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Return JSON: {\"ok\":true}" }]
    })
  });

  return {
    ok: response.ok,
    status: response.status,
    detail: response.ok ? `model=${model}` : await response.text()
  };
}

async function checkFal(config) {
  const endpoint = config.fal_endpoint_general ?? config.fal_endpoint_base ?? "fal-ai/flux-general";
  const response = await fetch(`https://queue.fal.run/${endpoint}/requests/nonexistent/status`, {
    headers: {
      Authorization: `Key ${config.fal_key}`
    }
  });

  const ok = response.ok || response.status === 404;
  return {
    ok,
    status: response.status,
    detail: ok ? `endpoint=${endpoint}` : await response.text()
  };
}

async function checkSendGrid(config) {
  const response = await fetch("https://api.sendgrid.com/v3/scopes", {
    headers: {
      Authorization: `Bearer ${config.sendgrid_api_key}`
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    detail: response.ok ? `from=${config.sendgrid_from_email ?? "unknown"}` : await response.text()
  };
}

async function checkStripe(config) {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: {
      Authorization: `Bearer ${config.stripe_secret_key}`
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    detail: response.ok ? "stripe account reachable" : await response.text()
  };
}

function assertRequired(config, key) {
  if (!config[key]) {
    throw new Error(`Missing required SSM key: ${key}`);
  }
}

async function main() {
  const config = await loadSsmParams();
  ["openai_api_key", "anthropic_api_key", "fal_key", "sendgrid_api_key", "stripe_secret_key"].forEach((key) =>
    assertRequired(config, key)
  );

  const checks = [
    ["openai", () => checkOpenAi(config)],
    ["anthropic", () => checkAnthropic(config)],
    ["fal", () => checkFal(config)],
    ["sendgrid", () => checkSendGrid(config)],
    ["stripe", () => checkStripe(config)]
  ];

  let failed = false;
  for (const [name, run] of checks) {
    const result = await run();
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`${status} ${name} status=${result.status} detail=${String(result.detail).slice(0, 180)}`);
    if (!result.ok) {
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL connectivity: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
