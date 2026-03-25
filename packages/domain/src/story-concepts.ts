import type { MoneyLessonKey } from "./enums.js";
import type { StoryConcept } from "./types.js";

export function storyConceptLessonKey(concept: StoryConcept): MoneyLessonKey {
  return concept.lessonScenario.moneyLessonKey;
}

export function storyConceptDeadlineEvent(concept: StoryConcept): string | null {
  return concept.lessonScenario.deadlineEvent;
}

export function storyConceptCountTarget(concept: StoryConcept): number | null {
  if (concept.lessonScenario.moneyLessonKey !== "jar_saving_limits") {
    return null;
  }

  return concept.lessonScenario.targetPrice;
}

export function storyConceptEarningOptionLabels(concept: StoryConcept): string[] {
  if (concept.lessonScenario.moneyLessonKey !== "jar_saving_limits") {
    return [];
  }

  return concept.lessonScenario.earningOptions.map((option) => option.label);
}

export function storyConceptHighlightLabels(concept: StoryConcept): string[] {
  const scenario = concept.lessonScenario;

  switch (scenario.moneyLessonKey) {
    case "prices_change":
      return [scenario.anchorItem, scenario.purchaseUnit, scenario.noticingMoment];
    case "jar_saving_limits":
      return [scenario.targetItem, scenario.temptation, ...scenario.earningOptions.map((option) => option.label)];
    case "new_money_unfair":
      return [scenario.gameName, scenario.tokenName, scenario.childGoal, scenario.ruleDisruption];
    case "keep_what_you_earn":
      return [scenario.workAction, scenario.earnedReward, scenario.rewardUse, scenario.unfairLossRisk];
    case "better_rules":
      return [scenario.gameName, scenario.brokenRule, scenario.fairRule, scenario.sharedGoal];
  }
}
