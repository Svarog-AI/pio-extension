---
decision: REJECTED
criticalIssues: 0
highIssues: 1
mediumIssues: 0
lowIssues: 1
---

# Code Review: Migrate capability pre-launch validation to use `GoalState` (Step 3)

## Decision
REJECTED

## Summary
The migration is structurally correct — all three capabilities import and use `createGoalState()`, exported signatures are preserved, error messages match, and all 264 tests pass. However, there's a systematic pattern of redundant GoalState construction: validation functions create a `GoalState` for document checks (`hasGoal()`, `hasPlan()`), then call helper functions that create their own fresh states instead of reusing the existing one. This undermines the performance intent of centralized state queries and produces N+1 filesystem scans where 1 suffices.

## Critical Issues
(none)

## High Issues
- [HIGH] **Redundant `GoalState` construction across helper calls.** Multiple validation functions create a `GoalState`, use it for top-level checks, then discard it by calling helpers that build fresh states internally:

  1. `execute-task.ts` `validateAndFindNextStep()` (line ~113): Creates `state = createGoalState(goalDir)`, stores `allSteps = state.steps()`. Then the loop at line ~136 calls `isStepReady(goalDir, i)` which internally runs `createGoalState(goalDir)` + `state.steps().find(...)` per iteration. For a goal with 5 steps, this is 6 total GoalState constructions instead of 1.

  2. `review-code.ts` `validateAndFindReviewStep()` (line ~230): Creates `state = createGoalState(goalDir)`, uses it for `hasGoal()`/`hasPlan()`. Then calls `findMostRecentCompletedStep(goalDir)` (line ~248) which creates yet another fresh state.

  The exported helpers (`isStepReady`, `isStepReviewable`, `findMostRecentCompletedStep`) are public APIs that must accept `goalDir` — they correctly construct their own state for external callers. However, internal callers within the same file should reuse an existing state to avoid redundant filesystem I/O.

## Medium Issues
(none)

## Low Issues
- [LOW] In `findMostRecentCompletedStep` (`review-code.ts`, line ~116), the explicit `&& allSteps[i].hasSummary()` check duplicates logic that could be factored into a shared helper used by both this function and `isStepReviewable`. Minor DRY opportunity. — `src/capabilities/review-code.ts` (line 116)

## Test Coverage Analysis
All acceptance criteria are covered:

1. **Type checking**: `npm run check` passes with zero errors.
2. **Regression tests**: All 264 tests pass across 11 test files, including the full truth tables for `isStepReady()` (6 tests), `isStepReviewable()` (5 tests), and `findMostRecentCompletedStep()` reverse scan (6 tests).
3. **Import verification**: All three files import `createGoalState` from `../goal-state`. No direct `fs.existsSync` calls for TASK.md, TEST.md, COMPLETED, BLOCKED, APPROVED, REJECTED, or SUMMARY.md remain in validation functions.
4. **`discoverNextStep` removal**: Confirmed removed from `evolve-plan.ts`.

## Gaps Identified
The migration correctly replaced raw `fs` calls with `GoalState` queries at the function level. However, the goal of "centralized filesystem queries" is not fully realized when multiple `GoalState` objects are created within a single validation flow — each independently reads the same files from disk. The fix should keep public API signatures unchanged while introducing internal helpers that accept a pre-built state.

## Recommendations
Fix the redundant construction by adding internal variants that accept a `GoalState`:

1. In `execute-task.ts`: Add `function _isStepReady(state: GoalState, stepNumber: number): boolean` that accepts a pre-built state. Keep `isStepReady(goalDir, stepNumber)` as a thin wrapper: `return _isStepReady(createGoalState(goalDir), stepNumber)`. In `validateAndFindNextStep`, use `_isStepReady(state, i)` directly.

2. In `review-code.ts`: Add `function _findMostRecentCompletedStep(state: GoalState): number | undefined` that accepts a pre-built state. Keep the public wrapper. In `validateAndFindReviewStep`, call `_findMostRecentCompletedStep(state)` instead of `findMostRecentCompletedStep(goalDir)`.

3. The same pattern applies to `isStepReviewable` if any future code path benefits from it (not strictly needed for this step since `validateStepForReview` already inlines the check correctly).

This preserves all public API signatures while eliminating redundant filesystem I/O within a single validation call.
