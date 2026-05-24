# Tests: Stale marker cleanup in `applyReviewDecision()`

Verifies that `applyReviewDecision()` removes both `APPROVED` and `REJECTED` markers before writing a new one, making the function idempotent across multiple calls with different decisions.

## Unit Tests

Given a step with a pre-existing APPROVED marker when applyReviewDecision is called with APPROVED then REJECTED then only REJECTED exists on disk.
Given a step with a pre-existing REJECTED marker when applyReviewDecision is called with REJECTED then APPROVED then only APPROVED exists on disk.
Given a step with no pre-existing markers when applyReviewDecision is called twice with APPROVED then the function is idempotent with no errors.
Given a step with both APPROVED and REJECTED markers when applyReviewDecision is called with APPROVED then only APPROVED exists after cleanup.
Given existing tests call applyReviewDecision with a clean step dir when the cleanup lines are added then all existing tests still pass with no regressions.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
