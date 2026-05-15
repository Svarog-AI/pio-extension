# Task: Migrate capability pre-launch validation to use `GoalState`

Replace ad-hoc filesystem scanning in three capability modules with calls to `createGoalState()`, consolidating all goal-state queries behind a single lazy-evaluated interface.

## Context

Currently, each capability that needs to understand "what's the current step status" or "is this step ready" performs its own `fs.existsSync` checks. This results in duplicated scanning logic across `evolve-plan.ts`, `execute-task.ts`, and `review-code.ts`. Step 1 created `src/goal-state.ts` with the `GoalState` interface and `createGoalState()` factory — a lazy-evaluated view that centralizes all these filesystem queries. This step migrates the three capability modules to use it.

## What to Build

Replace raw `fs.existsSync` calls inside validation functions with equivalent queries against the `GoalState` object. The exported function signatures remain identical — only internal implementation changes from direct `fs` calls to `GoalState` method invocations.

### Code Components

#### 1. `evolve-plan.ts` — `validateAndFindNextStep()`

Currently does:
- `fs.existsSync(goalDir)` — goal directory existence
- `fs.existsSync(planPath)` — PLAN.md existence
- `fs.existsSync(completedPath)` — root-level COMPLETED marker
- `discoverNextStep(goalDir)` — scans S01/S02 for TASK.md+TEST.md

Replace with:
- Try to construct `GoalState` via `createGoalState(goalDir)`. If the directory doesn't exist, this will still throw or return an object where `hasGoal()` returns false. Use a try-catch or pre-check `fs.existsSync(goalDir)` for the goal dir itself (structural check, not state-dependent).
- `state.hasPlan()` instead of `fs.existsSync(planPath)`
- Check root-level COMPLETED: this is NOT part of `GoalState`. Keep the direct `fs.existsSync(completedPath)` check since COMPLETED at the goal workspace root is a migration-era marker not represented in `GoalState`. Alternatively, skip if the existing behavior is "block relaunch when all steps specified" — verify whether this is still needed.
- `state.currentStepNumber()` instead of `discoverNextStep(goalDir)`

The function should import `createGoalState` from `../goal-state` and remove its import of `discoverNextStep` from `../fs-utils`.

#### 2. `execute-task.ts` — `isStepReady()`, `validateAndFindNextStep()`, `validateExplicitStep()`

**`isStepReady(goalDir, stepNumber)`** currently does:
- `fs.existsSync(stepDir)` — folder existence
- `fs.existsSync(TASK.md)`, `fs.existsSync(TEST.md)` — spec files
- `fs.existsSync(COMPLETED)`, `fs.existsSync(BLOCKED)` — markers

Replace with:
- Construct `GoalState` via `createGoalState(goalDir)` (pass goal dir, not cwd)
- Look up step via `state.steps().find(s => s.stepNumber === stepNumber)`
- Use `step.hasTask()`, `step.hasTest()`, and check `step.status()` for markers
- A step is ready when: `hasTask() && hasTest() && status() === "defined"` (since "defined" means specs exist but no COMPLETED/BLOCKED/other markers)

**`validateAndFindNextStep(name, cwd)`** currently does:
- `fs.existsSync(goalDir)` — goal directory existence (keep as-is, structural)
- `fs.existsSync(goalPath)` — GOAL.md existence → `state.hasGoal()`
- `fs.existsSync(planPath)` — PLAN.md existence → `state.hasPlan()`
- Loop calling `isStepReady(goalDir, i)` and manual folder/spec checks

Replace with:
- After resolving `goalDir`, construct `state = createGoalState(goalDir)`
- Use `state.hasGoal()`, `state.hasPlan()` for document checks
- Iterate over `state.steps()` to find the first step where `isStepReady()` returns true (which now uses GoalState internally)
- When no ready step found, use the same error message as before

**`validateExplicitStep(name, cwd, stepNumber)`** currently does:
- `fs.existsSync(goalDir)` — goal directory existence (keep)
- `fs.existsSync(stepDir)` — folder existence → check if step exists in `state.steps()`
- Manual checks for TASK.md, TEST.md, COMPLETED, BLOCKED

Replace with:
- Construct `state = createGoalState(goalDir)`
- Look up step via `state.steps().find(s => s.stepNumber === stepNumber)`
- Use `step.hasTask()`, `step.hasTest()`, `step.status()` for all checks
- If step not found in `state.steps()`, return the same "folder does not exist" error

#### 3. `review-code.ts` — `isStepReviewable()`, `findMostRecentCompletedStep()`, `validateStepForReview()`, `validateAndFindReviewStep()`

**`isStepReviewable(goalDir, stepNumber)`** currently does:
- `fs.existsSync(stepDir)` — folder existence
- `fs.existsSync(COMPLETED)`, `fs.existsSync(SUMMARY.md)`, `fs.existsSync(BLOCKED)`

Replace with:
- Construct `state = createGoalState(goalDir)`
- Look up step via `state.steps().find(s => s.stepNumber === stepNumber)`
- A step is reviewable when: `step.status() === "implemented"` (COMPLETED + SUMMARY.md, no BLOCKED)
- If step not found, return false

**`findMostRecentCompletedStep(goalDir)`** currently does:
- Forward scan to find max step folder
- Reverse scan calling `isStepReviewable()` for each

Replace with:
- Construct `state = createGoalState(goalDir)`
- Get all steps via `state.steps()` (already sorted ascending)
- Iterate in reverse to find first step where `step.status() === "implemented"`
- Return that step number or undefined

**`validateStepForReview(name, cwd, stepNumber)`** currently does:
- `fs.existsSync(goalDir)` — structural check (keep)
- `fs.existsSync(goalPath)` — GOAL.md → `state.hasGoal()`
- `fs.existsSync(planPath)` — PLAN.md → `state.hasPlan()`
- Calls `isStepReviewable()` and then detailed error checks with individual fs calls

Replace with:
- Construct `state = createGoalState(goalDir)` after structural check
- Use `state.hasGoal()`, `state.hasPlan()` for document validation
- Call `isStepReviewable()` (now using GoalState internally)
- If not reviewable, determine detailed error by looking up step in `state.steps()` and checking `step.status()` / individual methods

**`validateAndFindReviewStep(name, cwd)`** currently does:
- Same goal/plan checks as above
- Calls `findMostRecentCompletedStep(goalDir)`

Replace with:
- Construct `state = createGoalState(goalDir)` after structural check
- Use `state.hasGoal()`, `state.hasPlan()` for document validation
- Call `findMostRecentCompletedStep()` (now using GoalState internally)

### Approach and Decisions

- **Follow the pattern:** Each validation function constructs a fresh `GoalState` per call via `createGoalState(goalDir)`. No caching or module-level state — consistent with Step 1's "no internal caching" design.
- **Structural checks remain direct:** `fs.existsSync(goalDir)` for checking if the goal workspace directory itself exists is a structural check, not a state query. Keep these as-is since they validate preconditions before constructing any `GoalState`.
- **Import path:** Use `import { createGoalState } from "../goal-state"` in all three files.
- **Remove unused imports:** After migration, remove `discoverNextStep` from `evolve-plan.ts` imports and any other now-unused imports from `../fs-utils`.
- **Keep exported signatures identical:** All public function signatures (`isStepReady`, `isStepReviewable`, `findMostRecentCompletedStep`, etc.) remain unchanged for backward compatibility.
- **Error messages unchanged:** Preserve exact error message text to avoid breaking any downstream consumers or tests that match on error strings.
- **`prepareReviewSession` in `review-code.ts`:** This function performs filesystem writes (`fs.rmSync`) to clean stale markers. It does NOT read goal state — it modifies the filesystem. Do NOT change this function; it's not a validation/scanning function.

## Dependencies

- **Step 1 (COMPLETED):** `src/goal-state.ts` with `GoalState` interface and `createGoalState()` factory must exist. Verified via S01/SUMMARY.md — implementation approved.
- Step 2 is NOT required for this step. Capabilities use `GoalState` directly, not the state machine module.

## Files Affected

- `src/capabilities/evolve-plan.ts` — replace `validateAndFindNextStep()` internals: use `createGoalState()`, `state.hasPlan()`, `state.currentStepNumber()`. Remove `discoverNextStep` import.
- `src/capabilities/execute-task.ts` — replace `isStepReady()`, `validateAndFindNextStep()`, `validateExplicitStep()` internals: use `createGoalState()`, `state.steps()[N].hasTask()`, `state.steps()[N].hasTest()`, `state.steps()[N].status()`.
- `src/capabilities/review-code.ts` — replace `isStepReviewable()`, `findMostRecentCompletedStep()`, `validateStepForReview()`, `validateAndFindReviewStep()` internals: use `createGoalState()`, `state.steps()[N].status()`.
- `src/capabilities/evolve-plan.test.ts` — tests should continue to pass with identical results (existing test infrastructure uses real temp directories).
- `src/capabilities/execute-task.test.ts` — tests for `isStepReady()` and others should continue to pass.
- `src/capabilities/review-code.test.ts` — tests for `isStepReviewable()` and `findMostRecentCompletedStep()` should continue to pass.

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `evolve-plan.ts` validation functions produce identical results as before when given the same filesystem state (verified by existing tests in `src/capabilities/evolve-plan.test.ts`)
- [ ] `execute-task.ts` `isStepReady()` returns true only when step has TASK.md + TEST.md but no COMPLETED/BLOCKED — verified via existing behavior
- [ ] `review-code.ts` `isStepReviewable()` and `findMostRecentCompletedStep()` return identical results — verified via existing behavior
- [ ] No capability directly imports `node:fs` for goal-state checks (all filesystem queries go through `GoalState`). Structural pre-checks like `fs.existsSync(goalDir)` are acceptable since they validate directory existence before constructing state.

## Risks and Edge Cases

- **Root-level COMPLETED marker in evolve-plan:** The current code checks for a root-level `COMPLETED` file as a pre-launch guard. This is not represented in `GoalState`. The migration should preserve this behavior — either keep the direct `fs.existsSync` check or determine if it's still needed given that `currentStepNumber()` behavior covers this case.
- **`fs.existsSync(goalDir)` pre-checks:** If the goal directory doesn't exist, calling `createGoalState()` on it may throw or produce unexpected results from `steps()`. Always guard with a structural `fs.existsSync(goalDir)` before constructing state — this is a valid structural check per the acceptance criteria.
- **Error message fidelity:** Tests may assert on specific error messages (e.g., matching `/COMPLETED|already specified/i`). Preserve exact error text to avoid breaking tests.
- **`isStepReady` uses `status() === "defined"`**: The `GoalState` status "defined" means TASK.md + TEST.md exist with no COMPLETED/BLOCKED/APPROVED/REJECTED markers. This is the correct mapping for execution readiness.
- **`isStepReviewable` uses `status() === "implemented"`**: The `GoalState` status "implemented" means COMPLETED exists (plus the priority check ensures BLOCKED doesn't override it). However, reviewability also requires SUMMARY.md. The `status()` method doesn't explicitly check for SUMMARY.md — only marker files and spec files. Verify that "implemented" status correctly implies both COMPLETED and SUMMARY.md exist, or use `hasSummary()` as an additional check.
