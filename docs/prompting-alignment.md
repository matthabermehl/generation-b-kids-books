# Prompting Alignment Map

This document makes `deep-research-report-prompting.md` guidance enforceable in code.

## Requirement Mapping

| Source requirement | Prompt sections | Validator / critic enforcement | Test coverage |
|---|---|---|---|
| 80/20 arc (problem first, Bitcoin late) | `buildBeatPlannerSystemPrompt`, `buildBeatPlannerPrompt`, `buildBeatRewritePrompt` | `runDeterministicBeatChecks` (`BITCOIN_RATIO`, `BITCOIN_POSITION`) + numeric target helper `computeBitcoinBeatTargets` | `packages/prompts/test/beat-quality.test.ts` (`returns actionable ratio diagnostics...`) |
| Child is active hero with meaningful choices | Planner + narrative freshness critic | Narrative critic issues + rewrite loop in worker provider | `packages/prompts/test/prompt-principles.test.ts` (planner + critic signal checks) |
| Montessori realism for under-6 / read-aloud | Planner + Montessori critic | `runDeterministicBeatChecks` (`MONTESSORI_REALISM`) + Montessori critic | `packages/prompts/test/beat-quality.test.ts` (`fails montessori realism...`) |
| Science-of-Reading planning (controlled vocab/repetition/taught words) | Planner + SoR critic + rewrite prompt | `runDeterministicBeatChecks` (`DECODABILITY_TAG`, `EARLY_READER_WORD_BUDGET`, `TAUGHT_WORD_POSITION`) + SoR critic | `packages/prompts/test/prompt-principles.test.ts` (`planner prompt includes canonical tag...`) |
| Anti–Mad Libs specificity and emotional progression | Planner + narrative freshness critic | Narrative critic + rewrite loop | `packages/prompts/test/prompt-principles.test.ts` (`narrative critic prompt preserves...`) |
| Child-safe late Bitcoin framing for ages 3-7 | Planner + rewrite + SoR/Montessori/narrative critics + writer | Prompt guardrails explicitly forbid tablet/app/digital-jar/transfer mechanics and keep any explicit Bitcoin wording to a brief adult aside | `packages/prompts/test/prompt-principles.test.ts` (`planner prompt adds young-profile bitcoin guardrails`, `writer prompt forbids device-led bitcoin exposition...`) + `apps/workers/test/llm-provider.test.ts` (`injects explicit numeric bitcoin constraints...`) |
| Surgical rewrite only on flagged areas | Rewrite prompt | Beat rewrite stage in `apps/workers/src/providers/llm.ts` uses deterministic+critic issue bundle and only failing critics for guidance | `apps/workers/test/llm-provider.test.ts` (`injects explicit numeric bitcoin constraints...`) |
| Critics preserve late-stage Bitcoin resolution | Montessori + SoR + narrative critic prompts | Critic prompts explicitly forbid removing required Bitcoin resolution and rewrite includes numeric constraints | `packages/prompts/test/prompt-principles.test.ts` (`sor critic preserves late-stage bitcoin invariant`) |
| Strict structured output | All planner/critic/rewrite/writer prompts and provider calls | OpenAI `response_format.type=json_schema` and Anthropic tool schema output | `apps/workers/test/llm-provider.test.ts` (`uses strict schema calls...`) |
| Final writer model pin | Final story writer route | `draftPages` hard-pins `claude-opus-4-6` and bypasses cross-provider fallback | `apps/workers/test/llm-provider.test.ts` (`hard-pins Anthropic Opus 4.6...`) |

## Enforcement Notes

- Prompt wording is intent-faithful adaptation, not verbatim copy.
- Core constraints are protected by deterministic checks and principle-signal tests.
- If a principle disappears from prompts, tests should fail before deployment.
