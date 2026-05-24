# Decisions: Step 2 — Add idempotency tests for `applyReviewDecision()`

## Plan Deviations

- **Tests implemented early in Step 1:** The Step 1 executor added all 4 idempotency test cases to `src/capabilities/review-task.test.ts` during Step 1 implementation, even though Step 1's TASK.md scoped work to `review-task.ts` only. This means Step 2's planned tests (APPROVED→REJECTED, REJECTED→APPROVED, same-decision idempotency) already exist on disk. An additional edge-case test (`removes both markers when both already coexist`) was also added beyond the original plan.

## Architecture Decisions

- Remove **both** markers (not just the opposite one) for idempotency — handles edge cases where both might already coexist from a prior bug or manual file creation.
- Use `{ force: true }` on `fs.rmSync` to skip missing files gracefully, matching the existing pattern in `prepareReviewSession()`.
