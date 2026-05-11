# Fix pio_goal_from_issue creating goal workspace with wrong directory name

When `pio_goal_from_issue` is called with an explicit `name` parameter, the created goal workspace directory uses a derived name instead of the provided `name`. This causes orphaned directories and requires manual cleanup.

## Current State

The `pio_goal_from_issue` tool and command live in `src/capabilities/goal-from-issue.ts`. Both accept two parameters: `name` (desired goal workspace name) and `issuePath` (issue file identifier).

**Tool path (`defineTool.execute`):** Validates via `validateGoalFromIssue(ctx.cwd, params.name, params.issuePath)` — correctly uses `params.name` for directory existence checks. Enqueues with `enqueueTask(ctx.cwd, params.name, { capability: "create-goal", params: { goalName: params.name, initialMessage: ..., fileCleanup: [...] } })`. The queue file is written as `task-{params.name}.json`, and enqueued params include `goalName: params.name`.

**Command path (`handleGoalFromIssue`):** Parses args into `issuePath` and `name`, validates similarly, calls `resolveCapabilityConfig(ctx.cwd, { capability: "create-goal", goalName: name, ... })` and passes the result to `launchCapability()`.

In `src/utils.ts`, `resolveCapabilityConfig` derives `workingDir` from `params.goalName` via `resolveGoalDir(cwd, goalName)`, which produces `.pio/goals/<name>/`. The queue file format in `enqueueTask` is also correct — it writes to `task-{goalName}.json`.

In `src/capabilities/next-task.ts`, `launchAndCleanup` reads the queue file with `readPendingTask(ctx.cwd, goalName)` and calls `resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability })` — spreading the enqueued params (including `goalName`).

**The bug (confirmed live during previous session):** Calling `pio_goal_from_issue(name: "goal-from-issue-wrong-directory-name", issuePath: "...")` should produce a session writing to `.pio/goals/goal-from-issue-wrong-directory-name/GOAL.md`. Instead, the create-goal session's allowed write target was `.pio/goals/fix-goal-from-issue-directory-name/GOAL.md` — a different directory entirely. The queue file correctly contained `goalName: "goal-from-issue-wrong-directory-name"`, but something between queue resolution and session creation transformed the goal name. The exact point of failure requires investigation — it may involve how pi's framework resolves working directories from session params, or a mismatch in how `next-task.ts` passes params to `resolveCapabilityConfig`.

**Secondary issue:** The tool path in `goal-from-issue.ts` never calls `prepareGoal()` to create the goal directory before enqueuing — unlike `src/capabilities/create-goal.ts` which creates the directory upfront with `fs.mkdirSync`. This means the goal workspace may not exist when `/pio-next-task` dequeues and launches the session.

## To-Be State

1. **The `name` parameter always determines the goal workspace directory.** Whether called via tool or command, the goal is created at `.pio/goals/<name>/`, regardless of the issue file's slug. The issue file serves only as input context for the create-goal session.

2. **No orphaned directories.** A single goal directory with the correct name is created. No extra directories appear.

3. **Goal directory exists before the create-goal session starts.** The tool path must also create the workspace directory (using the same `prepareGoal` pattern from `src/capabilities/create-goal.ts`) before enqueuing, matching both the command path and the regular `pio_create_goal` tool.

4. **Root cause identified and fixed.** Investigation pinpoints exactly where the goal name is transformed — whether in param propagation through `goal-from-issue.ts`, queue resolution in `next-task.ts`, config resolution in `utils.ts`, or pi's framework session handling. The fix addresses that specific point.

5. **Reproduction case passes.** Calling `pio_goal_from_issue(name: "my-goal-name", issuePath: "some-completely-different-issue.md")` produces a single directory at `.pio/goals/my-goal-name/` with no orphaned directories.

**Files to investigate and potentially modify:**
- `src/capabilities/goal-from-issue.ts` — primary implementation, validate param passing and directory creation
- `src/utils.ts` — `resolveCapabilityConfig`, `enqueueTask`
- `src/capabilities/next-task.ts` — `launchAndCleanup` (queue param resolution)
- `src/capabilities/create-goal.ts` — reference for `prepareGoal` directory creation pattern
