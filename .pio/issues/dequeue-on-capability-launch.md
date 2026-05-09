# Dequeue all pending tasks when a capability session launches

When any capability sub-session is launched (via `/pio-next-task` or a direct command like `/pio-create-plan`, `/pio-evolve-plan`, etc.), all remaining task files in `.pio/session-queue/` should be drained.

## Rationale

Today the queue is only consumed by `/pio-next-task`. The `finally` block there removes the one file it processes. But two scenarios leave stale entries behind:

1. **Direct command supersedes queued task**: An agent enqueues a `create-plan` task via the tool API, then the user directly runs `/pio-create-plan my-goal`. The queued file is never consumed because the session was launched bypassing the queue. It should be removed since the work is being done directly.

2. **State machine override**: Tasks are queued following the transition pipeline (`create-goal` → `create-plan` → `evolve-plan`). If the user runs a capability out of order (e.g., `/pio-evolve-plan my-goal` while a `create-plan` task is still queued), the queued task becomes stale — the state machine path has diverged and it should be dequeued.

In both cases, **any pending queue entry at session launch time is stale** and should be removed.

## Current Behavior

- `/pio-next-task` reads the oldest `.json` file from `queueDir()`, launches a sub-session, then unlinks that single file in a `finally` block.
- Direct commands (`/pio-create-goal`, `/pio-create-plan`, `/pio-evolve-plan`, `/pio-goal-from-issue`) launch sessions via `launchCapability()` with no interaction with the queue at all.
- Tool handlers only **enqueue** tasks — they never drain the queue.

## Desired Behavior

When a capability sub-session is launched, all files in `.pio/session-queue/` should be removed before or after the session switch:

- `/pio-next-task`: already handles its own file; additionally drain any *other* remaining queue entries
- All direct command handlers: drain the entire queue before launching

This ensures the queue accurately reflects pending work — if a session is actively running, nothing should sit in the queue.

## Implementation Notes

- A utility function like `drainQueue(cwd: string): number` in `utils.ts` would be ideal — reads `.pio/session-queue/`, removes all `.json` files, returns count removed.
- Call it from `handleNextTask` (after reading the task but before launch, or after unlink) and from every direct command handler (`handleCreateGoal`, `handleCreatePlan`, `handleEvolvePlan`, `handleGoalFromIssue`).
- Alternatively, hook into `launchCapability()` in `session-capability.ts` to drain automatically for all callers — this is cleaner since it centralizes the behavior in one place. The function already receives `ctx.cwd`.

## Acceptance Criteria

- Running a direct command (`/pio-create-plan x`) when queue has pending entries removes all queue files
- Running `/pio-next-task` when multiple tasks are queued processes only the oldest and drains the rest
- No behavioral regression for single-task scenarios (queue was empty, or one task matched)
- `npm run check` passes with no type errors

## Category

improvement

## Context

Files involved:
- src/utils.ts — queueDir(), enqueueTask() — add drainQueue() utility
- src/capabilities/next-task.ts — handleNextTask already unlinks one file; needs to also drain remaining
- src/capabilities/session-capability.ts — launchCapability() is the central launcher used by all direct commands
- src/capabilities/create-goal.ts, create-plan.ts, evolve-plan.ts, goal-from-issue.ts — direct command handlers that bypass queue

Queue location: .pio/session-queue/*.json (timestamped filenames, lexicographic sort = chronological order)
