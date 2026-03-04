#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

TARGET_URL="${1:-${SNAPSHOT_URL:-http://localhost:3000}}"
OUTDIR=".agent/artifacts/ui-snapshots"
mkdir -p "${OUTDIR}"
OUTFILE="${OUTDIR}/snapshot-$(date +%Y%m%d_%H%M%S).png"

if command -v npx >/dev/null 2>&1; then
  agent_log "snapshot: ${TARGET_URL} -> ${OUTFILE}"
  if npx playwright screenshot --wait-for-timeout=1500 -- "${TARGET_URL}" "${OUTFILE}"; then
    agent_log "snapshot saved: ${OUTFILE}"
    exit 0
  fi
fi

agent_handle_missing_runner "snapshot" "AGENT_SNAPSHOT_FALLBACK" "warn"
