export interface PromptPrinciple {
  id: string;
  summary: string;
  appliesTo: "concept" | "planner" | "critic" | "rewrite" | "writer";
  requiredSignals: string[];
}

export const promptPrinciples: PromptPrinciple[] = [
  {
    id: "story_mode_concept",
    summary:
      "Story concepts must obey the selected story_mode so implicit mode stays fully unspoken, reveal mode plans a late warm Bitcoin answer, and forward mode supports earlier recurring caregiver or narrator framing.",
    appliesTo: "concept",
    requiredSignals: [
      "story-mode policy seam",
      "sound_money_implicit",
      "bitcoin_reveal_8020",
      "bitcoin_forward",
      "story_mode"
    ]
  },
  {
    id: "bitcoin_theme_positive",
    summary:
      "Obey story_mode exactly: implicit mode never names Bitcoin, reveal mode delays Bitcoin until the late solution window, and forward mode names Bitcoin earlier in caregiver or narrator framing while the child's money problem stays primary.",
    appliesTo: "planner",
    requiredSignals: [
      "story-mode policy seam",
      "sound_money_implicit",
      "bitcoin_reveal_8020",
      "bitcoin_forward",
      "child-centered"
    ]
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
    summary: "Avoid slot-filled generic beats; conflicts must be specific, emotionally believable, and move toward reassurance.",
    appliesTo: "critic",
    requiredSignals: ["mad-libs", "specific", "emotion", "reassurance"]
  },
  {
    id: "surgical_rewrite",
    summary: "Rewrite only flagged beats unless global constraints require propagation.",
    appliesTo: "rewrite",
    requiredSignals: ["preserve", "flagged", "global constraints", "schema"]
  },
  {
    id: "writer_bedtime_warmth",
    summary: "Final pages stay age-appropriate, concrete, warm, and bedtime-calm.",
    appliesTo: "writer",
    requiredSignals: ["age-appropriate", "concrete", "bedtime", "child should not say"]
  }
];

export function principlesFor(appliesTo: PromptPrinciple["appliesTo"]): PromptPrinciple[] {
  return promptPrinciples.filter((principle) => principle.appliesTo === appliesTo);
}
