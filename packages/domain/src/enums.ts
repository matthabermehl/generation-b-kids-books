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

export const orderStatuses = [
  "created",
  "paid",
  "building",
  "ready",
  "failed",
  "refunded"
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const bookStatuses = ["draft", "building", "ready", "failed"] as const;
export type BookStatus = (typeof bookStatuses)[number];

export const pageStatuses = ["pending", "ready", "failed"] as const;
export type PageStatus = (typeof pageStatuses)[number];

export const imageStatuses = ["pending", "generated", "qa_failed", "ready", "failed"] as const;
export type ImageStatus = (typeof imageStatuses)[number];
