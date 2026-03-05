import { z } from "zod";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }

  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

const operationalEnvSchema = z.object({
  APP_ENV: z.string().default("dev"),
  AWS_REGION: z.string().default("us-east-1"),
  SSM_PREFIX: z.string().default("/ai-childrens-book/dev"),
  RUNTIME_CONFIG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
  ENABLE_MOCK_CHECKOUT: z.string().optional()
});

export type ApiOperationalEnv = z.infer<typeof operationalEnvSchema> & {
  enableMockCheckout: boolean;
};

let cachedOperationalEnv: ApiOperationalEnv | null = null;

export function getOperationalEnv(): ApiOperationalEnv {
  if (cachedOperationalEnv) {
    return cachedOperationalEnv;
  }

  const parsed = operationalEnvSchema.parse(process.env);
  cachedOperationalEnv = {
    ...parsed,
    enableMockCheckout: boolEnv("ENABLE_MOCK_CHECKOUT", true)
  };

  return cachedOperationalEnv;
}

export function clearOperationalEnvCache(): void {
  cachedOperationalEnv = null;
}
