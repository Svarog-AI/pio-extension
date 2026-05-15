# Summary: Migrate capability pre-launch validation to use `GoalState`

## Status
COMPLETED

## Files Modified
- `src/capabilities/execute-task.ts` — Added `_isStepReady(state: GoalState, stepNumber)` internal helper that accepts a pre-built state. Changed `isStepReady(goalDir, stepNumber)` to be a thin wrapper. Updated `validateAndFindNextStep()` to reuse existing state via `_isStepReady(state, i)` instead of calling the public `isStepReady(goalDir, i)` per iteration (eliminated N+1 filesystem scans).
- `src/capabilities/review-code.ts` — Added `_isReviewable(step: StepStatus)` shared helper (addresses DRY concern from review). Added `_findMostRecentCompletedStep(state: GoalState)` internal helper that accepts a pre-built state. Changed `findMostRecentCompletedStep(goalDir)` and `isStepReviewable(goalDir, stepNumber)` to be thin wrappers. Updated `validateAndFindReviewStep()` to reuse existing state via `_findMostRecentCompletedStep(state)` instead of creating a fresh state (eliminated redundant filesystem scan).

## Files Created
(none)

## Files Deleted
(none)

## Decisions Made
- **Internal helpers are not exported:** `_isStepReady`, `_isReviewable`, and `_findMostRecentCompletedStep` are module-private. Public API signatures remain unchanged for backward compatibility.
- **Thin wrapper pattern:** Each public function delegates to its internal counterpart after constructing a fresh `GoalState`. This preserves the contract that external callers pass `goalDir` while internal callers can reuse existing state objects.
- **`_isReviewable` shared between two functions:** Extracts the common check `step.status() === "implemented" && step.hasSummary()` used by both `isStepReviewable` and `findMostRecentCompletedStep`. Addresses the LOW DRY issue from the review.
- **`evolve-plan.ts` required no changes:** The existing implementation already constructs state once and uses it directly (`state.hasPlan()`, `state.currentStepNumber()`). No redundant construction pattern existed there.

## Test Coverage
- All 264 existing tests pass (11 test files, 0 failures) — proves behavioral equivalence of the migration
- `npm run check` reports zero type errors
- Import verification: all three capability files import from `goal-state` (count ≥ 1 each)
- Direct fs goal-state query verification: no raw `fs.existsSync` calls for TASK.md, TEST.md, COMPLETED, BLOCKED, APPROVED, REJECTED, or SUMMARY.md remain in validation functions
- `discoverNextStep` import removed from `evolve-plan.ts` (confirmed via grep)

## Review Issues Addressed
- **[HIGH] Redundant GoalState construction:** Fixed by introducing internal helpers that accept pre-built `GoalState`. Internal callers (`validateAndFindNextStep`, `validateAndFindReviewStep`) now reuse a single state object instead of creating N+1 states per validation call.
- **[LOW] DRY opportunity in findMostRecentCompletedStep:** Fixed by extracting `_isReviewable(step: StepStatus)` shared helper used by both `isStepReviewable` and `findMostRecentCompletedStep`.
