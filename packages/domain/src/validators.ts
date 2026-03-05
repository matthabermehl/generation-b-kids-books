import { type ReadingProfile } from "./enums.js";
import type { StoryPage } from "./types.js";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const bannedPhrases = ["get rich", "guaranteed returns", "risk-free gains"];
const montessoriFantasyTerms = [
  "dragon",
  "wizard",
  "fairy",
  "spell",
  "enchanted",
  "unicorn",
  "magic wand",
  "sorcerer"
];

export function validateNarrativeRatio(pages: StoryPage[]): ValidationResult {
  if (pages.length < 4) {
    return {
      ok: false,
      issues: [{ code: "TOO_SHORT", message: "Story must have at least 4 pages." }]
    };
  }

  const mentionIndexes = pages
    .map((page) => page.pageText.toLowerCase().includes("bitcoin"))
    .flatMap((isMentioned, idx) => (isMentioned ? [idx] : []));

  const threshold = Math.floor(pages.length * 0.8);
  const badMention = mentionIndexes.find((idx) => idx < threshold - 1);

  if (badMention !== undefined) {
    return {
      ok: false,
      issues: [{ code: "RATIO_FAIL", message: "Bitcoin appears too early in the story arc." }]
    };
  }

  return { ok: true, issues: [] };
}

export function validateBannedPhrases(pages: StoryPage[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  pages.forEach((page) => {
    const text = page.pageText.toLowerCase();
    bannedPhrases.forEach((phrase) => {
      if (text.includes(phrase)) {
        issues.push({
          code: "BANNED_PHRASE",
          message: `Page ${page.pageIndex} contains banned phrase: ${phrase}`
        });
      }
    });
  });

  return { ok: issues.length === 0, issues };
}

export function validateReadingProfile(
  profile: ReadingProfile,
  pages: StoryPage[]
): ValidationResult {
  const issues: ValidationIssue[] = [];

  pages.forEach((page) => {
    const sentenceCount = page.pageText.split(/[.!?]/).filter(Boolean).length;
    const words = page.pageText.trim().split(/\s+/).filter(Boolean);

    if (profile === "read_aloud_3_4" && sentenceCount > 4) {
      issues.push({
        code: "SENTENCE_COUNT",
        message: `Page ${page.pageIndex} exceeds read-aloud sentence budget.`
      });
    }

    if (profile === "early_decoder_5_7" && words.length > 45) {
      issues.push({
        code: "WORD_COUNT",
        message: `Page ${page.pageIndex} exceeds early decoder word budget.`
      });
    }

    if (profile === "early_decoder_5_7") {
      const hardWords = words.filter((word) => /[^a-zA-Z'-]/.test(word) || word.length > 10);
      if (hardWords.length > 5) {
        issues.push({
          code: "DECODABILITY",
          message: `Page ${page.pageIndex} likely exceeds decodability limits.`
        });
      }
    }
  });

  return { ok: issues.length === 0, issues };
}

export function validateMontessoriRealism(profile: ReadingProfile, pages: StoryPage[]): ValidationResult {
  if (profile !== "read_aloud_3_4") {
    return { ok: true, issues: [] };
  }

  const issues: ValidationIssue[] = [];
  pages.forEach((page) => {
    const lowered = page.pageText.toLowerCase();
    const flagged = montessoriFantasyTerms.find((term) => lowered.includes(term));
    if (flagged) {
      issues.push({
        code: "MONTESSORI_REALISM",
        message: `Page ${page.pageIndex} includes fantasy term not aligned to Montessori realism: ${flagged}`
      });
    }
  });

  return { ok: issues.length === 0, issues };
}
