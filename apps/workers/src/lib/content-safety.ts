interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

export interface SafetyVerdict {
  ok: boolean;
  flagged: boolean;
  reasons: string[];
  mode: "deterministic" | "deterministic+openai";
}

const blockedTerms = [
  "blood",
  "gore",
  "kill",
  "weapon",
  "gun",
  "knife",
  "sex",
  "nude",
  "drugs",
  "suicide"
];

export function blockedTermsInText(text: string): string[] {
  const lowered = text.toLowerCase();
  return blockedTerms.filter((term) => lowered.includes(term));
}

function deterministicCheck(texts: string[]): string[] {
  const findings: string[] = [];

  texts.forEach((text, index) => {
    const matched = blockedTermsInText(text);
    matched.forEach((term) => {
      findings.push(`text[${index}] contains blocked term: ${term}`);
    });
  });

  return findings;
}

async function openAiModeration(openAiApiKey: string, texts: string[]): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: texts
    })
  });

  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 512);
    throw new Error(`OpenAI moderation request failed (${response.status}): ${snippet}`);
  }

  const payload = (await response.json()) as { results?: ModerationResult[] };
  const results = payload.results ?? [];
  const findings: string[] = [];

  results.forEach((result, index) => {
    if (!result.flagged) {
      return;
    }

    const categoryList = Object.entries(result.categories ?? {})
      .filter(([, value]) => value)
      .map(([name]) => name);
    findings.push(`text[${index}] flagged by OpenAI moderation (${categoryList.join(", ") || "unknown"})`);
  });

  return findings;
}

export async function moderateTexts(openAiApiKey: string, texts: string[]): Promise<SafetyVerdict> {
  const deterministicFindings = deterministicCheck(texts);
  const reasons = [...deterministicFindings];
  let mode: SafetyVerdict["mode"] = "deterministic";

  try {
    const modelFindings = await openAiModeration(openAiApiKey, texts);
    reasons.push(...modelFindings);
    mode = "deterministic+openai";
  } catch (error) {
    console.error("CONTENT_MODERATION_FAILURE", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return {
    ok: reasons.length === 0,
    flagged: reasons.length > 0,
    reasons,
    mode
  };
}
