#!/usr/bin/env bash
set -euo pipefail

echo "[gc] git status:"
git status --porcelain=v1 || true

echo
echo "[gc] biggest files (top 20):"
# portable-ish: use python if available
if command -v python >/dev/null 2>&1; then
  python - <<'PY'
import os
from pathlib import Path
paths=[]
for p in Path(".").rglob("*"):
    if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts:
        try:
            paths.append((p.stat().st_size, str(p)))
        except OSError:
            pass
for size, p in sorted(paths, reverse=True)[:20]:
    print(f"{size:>10}  {p}")
PY
else
  find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -exec wc -c {} + | sort -nr | head -n 20 || true
fi

echo
echo "[gc] TODO/FIXME hotspots (top 50):"
grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E "TODO|FIXME" . | head -n 50 || true

echo
echo "[gc] duplicate-ish filenames (heuristic):"
find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -printf "%f\n" 2>/dev/null | sort | uniq -cd | sort -nr | head -n 30 || true

echo
echo "[gc] done"
