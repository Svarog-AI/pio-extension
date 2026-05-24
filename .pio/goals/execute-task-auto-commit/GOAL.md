# Auto-commit on task completion

Add automatic `git commit` to pio workflow agents via a new reusable `pio-git` skill. The `execute-task` agent commits after each step; the `execute-plan` agent commits once at the end of all steps. This creates clean per-step checkpoints in git history, making it easy to inspect, diff, or revert individual plan steps.

The `pio-git` skill is designed as a shared git operations library for multiple capabilities. Auto-commit is the first operation; future goals will add branch checkout on `create-goal` and PR creation on `finalize-goal`.

## Current State

- **`src/prompts/execute-task.md`** — Step 9 ("Write completion artifacts") instructs the agent to write `COMPLETED`/`BLOCKED` markers and `SUMMARY.md`, then call `pio_mark_complete`. There is no git commit instruction anywhere in the prompt.
- **`src/prompts/execute-plan.md`** — Step 4 implements all steps sequentially, Step 5 runs final verification, Step 6 calls `pio_mark_complete`. No git commit instructions exist.
- **No skill for git operations exists.** The project has skills under `src/skills/` for pio workflow (`pio/SKILL.md`), TDD methodology (`test-driven-development/SKILL.md`), project knowledge (`pio-project-knowledge/SKILL.md`), and planning (`pio-planning/SKILL.md`) — but nothing that encapsulates git behavior.
- **`src/capabilities/execute-task.ts`** and **`src/capabilities/execute-plan.ts`** — Both are prompt-driven: all agent behavior is controlled by the injected markdown prompts. No git logic exists on the capability side.
- **`.pio/PROJECT/GIT.md`** — Documents project commit conventions: Conventional Commits (`type(scope): description`), observed types (`feat`, `refactor`, `fix`, `chore`, `test`, `docs`), and branch naming (`feat/<feature-name>`). The pio prefix is not yet documented as a convention, but individual step commits on feature branches already reference plan steps (e.g., `feat: implement per-capability model config (Steps 1-3)`).

Neither workflow creates git checkpoints. If an agent implements five steps, all changes remain uncommitted until the user manually runs `git add`/`git commit` after the session ends.

## To-Be State

### New skill: `src/skills/pio-git/SKILL.md`

A new skill that defines *how* pio agents perform git operations. The skill documents:

- **Delegation rule:** Before performing any commit or branch operation, read `.pio/PROJECT/GIT.md` to learn the project's conventions (commit message format, types, scope, branch naming). The skill does not define its own conventions — it always defers to GIT.md.
- **Staged commit protocol:** Stage *only* the files the agent actually changed — never `git add -A`. The exact staging strategy depends on the capability (see below). Construct commit messages following the format from GIT.md, handle errors gracefully.
- **Graceful failure semantics:** Log a warning and proceed if git fails — never block workflow completion.

#### Staging strategies

**For `execute-task` (per-step):** Read the just-written `SUMMARY.md`, extract file paths from the "Files Created", "Files Modified", and "Files Deleted" sections, and stage only those files with `git add <paths>`. This ensures the commit contains exactly the changes from this step — no pre-existing uncommitted work on the branch is included. (Note: `git add` on a deleted path correctly stages the deletion.)

**For `execute-plan` (all steps):** At session start, record a baseline of changed files using `git status --porcelain` (or equivalent). After all steps complete, compare against the baseline to determine which files are *newly* modified or created since the session started. Stage only those files. This avoids committing unrelated dirty state that existed before the session.

The skill is designed to grow. Future operations planned (out of scope for this goal but should be structurally accommodated):
- Branch checkout on `create-goal` — checkout a new branch based on `main` when a goal workspace is created (branch naming conventions come from GIT.md)
- PR creation on `finalize-goal` — open a pull request from the goal branch to `main` when a goal is finalized

### Updated conventions: `.pio/PROJECT/GIT.md`

Add pio-specific commit message formats to the existing conventions file:
- **`execute-task` commits:** `pio: Step N — <step title>` (e.g., `pio: Step 3 — Add path resolution utilities`)
- **`execute-plan` commits:** `pio: <goal-name> — all steps completed`

This keeps the single source of truth for conventions in GIT.md, and the skill simply tells agents to look there.

### Updated prompt: `src/prompts/execute-task.md`

Step 9 ("Write completion artifacts") gains an instruction between writing `SUMMARY.md` and calling `pio_mark_complete`: commit changes using the `pio-git` skill. The prompt instructs the agent to load `pio-git`, use the "per-step" staging strategy (read file lists from SUMMARY.md), and then proceed to completion. The capability prompt knows *what* to commit (files listed in the summary) but delegates *how* to the skill.

### Updated prompt: `src/prompts/execute-plan.md`

Two changes:
1. **Early in the process** (after reading GOAL.md/PLAN.md): record a baseline of current git state for later comparison.
2. **After Step 5** ("Final verification") and before Step 6 ("Signal completion"): commit using the `pio-git` skill with the "all-steps" staging strategy — compute changed files relative to the baseline, stage only those, and commit once.

### No capability code changes required

Both `src/capabilities/execute-task.ts` and `src/capabilities/execute-plan.ts` remain unchanged — behavior is entirely prompt+skill-driven. The agent has access to the `bash` tool for shell commands; the `pio-git` skill instructs which commands to run.
