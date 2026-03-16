import {
  validateBannedPhrases,
  validateBitcoinUsage,
  validateCaregiverConsistency,
  validateContinuityFacts,
  validateCountSequences,
  validateLateIntroductions,
  validateMontessoriRealism,
  validateNarrativeRatio,
  validatePageVariation,
  validateReadingProfile,
  type ReadingProfile,
  type StoryConcept,
  type StoryPackage
} from "@book/domain";

export interface QualitySummary {
  ok: boolean;
  issues: string[];
}

export function runDeterministicStoryChecks(
  profile: ReadingProfile,
  story: StoryPackage,
  concept: StoryConcept,
  enableStrictDecodableChecks = true
): QualitySummary {
  const issues: string[] = [];
  const pages = story.pages;

  const ratio = validateNarrativeRatio(pages);
  if (!ratio.ok) {
    issues.push(...ratio.issues.map((issue) => issue.message));
  }

  const banned = validateBannedPhrases(pages);
  if (!banned.ok) {
    issues.push(...banned.issues.map((issue) => issue.message));
  }

  const variation = validatePageVariation(pages);
  if (!variation.ok) {
    issues.push(...variation.issues.map((issue) => issue.message));
  }

  const counts = validateCountSequences(pages);
  if (!counts.ok) {
    issues.push(...counts.issues.map((issue) => issue.message));
  }

  const caregiver = validateCaregiverConsistency(concept, pages);
  if (!caregiver.ok) {
    issues.push(...caregiver.issues.map((issue) => issue.message));
  }

  const bitcoinUsage = validateBitcoinUsage(profile, concept, pages);
  if (!bitcoinUsage.ok) {
    issues.push(...bitcoinUsage.issues.map((issue) => issue.message));
  }

  const lateIntroductions = validateLateIntroductions(concept, pages);
  if (!lateIntroductions.ok) {
    issues.push(...lateIntroductions.issues.map((issue) => issue.message));
  }

  const continuity = validateContinuityFacts(story);
  if (!continuity.ok) {
    issues.push(...continuity.issues.map((issue) => issue.message));
  }

  if (enableStrictDecodableChecks) {
    const reading = validateReadingProfile(profile, pages);
    if (!reading.ok) {
      issues.push(...reading.issues.map((issue) => issue.message));
    }
  }

  const realism = validateMontessoriRealism(profile, pages);
  if (!realism.ok) {
    issues.push(...realism.issues.map((issue) => issue.message));
  }

  return { ok: issues.length === 0, issues };
}
