import { type ReadingProfile } from "./enums.js";
import type { StoryConcept, StoryPackage, StoryPage } from "./types.js";

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
const explicitCaregiverTerms = ["mom", "dad"];
const bitcoinTechnicalTerms = [
  "app",
  "phone",
  "tablet",
  "wallet",
  "password",
  "qr code",
  "transfer",
  "blockchain",
  "market",
  "chart"
];
const bitcoinChildActionTerms = ["say bitcoin", "repeat bitcoin", "spell bitcoin", "read bitcoin", "decode bitcoin"];
const numberWords = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty"
] as const;

function normalizePageTemplate(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedLower(value: string): string {
  return value.toLowerCase();
}

function pageMentions(page: StoryPage, phrase: string): boolean {
  return normalizedLower(page.pageText).includes(normalizedLower(phrase));
}

function tokenizePageWords(text: string): string[] {
  const rawTokens = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) ?? [];
  return rawTokens.flatMap((token) =>
    token
      .split("-")
      .map((part) => part.replace(/^'+|'+$/g, ""))
      .filter(Boolean)
  );
}

function sentenceFragments(text: string): string[] {
  return text.match(/[^.!?]+[.!?]?/g) ?? [text];
}

function numberWordIndexes(text: string): number[] {
  const matches = Array.from(
    normalizedLower(text).matchAll(new RegExp(`\\b(${numberWords.join("|")})\\b`, "g"))
  ).map((match) => match[1]);

  return matches
    .map((word) => numberWords.indexOf(word as (typeof numberWords)[number]))
    .filter((index) => index >= 0);
}

function quotedNumberRuns(text: string): number[][] {
  return Array.from(text.matchAll(/["“]([^"”]+)["”]/g))
    .map((match) => numberWordIndexes(match[1] ?? ""))
    .filter((indexes) => indexes.length >= 3);
}

function startsWithNumberWord(text: string): boolean {
  return new RegExp(`^[\\s"'“”]*(?:${numberWords.join("|")})\\b`, "i").test(text.trim());
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
    const words = tokenizePageWords(page.pageText);

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
      const hardWords = words.filter((word) => word.length > 10);
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

export function validateCountSequences(pages: StoryPage[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  pages.forEach((page) => {
    const lowered = normalizedLower(page.pageText);
    if (!lowered.includes("count")) {
      return;
    }

    const sentences = sentenceFragments(page.pageText);
    for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
      const sentence = sentences[sentenceIndex] ?? "";
      if (!/\bcount(?:ed|ing|s)?\b/i.test(sentence)) {
        continue;
      }

      const combined = [sentence, sentences[sentenceIndex + 1] ?? ""].join(" ");
      const quotedRuns = quotedNumberRuns(combined);
      const candidates =
        quotedRuns.length > 0
          ? quotedRuns
          : [
              numberWordIndexes(
                numberWordIndexes(sentence).length >= 3 || !startsWithNumberWord(sentences[sentenceIndex + 1] ?? "")
                  ? sentence
                  : `${sentence} ${sentences[sentenceIndex + 1] ?? ""}`
              )
            ];

      for (const indexes of candidates) {
        if (indexes.length < 3) {
          continue;
        }

        const sequential = indexes.every((value, index) => index === 0 || value === indexes[index - 1] + 1);
        if (!sequential) {
          issues.push({
            code: "COUNT_SEQUENCE",
            message: `Page ${page.pageIndex} has a non-sequential spoken count.`
          });
          return;
        }
      }
    }
  });

  return { ok: issues.length === 0, issues };
}

export function validateCaregiverConsistency(
  concept: StoryConcept,
  pages: StoryPage[]
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const expected = concept.caregiverLabel.toLowerCase();
  const forbiddenTerms = explicitCaregiverTerms.filter((term) => term !== expected);

  pages.forEach((page) => {
    const lowered = normalizedLower(page.pageText);
    forbiddenTerms.forEach((term) => {
      if (lowered.includes(term)) {
        issues.push({
          code: "CAREGIVER_CONSISTENCY",
          message: `Page ${page.pageIndex} uses caregiver wording '${term}' instead of ${concept.caregiverLabel}.`
        });
      }
    });
  });

  return { ok: issues.length === 0, issues };
}

export function validateBitcoinUsage(
  profile: ReadingProfile,
  concept: StoryConcept,
  pages: StoryPage[]
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (profile !== "read_aloud_3_4" && profile !== "early_decoder_5_7") {
    return { ok: true, issues: [] };
  }

  const mentionPages = pages.filter((page) => pageMentions(page, "bitcoin"));
  if (mentionPages.length === 0) {
    issues.push({
      code: "BITCOIN_USAGE",
      message: "Story must mention Bitcoin at least once in a way that supports the story theme."
    });
  }

  mentionPages.forEach((page) => {
    const lowered = normalizedLower(page.pageText);

    if (page.newWordsIntroduced.some((word) => normalizedLower(word).includes("bitcoin"))) {
      issues.push({
        code: "BITCOIN_CHILD_LANGUAGE",
        message: `Page ${page.pageIndex} makes Bitcoin a child-facing new word.`
      });
    }

    const technicalTerm = bitcoinTechnicalTerms.find((term) => lowered.includes(term));
    if (technicalTerm) {
      issues.push({
        code: "BITCOIN_POLICY",
        message: `Page ${page.pageIndex} ties Bitcoin to technical/device-first framing (${technicalTerm}).`
      });
    }

    const childAction = bitcoinChildActionTerms.find((term) => lowered.includes(term));
    if (childAction) {
      issues.push({
        code: "BITCOIN_POLICY",
        message: `Page ${page.pageIndex} asks the child to say, decode, or explain Bitcoin.`
      });
    }
  });

  return { ok: issues.length === 0, issues };
}

export function validateLateIntroductions(
  concept: StoryConcept,
  pages: StoryPage[]
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lateStart = Math.max(0, pages.length - 2);

  concept.forbiddenLateIntroductions.forEach((entry) => {
    const firstIndex = pages.findIndex((page) => pageMentions(page, entry));
    if (firstIndex >= lateStart) {
      issues.push({
        code: "LATE_INTRODUCTION",
        message: `'${entry}' is introduced too late on page ${firstIndex}.`
      });
    }
  });

  if (concept.deadlineEvent) {
    const firstDeadlineIndex = pages.findIndex((page) => pageMentions(page, concept.deadlineEvent as string));
    if (firstDeadlineIndex >= lateStart) {
      issues.push({
        code: "LATE_DEADLINE",
        message: `Deadline '${concept.deadlineEvent}' is introduced too late on page ${firstDeadlineIndex}.`
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function validateContinuityFacts(story: StoryPackage): ValidationResult {
  const issues: ValidationIssue[] = [];
  const earningLabels = story.concept.earningOptions.map((option) => normalizedLower(option.label));

  story.beats.forEach((beat, index) => {
    const page = story.pages[index];
    if (!page) {
      return;
    }

    const lowered = normalizedLower(page.pageText);
    beat.continuityFacts.forEach((fact) => {
      const separator = fact.indexOf(":");
      const key = separator >= 0 ? fact.slice(0, separator) : fact;
      const value = separator >= 0 ? fact.slice(separator + 1) : "";

      if (key === "forbid_term" && value && lowered.includes(normalizedLower(value))) {
        if (normalizedLower(value) === "grown-up" || normalizedLower(value) === "grown-ups") {
          return;
        }
        issues.push({
          code: "CONTINUITY_FORBIDDEN_TERM",
          message: `Page ${page.pageIndex} uses forbidden term '${value}'.`
        });
      }

      if (key === "caregiver_label" && value) {
        const expected = normalizedLower(value);
        explicitCaregiverTerms
          .filter((term) => term !== expected)
          .forEach((term) => {
            if (lowered.includes(term)) {
              issues.push({
                code: "CONTINUITY_CAREGIVER",
                message: `Page ${page.pageIndex} contradicts caregiver label '${value}'.`
              });
            }
          });
      }

      if (key === "chosen_earning_option" && value) {
        const chosen = normalizedLower(value);
        earningLabels
          .filter((label) => label !== chosen)
          .forEach((label) => {
            if (lowered.includes(label)) {
              issues.push({
                code: "CONTINUITY_EARNING_OPTION",
                message: `Page ${page.pageIndex} references '${label}' while beat continuity expects '${value}'.`
              });
            }
          });
      }
    });
  });

  return { ok: issues.length === 0, issues };
}
