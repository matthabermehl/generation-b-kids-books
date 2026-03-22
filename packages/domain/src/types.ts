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

export interface StoryRewriteTurn {
  story: StoryPackage;
  criticVerdict: StoryCriticVerdict;
}

export interface StoryDraftOptions {
  rewriteInstructions?: string;
  rewriteHistory?: StoryRewriteTurn[];
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

export type VisualEntityKind = "main_character" | "supporting_character" | "prop" | "setting";
export type VisualEntityImportance = "story_critical" | "supporting";
export type VisualReferenceStrategy =
  | "approved_character"
  | "generated_supporting_reference"
  | "prompt_only"
  | "scene_anchor";

export interface VisualIdentityAnchor {
  trait: string;
  value: string;
}

export interface VisualEntity {
  entityId: string;
  kind: VisualEntityKind;
  label: string;
  description: string;
  anchors: string[];
  identityAnchors?: VisualIdentityAnchor[];
  pageIndices: number[];
  sceneIds: string[];
  importance: VisualEntityImportance;
  recurring: boolean;
  referenceStrategy: VisualReferenceStrategy;
}

export interface VisualCountConstraint {
  entityId: string;
  label: string;
  quantity: number;
  sourceText: string;
}

export interface VisualStateConstraint {
  entityId: string;
  label: string;
  state: string;
  sourceText: string;
}

export interface VisualPageContract {
  pageIndex: number;
  sceneId: string;
  settingEntityId: string | null;
  requiredCharacterIds: string[];
  supportingCharacterIds: string[];
  requiredPropIds: string[];
  exactCountConstraints: VisualCountConstraint[];
  stateConstraints: VisualStateConstraint[];
  settingAnchors: string[];
  continuityNotes: string[];
  mustNotShow: string[];
}

export interface VisualStoryBible {
  bookId: string;
  title: string;
  childFirstName: string;
  generatedAt: string;
  entities: VisualEntity[];
  pages: VisualPageContract[];
}

export interface PageArtVisualGuidance {
  mustShow: string[];
  mustMatch: string[];
  showExactly: string[];
  mustNotShow: string[];
  settingAnchors: string[];
  continuityNotes: string[];
}

export type VisualQaIssueCode =
  | "supporting_character_mismatch"
  | "prop_count_mismatch"
  | "prop_state_mismatch"
  | "setting_anchor_mismatch"
  | "forbidden_extra_entity"
  | "style_outlier_extra"
  | "low_confidence";

export interface VisualQaIssue {
  code: VisualQaIssueCode;
  message: string;
  entityId?: string;
  expected?: string;
  observed?: string;
  confidence?: number | null;
}

export interface VisualQaVerdict {
  passed: boolean;
  issues: VisualQaIssue[];
  confidence: number | null;
  summary: string;
  mode: "mock" | "openai" | "skipped";
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
