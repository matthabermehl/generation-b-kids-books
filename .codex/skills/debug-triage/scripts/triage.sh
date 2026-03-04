#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
if [[ -z "$CMD" ]]; then
  echo "Usage: triage.sh \"<failing command>\""
  exit 2
fi

TS="$(date +"%Y%m%d_%H%M%S")"
OUTDIR=".agent/triage/${TS}"
mkdir -p "${OUTDIR}"

echo "[triage] writing to ${OUTDIR}"

{
  echo "# Triage Report"
  echo
  echo "Timestamp: $(date -Iseconds)"
  echo "Command: \`${CMD}\`"
  echo
  echo "## Repo state"
  echo
  echo "### git status"
  git status --porcelain=v1 || true
  echo
  echo "### git diff --stat"
  git diff --stat || true
  echo
  echo "### git log -20"
  git log --oneline -20 || true
  echo
  echo "## Environment"
  echo
  echo "- uname: $(uname -a 2>/dev/null || true)"
  echo "- node: $(node -v 2>/dev/null || true)"
  echo "- npm: $(npm -v 2>/dev/null || true)"
  echo "- python: $(python -V 2>/dev/null || true)"
  echo "- pip: $(python -m pip -V 2>/dev/null || true)"
  echo "- go: $(go version 2>/dev/null || true)"
  echo "- rustc: $(rustc --version 2>/dev/null || true)"
  echo
  echo "## Failing command output"
  echo
  echo "See: command_stdout.txt / command_stderr.txt"
  echo
  echo "## Hypothesis"
  echo "- (fill in after inspection)"
  echo
  echo "## Next experiments"
  echo "- (fill in after inspection)"
} > "${OUTDIR}/triage_report.md"

# Capture outputs separately (avoids truncation in markdown)
bash -lc "${CMD}" >"${OUTDIR}/command_stdout.txt" 2>"${OUTDIR}/command_stderr.txt" || true

echo "[triage] done. Inspect:"
echo "  ${OUTDIR}/triage_report.md"
echo "  ${OUTDIR}/command_stdout.txt"
echo "  ${OUTDIR}/command_stderr.txt"
