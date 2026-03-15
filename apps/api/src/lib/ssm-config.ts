import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import { z } from "zod";
import { getOperationalEnv } from "./env.js";
import { redactText } from "./log-redaction.js";

export interface RuntimeSecrets {
  sendgridApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  jwtSigningSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
}

export interface RuntimeConfig {
  secrets: RuntimeSecrets;
  sendgridFromEmail: string;
  authLinkTtlMinutes: number;
  webBaseUrl: string;
  reviewerEmailAllowlist: string[];
  models: {
    openaiJson: string;
    openaiVision: string;
    openaiImage: string;
    anthropicWriter: string;
  };
  stripe: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  };
  featureFlags: {
    enableMockLlm: boolean;
    enableMockImage: boolean;
    enableMockCheckout: boolean;
    enablePictureBookPipeline: boolean;
    enableIndependent8To10: boolean;
  };
}

const ssm = new SSMClient({});
const reviewerEmailAllowlistUnsetSentinel = "__unset__";

const runtimeConfigSchema = z.object({
  secrets: z.object({
    sendgridApiKey: z.string().min(1),
    openaiApiKey: z.string().min(1),
    anthropicApiKey: z.string().min(1),
    jwtSigningSecret: z.string().min(32),
    stripeSecretKey: z.string().min(1),
    stripeWebhookSecret: z.string().min(1)
  }),
  sendgridFromEmail: z.string().email(),
  authLinkTtlMinutes: z.number().int().positive(),
  webBaseUrl: z.string().url(),
  reviewerEmailAllowlist: z.array(z.string().email()),
  models: z.object({
    openaiJson: z.string().min(1),
    openaiVision: z.string().min(1),
    openaiImage: z.string().min(1),
    anthropicWriter: z.string().min(1)
  }),
  stripe: z.object({
    priceId: z.string().min(1),
    successUrl: z.string().url(),
    cancelUrl: z.string().url()
  }),
  featureFlags: z.object({
    enableMockLlm: z.boolean(),
    enableMockImage: z.boolean(),
    enableMockCheckout: z.boolean(),
    enablePictureBookPipeline: z.boolean(),
    enableIndependent8To10: z.boolean()
  })
});

let cachedConfig: { value: RuntimeConfig; expiresAt: number } | null = null;
let inFlightLoad: Promise<RuntimeConfig> | null = null;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function normalizeName(name: string, prefix: string): string {
  if (name.startsWith(`${prefix}/`)) {
    return name.slice(prefix.length + 1).toLowerCase();
  }

  return name.toLowerCase();
}

async function loadByPath(prefix: string): Promise<Record<string, string>> {
  let nextToken: string | undefined;
  const byName: Record<string, string> = {};

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

      byName[normalizeName(parameter.Name, prefix)] = parameter.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return byName;
}

function requiredParam(byName: Record<string, string>, key: string): string {
  const value = byName[key];
  if (!value) {
    throw new Error(`Missing required SSM parameter: ${key}`);
  }

  return value;
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const operational = getOperationalEnv();
  const byName = await loadByPath(operational.SSM_PREFIX);

  const parsed = runtimeConfigSchema.parse({
    secrets: {
      sendgridApiKey: requiredParam(byName, "sendgrid_api_key"),
      openaiApiKey: requiredParam(byName, "openai_api_key"),
      anthropicApiKey: requiredParam(byName, "anthropic_api_key"),
      jwtSigningSecret: requiredParam(byName, "jwt_signing_secret"),
      stripeSecretKey: requiredParam(byName, "stripe_secret_key"),
      stripeWebhookSecret: requiredParam(byName, "stripe_webhook_secret")
    },
    sendgridFromEmail: requiredParam(byName, "sendgrid_from_email"),
    authLinkTtlMinutes: Number(byName.auth_link_ttl_minutes ?? operational.AUTH_LINK_TTL_MINUTES),
    webBaseUrl: byName.web_base_url ?? operational.WEB_BASE_URL,
    reviewerEmailAllowlist: (byName.reviewer_email_allowlist ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => Boolean(email) && email !== reviewerEmailAllowlistUnsetSentinel),
    models: {
      openaiJson: byName.openai_model_json ?? "gpt-5-mini-2025-08-07",
      openaiVision: byName.openai_model_vision ?? "gpt-5-mini-2025-08-07",
      openaiImage: byName.openai_model_image ?? "gpt-image-1.5",
      anthropicWriter: byName.anthropic_model_writer ?? "claude-sonnet-4-5"
    },
    stripe: {
      priceId: requiredParam(byName, "stripe_price_id"),
      successUrl: requiredParam(byName, "stripe_success_url"),
      cancelUrl: requiredParam(byName, "stripe_cancel_url")
    },
    featureFlags: {
      enableMockLlm: parseBool(byName.enable_mock_llm, false),
      enableMockImage: parseBool(byName.enable_mock_image, false),
      enableMockCheckout: parseBool(byName.enable_mock_checkout, false),
      enablePictureBookPipeline: parseBool(byName.enable_picture_book_pipeline, false),
      enableIndependent8To10: parseBool(byName.enable_independent_8_to_10, false)
    }
  });

  return parsed;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const operational = getOperationalEnv();
  const now = Date.now();

  if (cachedConfig && now < cachedConfig.expiresAt) {
    return cachedConfig.value;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  inFlightLoad = loadRuntimeConfig()
    .then((config) => {
      cachedConfig = {
        value: config,
        expiresAt: Date.now() + operational.RUNTIME_CONFIG_CACHE_TTL_SECONDS * 1000
      };
      return config;
    })
    .catch((error) => {
      console.error("SSM_CONFIG_LOAD_FAILURE", {
        appEnv: operational.APP_ENV,
        ssmPrefix: operational.SSM_PREFIX,
        message: redactText(error instanceof Error ? error.message : String(error))
      });
      throw error;
    })
    .finally(() => {
      inFlightLoad = null;
    });

  return inFlightLoad;
}

export function clearRuntimeConfigCache(): void {
  cachedConfig = null;
  inFlightLoad = null;
}
