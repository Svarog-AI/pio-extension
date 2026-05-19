# Summary: Eliminate `_private(state)` / `public(goalDir)` split in `execute-task.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/execute-task.ts` — Removed `_isStepReady` private helper. Inlined state creation and step-check logic directly into `isStepReady(goalDir, stepNumber)`. Inlined the same logic in `validateAndFindNextStep()`. Removed unused `type GoalState` import (kept `createGoalState`).

## Files Deleted
- (none)

## Decisions Made
- Inlined the step-readiness check at both call sites (`isStepReady` and `validateAndFindNextStep`) rather than creating a new unexported helper. The logic is trivially simple (find step, check status) and doesn't warrant a separate function.
- Removed `type GoalState` from the import since it's no longer used as a type annotation anywhere in the file after removing `_isStepReady`.

## Test Coverage
- All 15 existing tests in `src/capabilities/execute-task.test.ts` pass (behavioral equivalence verified).
- Full suite: 398 tests across 17 files pass with zero regressions.
- Programmatic verification: `grep -c "_isStepReady"` returns 0, `export function isStepReady` present with correct signature, `npx tsc --noEmit` exits cleanly.
