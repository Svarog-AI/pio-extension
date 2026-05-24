# Tests: Idempotency of `applyReviewDecision()`

Verifies that `applyReviewDecision()` correctly removes stale review markers before applying a new decision, ensuring idempotency across multiple calls with different or identical decisions.

## Unit Tests

Given `applyReviewDecision()` called with APPROVED then REJECTED when markers are checked then only REJECTED exists on disk.
Given `applyReviewDecision()` called with REJECTED then APPROVED when markers are checked then only APPROVED exists on disk.
Given `applyReviewDecision()` called multiple times with the same decision when no errors occur then the correct marker is present.
Given both APPROVED and REJECTED markers already coexist when `applyReviewDecision()` applies APPROVED then only APPROVED remains.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
