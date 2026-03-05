import { randomUUID } from "node:crypto";

const sensitiveKeyPattern = /(authorization|api[-_]?key|secret|token|password|signature|jwt|credential)/i;
const sensitiveValuePatterns: RegExp[] = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g,
  /\bSG\.[A-Za-z0-9._-]+\b/g,
  /\b(?:Bearer|Key)\s+[A-Za-z0-9._-]+\b/g
];

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
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

export function boolFromEnv(name: string, fallback: boolean): boolean {
  return parseBoolean(process.env[name], fallback);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(): string {
  return randomUUID();
}

export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function fileExtensionForContentType(contentType: string): string {
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  if (contentType.includes("svg")) {
    return "svg";
  }

  return "bin";
}

export function redactText(value: string): string {
  return sensitiveValuePatterns.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), value);
}

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLog(entry));
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitizeForLog(entry);
    }
    return redacted;
  }

  return value;
}

export function logStructured(event: string, context: Record<string, unknown>): void {
  const safeContext = sanitizeForLog(context) as Record<string, unknown>;
  console.log(
    JSON.stringify({
      event,
      ...safeContext
    })
  );
}
