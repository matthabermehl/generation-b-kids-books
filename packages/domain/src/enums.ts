export const moneyLessonKeys = [
  "inflation_candy",
  "saving_later",
  "delayed_gratification"
] as const;

export type MoneyLessonKey = (typeof moneyLessonKeys)[number];

export const readingProfiles = [
  "read_aloud_3_4",
  "early_decoder_5_7",
  "independent_8_10"
] as const;

export type ReadingProfile = (typeof readingProfiles)[number];

export const pictureBookReadingProfiles = ["read_aloud_3_4", "early_decoder_5_7"] as const;
export type PictureBookReadingProfile = (typeof pictureBookReadingProfiles)[number];

export const bookProductFamilies = ["picture_book_fixed_layout", "chapter_book_reflowable"] as const;
export type BookProductFamily = (typeof bookProductFamilies)[number];

export const layoutProfileIds = ["pb_square_8_5_v1"] as const;
export type LayoutProfileId = (typeof layoutProfileIds)[number];

export const pageTemplateIds = [
  "corner_ul_ellipse",
  "corner_ur_ellipse",
  "column_left_soft",
  "column_right_soft",
  "band_top_soft",
  "band_bottom_soft"
] as const;
export type PageTemplateId = (typeof pageTemplateIds)[number];

export const orderStatuses = [
  "created",
  "checkout_pending",
  "paid",
  "building",
  "needs_review",
  "ready",
  "failed",
  "refunded"
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const bookStatuses = ["draft", "building", "needs_review", "ready", "failed"] as const;
export type BookStatus = (typeof bookStatuses)[number];

export const pageStatuses = ["pending", "ready", "failed"] as const;
export type PageStatus = (typeof pageStatuses)[number];

export const imageStatuses = ["pending", "generated", "qa_failed", "ready", "failed"] as const;
export type ImageStatus = (typeof imageStatuses)[number];
