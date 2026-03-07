export function isReviewerEmailAllowed(email: string, allowlist: string[]): boolean {
  return allowlist.includes(email.trim().toLowerCase());
}
