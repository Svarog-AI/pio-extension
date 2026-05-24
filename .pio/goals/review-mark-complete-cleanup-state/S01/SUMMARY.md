# Summary: Add stale marker cleanup to `applyReviewDecision()`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/review-task.ts` — Added two `fs.rmSync` calls at the start of `applyReviewDecision()` to delete both `APPROVED` and `REJECTED` markers before writing a new one, making the function idempotent.
- `src/capabilities/review-task.test.ts` — Added 4 new test cases to the `applyReviewDecision` describe block: APPROVED→REJECTED cleanup, REJECTED→APPROVED cleanup, same-decision idempotency, and coexisting-both-markers cleanup.

## Files Deleted
- (none)

## Decisions Made
- Remove **both** markers (not just the opposite one) for simpler and safer idempotency — handles edge cases where both might already coexist from a prior bug or manual file creation.
- Used `{ force: true }` on `fs.rmSync` to skip missing files gracefully, matching the existing pattern in `prepareReviewSession()`.

## User-Requested Changes
- (none)

## Test Coverage
- 4 new test cases added to `src/capabilities/review-task.test.ts`:
  - `APPROVED then REJECTED leaves only REJECTED on disk` — verifies stale APPROVED is removed
  - `REJECTED then APPROVED leaves only APPROVED on disk` — verifies stale REJECTED is removed
  - `multiple calls with the same decision are idempotent` — verifies no errors on repeated calls
  - `removes both markers when both already coexist` — verifies cleanup handles bug-state edge case
- All 674 tests pass (23 test files), no regressions
- `npx tsc --noEmit` reports no type errors
