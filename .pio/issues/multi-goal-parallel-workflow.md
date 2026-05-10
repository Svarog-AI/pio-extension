# Support parallel work on multiple goals

Currently pio supports only one active workflow at a time. The session queue holds a single task (`.pio/session-queue/task.json` — see `enqueueTask` in `src/utils.ts`), and `/pio-next-task` reads that fixed file with no goal parameter. If you enqueue a task for goal B while goal A's plan is half-done, the previous task is overwritten and lost.

This makes it impossible to context-switch between goals or run multiple goals concurrently across sessions.

## Current limitations

1. **Single-slot queue:** `enqueueTask()` always writes to `task.json`, overwriting any existing entry. Only one pending task survives at a time.
2. **No goal targeting:** `/pio-next-task` reads the single file — no way to say "process the next task for goal X".
3. **Linear transition model:** `CAPABILITY_TRANSITIONS` in `utils.ts` defines a fixed happy-path chain (`create-goal → create-plan → evolve-plan → ...`). This works per-goal but has no notion of which goal a transition belongs to when multiple goals exist.
4. **No active-goal tracking:** Nothing tracks which goal(s) are "in progress" vs. "completed" vs. "blocked", so there's no way to list, switch, or resume.

## Proposed approach

### 1. Per-goal queue (or per-task unique filenames)

Instead of a single `task.json`, use either:

- **Per-goal queue directories:** `.pio/session-queue/<goal-name>/task.json` — each goal has its own slot
- **Unique timestamped files** (as the README already mentions): `{timestamp}-{capability}-{goalName}.json` — full FIFO with goal attribution

The timestamped-file approach is more flexible: supports multiple pending tasks per goal AND cross-goal interleaving. The `enqueueTask` function would accept a `goalName` and produce filenames like `20260510_143000-evolve-plan-auth-redesign.json`.

### 2. Goal-scoped `/pio-next-task`

Extend the command to accept an optional goal name:

```
/pio-next-task           → dequeue oldest task from any goal (global FIFO)
/pio-next-task <goalName> → dequeue oldest task for a specific goal
```

When dequeuing, include `goalName` in session params so downstream capabilities know which workspace they belong to.

### 3. Goal status tracking

Add a lightweight `.pio/goals/<name>/STATUS` file (or embed in GOAL.md metadata) with values: `active`, `blocked`, `completed`, `abandoned`. This enables:

- `/pio-list-goals` — show all goals with status, current step
- Prioritization when dequeuing globally (e.g., only dequeue from `active` goals)

### 4. Context isolation

Ensure that switching between goals restores the correct working directory and context:

- `launchCapability` already derives `workingDir` from `params.goalName` — this should continue to work
- Verify `session-before-switch` cleanup doesn't leak state across goals

## What NOT to change

- The per-step sub-session model (one session = one capability = one goal step) is correct and should stay
- PLAN.md, TASK.md formats are goal-local already — no changes needed there
- The transition logic itself is fine — just needs goal scoping

## Scope

Primary changes:
- `src/utils.ts` — `enqueueTask` (unique filenames), add `findNextTask(goalName?)`, add `dequeueTask(filePath)` 
- `src/capabilities/next-task.ts` — accept optional `<goalName>` arg, scan queue directory instead of fixed file
- New command: `/pio-list-goals` (list all goals with status)

Secondary considerations:
- Should `enqueueTask` be called from more places? Currently only used by the exit-gate transition logic in `validation.ts`
- Timestamp format: `YYYYMMDD_HHMMSS` (existing convention mentioned in PROJECT.md)

## Category

improvement

## Context

Relevant files:
- src/utils.ts — enqueueTask, queueDir, CAPABILITY_TRANSITIONS, resolveNextCapability
- src/capabilities/next-task.ts — single-slot task reading (task.json)
- src/capabilities/validation.ts — exit gate that calls enqueueTask for transitions
- .pio/session-queue/ — current single-file queue layout
