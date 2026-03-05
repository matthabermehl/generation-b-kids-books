import type { MoneyLessonKey, ReadingProfile } from "@book/domain";

export interface StoryTemplateContext {
  childFirstName: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
}

function jsonOnlyBlock(schemaName: string, schemaDefinition: string): string {
  return [
    "Return ONLY valid JSON.",
    `Target schema name: ${schemaName}.`,
    "Do not wrap JSON in markdown fences.",
    schemaDefinition
  ].join("\n");
}

export function buildBeatPlannerPrompt(context: StoryTemplateContext, pageCount: number): string {
  return [
    "You are a children's story planner.",
    `Create a plot with exactly ${pageCount} pages and a late Bitcoin reveal.`,
    `Child: ${context.childFirstName}, age ${context.ageYears}`,
    `Lesson key: ${context.lesson}`,
    `Interests: ${context.interests.join(", ") || "general family activities"}`,
    `Reading profile: ${context.profile}`,
    "Constraint: first 80% of pages focus on problem exploration.",
    "Constraint: avoid hype language or investment guarantees.",
    jsonOnlyBlock(
      "BeatSheet",
      `{"beats": ["string", "... exactly ${pageCount} items ..."]}`
    )
  ].join("\n");
}

export function buildPageWriterPrompt(context: StoryTemplateContext, beats: string[], pageCount: number): string {
  const beatSummary = beats.map((beat, idx) => `${idx + 1}. ${beat}`).join("\n");
  return [
    "You are a children's page writer.",
    `Use this beat summary:\n${beatSummary}`,
    `Audience profile: ${context.profile}`,
    `Page count: ${pageCount}`,
    "Use warm, calm, realistic settings for younger readers.",
    "Keep language age-appropriate and concrete.",
    jsonOnlyBlock(
      "StoryPackage",
      '{"title":"string","beats":[{"purpose":"string","conflict":"string","sceneLocation":"string","emotionalTarget":"string","bitcoinRelevanceScore":0.0}],"pages":[{"pageIndex":0,"pageText":"string","illustrationBrief":"string","newWordsIntroduced":["word"],"repetitionTargets":["word"]}]}'
    )
  ].join("\n");
}

export function buildCriticPrompt(context: StoryTemplateContext, storyJson: string): string {
  return [
    "You are a strict story quality critic for a children's money-learning app.",
    `Reading profile: ${context.profile}`,
    "Evaluate these constraints:",
    "- Story must delay explicit Bitcoin mentions to final ~20% of pages.",
    "- Avoid banned phrases like guaranteed returns or risk-free gains.",
    "- Reading complexity must fit profile.",
    "Story JSON:",
    storyJson,
    jsonOnlyBlock("CriticVerdict", '{"ok": true, "notes": ["string"]}')
  ].join("\n");
}

export function stylePrefix(): string {
  return "Muted watercolor palette, matte texture, calm composition, minimal clutter.";
}
