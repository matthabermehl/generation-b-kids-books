Current state:
- Repository is on `master` with a clean worktree.
- Existing harness surfaces are present: `.agent/`, `scripts/agent/`, `AGENTS.md`, and root `mymemory.md`.
- No `.github` branch naming constraints were found.

Objectives:
- Refresh the existing harness using the Harness Update (Existing Repo) workflow.
- Keep any newly added harness-only files ignored because this is a shared repository.
- Run the relevant harness verification after updating.

Risks:
- Harness refresh may modify managed files under `.agent/`, `scripts/agent/`, `AGENTS.md`, or memory files.
- Existing tracked harness files may remain tracked even if future harness artifacts are ignored.

Assumptions:
- This is an already-harnessed repo, not an empty repo bootstrap.
- Non-production local harness maintenance is safe to perform without additional product decisions.

Open decisions:
- Whether to open a PR after the branch is committed and pushed.
