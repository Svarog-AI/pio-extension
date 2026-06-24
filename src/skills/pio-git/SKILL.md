---
name: pio-git
description: Perform git operations for pio workflow agents — commit changes, stage files selectively, and construct commit messages. Use when a pio agent needs to commit code changes, stage files for a commit, or perform other git operations during workflow execution.
---

## Overview

This skill defines how pio agents perform git operations using shell commands via the `bash` tool. It is capability-agnostic — any pio prompt can invoke these protocols.

## Convention Lookup Rule

Before performing any git operation, read `.pio/PROJECT/GIT.md` to learn the project's conventions: commit format, observed types, branch naming patterns, and signing practices.

**The skill never defines its own conventions.** It always defers to GIT.md. If `.pio/PROJECT/GIT.md` does not exist, fall back to a short descriptive one-liner.

## Staged Commit Protocol

Stage only the files the agent actually changed. **Never use `git add -A`.**

### Staging strategy

1. **If `SUMMARY.md` exists** (per-step commits): extract file paths from "Files Created", "Files Modified", and "Files Deleted" sections, then `git add <paths>`. Note: `git add` on a deleted path stages the deletion.
2. **Otherwise** (ad-hoc): run `git status --porcelain`, extract paths (strip status prefix), then `git add <paths>`.

### Commit message construction

- Read `.pio/PROJECT/GIT.md` and follow its conventions exactly
- Write a short descriptive one-liner summarizing the change
- **Do not include "Step N"** — describe the change, not plan step numbers
- If GIT.md does not exist, use a plain descriptive one-liner

See [REFERENCE.md](REFERENCE.md) for the execution code block.

## Branch Checkout Protocol

Checkout a dedicated branch when a goal workspace is created. Follow these steps in order:

1. **Subgoal detection** — if the goal workspace path contains `/subgoals/`, skip this protocol entirely.
2. **Verify git repository** — `git rev-parse --show-toplevel`. On failure: warn and skip.
3. **Verify git user config** — `git config user.name` and `git config user.email`. On failure: warn and skip.
4. **Convention lookup** — read `.pio/PROJECT/GIT.md` for branch naming patterns (e.g., `feat/<feature-name>`). Fallback: `feat/<goal-name>`.
5. **Construct branch name** — apply the pattern with the goal name: lowercase, spaces to hyphens (e.g., `Implement Git Lifecycle` → `feat/implement-git-lifecycle`).
6. **Detect current branch** — `git symbolic-ref --short HEAD`. On failure (detached HEAD): warn and skip.
7. **Non-main branch handling** — if current branch is not the main branch (from GIT.md or default `main`), use it as the base for the new branch. Note this branch as the PR target for downstream PR creation.
8. **Branch collision resolution** — `git rev-parse --verify <branch>`. If the branch exists:
   - **Top-level goals:** call `ask_user` with three options: (a) Reuse existing branch — `git checkout <branch>`, (b) Create suffixed branch — append `-2`, `-3`, etc. until free, (c) Cancel branching — skip and continue on current branch.
   - **Subgoals:** auto-suffix without prompting (`-2`, `-3`, etc.).
9. **Checkout the branch** — `git checkout -b <branch>` (or `git checkout -b <branch> <current-branch>` for non-main base).

**Edge cases:** See [REFERENCE.md](REFERENCE.md) — covers no git repo, detached HEAD, uncommitted changes, shallow clone.

## PR Creation Protocol

Create a pull request when a goal is finalized. Follow these steps in order:

1. **Subgoal detection** — if the goal workspace path contains `/subgoals/`, skip this protocol entirely.
2. **Verify git repository** — `git rev-parse --show-toplevel`. On failure: warn and skip.
3. **Verify `gh` CLI available** — `command -v gh`. On failure: warn and skip.
4. **Verify `gh` authentication** — `gh auth status`. On failure: warn and skip.
5. **Determine target branch** — read `.pio/PROJECT/GIT.md` for main branch name, fallback `main`, or use the base branch recorded during Branch Checkout Protocol (non-main branch handling).
6. **Get current branch** — `git symbolic-ref --short HEAD`. On failure: warn and skip.
7. **Check for existing PR** — `gh pr list --head <branch> --base <target>`. If found and open: report URL and skip. If closed/merged (re-finalize): proceed to create a new one.
8. **Check for changes** — `git diff --shortstat <target>...<head>`. If empty: warn and skip.
9. **Push branch to remote** — `git push -u origin <branch>`. On failure: warn and skip.
10. **Construct PR title** — follow GIT.md Conventional Commits format. Pick type from observed types (`feat`, `fix`, `refactor`, etc.) based on goal name/summary. Fallback: short descriptive one-liner.
11. **Construct PR body** — if GIT.md specifies a PR body template, follow it. Otherwise construct from: GOAL.md summary, PLAN.md step list, per-step SUMMARY.md files (files changed).
12. **Create the PR** — `gh pr create --title "<title>" --body "<body>" --base <target> --head <branch>`.

**Edge cases:** See [REFERENCE.md](REFERENCE.md) — covers `gh` not installed, not authenticated, network failure, branch not pushed, no changes, existing PR, not a GitHub repo, re-finalize.

## Graceful Failure Semantics

If any git command fails, log a warning and proceed — **never block workflow completion**. Git operations may fail due to no git repository, missing git config, permission issues, or no changes to commit.

On failure, emit a warning (e.g., via `console.warn` or a notification) and continue. The agent should not retry or block waiting for user input.

## Future Extensibility

This skill is structured to accommodate additional git operations without restructuring:

- **Cherry-pick protocol:** Selectively apply commits across branches, following GIT.md conventions for commit selection and message handling.
- **Tag creation on release:** Annotate releases with versioned tags, following GIT.md tag naming patterns.
- **Git worktrees:** Evaluated and excluded per SPECIFICATION.md §4 — pio's sequential execution model (one task per goal slot) and VS Code's single-workspace constraint eliminate the need for parallel worktrees. Revisitable if parallel goal development becomes a stated requirement.

When new operations are added, follow the same patterns: convention lookup from GIT.md, graceful failure semantics, and capability-agnostic protocol design.
