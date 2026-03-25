import type {
  StoryConcept as DomainStoryConcept,
  StoryCriticIssue as DomainStoryCriticIssue,
  StoryCriticVerdict as DomainStoryCriticVerdict
} from "@book/domain";

export interface CriticIssue {
  beatIndex: number;
  problem: string;
  tier: "hard" | "soft";
  severity: "low" | "med" | "high";
  fix: string;
}

export interface CriticVerdict {
  pass: boolean;
  issues: CriticIssue[];
  rewriteInstructions: string;
}

export type StoryConcept = DomainStoryConcept;
export type StoryCriticIssue = DomainStoryCriticIssue;
export type StoryCriticVerdict = DomainStoryCriticVerdict;

const earningOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "action", "sceneLocation"],
  properties: {
    label: { type: "string", minLength: 1 },
    action: { type: "string", minLength: 1 },
    sceneLocation: { type: "string", minLength: 1 }
  }
} as const;

const lessonScenarioSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "moneyLessonKey",
    "anchorItem",
    "beforePrice",
    "afterPrice",
    "purchaseUnit",
    "countableComparison",
    "noticingMoment",
    "targetItem",
    "targetPrice",
    "startingAmount",
    "gapAmount",
    "earningOptions",
    "temptation",
    "gameName",
    "tokenName",
    "childGoal",
    "ruleDisruption",
    "fairnessRepair",
    "workAction",
    "earnedReward",
    "rewardUse",
    "unfairLossRisk",
    "brokenRule",
    "fairRule",
    "sharedGoal",
    "deadlineEvent"
  ],
  properties: {
    moneyLessonKey: {
      type: "string",
      enum: [
        "prices_change",
        "jar_saving_limits",
        "new_money_unfair",
        "keep_what_you_earn",
        "better_rules"
      ]
    },
    anchorItem: { type: "string", minLength: 1 },
    beforePrice: { type: "integer", minimum: 1, maximum: 500 },
    afterPrice: { type: "integer", minimum: 1, maximum: 500 },
    purchaseUnit: { type: "string", minLength: 1 },
    countableComparison: { type: "string", minLength: 1 },
    noticingMoment: { type: "string", minLength: 1 },
    targetItem: { type: "string", minLength: 1 },
    targetPrice: { type: "integer", minimum: 1, maximum: 500 },
    startingAmount: { type: "integer", minimum: 0, maximum: 500 },
    gapAmount: { type: "integer", minimum: 1, maximum: 500 },
    earningOptions: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: earningOptionSchema
    },
    temptation: { type: "string", minLength: 1 },
    gameName: { type: "string", minLength: 1 },
    tokenName: { type: "string", minLength: 1 },
    childGoal: { type: "string", minLength: 1 },
    ruleDisruption: { type: "string", minLength: 1 },
    fairnessRepair: { type: "string", minLength: 1 },
    workAction: { type: "string", minLength: 1 },
    earnedReward: { type: "string", minLength: 1 },
    rewardUse: { type: "string", minLength: 1 },
    unfairLossRisk: { type: "string", minLength: 1 },
    brokenRule: { type: "string", minLength: 1 },
    fairRule: { type: "string", minLength: 1 },
    sharedGoal: { type: "string", minLength: 1 },
    deadlineEvent: { type: ["string", "null"], minLength: 1 }
  }
} as const;

const storyConceptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "premise",
    "caregiverLabel",
    "bitcoinBridge",
    "emotionalPromise",
    "caregiverWarmthMoment",
    "bitcoinValueThread",
    "requiredSetups",
    "requiredPayoffs",
    "forbiddenLateIntroductions",
    "lessonScenario"
  ],
  properties: {
    premise: { type: "string", minLength: 1 },
    caregiverLabel: { type: "string", enum: ["Mom", "Dad"] },
    bitcoinBridge: { type: "string", minLength: 1 },
    emotionalPromise: { type: "string", minLength: 1 },
    caregiverWarmthMoment: { type: "string", minLength: 1 },
    bitcoinValueThread: { type: "string", minLength: 1 },
    requiredSetups: {
      type: "array",
      minItems: 2,
      maxItems: 12,
      items: { type: "string", minLength: 1 }
    },
    requiredPayoffs: {
      type: "array",
      minItems: 2,
      maxItems: 12,
      items: { type: "string", minLength: 1 }
    },
    forbiddenLateIntroductions: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string", minLength: 1 }
    },
    lessonScenario: lessonScenarioSchema
  }
} as const;

const plannedBeatSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "purpose",
    "conflict",
    "sceneLocation",
    "sceneId",
    "sceneVisualDescription",
    "emotionalTarget",
    "pageIndexEstimate",
    "decodabilityTags",
    "newWordsIntroduced",
    "bitcoinRelevanceScore",
    "introduces",
    "paysOff",
    "continuityFacts"
  ],
  properties: {
    purpose: { type: "string", minLength: 1 },
    conflict: { type: "string", minLength: 1 },
    sceneLocation: { type: "string", minLength: 1 },
    sceneId: { type: "string", minLength: 1 },
    sceneVisualDescription: { type: "string", minLength: 1 },
    emotionalTarget: { type: "string", minLength: 1 },
    pageIndexEstimate: { type: "integer", minimum: 0, maximum: 40 },
    decodabilityTags: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: { type: "string", minLength: 1 }
    },
    newWordsIntroduced: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string", minLength: 1 }
    },
    bitcoinRelevanceScore: { type: "number", minimum: 0, maximum: 1 },
    introduces: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string", minLength: 1 }
    },
    paysOff: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string", minLength: 1 }
    },
    continuityFacts: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string", minLength: 1 }
    }
  }
} as const;

export const schemaNames = {
  storyConcept: "StoryConcept",
  beatSheet: "BeatSheet",
  criticVerdict: "CriticVerdict",
  storyPackage: "StoryPackage",
  storyCriticVerdict: "StoryCriticVerdict"
} as const;

export const storyConceptJsonSchema = storyConceptSchema;

export const beatSheetJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beats"],
  properties: {
    beats: {
      type: "array",
      minItems: 4,
      maxItems: 32,
      items: plannedBeatSchema
    }
  }
} as const;

export const criticVerdictJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "issues", "rewriteInstructions"],
  properties: {
    pass: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beatIndex", "problem", "tier", "severity", "fix"],
        properties: {
          beatIndex: { type: "integer", minimum: 0, maximum: 40 },
          problem: { type: "string", minLength: 1 },
          tier: { type: "string", enum: ["hard", "soft"] },
          severity: { type: "string", enum: ["low", "med", "high"] },
          fix: { type: "string", minLength: 1 }
        }
      }
    },
    rewriteInstructions: { type: "string" }
  }
} as const;

export const storyPackageJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "concept", "beats", "pages"],
  properties: {
    title: { type: "string", minLength: 1 },
    concept: storyConceptSchema,
    beats: {
      type: "array",
      minItems: 4,
      maxItems: 32,
      items: plannedBeatSchema
    },
    pages: {
      type: "array",
      minItems: 4,
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "pageIndex",
          "pageText",
          "illustrationBrief",
          "sceneId",
          "sceneVisualDescription",
          "newWordsIntroduced",
          "repetitionTargets"
        ],
        properties: {
          pageIndex: { type: "integer", minimum: 0, maximum: 40 },
          pageText: { type: "string", minLength: 1 },
          illustrationBrief: { type: "string", minLength: 1 },
          sceneId: { type: "string", minLength: 1 },
          sceneVisualDescription: { type: "string", minLength: 1 },
          newWordsIntroduced: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: { type: "string", minLength: 1 }
          },
          repetitionTargets: {
            type: "array",
            minItems: 0,
            maxItems: 16,
            items: { type: "string", minLength: 1 }
          }
        }
      }
    }
  }
} as const;

export const storyCriticVerdictJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "issues", "rewriteInstructions"],
  properties: {
    ok: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "pageStart",
          "pageEnd",
          "issueType",
          "severity",
          "rewriteTarget",
          "evidence",
          "suggestedFix"
        ],
        properties: {
          pageStart: { type: "integer", minimum: 0, maximum: 40 },
          pageEnd: { type: "integer", minimum: 0, maximum: 40 },
          issueType: {
            type: "string",
            enum: [
              "count_sequence",
              "caregiver_consistency",
              "setup_payoff",
              "action_continuity",
              "age_plausibility",
              "theme_integration",
              "bitcoin_fit",
              "reading_level",
              "emotional_tone",
              "caregiver_warmth",
              "ending_emotion"
            ]
          },
          severity: { type: "string", enum: ["hard", "soft"] },
          rewriteTarget: { type: "string", enum: ["concept", "beat", "page"] },
          evidence: { type: "string", minLength: 1 },
          suggestedFix: { type: "string", minLength: 1 }
        }
      }
    },
    rewriteInstructions: { type: "string" }
  }
} as const;
