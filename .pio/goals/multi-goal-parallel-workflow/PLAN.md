# Plan: Multi-Goal Parallel Workflow

Replace the single-slot session queue (`task.json`) with per-goal queue files, add goal-scoped task dequeuing, last-task history tracking, and a `/pio-list-goals` command — enabling concurrent work on multiple goals without losing pending tasks.

## Prerequisites

None.

## Steps

### Step 1: Refactor `enqueueTask` to per-goal files + add queue utilities

**Description:** Rewrite `enqueueTask` in `src/utils.ts` so it writes to `.pio/session-queue/task-{goalName}.json` instead of the fixed `task.json`. The function signature changes from `enqueueTask(cwd, task)` to `enqueueTask(cwd, goalName, task)`, computing the per-goal path deterministically. Add two new utility functions: `readPendingTask(cwd, goalName)` (reads a specific goal's queue file, returns `SessionQueueTask | undefined`) and `listPendingGoals(cwd)` (lists all goal names that have a pending task file by scanning the queue directory for `task-*.json` patterns).

Update the doc comments on these functions to reflect the per-goal naming convention. Keep `queueDir(cwd)` unchanged — it still returns the shared `.pio/session-queue/` directory.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `enqueueTask` is exported with signature `(cwd: string, goalName: string, task: SessionQueueTask) => void`
- [ ] `readPendingTask` is exported with signature `(cwd: string, goalName: string) => SessionQueueTask | undefined`
- [ ] `listPendingGoals` is exported with signature `(cwd: string) => string[]`

**Files affected:**
- `src/utils.ts` — refactor `enqueueTask`, add `readPendingTask`, add `listPendingGoals`

---

### Step 2: Add `writeLastTask` utility

**Description:** Add a new function `writeLastTask(goalDir, task)` to `src/utils.ts` that writes the completed task record as JSON to `.pio/goals/<name>/LAST_TASK.json` inside the goal directory. The JSON shape matches `SessionQueueTask` (`capability` + `params`). This provides execution history per goal without introducing managed state.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `writeLastTask` is exported with signature `(goalDir: string, task: SessionQueueTask) => void`
- [ ] The function writes JSON to `<goalDir>/LAST_TASK.json`

**Files affected:**
- `src/utils.ts` — add `writeLastTask` function

---

### Step 3: Update goal-scoped capability tool handlers to pass `goalName`

**Description:** Update all tool handler calls to `enqueueTask` in the following capabilities to include `goalName` as the second argument. These are the call sites where a task is enqueued for a specific goal:

- `src/capabilities/create-goal.ts` — `params.name` is the goal name
- `src/capabilities/create-plan.ts` — `params.name` is the goal name
- `src/capabilities/evolve-plan.ts` — `params.name` is the goal name
- `src/capabilities/execute-task.ts` — `params.name` is the goal name
- `src/capabilities/review-code.ts` — `params.name` is the goal name
- `src/capabilities/goal-from-issue.ts` — `params.name` is the goal name

Each call changes from `enqueueTask(ctx.cwd, { capability: "...", params: { goalName: ... } })` to `enqueueTask(ctx.cwd, params.name, { capability: "...", params: { goalName: ... } })`. The import of `enqueueTask` in each file also needs updating (the function signature changed).

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] All six files listed above compile without errors and call `enqueueTask(cwd, goalName, task)` with the correct 3 arguments

**Files affected:**
- `src/capabilities/create-goal.ts` — update enqueueTask call
- `src/capabilities/create-plan.ts` — update enqueueTask call
- `src/capabilities/evolve-plan.ts` — update enqueueTask call
- `src/capabilities/execute-task.ts` — update enqueueTask call
- `src/capabilities/review-code.ts` — update enqueueTask call
- `src/capabilities/goal-from-issue.ts` — update enqueueTask call

**Parallel with Step 4:** Steps 3, 4, and 5 are independent of each other after Step 1 completes.

---

### Step 4: Update validation auto-enqueue + write LAST_TASK.json

**Description:** In `src/capabilities/validation.ts`, update the auto-enqueue logic (inside the `pio_mark_complete` tool's execute handler) to use the new 3-argument `enqueueTask(cwd, goalName, task)` signature. The `goalName` is already extracted via `extractGoalName(dir)` in this file. After enqueuing the next task, also call `writeLastTask(goalDir, completedTask)` to record what just finished — writing to `<goalDir>/LAST_TASK.json`. The completed task record should capture the current capability name and its session params.

Import `writeLastTask` from `../utils`. Construct the goal directory path using `resolveGoalDir(cwd, goalName)` before calling `writeLastTask`.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `enqueueTask` call in validation.ts uses 3 arguments with `goalName` as the second arg
- [ ] After successful enqueuing, `writeLastTask` is called to record the completed task

**Files affected:**
- `src/capabilities/validation.ts` — update enqueueTask call, add writeLastTask call

**Parallel with Step 3:** Independent from Step 3 after Step 1 completes.

---

### Step 5: Remove project-context queuing (launch directly)

**Description:** In `src/capabilities/project-context.ts`, remove the `enqueueTask` call from the tool's execute handler. Instead, have the tool resolve the capability config and launch the session directly — matching the pattern the command handler already uses. This eliminates the need for a goal-less queue slot entirely. The import of `enqueueTask` should be removed if it becomes unused.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] The tool handler resolves config and launches directly (no enqueuing)
- [ ] No import of `enqueueTask` remains in `project-context.ts`

**Files affected:**
- `src/capabilities/project-context.ts` — replace enqueueTask with direct launch, remove unused imports

**Parallel with Step 3:** Independent from Steps 3 and 4 after Step 1 completes.

---

### Step 6: Extend `/pio-next-task` with goal scoping

**Description:** Rewrite the command handler in `src/capabilities/next-task.ts` to accept an optional `<goalName>` argument. When provided (`/pio-next-task <goalName>`), read and launch the task from `.pio/session-queue/task-{goalName}.json` using `readPendingTask(cwd, goalName)`. When no arg is provided, call `listPendingGoals(cwd)`: if zero goals have pending tasks, notify user; if exactly one, auto-launch it; if multiple, list them and ask the user to specify a goal.

After launching, delete the queue file for that goal (same pattern as today's unlink, just using the per-goal path). Remove any reference to `task.json` in this file. Import `readPendingTask` and `listPendingGoals` from `../utils`.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `/pio-next-task <goalName>` reads the correct per-goal file and launches the task
- [ ] `/pio-next-task` with no arg lists pending goals, auto-launches if exactly one exists
- [ ] The queue file is deleted after successful launch

**Files affected:**
- `src/capabilities/next-task.ts` — add goalName argument, use readPendingTask/listPendingGoals, update notifications

---

### Step 7: Create `/pio-list-goals` command

**Description:** Add a new command handler that lists all goal workspaces under `.pio/goals/`. For each goal directory (derived from subdirectory names), infer the current phase by checking which files exist: GOAL.md only → "defined", PLAN.md present → "planned", step folders with TASK.md → "in progress". If `LAST_TASK.json` exists in the goal dir, show the last executed capability name. Display the results as a formatted notification to the user.

Register this command via `pi.registerCommand("pio-list-goals", ...)` following the existing pattern (e.g., `setupDeleteGoal`). Wire it into `src/index.ts`. The phase inference uses only filesystem checks — no managed state or status enums. Use `resolveGoalDir`, `fs.existsSync`, and read LAST_TASK.json where present to determine display info.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] Running `/pio-list-goals` shows a table of goals with name, phase, and last task info
- [ ] Phase is correctly inferred from existing files (defined/planned/in progress)
- [ ] The command handles edge cases: no goals exist (shows "No goals found"), empty goal directories

**Files affected:**
- `src/capabilities/list-goals.ts` — new file: command handler for listing goals
- `src/index.ts` — import and call `setupListGoals(pi)`

---

## Notes

- **Backwards compatibility for the queue directory:** After this change, old `task.json` files will be silently ignored. Any task still in the old format when this deploys will be lost. This is an acceptable trade-off since queue files are ephemeral and short-lived. No migration logic is needed.
- **Goal name sanitization:** The per-goal filename `task-{goalName}.json` assumes goal names contain only filesystem-safe characters. The existing `prepareGoal` function in `create-goal.ts` doesn't currently sanitize names. If this becomes a concern, add a validation step — but it's outside the scope of this plan.
- **`CAPABILITY_TRANSITIONS` in `src/utils.ts` does not change.** The transition map is purely logical (capability → next capability) and already carries `goalName` through session params. No modifications needed there.
- **File protection:** `LAST_TASK.json` will need to be writable by the validation auto-enqueue path but should not be modified during regular capability sessions. The existing `.pio/` write protection in `validation.ts` blocks writes outside the goal workspace's allowlist — since LAST_TASK.json lives inside `<goalDir>/`, it's inside the session's own working directory and will be permitted by the "session own workingDir" rule.
- **Steps 3, 4, and 5 can execute in parallel.** All three depend only on Step 1 (the new `enqueueTask` signature). Steps 6 and 7 also depend on Step 1 but are independent of each other.
