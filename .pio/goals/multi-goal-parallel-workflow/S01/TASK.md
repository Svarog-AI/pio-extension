# Task: Refactor `enqueueTask` to per-goal files + add queue utilities

Replace the single-slot `task.json` with per-goal queue files (`task-{goalName}.json`) and add helper functions for reading/dequeueing per goal.

## Context

Currently `enqueueTask(cwd, task)` writes to a fixed path `.pio/session-queue/task.json`, silently overwriting any previously queued task. This means only one pending task can exist at a time across all goals. To support parallel work on multiple goals, each goal needs its own queue file.

## What to Build

### 1. Refactor `enqueueTask`

Change the signature from `(cwd: string, task: SessionQueueTask) => void` to `(cwd: string, goalName: string, task: SessionQueueTask) => void`. The function computes the per-goal path deterministically as `.pio/session-queue/task-{goalName}.json` and writes JSON there. The body of the function (calling `queueDir`, `writeFileSync`) stays the same — only the filename changes from `"task.json"` to `` `task-${goalName}.json` ``.

### 2. Add `readPendingTask`

A new exported function: `(cwd: string, goalName: string) => SessionQueueTask | undefined`. It constructs the per-goal path, checks if the file exists (returning `undefined` if not), reads the JSON content, parses it, and returns the result as `SessionQueueTask`. Follows the same pattern as the current monolithic read in `next-task.ts` but parameterized by goal name.

### 3. Add `listPendingGoals`

A new exported function: `(cwd: string) => string[]`. It scans `.pio/session-queue/` for files matching the pattern `task-*.json`, extracts the goal name from each filename (stripping the `task-` prefix and `.json` extension), and returns an array of goal names. Use `fs.readdirSync` + filter by regex or string startsWith/endsWith checks. Return an empty array if the queue directory has no matching files.

### 4. Update doc comments

Update the JSDoc on `enqueueTask` to reflect the per-goal naming convention. The current comment says "Write the pending task to a single fixed file `.pio/session-queue/task.json`" — update it to describe per-goal files.

## Code Components

### `enqueueTask(cwd: string, goalName: string, task: SessionQueueTask): void`
- **What:** Writes a JSON task file for a specific goal. The path is computed as `{queueDir}/task-{goalName}.json`. Overwrites any existing file for that goal (one slot per goal).
- **Interface:** `enqueueTask(cwd: string, goalName: string, task: SessionQueueTask): void`
- **Fits with:** Existing `queueDir(cwd)` — reused to resolve the directory. Callers must now pass `goalName` as the second argument.

### `readPendingTask(cwd: string, goalName: string): SessionQueueTask | undefined`
- **What:** Reads and parses the queue file for a specific goal. Returns `undefined` if the file doesn't exist (no pending task for that goal).
- **Interface:** `readPendingTask(cwd: string, goalName: string): SessionQueueTask | undefined`
- **Fits with:** Used by the updated `next-task.ts` handler (Step 6) to read per-goal tasks.

### `listPendingGoals(cwd: string): string[]`
- **What:** Discovers all goals that currently have a pending task by scanning the queue directory for `task-*.json` files. Returns an array of goal names (strings extracted from filenames).
- **Interface:** `listPendingGoals(cwd: string): string[]`
- **Fits with:** Used by `next-task.ts` (Step 6) to list pending goals when no argument is provided. Also used by the future `/pio-list-goals` command (Step 7).

## Approach and Decisions

- **Keep `queueDir(cwd)` unchanged.** It still returns `.pio/session-queue/` — no per-goal subdirectories needed since filenames encode the goal identity.
- **Deterministic paths.** No timestamps, no random suffixes. The path is always `{queueDir}/task-{goalName}.json`. This means one pending task per goal at a time, which matches pio's model (one session = one capability step).
- **Use `fs.existsSync` guard in `readPendingTask`.** Return `undefined` early if the file doesn't exist — don't throw.
- **Regex or string ops for `listPendingGoals`.** Use `fs.readdirSync` on the queue dir, filter files matching `/^task-(.+)\.json$/`, and extract the goal name (the capture group). No need for glob libraries.
- **Follow existing conventions.** All functions are exported at module level (no namespacing). Use JSDoc comments consistently with other utilities in `src/utils.ts`.

## Dependencies

None. This is Step 1 — no earlier steps to depend on.

## Files Affected

- `src/utils.ts` — refactor `enqueueTask` (add `goalName` parameter, change filename), add `readPendingTask`, add `listPendingGoals`, update doc comments

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `enqueueTask` is exported with signature `(cwd: string, goalName: string, task: SessionQueueTask) => void`
- [ ] `readPendingTask` is exported with signature `(cwd: string, goalName: string) => SessionQueueTask | undefined`
- [ ] `listPendingGoals` is exported with signature `(cwd: string) => string[]`

## Risks and Edge Cases

- **Goal names with special characters:** Goal names should be filesystem-safe (alphanumeric, hyphens, underscores). The plan notes this as an accepted limitation — no sanitization needed in this step.
- **Backwards compatibility:** After this change, any existing `task.json` file is silently ignored. This is acceptable per the plan notes — queue files are ephemeral. No migration logic needed.
- **Downstream callers will break:** All callers of `enqueueTask` (in capabilities) currently pass 2 arguments. They will fail to compile after this step. Steps 3 and 4 will update them. This is expected and correct behavior for TDD — the type errors in other files are a signal that those steps need to run.
- **Empty queue directory:** `listPendingGoals` should handle an empty directory gracefully (return `[]`) without throwing.
