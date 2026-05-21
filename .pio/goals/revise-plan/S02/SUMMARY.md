# Summary: Add `revisionNeeded()` to StepStatus and GoalState

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — Added `revisionNeeded: () => boolean` to `StepStatus` interface and implementation in `createStepStatus()`. Follows the existing pattern: zero-arg function wrapping `fs.existsSync` on `REVISE_PLAN_NEEDED` inside the step directory.
- `src/goal-state.test.ts` — Added `describe("revisionNeeded()")` block with 5 test cases covering marker existence, non-existence, lazy evaluation, non-step folder exclusion, and higher step numbers.
- `src/state-machine.test.ts` — Added `revisionNeeded: () => false` to `mockStep()` helper to satisfy the updated `StepStatus` interface.

## Files Deleted
- (none)

## Decisions Made
- Implementation follows the exact pattern of existing `StepStatus` methods (`hasTask`, `hasTest`, `hasSummary`) — lazy `fs.existsSync` with no caching.
- Marker filename is `REVISE_PLAN_NEEDED` (exact, case-sensitive) as specified in GOAL.md.
- No changes to `GoalState` interface — `revisionNeeded()` lives on `StepStatus`, accessible via `state.steps()[N].revisionNeeded()`.

## Test Coverage
- 5 new test cases in `src/goal-state.test.ts`:
  - Returns `true` when `REVISE_PLAN_NEEDED` exists
  - Returns `false` when marker does not exist
  - Lazy evaluation (no caching) — reflects filesystem changes
  - Non-step folders are ignored (not included in `steps()`)
  - Works for higher step numbers (S05, S10)
- All 497 tests pass across 21 test files (no regressions)
- `npx tsc --noEmit` reports no errors
