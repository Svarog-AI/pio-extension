# Task: Add idempotency tests for `applyReviewDecision()`

Verify that all required idempotency test cases for `applyReviewDecision()` exist and pass, acknowledging that Step 1 already implemented these tests ahead of schedule.

## Context

Step 1 modified `applyReviewDecision()` in `src/capabilities/review-task.ts` to delete both `APPROVED` and `REJECTED` markers before writing a new one, making the function idempotent. During Step 1 implementation, the executor also added test cases to `src/capabilities/review-task.test.ts` that cover the idempotency scenarios originally planned for Step 2. This TASK.md reflects that reality — all planned tests already exist in the codebase.

## What to Build

No new code is required. The executor must:

1. **Verify existing test coverage** — confirm the following test cases exist in the `describe("applyReviewDecision", ...)` block in `src/capabilities/review-task.test.ts`:
   - `APPROVED then REJECTED leaves only REJECTED on disk` — calls `applyReviewDecision()` with APPROVED, then REJECTED; asserts only REJECTED marker exists
   - `REJECTED then APPROVED leaves only APPROVED on disk` — calls with REJECTED then APPROVED; asserts only APPROVED marker exists
   - `multiple calls with the same decision are idempotent` — calls twice with same decision; asserts no errors, correct marker present
   - `removes both markers when both already coexist` (bonus edge case added beyond plan) — pre-creates both markers, applies one decision; asserts only the new marker exists

2. **Run verification commands** — confirm all tests pass and type-checking succeeds:
   - `npm test` — all tests pass with no regressions
   - `npx tsc --noEmit` — no type errors

3. **Report findings in SUMMARY.md** — document which tests were verified, test counts, and confirmation that acceptance criteria are satisfied.

### Approach and Decisions

Per `DECISIONS.md`: Step 1 executor went beyond scope and added the idempotency tests early. This step verifies they are correct and complete. If any planned test is missing (unlikely), add it following the existing patterns in the file (`createTempDir`, `createGoalTree`, `ReviewOutputs`).

## Dependencies

Step 1 must be completed — `applyReviewDecision()` must include the stale marker cleanup logic. (Already satisfied.)

## Files Affected

- `src/capabilities/review-task.test.ts` — verify existing test cases (no changes expected)

## Acceptance Criteria

- All new tests pass (`npm test` succeeds with no regressions)
- `npx tsc --noEmit` reports no type errors
- Three required `it` blocks exist in the `applyReviewDecision` describe block covering: APPROVED→REJECTED, REJECTED→APPROVED, and same-decision idempotency
- (Bonus) Fourth test case for coexisting-markers edge case also passes

## Risks and Edge Cases

- If any planned test is missing from the file (executor did something different than expected), write it following existing patterns. Use `createGoalTree()`, `createTempDir()`, and construct `ReviewOutputs` objects matching the schema.
- Ensure tests use `{ force: true }` on any filesystem operations to match the project pattern.
