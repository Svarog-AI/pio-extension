# /pio-next-task should auto-use the session's active goal

When `/pio-next-task` is invoked without arguments from a capability sub-session (e.g. after `create-plan`, `execute-task`, `review-code`), it should automatically use the current session's active goal instead of scanning all pending tasks and prompting the user when multiple goals have pending work.

## Current State

In `src/capabilities/next-task.ts`, the `handleNextTask` function handles three cases:

1. **Goal name provided as arg** — reads that specific goal's queue file (`readPendingTask`) and launches directly.
2. **No args, exactly one pending goal** — auto-launches the single pending task.
3. **No args, multiple pending goals** — displays a selection prompt listing all pending goals, requiring the user to re-run with an explicit goal name.

Case 3 is the problem. When invoked from a capability sub-session (e.g. after `pio_mark_complete` in an `execute-task` session), the current session already knows which goal it belongs to. This information is stored in the `pio-config` custom session entry, written by `launchCapability()` in `src/capabilities/session-capability.ts`. The config's `sessionParams` field includes `goalName` (e.g., `{ goalName: "fix-something", stepNumber: 2 }`).

However, `handleNextTask` never reads the current session's `pio-config`. It always falls back to scanning `.pio/session-queue/` via `listPendingGoals()` in `src/utils.ts`, which reads all `task-*.json` files across all goals. This produces unnecessary friction when the user is already working within a specific goal context.

Relevant files:
- `src/capabilities/next-task.ts` — `handleNextTask` needs to check session-scoped `goalName` before falling back to scanning
- `src/capabilities/session-capability.ts` — shows how `pio-config` is written (`newSm.appendCustomEntry("pio-config", config)`) and read (`ctx.sessionManager.getEntries().find(...)`)
- `src/utils.ts` — `readPendingTask(cwd, goalName)` can read a specific goal's task directly
- `src/types.ts` — `CapabilityConfig.sessionParams` may contain `goalName: string`

## To-Be State

In `handleNextTask`, when invoked without arguments, the command should:

1. **Check the current session's `pio-config` for `goalName`.** Read custom entries via `ctx.sessionManager.getEntries()`, find the `pio-config` entry, and extract `sessionParams.goalName`.
2. **If `goalName` is present**, call `readPendingTask(cwd, goalName)` directly and launch that task — no scanning, no prompt.
3. **Only fall back to scanning all pending goals** (current Case 2/3 behavior) if the session has no `pio-config` or no `goalName` in it (e.g., a fresh parent session with no active goal context).

This means the selection prompt ("Multiple goals have pending tasks...") appears only when the user genuinely has no active goal context — such as calling `/pio-next-task` from a top-level session where multiple unrelated goals are being worked on concurrently.

No new files are required. The change is confined to `src/capabilities/next-task.ts`. The fix should add a helper or inline logic to read the current session's `pio-config` and extract `goalName`, inserting this check between the "arg provided" case and the "scan all pending goals" case.
