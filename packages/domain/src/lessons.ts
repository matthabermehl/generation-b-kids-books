import { moneyLessonKeys, type MoneyLessonKey } from "./enums.js";

export interface MoneyLessonDefinition {
  key: MoneyLessonKey;
  label: string;
  helperText: string;
  emotionalArcTarget: string;
  bitcoinValueThread: string;
  scenarioGuidance: string;
}

export const moneyLessonDefinitions: Record<MoneyLessonKey, MoneyLessonDefinition> = {
  prices_change: {
    key: "prices_change",
    label: "Why prices can change even when you do nothing",
    helperText: "Use a countable everyday price change that the child can notice and feel.",
    emotionalArcTarget: "confused to reassured to calmly observant",
    bitcoinValueThread: "long-term thinking and noticing when money changes around you",
    scenarioGuidance:
      "Use one concrete item with a simple before-and-after price comparison. Keep the cause child-level and observable."
  },
  jar_saving_limits: {
    key: "jar_saving_limits",
    label: "Why saving in a jar does not always work",
    helperText: "Keep the child active in saving, but show why patience needs better money habits than a static jar alone.",
    emotionalArcTarget: "hopeful to stretched to calm pride",
    bitcoinValueThread: "patience, stewardship, and protecting long-term effort",
    scenarioGuidance:
      "Use a real target item, countable savings, two child-safe earning options, and one tempting smaller-now choice."
  },
  new_money_unfair: {
    key: "new_money_unfair",
    label: "Why it feels unfair when new money appears",
    helperText: "Frame the lesson through a game or ticket system that suddenly changes midstream.",
    emotionalArcTarget: "excited to unsettled to fairly understood",
    bitcoinValueThread: "fairness, honest rules, and why surprise dilution feels wrong",
    scenarioGuidance:
      "Use a child-scale game or fair-style system where extra tickets, tokens, or points appear and change outcomes."
  },
  keep_what_you_earn: {
    key: "keep_what_you_earn",
    label: "Why work should let you keep your rewards",
    helperText: "Center the feeling of effort, earned reward, and why it hurts when that reward is weakened or taken.",
    emotionalArcTarget: "motivated to discouraged to respected and proud",
    bitcoinValueThread: "earned rewards, stewardship, and honoring effort over time",
    scenarioGuidance:
      "Use one practical child job, one concrete earned reward, and one child-safe unfair loss or dilution moment that gets resolved."
  },
  better_rules: {
    key: "better_rules",
    label: "Why some games have better rules than others",
    helperText: "Teach fair rules through a game where everyone can feel the difference between stable and changing rules.",
    emotionalArcTarget: "playful to frustrated to calm and secure",
    bitcoinValueThread: "fair rules, shared trust, and why no one should change the rules mid-game",
    scenarioGuidance:
      "Use one concrete game, a broken rule that feels unfair, and a better stable rule the group can understand."
  }
};

export const orderedMoneyLessons = moneyLessonKeys.map((key) => moneyLessonDefinitions[key]);

export function getMoneyLessonDefinition(key: MoneyLessonKey): MoneyLessonDefinition {
  return moneyLessonDefinitions[key];
}
