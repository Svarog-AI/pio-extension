# /pio-next-task should auto-select the session's current goal instead of prompting when multiple goals have pending tasks

## Problem

When multiple goals have pending tasks, `/pio-next-task` displays a selection prompt to the user:

```
Multiple goals have pending tasks. Specify a goal:
 /pio-next-task <goal-name>

 Pending:
   - fix-agent-degenerate-looping
   - fix-skill-loading
```

This is unnecessary friction. The session already knows which goal it's working on — the `pio-config` custom entry (set by `launchCapability`) contains `goalName` in `sessionParams`. The user should never be asked to pick; the command should use the active goal automatically.

## Expected behavior

1. **When invoked from a capability session** (e.g., after `create-plan`, `execute-task` etc.), `/pio-next-task` with no args should check the current session's `pio-config` for `goalName` and use that directly — no selection prompt.
2. **Only fall back to prompting** if the command is called from a session that has no goal context at all (e.g., a fresh parent session).

## Current behavior

`src/capabilities/next-task.ts` -> `handleNextTask`:
- No args → calls `listPendingGoals()` → scans `.pio/session-queue/task-*.json` for ALL pending goals
- If >1 found → displays selection prompt to user
- Never checks whether the current session already has an active goal context

## Context

Relevant files:
- `src/capabilities/next-task.ts` — command handler, needs the fix
- `src/capabilities/session-capability.ts` — where `pio-config` is written via `newSm.appendCustomEntry("pio-config", config)`. Config includes `goalName` in `sessionParams`.
- `src/utils.ts` — `listPendingGoals`, `readPendingTask` utilities

## Proposed approach

In `handleNextTask`, before falling back to scanning all pending tasks:
1. Check if the current session has a `pio-config` entry with `goalName`
2. If yes, read that goal's pending task directly (`readPendingTask`) and launch it
3. Only scan all pending goals if no session-scoped goal is found

## Category

improvement
