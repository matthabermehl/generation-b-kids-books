#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

if [[ -f package.json ]] && agent_node_has_script "test"; then
  agent_log "test: package.json test script"
  agent_run_node_script "test"
  exit 0
fi

if py_cmd="$(agent_choose_python 2>/dev/null)"; then
  if [[ -f pyproject.toml || -f pytest.ini || -d tests ]]; then
    if "${py_cmd}" -m pytest --version >/dev/null 2>&1; then
      if [[ "${SMOKE:-0}" = "1" ]]; then
        agent_log "test: ${py_cmd} -m pytest -q -x"
        "${py_cmd}" -m pytest -q -x
      else
        agent_log "test: ${py_cmd} -m pytest"
        "${py_cmd}" -m pytest
      fi
      exit 0
    fi
  fi
fi

if [[ -f go.mod ]] && command -v go >/dev/null 2>&1; then
  agent_log "test: go test ./..."
  go test ./...
  exit 0
fi

if [[ -f Cargo.toml ]] && command -v cargo >/dev/null 2>&1; then
  agent_log "test: cargo test"
  cargo test
  exit 0
fi

if [[ -f pom.xml ]] && command -v mvn >/dev/null 2>&1; then
  agent_log "test: mvn test"
  mvn test
  exit 0
fi

if [[ -f gradlew ]]; then
  agent_log "test: ./gradlew test"
  ./gradlew test
  exit 0
fi

agent_handle_missing_runner "test" "AGENT_TEST_FALLBACK" "warn"
