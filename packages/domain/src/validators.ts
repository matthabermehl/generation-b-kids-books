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

function normalizePageTemplate(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  const unionSize = left.size + right.size - overlap;
  return unionSize === 0 ? 0 : overlap / unionSize;
}

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

export function validatePageVariation(pages: StoryPage[]): ValidationResult {
  if (pages.length < 4) {
    return { ok: true, issues: [] };
  }

  const issues: ValidationIssue[] = [];
  const maxClusterSize = Math.max(2, Math.floor(pages.length * 0.4));

  const templateCounts = new Map<string, number>();
  const templates = pages.map((page) => normalizePageTemplate(page.pageText));
  for (const template of templates) {
    templateCounts.set(template, (templateCounts.get(template) ?? 0) + 1);
  }

  const duplicated = Array.from(templateCounts.entries()).find(([, count]) => count > maxClusterSize);
  if (duplicated) {
    issues.push({
      code: "LOW_VARIATION_TEMPLATE",
      message: `Too many pages share near-identical text (${duplicated[1]} pages, limit ${maxClusterSize}).`
    });
  }

  const tokenSets = templates.map((template) => new Set(template.split(" ").filter(Boolean)));
  for (let i = 0; i < tokenSets.length; i += 1) {
    let similarCount = 1;
    for (let j = 0; j < tokenSets.length; j += 1) {
      if (i === j) {
        continue;
      }
      if (jaccardSimilarity(tokenSets[i], tokenSets[j]) >= 0.9) {
        similarCount += 1;
      }
    }

    if (similarCount > maxClusterSize) {
      issues.push({
        code: "LOW_VARIATION_CLUSTER",
        message: `Pages contain a high-similarity text cluster (${similarCount} pages, limit ${maxClusterSize}).`
      });
      break;
    }
  }

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
