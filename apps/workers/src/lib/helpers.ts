import { randomUUID } from "node:crypto";

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

export function logStructured(event: string, context: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      ...context
    })
  );
}
