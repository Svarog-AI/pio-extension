# Code Review: Simplify write allowlist and add `prepareSession` for review-code (Step 5)

## Decision
APPROVED

## Summary
Step 5 correctly implements both requirements from the task spec: simplifying the write allowlist to REVIEW.md-only, and adding a `prepareSession` hook that deletes stale APPROVED/REJECTED markers on startup. The implementation follows existing naming conventions (`prepareReviewSession`), error-handling patterns (throws when `stepNumber` is missing), and uses `{ force: true }` for safe deletion. All 12 new unit tests plus updated existing tests pass, and TypeScript compilation reports no errors.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- [LOW] The `createGoalTree` helper in the test file is nearly identical to the one in `execute-task-initial-message.test.ts`. Consider extracting it into a shared test utilities module (e.g., `__tests__/helpers.ts`) for reuse across test files. — `__tests__/review-code-config.test.ts`

## Test Coverage Analysis
All 8 acceptance criteria from TASK.md are covered by tests:

| Acceptance Criterion | Covered By |
|---|---|
| Allowlist returns only `[S{NN}/REVIEW.md]` | `resolveReviewWriteAllowlist` test: "given a step number, should return array containing only REVIEW.md path" |
| Allowlist excludes APPROVED | `resolveReviewWriteAllowlist` test: "excludes APPROVED from the write allowlist" |
| `prepareSession` is defined and assigned to `CAPABILITY_CONFIG.prepareSession` | `prepareSession` test: "should be defined as a function" + integration in `capability-config.test.ts` |
| Deletes both APPROVED and REJECTED | `prepareSession` tests: "deletes stale APPROVED marker", "deletes stale REJECTED marker", "deletes both when both exist" |
| Does NOT delete COMPLETED, REVIEW.md, or other files | `prepareSession` tests: "does not delete COMPLETED marker", "does not delete REVIEW.md" |
| Throws when stepNumber missing | Both allowlist and prepareSession have "throws when stepNumber is missing" tests |
| Uses `{ force: true }` for safe deletion | "handles missing markers gracefully (no error)" test proves this behavior |
| Follows naming/error-handling convention | Verified by inspection — `prepareReviewSession` matches pattern of `resolveReviewValidation`, etc. |

The existing `capability-config.test.ts` was correctly updated to expect REVIEW.md-only allowlist (one path, no APPROVED). The `session-capability.test.ts` and `types.test.ts` were correctly updated to verify review-code has `prepareSession` defined while other capabilities remain undefined. Full suite: 187 tests across 13 files — all passing.

## Gaps Identified
No gaps detected. GOAL → PLAN → TASK → Implementation chain is consistent for this step. The implementation faithfully represents what was specified in TASK.md, with no scope creep or missing functionality.

## Recommendations
N/A — approved as-is.
