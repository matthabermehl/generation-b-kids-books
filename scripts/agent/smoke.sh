#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

agent_log "smoke: init"
bash scripts/agent/init.sh

export SMOKE="${SMOKE:-1}"
agent_log "smoke: test (SMOKE=${SMOKE})"
bash scripts/agent/test.sh

agent_log "smoke: PASS"

timestamp="$(agent_now_utc)"
evidence="bash scripts/agent/smoke.sh => PASS (${timestamp})"
agent_mark_task_pass_if_exists "harness-baseline-smoke-01" "${evidence}"
agent_mark_task_pass_if_exists "baseline-smoke-verify-01" "${evidence}"
