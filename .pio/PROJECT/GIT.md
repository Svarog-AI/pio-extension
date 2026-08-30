# Git Conventions

## Commit Message Format

**Format:** **Conventional Commits** (`type(scope): description`). Observed consistently in recent history (not strictly enforced by CI, hooks, or documentation).

### Observed types (from `git log`)

| Type | Usage | Example |
|------|-------|---------|
| `feat` | New features, capability additions | `feat(runtime): add do-while loop blocks (kind: "loop") to workflows (#81)` |
| `refactor` | Code restructuring without behavior changes | `refactor(project-context): move merge-notes to a top-level phase after the research loop` |
| `fix` | Bug fixes | `fix(runtime): prevent 'Workflow Paused' message from repeating in ad hoc mode (#76)` |
| `chore` | Maintenance, housekeeping, pio state updates | `chore: state` |
| `test` | Test-related changes | `test: collocate complex test files (S01)` |
| `docs` | Documentation changes | `docs(skills): drop goal-specific migration note from capability-design skill` |

### Scope usage

Optional scope in parentheses, typically the affected module or feature area (e.g., `project-context`, `runtime`, `loop-engine`, `skills`). A PR number is sometimes appended as `(#NN)` for merged feature work.

### Commit message rules (pio-git skill)

- Write a short descriptive one-liner summarizing the change.
- **Do not include "Step N"** — describe the change, not plan step numbers.
- Follow the conventions in this file (GIT.md); if absent, use a plain descriptive one-liner.

## Tag / versioning scheme

**No tags detected** (`git tag -l` returns empty). The package version is `0.1.0` in `package.json`, but **no release tags exist**. No semantic versioning, calendar versioning, or release candidates observed. There is no version-bump tooling or changelog.

## Branch naming patterns

- **Main branch:** `main`
- **Feature branches:** `feat/<feature-name>` (e.g., `feat/runtime-loop-engine`, `feat/auto-completed-marker`)
- **Refactor branches:** `refactor/<description>` (e.g., `refactor/programmatic-phase-advancement`)
- **Fix branches:** `fix/<issue>` (e.g., `fix/validation-guard-leak`)
- **Other/topic branches:** `<topic>` (e.g., `experimental`, `custom-models`, `backup/experimental-pre-rewrite`, `test/variable-phases`)

Branches follow a descriptive naming pattern **without ticket/issue-number embedding**. Feature branches are pushed to origin and merged via PRs.

### Branching strategy (pio-git skill protocol)

- Each goal workspace is developed on a **dedicated branch** (default `feat/<goal-name>`, or the pattern from GIT.md).
- Checkout a branch when a goal is created; on branch collision, ask the user (reuse existing / create suffixed `-2`/`-3` / cancel).
- Subgoals commit inline on the parent branch (no separate branch).
- Note the base branch as the PR target for downstream PR creation.

## Merge commit conventions

Feature branches are merged via **merge pull requests** (merge commits, **not** squash merges). Pattern: `Merge pull request #N from Svarog-AI/<branch>` (many such merges observed in history). Merges target `main` (CI runs on push/PR to `main`).

## Signing practices

**No GPG signing and no DCO sign-off observed.** Recent commits report `N` (not signed); there is no `gpg.format`/`commit.gpgsign` git config; no `Signed-off-by:` lines detected. No commit-signing enforcement.
