import type {
  BookProductFamily,
  LayoutProfileId,
  MoneyLessonKey,
  PageTemplateId,
  PictureBookReadingProfile,
  ReviewAction,
  ReviewCaseStatus,
  ReviewStage,
  ReadingProfile
} from "./enums.js";

export interface CreateOrderInput {
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  moneyLessonKey: MoneyLessonKey;
  interestTags: string[];
  readingProfileId: ReadingProfile;
  characterDescription: string;
}

export interface PlannedBeat {
  purpose: string;
  conflict: string;
  sceneLocation: string;
  emotionalTarget: string;
  pageIndexEstimate: number;
  decodabilityTags: string[];
  newWordsIntroduced: string[];
  bitcoinRelevanceScore: number;
}

export interface BeatSheet {
  beats: PlannedBeat[];
}

export type StoryBeat = PlannedBeat;

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

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageFadeSpec {
  shape: "ellipse" | "soft_band";
  featherPx: number;
}

export interface PageTextStyleSpec {
  readingProfileId: PictureBookReadingProfile;
  preferredFontPx: number;
  minFontPx: number;
  lineHeight: number;
  align: "left";
}

export interface PageCompositionSpec {
  layoutProfileId: LayoutProfileId;
  templateId: PageTemplateId;
  canvas: {
    width: number;
    height: number;
  };
  textBox: NormalizedRect;
  artBox: NormalizedRect;
  maskBox: NormalizedRect;
  fade: PageFadeSpec;
  textStyle: PageTextStyleSpec;
}

export interface BookProductConfig {
  productFamily: BookProductFamily;
  layoutProfileId: LayoutProfileId | null;
}

export interface ReviewCaseSummary {
  id: string;
  bookId: string;
  orderId: string;
  status: ReviewCaseStatus;
  stage: ReviewStage;
  reasonSummary: string;
  reasonJson: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReviewEventRecord {
  id: string;
  reviewCaseId: string;
  bookId: string;
  pageId: string | null;
  reviewerEmail: string;
  action: ReviewAction;
  notes: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}
