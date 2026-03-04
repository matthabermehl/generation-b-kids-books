#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

mode="${1:---write}"
case "${mode}" in
  --check|check)
    mode="check"
    ;;
  --write|write)
    mode="write"
    ;;
  *)
    agent_err "usage: bash scripts/agent/format.sh [--check|--write]"
    exit 2
    ;;
esac

if [[ "${mode}" == "check" ]]; then
  if [[ -f package.json ]] && agent_node_has_script "format:check"; then
    agent_log "format: package.json format:check script"
    agent_run_node_script "format:check"
    exit 0
  fi

  if [[ -f package.json ]] && agent_node_has_script "format-check"; then
    agent_log "format: package.json format-check script"
    agent_run_node_script "format-check"
    exit 0
  fi

  if py_cmd="$(agent_choose_python 2>/dev/null)"; then
    if "${py_cmd}" -m ruff format --help >/dev/null 2>&1; then
      agent_log "format: ${py_cmd} -m ruff format --check ."
      "${py_cmd}" -m ruff format --check .
      exit 0
    fi
    if "${py_cmd}" -m black --version >/dev/null 2>&1; then
      agent_log "format: ${py_cmd} -m black --check ."
      "${py_cmd}" -m black --check .
      exit 0
    fi
  fi

  if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
    agent_log "format: cargo fmt --all -- --check"
    cargo fmt --all -- --check
    exit 0
  fi

  if [[ -f go.mod ]] && command -v gofmt >/dev/null 2>&1; then
    mapfile -t go_files < <(find . -type f -name "*.go" -not -path "./vendor/*" | sort)
    if [[ "${#go_files[@]}" -eq 0 ]]; then
      agent_log "format: no go files found"
      exit 0
    fi
    unformatted="$(gofmt -l "${go_files[@]}")"
    if [[ -n "${unformatted}" ]]; then
      printf '%s\n' "${unformatted}"
      agent_err "format: gofmt check failed"
      exit 2
    fi
    agent_log "format: gofmt check PASS"
    exit 0
  fi

  agent_handle_missing_runner "format check" "AGENT_FORMAT_FALLBACK" "warn"
  exit 0
fi

if [[ -f package.json ]] && agent_node_has_script "format"; then
  agent_log "format: package.json format script"
  agent_run_node_script "format"
  exit 0
fi

if py_cmd="$(agent_choose_python 2>/dev/null)"; then
  if "${py_cmd}" -m ruff format --help >/dev/null 2>&1; then
    agent_log "format: ${py_cmd} -m ruff format ."
    "${py_cmd}" -m ruff format .
    exit 0
  fi
  if "${py_cmd}" -m black --version >/dev/null 2>&1; then
    agent_log "format: ${py_cmd} -m black ."
    "${py_cmd}" -m black .
    exit 0
  fi
fi

if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
  agent_log "format: cargo fmt --all"
  cargo fmt --all
  exit 0
fi

if [[ -f go.mod ]] && command -v go >/dev/null 2>&1; then
  agent_log "format: go fmt ./..."
  go fmt ./...
  exit 0
fi

agent_handle_missing_runner "format" "AGENT_FORMAT_FALLBACK" "warn"
