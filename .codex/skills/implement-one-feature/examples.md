# implement-one-feature examples

## Example: API task
- Task ID: `auth-login-01`
- Evidence:
  - `bash scripts/agent/test.sh` => PASS
  - `bash scripts/agent/quality.sh` => PASS

## Example: UI workflow task
- Task ID: `dashboard-nav-02`
- Evidence:
  - `bash scripts/agent/quality.sh` => PASS
  - `bash scripts/agent/e2e.sh` => PASS
  - `bash scripts/agent/snapshot_ui.sh http://localhost:3000/dashboard` => screenshot captured
