# Plan: Delete Issue File on Goal Conversion

Add issue file deletion to `src/capabilities/goal-from-issue.ts` so that converting an issue into a goal automatically removes the source `.pio/issues/<slug>.md` file.

## Prerequisites

None.

## Steps

### Step 1: Add issue deletion to both handlers in goal-from-issue.ts

**Description:** In `src/capabilities/goal-from-issue.ts`, add `fs.rmSync(validation.issuePath, { force: true })` immediately after the goal directory creation (`fs.mkdirSync`) and before the enqueue/launch call in **both** the tool `execute` handler (around line 52) and the command `handleGoalFromIssue` handler (around line 92). This deletes the source issue file only when validation has passed — the early returns on validation failure guarantee the issue is untouched on errors. The `fs` module is already imported (`import * as fs from "node:fs"`), so no new imports are needed.

**Acceptance criteria:**
- [ ] `npm run check` passes with no type errors
- [ ] In the tool `execute` handler, `fs.rmSync(validation.issuePath, { force: true })` is called after `fs.mkdirSync(goalDir)` and before `enqueueTask()`
- [ ] In the command `handleGoalFromIssue` handler, `fs.rmSync(validation.issuePath, { force: true })` is called after `fs.mkdirSync(goalDir)` and before `resolveCapabilityConfig()` / `launchCapability()`
- [ ] No other files are modified; no new imports, dependencies, or API changes
- [ ] Validation-failure paths (issue not found, goal already exists) still return early without touching the issue file

**Files affected:**
- `src/capabilities/goal-from-issue.ts` — add one `fs.rmSync` line in each of the two handlers (tool execute, command handleGoalFromIssue)

## Notes

- The `{ force: true }` option on `rmSync` ensures no error is thrown if the file somehow no longer exists at deletion time (defensive), matching the spirit of existing patterns like `next-task.ts`'s try/catch around `unlinkSync`.
- `validation.issuePath` is always an absolute path (resolved by `findIssuePath()` in `utils.ts`), so no path resolution issues.
- The `{ recursive: true }` option used in `delete-goal.ts` is unnecessary here since issue files are plain files, not directories — a simple `rmSync` with `{ force: true }` suffices.
