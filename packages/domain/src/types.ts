import type { MoneyLessonKey, ReadingProfile } from "./enums.js";

export interface CreateOrderInput {
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  moneyLessonKey: MoneyLessonKey;
  interestTags: string[];
  readingProfileId: ReadingProfile;
}

export interface StoryBeat {
  purpose: string;
  conflict: string;
  sceneLocation: string;
  emotionalTarget: string;
  bitcoinRelevanceScore: number;
}

export interface StoryPage {
  pageIndex: number;
  pageText: string;
  illustrationBrief: string;
  newWordsIntroduced: string[];
  repetitionTargets: string[];
}

export interface StoryPackage {
  title: string;
  beats: StoryBeat[];
  pages: StoryPage[];
  readingProfileId: ReadingProfile;
  moneyLessonKey: MoneyLessonKey;
}
