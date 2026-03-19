import type { BeatSheet, ReadingProfile } from "@book/domain";

const fantasyTerms = [
  "dragon",
  "wizard",
  "fairy",
  "spell",
  "enchanted",
  "unicorn",
  "magic",
  "sorcerer"
];

const taughtWords = ["bitcoin"];
const defaultThemeThreshold = 0.35;

export interface BeatDeterministicIssue {
  code: string;
  message: string;
  beatIndex?: number;
  details?: Record<string, number | number[] | string>;
}

export interface BeatDeterministicSummary {
  ok: boolean;
  issues: BeatDeterministicIssue[];
}

export interface BeatValidationContext {
  profile: ReadingProfile;
  ageYears: number;
  pageCount: number;
}

function includesSignal(value: string, signal: string): boolean {
  return value.toLowerCase().includes(signal.toLowerCase());
}

function isEarlyReader(profile: ReadingProfile, ageYears: number): boolean {
  return profile === "early_decoder_5_7" || (ageYears >= 5 && ageYears <= 7);
}

function requiresMontessoriRealism(profile: ReadingProfile, ageYears: number): boolean {
  return profile === "read_aloud_3_4" || ageYears < 6;
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[\s-]+/g, "_");
}

function hasRequiredDecodabilityTag(tags: string[]): boolean {
  return tags.some((tag) => {
    const normalized = normalizeTag(tag);
    return (
      normalized.includes("controlled_vocab") ||
      normalized.includes("repetition") ||
      normalized.includes("taught_words")
    );
  });
}

export function runDeterministicBeatChecks(
  context: BeatValidationContext,
  beatSheet: BeatSheet
): BeatDeterministicSummary {
  const issues: BeatDeterministicIssue[] = [];
  const beats = beatSheet.beats;

  if (beats.length !== context.pageCount) {
    issues.push({
      code: "BEAT_COUNT",
      message: `Beat count ${beats.length} must equal pageCount ${context.pageCount}.`,
      details: {
        actualBeatCount: beats.length,
        expectedBeatCount: context.pageCount
      }
    });
  }

  const bitcoinBeatIndexes = beats
    .map((beat, index) => ({ index, score: beat.bitcoinRelevanceScore }))
    .filter((entry) => entry.score >= defaultThemeThreshold)
    .map((entry) => entry.index);

  if (bitcoinBeatIndexes.length === 0) {
    issues.push({
      code: "BITCOIN_THEME_INTEGRATION",
      message: `At least one beat must use bitcoinRelevanceScore >= ${defaultThemeThreshold} to show Bitcoin positively supporting the story theme.`,
      details: {
        highBeatIndexes: bitcoinBeatIndexes,
        highBeatCount: bitcoinBeatIndexes.length,
        requiredThreshold: defaultThemeThreshold
      }
    });
  }

  if (requiresMontessoriRealism(context.profile, context.ageYears)) {
    beats.forEach((beat, index) => {
      const content = `${beat.conflict} ${beat.sceneLocation}`.toLowerCase();
      const flagged = fantasyTerms.find((term) => content.includes(term));
      if (flagged) {
        issues.push({
          code: "MONTESSORI_REALISM",
          beatIndex: index,
          message: `Beat includes fantasy framing not allowed for this profile: ${flagged}.`
        });
      }
    });
  }

  if (isEarlyReader(context.profile, context.ageYears)) {
    beats.forEach((beat, index) => {
      if (beat.newWordsIntroduced.length > 2) {
        issues.push({
          code: "EARLY_READER_WORD_BUDGET",
          beatIndex: index,
          message: "Early-reader beats must introduce at most 2 new words."
        });
      }

      if (!hasRequiredDecodabilityTag(beat.decodabilityTags)) {
        issues.push({
          code: "DECODABILITY_TAG",
          beatIndex: index,
          message:
            "Beat must include canonical decodability tags: controlled_vocab, repetition, or taught_words.",
          details: {
            beatIndex: index
          }
        });
      }

      const bitcoinAsChildWord = beat.newWordsIntroduced.some((word) => {
        const lowered = word.toLowerCase();
        return taughtWords.some((taughtWord) => includesSignal(lowered, taughtWord));
      });

      if (bitcoinAsChildWord) {
        issues.push({
          code: "BITCOIN_CHILD_LANGUAGE",
          beatIndex: index,
          message: "Bitcoin may not appear in newWordsIntroduced for child-facing reading instruction.",
          details: {
            beatIndex: index
          }
        });
      }
    });
  }

  return {
    ok: issues.length === 0,
    issues
  };
}
