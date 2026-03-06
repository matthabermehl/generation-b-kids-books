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
const defaultHighScoreThreshold = 0.65;
const defaultRatioMin = 0.15;
const defaultRatioMax = 0.3;

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

export interface BitcoinBeatTargets {
  highScoreThreshold: number;
  ratioMin: number;
  ratioMax: number;
  minHighBeats: number;
  maxHighBeats: number;
  allowedHighStartIndex: number;
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

export function computeBitcoinBeatTargets(
  pageCount: number,
  highScoreThreshold = defaultHighScoreThreshold,
  ratioMin = defaultRatioMin,
  ratioMax = defaultRatioMax
): BitcoinBeatTargets {
  if (pageCount <= 0) {
    return {
      highScoreThreshold,
      ratioMin,
      ratioMax,
      minHighBeats: 0,
      maxHighBeats: 0,
      allowedHighStartIndex: 0
    };
  }

  const minHighBeats = Math.ceil(pageCount * ratioMin);
  const maxFromRatio = Math.floor(pageCount * ratioMax);
  const maxHighBeats = Math.min(pageCount, Math.max(minHighBeats, maxFromRatio));

  return {
    highScoreThreshold,
    ratioMin,
    ratioMax,
    minHighBeats,
    maxHighBeats,
    allowedHighStartIndex: Math.floor(pageCount * 0.7)
  };
}

export function runDeterministicBeatChecks(
  context: BeatValidationContext,
  beatSheet: BeatSheet
): BeatDeterministicSummary {
  const issues: BeatDeterministicIssue[] = [];
  const beats = beatSheet.beats;
  const bitcoinTargets = computeBitcoinBeatTargets(context.pageCount);

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
    .filter((entry) => entry.score >= bitcoinTargets.highScoreThreshold)
    .map((entry) => entry.index);

  const bitcoinRatio = beats.length === 0 ? 0 : bitcoinBeatIndexes.length / beats.length;
  if (bitcoinRatio < bitcoinTargets.ratioMin || bitcoinRatio > bitcoinTargets.ratioMax) {
    issues.push({
      code: "BITCOIN_RATIO",
      message: `Bitcoin beat ratio ${bitcoinRatio.toFixed(2)} must be between ${bitcoinTargets.ratioMin.toFixed(2)} and ${bitcoinTargets.ratioMax.toFixed(2)}. High-score beats: ${bitcoinBeatIndexes.length}, required: ${bitcoinTargets.minHighBeats}-${bitcoinTargets.maxHighBeats} at score >= ${bitcoinTargets.highScoreThreshold}.`,
      details: {
        highScoreThreshold: bitcoinTargets.highScoreThreshold,
        ratioMin: bitcoinTargets.ratioMin,
        ratioMax: bitcoinTargets.ratioMax,
        highBeatIndexes: bitcoinBeatIndexes,
        highBeatCount: bitcoinBeatIndexes.length,
        requiredMinHighBeats: bitcoinTargets.minHighBeats,
        requiredMaxHighBeats: bitcoinTargets.maxHighBeats
      }
    });
  }

  bitcoinBeatIndexes.forEach((index) => {
    if (index < bitcoinTargets.allowedHighStartIndex) {
      issues.push({
        code: "BITCOIN_POSITION",
        beatIndex: index,
        message: `High bitcoin relevance beats must be in the final 30% of the arc (index >= ${bitcoinTargets.allowedHighStartIndex}).`,
        details: {
          beatIndex: index,
          allowedHighStartIndex: bitcoinTargets.allowedHighStartIndex,
          highScoreThreshold: bitcoinTargets.highScoreThreshold
        }
      });
    }
  });

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

      const taughtWordTooEarly = beat.newWordsIntroduced.some((word) => {
        const lowered = word.toLowerCase();
        return taughtWords.some((taughtWord) => includesSignal(lowered, taughtWord));
      });

      const finalTwentyPercentIndex = Math.floor(beats.length * 0.8);
      if (taughtWordTooEarly && index < finalTwentyPercentIndex) {
        issues.push({
          code: "TAUGHT_WORD_POSITION",
          beatIndex: index,
          message: `Taught words like Bitcoin must appear only in the final 20% of beats (index >= ${finalTwentyPercentIndex}).`,
          details: {
            beatIndex: index,
            finalTwentyPercentIndex
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
