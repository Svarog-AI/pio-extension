# execute-task should auto-commit changes on completion

# execute-task should auto-commit changes on completion

When `execute-task` finishes implementing a step and writes `SUMMARY.md`, it should also run a `git commit` to save the changes. This creates a clean per-step checkpoint in git history, making it easy to inspect, revert, or diff individual plan steps.

## What to change

### `src/prompts/execute-task.md`
Add instructions near the completion section: after writing `SUMMARY.md` and before calling `pio_mark_complete`, run `git add -A && git commit -m "<step title>"` (or similar). The commit message should reference the step number and title.

### Behavior
- **Commit message format:** `pio: Step N — <title from PLAN.md>`
- **Scope:** Stage all changes (`git add -A`) — the agent only touched files for this one step
- **Graceful failure:** If git isn't configured or the repo has uncommitted dirty state, log a warning but don't block completion

## Open questions
- Should `execute-plan` (which runs multiple steps) commit per-step or once at the end? (Probably per-step for consistency)

## Category

improvement

## Context

Relevant files:
- `src/prompts/execute-task.md` — implementation agent prompt, add commit instruction near completion section
- `src/capabilities/execute-task.ts` — execute-task capability (may need no changes if handled via prompt only)
