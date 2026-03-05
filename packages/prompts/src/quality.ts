import { validateBannedPhrases, validateNarrativeRatio, validateReadingProfile, type StoryPage, type ReadingProfile } from "@book/domain";

export interface QualitySummary {
  ok: boolean;
  issues: string[];
}

export function runDeterministicStoryChecks(
  profile: ReadingProfile,
  pages: StoryPage[],
  enableStrictDecodableChecks = true
): QualitySummary {
  const issues: string[] = [];

  const ratio = validateNarrativeRatio(pages);
  if (!ratio.ok) {
    issues.push(...ratio.issues.map((issue) => issue.message));
  }

  const banned = validateBannedPhrases(pages);
  if (!banned.ok) {
    issues.push(...banned.issues.map((issue) => issue.message));
  }

  if (enableStrictDecodableChecks) {
    const reading = validateReadingProfile(profile, pages);
    if (!reading.ok) {
      issues.push(...reading.issues.map((issue) => issue.message));
    }
  }

  return { ok: issues.length === 0, issues };
}
