#!/usr/bin/env bash
# shellcheck shell=bash

agent_common_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

agent_repo_root() {
  local common_dir
  common_dir="$(agent_common_dir)"
  cd "${common_dir}/../.." && pwd
}

agent_log() {
  printf '[agent] %s\n' "$*"
}

agent_warn() {
  printf '[agent][warn] %s\n' "$*" >&2
}

agent_err() {
  printf '[agent][error] %s\n' "$*" >&2
}

agent_choose_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi
  return 1
}

agent_node_has_script() {
  local script_name="$1"
  [[ -f package.json ]] || return 1
  command -v node >/dev/null 2>&1 || return 1
  node -e "
const fs = require('fs');
const scriptName = process.argv[1];
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  process.exit(pkg && pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName) ? 0 : 1);
} catch (_) {
  process.exit(1);
}
" "${script_name}" >/dev/null 2>&1
}

agent_detect_node_pm() {
  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
    return 0
  fi
  if [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    echo "yarn"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return 0
  fi
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
    return 0
  fi
  if command -v yarn >/dev/null 2>&1; then
    echo "yarn"
    return 0
  fi
  return 1
}

agent_run_node_script() {
  local script_name="$1"
  local pm
  if ! pm="$(agent_detect_node_pm)"; then
    agent_err "no package manager detected"
    return 2
  fi
  case "${pm}" in
    npm)
      npm run -- "${script_name}"
      ;;
    pnpm)
      pnpm run -- "${script_name}"
      ;;
    yarn)
      yarn run "${script_name}"
      ;;
    *)
      agent_err "unsupported package manager: ${pm}"
      return 2
      ;;
  esac
}

agent_fallback_policy() {
  local env_name="$1"
  local default_value="$2"
  local raw_value
  raw_value="${!env_name:-${default_value}}"
  case "${raw_value}" in
    warn|fail)
      echo "${raw_value}"
      ;;
    *)
      echo "${default_value}"
      ;;
  esac
}

agent_handle_missing_runner() {
  local runner_name="$1"
  local policy_env="$2"
  local default_policy="$3"
  local policy
  policy="$(agent_fallback_policy "${policy_env}" "${default_policy}")"

  if [[ "${policy}" = "warn" ]]; then
    agent_warn "No ${runner_name} runner detected. Continuing because ${policy_env}=warn."
    return 0
  fi

  agent_err "No ${runner_name} runner detected. Set ${policy_env}=warn to continue."
  return 2
}

agent_now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

agent_feature_list_cmd() {
  local cmd_path="scripts/agent/feature_list.py"
  [[ -x "${cmd_path}" ]] || return 1
  echo "${cmd_path}"
}

agent_mark_task_pass_if_exists() {
  local task_id="$1"
  local evidence="$2"
  local feature_cmd

  if ! feature_cmd="$(agent_feature_list_cmd 2>/dev/null)"; then
    return 0
  fi

  if ! "${feature_cmd}" show "${task_id}" >/dev/null 2>&1; then
    return 0
  fi

  if "${feature_cmd}" pass "${task_id}" --evidence "${evidence}" >/dev/null 2>&1; then
    agent_log "tracker: ${task_id} marked passing"
  else
    agent_warn "tracker: failed to mark ${task_id} passing"
  fi
}

agent_cd_repo_root() {
  cd "$(agent_repo_root)"
}
