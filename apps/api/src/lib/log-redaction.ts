const sensitiveKeyPattern = /(authorization|api[-_]?key|secret|token|password|signature|jwt|credential)/i;
const sensitiveValuePatterns: RegExp[] = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g,
  /\bSG\.[A-Za-z0-9._-]+\b/g,
  /\b(?:Bearer|Key)\s+[A-Za-z0-9._-]+\b/g
];

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
