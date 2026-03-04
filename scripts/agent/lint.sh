#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

if [[ -f package.json ]] && agent_node_has_script "lint"; then
  agent_log "lint: package.json lint script"
  agent_run_node_script "lint"
  exit 0
fi

if py_cmd="$(agent_choose_python 2>/dev/null)"; then
  if "${py_cmd}" -m ruff --version >/dev/null 2>&1; then
    agent_log "lint: ${py_cmd} -m ruff check ."
    "${py_cmd}" -m ruff check .
    exit 0
  fi
  if "${py_cmd}" -m flake8 --version >/dev/null 2>&1; then
    agent_log "lint: ${py_cmd} -m flake8"
    "${py_cmd}" -m flake8
    exit 0
  fi
fi

if [[ -f go.mod ]] && command -v golangci-lint >/dev/null 2>&1; then
  agent_log "lint: golangci-lint run"
  golangci-lint run
  exit 0
fi

if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
  agent_log "lint: cargo clippy -- -D warnings"
  cargo clippy -- -D warnings
  exit 0
fi

agent_handle_missing_runner "lint" "AGENT_LINT_FALLBACK" "warn"
