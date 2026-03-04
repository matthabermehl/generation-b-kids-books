#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

quality_mode="${AGENT_QUALITY_MODE:-check}"
if [[ "$#" -gt 1 ]]; then
  agent_err "usage: bash scripts/agent/quality.sh [--check|--fix]"
  exit 2
fi
if [[ "$#" -eq 1 ]]; then
  case "$1" in
    --check|check)
      quality_mode="check"
      ;;
    --fix|fix|--write|write)
      quality_mode="fix"
      ;;
    *)
      agent_err "usage: bash scripts/agent/quality.sh [--check|--fix]"
      exit 2
      ;;
  esac
fi
case "${quality_mode}" in
  check|fix)
    ;;
  *)
    agent_err "AGENT_QUALITY_MODE must be 'check' or 'fix'"
    exit 2
    ;;
esac

format_ran=0
if [[ "${AGENT_SKIP_FORMAT:-0}" != "1" ]]; then
  if [[ "${quality_mode}" == "fix" ]]; then
    agent_log "quality: format (write mode)"
    bash scripts/agent/format.sh --write
  else
    agent_log "quality: format (check mode)"
    bash scripts/agent/format.sh --check
  fi
  format_ran=1
else
  agent_warn "quality: skipping format because AGENT_SKIP_FORMAT=1"
fi

agent_log "quality: lint"
bash scripts/agent/lint.sh

agent_log "quality: test"
bash scripts/agent/test.sh

agent_log "quality: PASS"

timestamp="$(agent_now_utc)"
evidence_cmd="bash scripts/agent/quality.sh"
if [[ "${quality_mode}" == "fix" ]]; then
  evidence_cmd+=" --fix"
fi
evidence="${evidence_cmd} => PASS (${timestamp})"
agent_mark_task_pass_if_exists "script-lint-reliability-01" "${evidence}"
agent_mark_task_pass_if_exists "script-test-reliability-01" "${evidence}"
if [[ "${format_ran}" -eq 1 ]]; then
  agent_mark_task_pass_if_exists "script-format-reliability-01" "${evidence}"
fi
agent_mark_task_pass_if_exists "harness-baseline-quality-01" "${evidence}"
