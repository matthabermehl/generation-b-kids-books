#!/usr/bin/env bash
set -euo pipefail

# Lightweight doc garden checks. Customize for your repo.
# The goal is to surface drift, not be perfect.

echo "[doc-garden] docs tree:"
find docs -maxdepth 2 -type f -name "*.md" 2>/dev/null || true

if [[ -f docs/index.md ]]; then
  echo "[doc-garden] checking docs/index.md links to docs/*.md (best-effort)"
  # list docs files not mentioned in index
  missing=0
  while IFS= read -r f; do
    bn="$(basename "$f")"
    if ! grep -q "$bn" docs/index.md; then
      echo "  - docs/index.md missing reference: $f"
      missing=1
    fi
  done < <(find docs -type f -name "*.md" | sort)
  if [[ $missing -eq 0 ]]; then
    echo "[doc-garden] docs/index.md references all docs/*.md (best-effort)"
  fi
else
  echo "[doc-garden] NOTE: docs/index.md not found. Consider adding a docs index."
fi

echo "[doc-garden] scan for TODO/FIXME in docs:"
grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E "TODO|FIXME" docs 2>/dev/null || true

echo "[doc-garden] done"
