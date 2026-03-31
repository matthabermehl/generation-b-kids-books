import {
  type StoryCriticIssueSeverity,
  type StoryCriticIssueType,
  type StoryCriticRewriteTarget,
  type StoryPage,
  type ValidationIssue,
  validateBannedPhrases,
  validateBitcoinStoryTitle,
  validateBitcoinUsage,
  validateCaregiverConsistency,
  validateContinuityFacts,
  validateCountSequences,
  validateLateIntroductions,
  validateMontessoriRealism,
  validateNarrativeRatio,
  validatePageVariation,
  validateReadingProfile,
  validateStoryTone,
  type ReadingProfile,
  type StoryConcept,
  type StoryPackage
} from "@book/domain";

export interface DeterministicStoryIssue {
  pageStart: number;
  pageEnd: number;
  issueType: StoryCriticIssueType;
  severity: StoryCriticIssueSeverity;
  rewriteTarget: StoryCriticRewriteTarget;
  message: string;
}

export interface QualitySummary {
  ok: boolean;
  issues: DeterministicStoryIssue[];
}

function wholeStoryRange(pages: StoryPage[]): { pageStart: number; pageEnd: number } {
  return {
    pageStart: 0,
    pageEnd: Math.max(0, pages.length - 1)
  };
}

function validationIssueRange(
  issue: ValidationIssue,
  pages: StoryPage[]
): { pageStart: number; pageEnd: number } {
  if (typeof issue.pageStart === "number" || typeof issue.pageEnd === "number") {
    const pageStart = issue.pageStart ?? issue.pageEnd ?? 0;
    const pageEnd = issue.pageEnd ?? issue.pageStart ?? pageStart;
    return { pageStart, pageEnd };
  }

  const rangeMatch = issue.message.match(/pages?\s+(\d+)(?:-(\d+))?/i);
  if (rangeMatch) {
    const pageStart = Number(rangeMatch[1] ?? 0);
    const pageEnd = Number(rangeMatch[2] ?? rangeMatch[1] ?? 0);
    return { pageStart, pageEnd };
  }

  return wholeStoryRange(pages);
}

function deterministicIssue(
  pages: StoryPage[],
  issueType: StoryCriticIssueType,
  rewriteTarget: StoryCriticRewriteTarget,
  message: string,
  range: { pageStart: number; pageEnd: number },
  severity: StoryCriticIssueSeverity = "hard"
): DeterministicStoryIssue {
  return {
    pageStart: range.pageStart,
    pageEnd: range.pageEnd,
    issueType,
    severity,
    rewriteTarget,
    message
  };
}

function fromValidationIssue(
  pages: StoryPage[],
  issue: ValidationIssue,
  issueType: StoryCriticIssueType,
  rewriteTarget: StoryCriticRewriteTarget = "page"
): DeterministicStoryIssue {
  return deterministicIssue(pages, issueType, rewriteTarget, issue.message, validationIssueRange(issue, pages));
}

export function runDeterministicStoryChecks(
  profile: ReadingProfile,
  story: StoryPackage,
  concept: StoryConcept,
  enableStrictDecodableChecks = true
): QualitySummary {
  const issues: DeterministicStoryIssue[] = [];
  const pages = story.pages;
  const fullStoryRange = wholeStoryRange(pages);

  const ratio = validateNarrativeRatio(pages);
  if (!ratio.ok) {
    issues.push(...ratio.issues.map((issue) => fromValidationIssue(pages, issue, "theme_integration")));
  }

  const banned = validateBannedPhrases(pages);
  if (!banned.ok) {
    issues.push(...banned.issues.map((issue) => fromValidationIssue(pages, issue, "bitcoin_fit")));
  }

  const variation = validatePageVariation(pages);
  if (!variation.ok) {
    issues.push(...variation.issues.map((issue) => fromValidationIssue(pages, issue, "theme_integration")));
  }

  const counts = validateCountSequences(pages);
  if (!counts.ok) {
    issues.push(...counts.issues.map((issue) => fromValidationIssue(pages, issue, "count_sequence")));
  }

  const caregiver = validateCaregiverConsistency(concept, pages);
  if (!caregiver.ok) {
    issues.push(...caregiver.issues.map((issue) => fromValidationIssue(pages, issue, "caregiver_consistency")));
  }

  const title = validateBitcoinStoryTitle(profile, concept, story.title, pages.length);
  if (!title.ok) {
    issues.push(...title.issues.map((issue) => fromValidationIssue(pages, issue, "theme_integration")));
  }

  const bitcoinUsage = validateBitcoinUsage(profile, concept, pages);
  if (!bitcoinUsage.ok) {
    issues.push(
      ...bitcoinUsage.issues.map((issue) =>
        fromValidationIssue(
          pages,
          issue,
          issue.code === "BITCOIN_USAGE" ? "theme_integration" : "bitcoin_fit"
        )
      )
    );
  }

  const lateIntroductions = validateLateIntroductions(concept, pages);
  if (!lateIntroductions.ok) {
    issues.push(...lateIntroductions.issues.map((issue) => fromValidationIssue(pages, issue, "setup_payoff", "beat")));
  }

  const continuity = validateContinuityFacts(story);
  if (!continuity.ok) {
    issues.push(...continuity.issues.map((issue) => fromValidationIssue(pages, issue, "action_continuity")));
  }

  if (enableStrictDecodableChecks) {
    const reading = validateReadingProfile(profile, pages);
    if (!reading.ok) {
      issues.push(...reading.issues.map((issue) => fromValidationIssue(pages, issue, "reading_level")));
    }
  }

  const realism = validateMontessoriRealism(profile, pages);
  if (!realism.ok) {
    issues.push(...realism.issues.map((issue) => fromValidationIssue(pages, issue, "age_plausibility")));
  }

  const tone = validateStoryTone(profile, concept, pages);
  if (!tone.ok) {
    issues.push(
      ...tone.issues.map((issue) =>
        fromValidationIssue(
          pages,
          issue,
          issue.code === "ENDING_EMOTION" ? "ending_emotion" : "emotional_tone"
        )
      )
    );
  }

  return { ok: issues.length === 0, issues };
}
