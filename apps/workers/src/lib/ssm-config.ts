import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import { z } from "zod";
import { parseBoolean, redactText } from "./helpers.js";

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
  sendgridFromEmail: string;
  webBaseUrl: string;
}

const ssm = new SSMClient({});

const operationalEnvSchema = z.object({
  APP_ENV: z.string().default("dev"),
  SSM_PREFIX: z.string().default("/ai-childrens-book/dev"),
  RUNTIME_CONFIG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300)
});

const runtimeConfigSchema = z.object({
  secrets: z.object({
    sendgridApiKey: z.string().min(1),
    openaiApiKey: z.string().min(1),
    anthropicApiKey: z.string().min(1),
    jwtSigningSecret: z.string().min(32),
    stripeSecretKey: z.string().min(1),
    stripeWebhookSecret: z.string().min(1)
  }),
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
  }),
  sendgridFromEmail: z.string().email(),
  webBaseUrl: z.string().url()
});

let cachedConfig: { value: RuntimeConfig; expiresAt: number } | null = null;
let inFlightLoad: Promise<RuntimeConfig> | null = null;

function normalizeName(name: string, prefix: string): string {
  if (name.startsWith(`${prefix}/`)) {
    return name.slice(prefix.length + 1).toLowerCase();
  }

  return name.toLowerCase();
}

function requiredParam(byName: Record<string, string>, key: string): string {
  const value = byName[key];
  if (!value) {
    throw new Error(`Missing required SSM parameter: ${key}`);
  }

  return value;
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

async function loadRuntimeConfigFromSsm(): Promise<RuntimeConfig> {
  const env = operationalEnvSchema.parse(process.env);
  const byName = await loadByPath(env.SSM_PREFIX);

  const config = runtimeConfigSchema.parse({
    secrets: {
      sendgridApiKey: requiredParam(byName, "sendgrid_api_key"),
      openaiApiKey: requiredParam(byName, "openai_api_key"),
      anthropicApiKey: requiredParam(byName, "anthropic_api_key"),
      jwtSigningSecret: requiredParam(byName, "jwt_signing_secret"),
      stripeSecretKey: requiredParam(byName, "stripe_secret_key"),
      stripeWebhookSecret: requiredParam(byName, "stripe_webhook_secret")
    },
    models: {
      openaiJson: byName.openai_model_json ?? "gpt-5-mini-2025-08-07",
      openaiVision: byName.openai_model_vision ?? "gpt-5-mini-2025-08-07",
      openaiImage: byName.openai_model_image ?? "gpt-image-1-mini",
      anthropicWriter: byName.anthropic_model_writer ?? "claude-sonnet-4-5"
    },
    stripe: {
      priceId: requiredParam(byName, "stripe_price_id"),
      successUrl: requiredParam(byName, "stripe_success_url"),
      cancelUrl: requiredParam(byName, "stripe_cancel_url")
    },
    featureFlags: {
      enableMockLlm: parseBoolean(byName.enable_mock_llm, false),
      enableMockImage: parseBoolean(byName.enable_mock_image, false),
      enableMockCheckout: parseBoolean(byName.enable_mock_checkout, false),
      enablePictureBookPipeline: parseBoolean(byName.enable_picture_book_pipeline, false),
      enableIndependent8To10: parseBoolean(byName.enable_independent_8_to_10, false)
    },
    sendgridFromEmail: requiredParam(byName, "sendgrid_from_email"),
    webBaseUrl: requiredParam(byName, "web_base_url")
  });

  return config;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const env = operationalEnvSchema.parse(process.env);
  const now = Date.now();

  if (cachedConfig && now < cachedConfig.expiresAt) {
    return cachedConfig.value;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  inFlightLoad = loadRuntimeConfigFromSsm()
    .then((config) => {
      cachedConfig = {
        value: config,
        expiresAt: Date.now() + env.RUNTIME_CONFIG_CACHE_TTL_SECONDS * 1000
      };
      return config;
    })
    .catch((error) => {
      console.error("SSM_CONFIG_LOAD_FAILURE", {
        appEnv: env.APP_ENV,
        ssmPrefix: env.SSM_PREFIX,
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
