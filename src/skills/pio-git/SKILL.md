---
name: pio-git
description: Perform git operations for pio workflow agents — commit changes, stage files selectively, and construct commit messages. Use when a pio agent needs to commit code changes, stage files for a commit, or perform other git operations during workflow execution.
---

## Overview

This skill defines how pio agents perform git operations using shell commands via the `bash` tool. It is capability-agnostic — any pio prompt can invoke these protocols. The skill provides a unified commit workflow that adapts to context (per-step vs. full-plan commits).

## Convention Lookup Rule

Before performing any git operation, read `.pio/PROJECT/GIT.md` to learn the project's conventions:

- Commit message format (Conventional Commits, custom prefixes)
- Observed commit types and scope usage
- Branch naming patterns
- Signing practices (GPG, DCO, or none)

**The skill never defines its own conventions.** It always defers to GIT.md. If `.pio/PROJECT/GIT.md` does not exist, fall back to a short descriptive one-liner commit message.

## Staged Commit Protocol

Stage only the files the agent actually changed. **Never use `git add -A`** — only stage explicitly determined files.

### Staging strategy

Use this unified approach:

1. **If `SUMMARY.md` exists in the working directory** (typically from `execute-task` per-step commits):
   - Extract file paths from the "Files Created", "Files Modified", and "Files Deleted" sections
   - Stage those exact paths: `git add <path1> <path2> ...`
   - Note: `git add` on a deleted path correctly stages the deletion

2. **Otherwise** (typically from `execute-plan` or ad-hoc commits):
   - Run `git status --porcelain` to find all changed and untracked files
   - Extract file paths from the output (strip the status prefix, e.g., `M ` or `??`)
   - Stage those paths: `git add <path1> <path2> ...`

### Commit message construction

- Read `.pio/PROJECT/GIT.md` and follow its conventions exactly
- Write a short descriptive one-liner summarizing the change
- **Do not include "Step N" or similar substrings** in commit messages — the commit message should describe the change, not reference plan step numbers
- If GIT.md does not exist, use a plain descriptive one-liner (e.g., "add path resolution utilities")

### Execution steps

```bash
# 1. Stage the determined files
git add <path1> <path2> ...

# 2. Commit with the constructed message
git commit -m "<message>"
```

## Graceful Failure Semantics

If any git command fails, log a warning and proceed — **never block workflow completion**. Git operations may fail due to:

- No git repository in the working directory
- Git not configured (user.name, user.email missing)
- Permission issues
- No changes to commit (empty staging area)

On failure, emit a warning (e.g., via `console.warn` or a notification) and continue with the workflow. The agent should not retry or block waiting for user input.

## Future Extensibility

This skill is structured to accommodate additional git operations without restructuring:

- **Branch checkout on `create-goal`:** Checkout a new branch based on `main` when a goal workspace is created. Branch naming conventions come from GIT.md.
- **PR creation on `finalize-goal`:** Open a pull request from the goal branch to `main` when a goal is finalized.

When these operations are added, follow the same patterns: convention lookup from GIT.md, graceful failure semantics, and capability-agnostic protocol design.
