---
name: doc-gardener
description: >
  Keeps docs accurate after code changes.
  Use when behavior, commands, architecture, or APIs changed.
  Do: update docs in docs/ + keep AGENTS.md as a map (not a dump).
  Don't use when change is purely internal and docs are unaffected.
  Outputs: updated docs + updated doc index and/or links.
---

## Goal
Make docs match reality.

## Quick scan
```bash
bash .codex/skills/doc-gardener/scripts/doc_garden.sh
```

## What to update (common)
- docs/PRODUCT.md: changed user behavior
- docs/ARCHITECTURE.md: new modules, boundaries, data flows
- docs/SECURITY.md: auth/secrets/networking changes
- docs/RELIABILITY.md: new escalation or ops procedures

## Rule of thumb
- Keep root AGENTS.md short and linking outward.
- Put details into docs/ and scripts/agent/.
