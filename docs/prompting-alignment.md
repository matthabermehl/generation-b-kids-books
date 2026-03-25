# Prompting Alignment Map

This document makes `deep-research-report-prompting.md` guidance enforceable in code.

## Requirement Mapping

| Source requirement | Prompt sections | Validator / critic enforcement | Test coverage |
|---|---|---|---|
| Bitcoin supports the selected money-value thread without late-only placement or pitch energy | `buildBeatPlannerSystemPrompt`, `buildBeatPlannerPrompt`, `buildBeatRewritePrompt`, `buildPageWriterPrompt`, `buildCriticPrompt` | `runDeterministicBeatChecks` (`BITCOIN_THEME_INTEGRATION`, `BITCOIN_CHILD_LANGUAGE`) + lighter story checks in `validateBitcoinUsage` | `packages/prompts/test/beat-quality.test.ts` (`requires at least one beat...`) + `packages/domain/test/validators.test.ts` (`allows recurring safe Bitcoin mentions...`) |
| Bedtime warmth, caregiver reassurance, and emotional relief are first-class story goals | Planner, writer, critic, and rewrite prompts | deterministic beat/story warmth checks + critic issue types (`emotional_tone`, `caregiver_warmth`, `ending_emotion`) | `packages/prompts/test/beat-quality.test.ts` (`requires a warmth beat...`) + `packages/prompts/test/quality.test.ts` (`flags stories missing warm caregiver language`) |
| Child is active hero with meaningful choices | Planner + narrative freshness critic | Narrative critic issues + rewrite loop in worker provider | `packages/prompts/test/prompt-principles.test.ts` (planner + critic signal checks) |
| Montessori realism for under-6 / read-aloud | Planner + Montessori critic | `runDeterministicBeatChecks` (`MONTESSORI_REALISM`) + Montessori critic | `packages/prompts/test/beat-quality.test.ts` (`fails montessori realism...`) |
| Science-of-Reading planning (controlled vocab/repetition/taught words) | Planner + SoR critic + rewrite prompt | `runDeterministicBeatChecks` (`DECODABILITY_TAG`, `EARLY_READER_WORD_BUDGET`, `BITCOIN_CHILD_LANGUAGE`) + SoR critic | `packages/prompts/test/prompt-principles.test.ts` (`planner prompt includes thematic Bitcoin guidance...`) |
| Anti–Mad Libs specificity and calm emotional progression | Planner + narrative freshness critic | Narrative critic + rewrite loop | `packages/prompts/test/prompt-principles.test.ts` (`narrative critic prompt preserves...`) |
| Child-safe recurring Bitcoin framing for ages 3-7 | Planner + rewrite + SoR/Montessori/narrative critics + writer | Prompt guardrails explicitly forbid tablet/app/digital-jar/transfer mechanics, child decoding/explaining of Bitcoin, and hype | `packages/prompts/test/prompt-principles.test.ts` (`planner prompt adds young-profile bitcoin guardrails`, `writer prompt allows generic class words while keeping Bitcoin child-safe`) + `apps/workers/test/llm-provider.test.ts` (`injects thematic Bitcoin rewrite guidance...`) |
| Surgical rewrite only on flagged areas | Rewrite prompt | Beat rewrite stage in `apps/workers/src/providers/llm.ts` uses deterministic+critic issue bundle and only failing critics for guidance | `apps/workers/test/llm-provider.test.ts` (`injects thematic Bitcoin rewrite guidance...`) |
| Story writer preserves author/critic history across rewrites | Final story writer route + story critic | `draftPages` now sends alternating draft/critic messages and `prepare_story` loops until pass or rewrite budget exhaustion | `apps/workers/test/llm-provider.test.ts` (`passes prior story drafts...`) + `apps/workers/test/pipeline.test.ts` (`persists story-proof.pdf before stopping...`) |
| Strict structured output | All planner/critic/rewrite/writer prompts and provider calls | OpenAI `response_format.type=json_schema` and Anthropic tool schema output | `apps/workers/test/llm-provider.test.ts` (`uses strict schema calls...`) |
| Final writer model pin | Final story writer route | `draftPages` hard-pins `claude-opus-4-6` and bypasses cross-provider fallback | `apps/workers/test/llm-provider.test.ts` (`hard-pins Anthropic Opus 4.6...`) |

## Enforcement Notes

- Prompt wording is intent-faithful adaptation, not verbatim copy.
- Core constraints are protected by deterministic checks and principle-signal tests.
- Lesson taxonomy and lesson-specific value threads come from the shared `@book/domain` lesson-definition registry so UI copy and prompting stay aligned.
- If a principle disappears from prompts, tests should fail before deployment.
