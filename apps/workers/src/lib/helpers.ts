import { randomUUID } from "node:crypto";

export function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
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
