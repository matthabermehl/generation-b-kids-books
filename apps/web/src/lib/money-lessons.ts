import { getMoneyLessonDefinition, orderedMoneyLessons, type MoneyLessonKey } from "@book/domain";

export type LessonKey = MoneyLessonKey;

export { orderedMoneyLessons };

export function getMoneyLessonLabel(key: MoneyLessonKey): string {
  return getMoneyLessonDefinition(key).label;
}

export function getMoneyLessonHelperText(key: MoneyLessonKey): string {
  return getMoneyLessonDefinition(key).helperText;
}
