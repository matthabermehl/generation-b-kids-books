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

export type StoryCaregiverLabel = "Mom" | "Dad";

export interface StoryConceptEarningOption {
  label: string;
  action: string;
  sceneLocation: string;
}

export interface StoryConcept {
  premise: string;
  caregiverLabel: StoryCaregiverLabel;
  targetItem: string;
  targetPrice: number;
  startingAmount: number;
  gapAmount: number;
  earningOptions: [StoryConceptEarningOption, StoryConceptEarningOption];
  temptation: string;
  deadlineEvent: string | null;
  bitcoinBridge: string;
  requiredSetups: string[];
  requiredPayoffs: string[];
  forbiddenLateIntroductions: string[];
}

export interface PlannedBeat {
  purpose: string;
  conflict: string;
  sceneLocation: string;
  sceneId: string;
  sceneVisualDescription: string;
  emotionalTarget: string;
  pageIndexEstimate: number;
  decodabilityTags: string[];
  newWordsIntroduced: string[];
  bitcoinRelevanceScore: number;
  introduces: string[];
  paysOff: string[];
  continuityFacts: string[];
}

export interface BeatSheet {
  beats: PlannedBeat[];
}

export type StoryBeat = PlannedBeat;

export interface StoryPage {
  pageIndex: number;
  pageText: string;
  illustrationBrief: string;
  sceneId: string;
  sceneVisualDescription: string;
  newWordsIntroduced: string[];
  repetitionTargets: string[];
}

export interface StoryPackage {
  title: string;
  concept: StoryConcept;
  beats: StoryBeat[];
  pages: StoryPage[];
  readingProfileId: ReadingProfile;
  moneyLessonKey: MoneyLessonKey;
}

export type StoryCriticIssueType =
  | "count_sequence"
  | "caregiver_consistency"
  | "setup_payoff"
  | "action_continuity"
  | "age_plausibility"
  | "theme_integration"
  | "bitcoin_fit"
  | "reading_level";

export type StoryCriticRewriteTarget = "concept" | "beat" | "page";
export type StoryCriticIssueSeverity = "hard" | "soft";

export interface StoryCriticIssue {
  pageStart: number;
  pageEnd: number;
  issueType: StoryCriticIssueType;
  severity: StoryCriticIssueSeverity;
  rewriteTarget: StoryCriticRewriteTarget;
  evidence: string;
  suggestedFix: string;
}

export interface StoryCriticVerdict {
  ok: boolean;
  issues: StoryCriticIssue[];
  rewriteInstructions: string;
}

export interface ScenePlanScene {
  sceneId: string;
  sceneVisualDescription: string;
  beatIndices: number[];
  pageIndices: number[];
}

export interface ScenePlanArtifact {
  bookId: string;
  title: string;
  scenes: ScenePlanScene[];
  generatedAt: string;
}

export interface ImagePlanPromptInputs {
  pageText: string;
  illustrationBrief: string;
  sceneVisualDescription: string;
}

export interface ImagePlanPage {
  pageId: string;
  pageIndex: number;
  sceneId: string;
  sceneVisualDescription: string;
  priorSameScenePageIds: string[];
  pageArtPromptInputs: ImagePlanPromptInputs;
}

export interface ImagePlanArtifact {
  bookId: string;
  title: string;
  pages: ImagePlanPage[];
  generatedAt: string;
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

export interface SpreadTextPageSpec {
  textBox: NormalizedRect;
}

export interface SpreadArtPageSpec {
  artBox: NormalizedRect;
  maskBox: NormalizedRect;
  fade: PageFadeSpec;
  gutterSafeInsetPx: number;
}

export interface SpreadCompositionSpec {
  layoutProfileId: LayoutProfileId;
  templateId: PageTemplateId;
  canvas: {
    width: number;
    height: number;
  };
  spreadCanvas: {
    width: number;
    height: number;
  };
  leftPage: SpreadTextPageSpec;
  rightPage: SpreadArtPageSpec;
  textStyle: PageTextStyleSpec;
}

export type PageCompositionSpec = SpreadCompositionSpec;

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
