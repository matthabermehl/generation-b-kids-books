import type { MoneyLessonKey, ReadingProfile } from "@book/domain";

export interface StoryTemplateContext {
  childFirstName: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
}

export function buildBeatPlannerPrompt(context: StoryTemplateContext): string {
  return [
    "You are a children's story planner.",
    "Create a plot with 12 pages and a late Bitcoin reveal.",
    `Child: ${context.childFirstName}, age ${context.ageYears}`,
    `Lesson key: ${context.lesson}`,
    `Interests: ${context.interests.join(", ") || "general family activities"}`,
    `Reading profile: ${context.profile}`,
    "Constraint: first 80% of pages focus on problem exploration.",
    "Constraint: avoid hype language or investment guarantees.",
    "Return strict JSON with beats and page intentions."
  ].join("\n");
}

export function buildPageWriterPrompt(context: StoryTemplateContext, beatSummary: string): string {
  return [
    "You are a children's page writer.",
    `Use this beat summary: ${beatSummary}`,
    `Audience profile: ${context.profile}`,
    "Use warm, calm, realistic settings for younger readers.",
    "Return JSON with page_text, page_illustration_brief, new_words_introduced, repetition_targets."
  ].join("\n");
}

export function stylePrefix(): string {
  return "Muted watercolor palette, matte texture, calm composition, minimal clutter.";
}
