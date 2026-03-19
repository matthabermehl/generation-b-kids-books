export interface PromptPrinciple {
  id: string;
  summary: string;
  appliesTo: "planner" | "critic" | "rewrite" | "writer";
  requiredSignals: string[];
}

export const promptPrinciples: PromptPrinciple[] = [
  {
    id: "bitcoin_theme_positive",
    summary: "Bitcoin supports the saving theme in a positive, child-safe way without needing to wait for the ending.",
    appliesTo: "planner",
    requiredSignals: ["bitcoin", "positive", "theme", "saving"]
  },
  {
    id: "child_agency",
    summary: "The child hero makes meaningful choices that affect outcomes.",
    appliesTo: "planner",
    requiredSignals: ["child", "hero", "meaningful", "choices"]
  },
  {
    id: "montessori_realism",
    summary: "Under-6 stories remain reality-based and practical-life oriented.",
    appliesTo: "planner",
    requiredSignals: ["montessori", "under 6", "reality", "practical"]
  },
  {
    id: "sor_decodability",
    summary: "Plan for controlled vocabulary, repetition, and taught-word sequencing.",
    appliesTo: "planner",
    requiredSignals: ["science-of-reading", "controlled", "repetition", "taught"]
  },
  {
    id: "anti_mad_libs",
    summary: "Avoid slot-filled generic beats; conflicts must be specific and emotionally believable.",
    appliesTo: "critic",
    requiredSignals: ["mad-libs", "specific", "emotion", "believable"]
  },
  {
    id: "surgical_rewrite",
    summary: "Rewrite only flagged beats unless global constraints require propagation.",
    appliesTo: "rewrite",
    requiredSignals: ["preserve", "flagged", "global constraints", "schema"]
  },
  {
    id: "writer_grounding",
    summary: "Final pages stay age-appropriate, concrete, and consequence-driven.",
    appliesTo: "writer",
    requiredSignals: ["age-appropriate", "concrete", "consequence", "child should not say"]
  }
];

export function principlesFor(appliesTo: PromptPrinciple["appliesTo"]): PromptPrinciple[] {
  return promptPrinciples.filter((principle) => principle.appliesTo === appliesTo);
}
