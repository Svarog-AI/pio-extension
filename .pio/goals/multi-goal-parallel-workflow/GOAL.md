# Multi-Goal Parallel Workflow

Enable pio to support concurrent work on multiple goals: a per-goal pending task slot, goal-scoped task dequeuing, last-task history per goal, and a command to list all goals. This removes the single-slot bottleneck so developers can context-switch between goals without losing pending tasks.

## Current State

The session queue is a single fixed file `.pio/session-queue/task.json`. The function `enqueueTask()` in `src/utils.ts` always writes to this one path, overwriting any previously enqueued task. This means only the most recently enqueued task survives — if you start a task for goal B while goal A's task is pending, goal A's task is silently lost.

The `/pio-next-task` command (`src/capabilities/next-task.ts`) reads exactly this one file (`task.json`) with no parameters. There is no way to specify which goal's task to process next. The handler parses the task, resolves capability config via `resolveCapabilityConfig()`, launches the sub-session via `launchCapability()`, and deletes the file on completion (success or error).

The auto-transition mechanism lives in `pio_mark_complete` (`src/capabilities/validation.ts`). When validation passes, it extracts the goal name from the working directory, resolves the next capability via `resolveNextCapability()` (which reads `CAPABILITY_TRANSITIONS` from `src/utils.ts`), and calls `enqueueTask()` to write the next task. This path also uses the single-slot file — no goal scoping is applied during enqueuing.

The transition map (`CAPABILITY_TRANSITIONS` in `src/utils.ts`) defines a fixed chain: `create-goal → create-plan → evolve-plan → execute-task → (evolve-plan | review-code)`. The transitions work correctly per-goal but carry no notion of which goal a queued task belongs to beyond the `goalName` field in `params`.

There is no mechanism to track goal status. Nothing distinguishes goals that are active, completed, blocked, or abandoned. There is no command to list goals or their current state.

## To-Be State

### Per-goal queue files

Replace the single `task.json` with per-goal files: `.pio/session-queue/task-{goalName}.json`. Each goal gets its own slot — one pending task at a time, matching how pio actually works (one session = one capability step). The `enqueueTask()` function in `src/utils.ts` will accept a `goalName` parameter and write directly to the known path. No timestamps, no scanning, no sorting.

### Simplified queue access

With one file per goal, there's no FIFO to scan:
- `enqueueTask(cwd, goalName, task)` — writes directly to `.pio/session-queue/task-{goalName}.json`
- `readPendingTask(cwd, goalName)` — reads the specific file for a goal (or returns `undefined`)
- `listPendingGoals(cwd)` — lists goal names that have a pending task file (for `/pio-next-task` with no arg)
- Dequeue is read + delete on the known path (same pattern as current `next-task.ts`, just parameterized by goal name).

### Goal-scoped `/pio-next-task`

Extend `src/capabilities/next-task.ts` so the command accepts an optional `<goalName>` argument:
- `/pio-next-task <goalName>` → reads and launches the task from `.pio/session-queue/task-{goalName}.json`
- `/pio-next-task` (no arg) → lists goals with pending tasks; if exactly one, launches it; if multiple, notifies user to specify a goal

When launching, pass `goalName` in session params so downstream capabilities know which workspace they belong to. The handler reads the known file path directly — no scanning needed.

### Last-executed-task tracking per goal

Instead of introducing explicit status enums, derive goal state from the files that already exist on disk (GOAL.md, PLAN.md, step folders, APPROVED markers). To track execution history without adding managed state, store the last completed task in each goal directory as `.pio/goals/<name>/LAST_TASK.json`.

This file uses the same JSON shape as queue tasks (`capability` + `params`), where `params` carries `_sessionContext` (the accumulated history of capabilities executed for this goal). After a capability session completes validation, the completed task record is written here — alongside enqueuing the next task. This provides:
- Task history per goal (what was done last, what came before)
- Resume context if a goal needs to be picked up later
- No separate state machine or status file to keep in sync

### New `/pio-list-goals` command

A new command that lists all goal workspaces under `.pio/goals/`, showing:
- Goal name (derived from directory name)
- Current phase (inferred from existing files: GOAL.md only → defined, PLAN.md exists → planned, TASK.md for a step → in progress, APPROVED markers → completed steps)
- Last executed task (read from `LAST_TASK.json` if present, showing the last capability name and params)

This gives users visibility into all parallel workstreams without introducing managed status state.

### What does not change

- Per-step sub-session model: one session = one capability = one goal step (unchanged)
- PLAN.md and TASK.md formats (already goal-local, no changes needed)
- The transition logic itself (`CAPABILITY_TRANSITIONS` — just needs goal scoping via filenames)
- File protection and validation rules in `validation.ts`

### Primary file changes

- `src/utils.ts` — refactor `enqueueTask(cwd, goalName, task)` to write per-goal files; add `readPendingTask(cwd, goalName)`, `listPendingGoals(cwd)`, and `writeLastTask(goalDir, task)`
- `src/capabilities/next-task.ts` — accept optional `<goalName>` arg, read from known path instead of fixed file
- New command: `/pio-list-goals` (list goals with inferred phase and last executed task)
- `src/capabilities/validation.ts` — after validation passes, write completed task to `.pio/goals/<name>/LAST_TASK.json` alongside enqueuing the next task; ensure `enqueueTask` calls include `goalName`
