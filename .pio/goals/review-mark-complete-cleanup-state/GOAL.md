# pio_mark_complete should clean up existing review markers before applying a new decision

`applyReviewDecision()` in `src/capabilities/review-task.ts` creates `APPROVED` or `REJECTED` marker files but never removes the opposite marker first. If a step was previously approved (or rejected) and the review decision changes, both markers coexist on disk. This causes subsequent validation to fail because exactly one of `APPROVED`/`REJECTED` is expected — not both.

## Current State

The `applyReviewDecision()` function lives in `src/capabilities/review-task.ts` (lines 26–45). On an `APPROVED` decision, it writes `S{NN}/APPROVED`. On a `REJECTED` decision, it writes `S{NN}/REJECTED` and deletes `S{NN}/COMPLETED`. Neither branch removes the opposite marker beforehand.

The review-task session does have a `prepareReviewSession()` hook (same file, lines 87–97) that deletes stale `APPROVED`/`REJECTED` markers **before** the review sub-session starts. This handles the case where the user re-launches a review session for the same step. However, it does not protect against marker coexistence when:

1. A review session completes with one decision (e.g., APPROVED), creating `S{NN}/APPROVED`.
2. The user manually changes REVIEW.md frontmatter to the opposite decision (REJECTED) without re-launching a fresh session.
3. `postValidateReview()` calls `applyReviewDecision()` again — which creates `REJECTED` but leaves `APPROVED` on disk.
4. Both markers now coexist, causing downstream tooling that checks for exactly one marker to fail.

The tests in `src/capabilities/review-task.test.ts` cover the basic happy paths (create APPROVED, create REJECTED + delete COMPLETED) and the `prepareReviewSession` cleanup, but do not test the scenario where `applyReviewDecision()` is called twice with different decisions — i.e., stale marker cleanup inside `applyReviewDecision()` itself.

Related files:
- `src/capabilities/review-task.ts` — `applyReviewDecision()`, `prepareReviewSession()`, `postValidateReview()`
- `src/capabilities/review-task.test.ts` — existing tests for both functions
- `src/goal-state.ts` — `StepStatus.status()` checks markers in priority order (APPROVED > REJECTED)
- `src/capabilities/revise-plan.ts` — `cleanupIncompleteSteps()` uses APPROVED marker presence to decide which step folders to delete

## To-Be State

`applyReviewDecision()` must be idempotent with respect to review decision markers: before creating a new marker, it removes the opposite one. This ensures that re-running review with a changed decision never leaves stale markers on disk.

Specifically, the function should clean up BOTH `APPROVED` and `REJECTED` before writing the new marker (not just the "opposite" one — removing both is simpler and safer for idempotency). After cleanup:
- On `APPROVED`: `S{NN}/REJECTED` removed, `S{NN}/APPROVED` created.
- On `REJECTED`: `S{NN}/APPROVED` removed, `S{NN}/REJECTED` created, `S{NN}/COMPLETED` removed (existing behavior preserved).

This makes the function safe to call multiple times with different decisions — a property needed for robustness during manual review re-runs and for preventing inconsistent state in edge cases. Tests should verify:
- Calling `applyReviewDecision()` twice with APPROVED then REJECTED leaves only REJECTED (no stale APPROVED).
- Calling it twice with REJECTED then APPROVED leaves only APPROVED (no stale REJECTED).
- Multiple calls with the same decision remain idempotent (no errors, correct marker present).
