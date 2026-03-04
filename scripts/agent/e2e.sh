#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

mkdir -p .agent/artifacts

if [[ -f package.json ]] && agent_node_has_script "e2e"; then
  agent_log "e2e: package.json e2e script"
  agent_run_node_script "e2e"
  exit 0
fi

if [[ -f package.json ]] && command -v npx >/dev/null 2>&1; then
  if [[ -f playwright.config.ts || -f playwright.config.js ]]; then
    agent_log "e2e: npx playwright test"
    npx playwright test
    exit 0
  fi

  if [[ -f cypress.config.ts || -f cypress.config.js || -f cypress.json ]]; then
    agent_log "e2e: npx cypress run"
    npx cypress run
    exit 0
  fi
fi

agent_handle_missing_runner "e2e" "AGENT_E2E_FALLBACK" "warn"
