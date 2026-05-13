# Summary: Update `review-code` transition with explicit `REJECTED` check

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/utils.ts` — Added explicit `REJECTED` file existence check in `CAPABILITY_TRANSITIONS["review-code"]` resolver. REJECTED is checked before APPROVED (takes precedence). When REJECTED exists, routes to `execute-task` with `{ goalName, stepNumber }`. Fallback behavior unchanged.
- `__tests__/transition.test.ts` — Extended `createGoalTree` helper to support `rejected` flag. Added new `describe("REJECTED marker routing")` block with 3 test cases: REJECTED-only routing, goalName preservation, and REJECTED-over-APPROVED precedence.

## Files Deleted
- (none)

## Decisions Made
- **No extra params passed:** The transition does not pass flags like `rejectedAfterReview`. The REJECTED marker file itself is the single source of truth for downstream code to detect intentional rejection.
- **REJECTED checked before APPROVED:** Safety preference — if both exist on disk (theoretically impossible with proper lifecycle), rejection wins so the step is re-executed rather than silently advanced.

## Test Coverage
- 3 new tests in `__tests__/transition.test.ts`:
  - `returns execute-task when REJECTED exists` — verifies basic REJECTED routing
  - `preserves goalName when REJECTED routes to execute-task` — verifies params integrity
  - `REJECTED takes precedence when both APPROVED and REJECTED exist` — verifies safety preference
- All 168 tests pass (0 regressions)
- `npm run check` passes with no type errors
