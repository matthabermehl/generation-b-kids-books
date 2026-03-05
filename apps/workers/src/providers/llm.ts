import type { MoneyLessonKey, ReadingProfile, StoryPackage } from "@book/domain";
import { runDeterministicStoryChecks } from "@book/prompts";
import { boolFromEnv } from "../lib/helpers.js";

export interface StoryContext {
  bookId: string;
  childFirstName: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
  pageCount: number;
}

export interface LlmProvider {
  generateBeatSheet(context: StoryContext): Promise<{ beats: string[] }>;
  draftPages(context: StoryContext, beats: string[]): Promise<StoryPackage>;
  critic(context: StoryContext, story: StoryPackage): Promise<{ ok: boolean; notes: string[] }>;
}

class MockLlmProvider implements LlmProvider {
  async generateBeatSheet(context: StoryContext): Promise<{ beats: string[] }> {
    return {
      beats: Array.from({ length: context.pageCount }, (_, idx) => {
        if (idx < context.pageCount - 2) {
          return `Beat ${idx + 1}: ${context.childFirstName} faces a money challenge while exploring ${context.interests[0] ?? "their neighborhood"}.`;
        }

        return `Beat ${idx + 1}: ${context.childFirstName} discovers Bitcoin as a long-term saving tool.`;
      })
    };
  }

  async draftPages(context: StoryContext, beats: string[]): Promise<StoryPackage> {
    const pages = beats.map((beat, idx) => ({
      pageIndex: idx,
      pageText:
        idx < beats.length - 2
          ? `${context.childFirstName} notices prices changing and learns to plan ahead. ${beat}`
          : `${context.childFirstName} learns Bitcoin can protect savings over time and feels more confident. ${beat}`,
      illustrationBrief: `Calm watercolor scene for ${context.childFirstName}, page ${idx + 1}`,
      newWordsIntroduced: idx === 0 ? ["budget"] : idx === beats.length - 2 ? ["bitcoin"] : [],
      repetitionTargets: ["save", "plan"]
    }));

    return {
      title: `${context.childFirstName}'s Bitcoin Adventure`,
      beats: beats.map((beat) => ({
        purpose: beat,
        conflict: "Changing prices",
        sceneLocation: context.interests[0] ?? "home",
        emotionalTarget: "calm confidence",
        bitcoinRelevanceScore: beat.includes("Bitcoin") ? 0.9 : 0.2
      })),
      pages,
      readingProfileId: context.profile,
      moneyLessonKey: context.lesson
    };
  }

  async critic(context: StoryContext, story: StoryPackage): Promise<{ ok: boolean; notes: string[] }> {
    const quality = runDeterministicStoryChecks(
      context.profile,
      story.pages,
      boolFromEnv("ENABLE_STRICT_DECODABLE_CHECKS", true)
    );

    return { ok: quality.ok, notes: quality.issues };
  }
}

class StubOpenAiAnthropicProvider extends MockLlmProvider {
  override async generateBeatSheet(context: StoryContext): Promise<{ beats: string[] }> {
    // First pass keeps external model calls optional. Real model routing is enabled in phase 2.
    return super.generateBeatSheet(context);
  }
}

export function resolveLlmProvider(): LlmProvider {
  const useMock = boolFromEnv("ENABLE_MOCK_LLM", true);
  if (useMock) {
    return new MockLlmProvider();
  }

  return new StubOpenAiAnthropicProvider();
}
