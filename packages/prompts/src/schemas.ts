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

export interface StoryCriticVerdict {
  ok: boolean;
  notes: string[];
}

const plannedBeatSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "purpose",
    "conflict",
    "sceneLocation",
    "emotionalTarget",
    "pageIndexEstimate",
    "decodabilityTags",
    "newWordsIntroduced",
    "bitcoinRelevanceScore"
  ],
  properties: {
    purpose: { type: "string", minLength: 1 },
    conflict: { type: "string", minLength: 1 },
    sceneLocation: { type: "string", minLength: 1 },
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
    bitcoinRelevanceScore: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;

export const schemaNames = {
  beatSheet: "BeatSheet",
  criticVerdict: "CriticVerdict",
  storyPackage: "StoryPackage",
  storyCriticVerdict: "StoryCriticVerdict"
} as const;

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
  required: ["title", "beats", "pages"],
  properties: {
    title: { type: "string", minLength: 1 },
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
          "newWordsIntroduced",
          "repetitionTargets"
        ],
        properties: {
          pageIndex: { type: "integer", minimum: 0, maximum: 40 },
          pageText: { type: "string", minLength: 1 },
          illustrationBrief: { type: "string", minLength: 1 },
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
  required: ["ok", "notes"],
  properties: {
    ok: { type: "boolean" },
    notes: {
      type: "array",
      items: { type: "string", minLength: 1 }
    }
  }
} as const;
