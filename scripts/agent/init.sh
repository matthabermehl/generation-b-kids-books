#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
agent_cd_repo_root

agent_log "init start: $(pwd)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  agent_log "git: $(git rev-parse --short HEAD 2>/dev/null || echo 'no-commit-yet')"
else
  agent_log "git: not a git repository"
fi

if [[ -f package.json ]]; then
  if pm="$(agent_detect_node_pm 2>/dev/null)"; then
    case "${pm}" in
      pnpm)
        if [[ -f pnpm-lock.yaml ]]; then
          agent_log "pnpm install --frozen-lockfile"
          pnpm install --frozen-lockfile
        else
          agent_log "pnpm install"
          pnpm install
        fi
        ;;
      yarn)
        if [[ -f yarn.lock ]]; then
          agent_log "yarn install --frozen-lockfile"
          yarn install --frozen-lockfile
        else
          agent_log "yarn install"
          yarn install
        fi
        ;;
      npm)
        if [[ -f package-lock.json ]]; then
          agent_log "npm ci"
          npm ci
        else
          agent_log "npm install"
          npm install
        fi
        ;;
    esac
  else
    agent_warn "package.json detected but no npm/pnpm/yarn available"
  fi
fi

if py_cmd="$(agent_choose_python 2>/dev/null)"; then
  if [[ -f uv.lock ]] && command -v uv >/dev/null 2>&1; then
    agent_log "uv sync"
    uv sync
  elif [[ -f poetry.lock || -f pyproject.toml ]] && command -v poetry >/dev/null 2>&1; then
    agent_log "poetry install"
    poetry install
  elif [[ -f requirements.txt ]]; then
    agent_log "${py_cmd} -m pip install -r requirements.txt"
    "${py_cmd}" -m pip install -r requirements.txt
  elif [[ -f pyproject.toml ]]; then
    agent_warn "pyproject.toml detected but no uv/poetry workflow found"
  fi
else
  if [[ -f requirements.txt || -f pyproject.toml ]]; then
    agent_warn "python project detected but python3/python not found"
  fi
fi

if [[ -f go.mod ]]; then
  if command -v go >/dev/null 2>&1; then
    agent_log "go mod download"
    go mod download
  else
    agent_warn "go.mod detected but go not found"
  fi
fi

if [[ -f Cargo.toml ]]; then
  if command -v cargo >/dev/null 2>&1; then
    agent_log "cargo fetch"
    cargo fetch
  else
    agent_warn "Cargo.toml detected but cargo not found"
  fi
fi

agent_log "init complete"
