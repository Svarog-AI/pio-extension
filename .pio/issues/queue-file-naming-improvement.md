# Session queue files should include capability name for clarity

## Current behavior

Queue files are named `task-{goalName}.json` (e.g. `task-fix-skill-loading.json`). The `task-` prefix doesn't convey which capability is pending.

## Proposed change

Rename to `{goalName}_{capability}.json` format, e.g.:

- `fix-skill-loading_create-goal.json`
- `fix-skill-loading_create-plan.json`
- `fix-skill-loading_evolve-plan.json`

## Benefits

1. Instantly visible what task type is pending when running `ls .pio/session-queue/`
2. No ambiguity about the nature of the queued work
3. Still one file per goal (enforced by `enqueueTask`), so no conflict issues

## Files to change

- `src/utils.ts` — `enqueueTask`, `readPendingTask`, `listPendingGoals` all reference the `task-{goalName}.json` pattern

## Category

improvement

## Context

See src/utils.ts: enqueueTask writes to `task-${goalName}.json`. The current queue has `task-fix-skill-loading.json` which doesn't indicate the "create-goal" capability is pending.
