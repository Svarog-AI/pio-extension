---
totalSteps: 2
steps:
  - name: add-stale-marker-cleanup
    complexity: task
  - name: test-idempotency
    complexity: task
---

# Plan: review-mark-complete-cleanup-state

Make `applyReviewDecision()` idempotent by removing stale review markers before applying a new decision.

## Prerequisites

None.

## Steps

### Step 1: Add stale marker cleanup to `applyReviewDecision()`

**Description**

Modify `applyReviewDecision()` in `src/capabilities/review-task.ts` to delete both `APPROVED` and `REJECTED` markers before writing the new one. This ensures the function is safe to call multiple times with different decisions — a property needed when users manually change REVIEW.md frontmatter and re-run validation, or when `postValidateReview()` calls `applyReviewDecision()` again after a decision change.

The implementation should use `fs.rmSync` with `{ force: true }` (same pattern as `prepareReviewSession()`) to remove both marker files at the top of the function, before the `if/else` branch that writes the new marker. The existing behavior on `REJECTED` (deleting `COMPLETED`) is preserved unchanged.

**Acceptance Criteria**

- `npx tsc --noEmit` reports no type errors
- Running existing test suite (`npm test`) passes with no regressions
- `applyReviewDecision()` deletes both `APPROVED` and `REJECTED` before writing a new marker (verifiable by reading the source)

**Files Affected**

- `src/capabilities/review-task.ts` — add stale marker cleanup at the start of `applyReviewDecision()`

### Step 2: Add idempotency tests for `applyReviewDecision()`

**Description**

Add new test cases to the existing `describe("applyReviewDecision", ...)` block in `src/capabilities/review-task.test.ts` to verify the idempotency behavior:

1. Calling with APPROVED then REJECTED leaves only REJECTED on disk (no stale APPROVED)
2. Calling with REJECTED then APPROVED leaves only APPROVED on disk (no stale REJECTED)
3. Multiple calls with the same decision remain idempotent — no errors thrown, correct marker present

Use the existing test helpers (`createTempDir`, `createGoalTree`, `ReviewOutputs`) to follow established patterns.

**Acceptance Criteria**

- All new tests pass (`npm test` succeeds)
- `npx tsc --noEmit` reports no type errors
- Three new `it` blocks exist in the `applyReviewDecision` describe block covering: APPROVED→REJECTED, REJECTED→APPROVED, and same-decision idempotency

**Files Affected**

- `src/capabilities/review-task.test.ts` — add 3 new test cases to the `applyReviewDecision` describe block

## Notes

- The cleanup must remove **both** markers, not just the opposite one. This is simpler and safer for idempotency — it handles edge cases where both might already coexist (e.g., from a bug or manual file creation).
- `prepareReviewSession()` already performs this same cleanup but runs at a different point in the lifecycle (before the review sub-session starts). Adding cleanup to `applyReviewDecision()` covers the gap when `postValidateReview()` is called outside a fresh session.
- The REJECTED branch still deletes `COMPLETED` — this existing behavior must be preserved.
