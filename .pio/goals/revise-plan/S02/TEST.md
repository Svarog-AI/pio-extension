# Tests: Add `revisionNeeded()` to StepStatus and GoalState

## Unit Tests

- **File:** `src/goal-state.test.ts` — add a new `describe("revisionNeeded()")` block following the existing test structure (temp dirs, `createGoalTree`, `beforeEach`/`afterEach`).
- **Test runner:** Vitest (existing config: globals, Node.js env)

**Test cases:**

1. `describe("revisionNeeded()")`:
   - `it("returns true when REVISE_PLAN_NEEDED exists in the step folder")` — Arrange: create goal tree with S01 containing `REVISE_PLAN_NEEDED`. Act: `state.steps()[0].revisionNeeded()`. Assert: `true`.
   - `it("returns false when REVISE_PLAN_NEEDED does not exist")` — Arrange: create goal tree with empty S01. Act: `state.steps()[0].revisionNeeded()`. Assert: `false`.
   - `it("reflects filesystem changes with no caching (lazy evaluation)")` — Arrange: create goal tree with empty S01, create `GoalState`. Initially `revisionNeeded()` is `false`. Write `REVISE_PLAN_NEEDED` to S01. Now `revisionNeeded()` is `true`. Remove file. Back to `false`. Asserts prove no internal caching.
   - `it("returns false for a non-step folder containing REVISE_PLAN_NEEDED")` — Arrange: create a non-step directory (e.g., `docs/`) with `REVISE_PLAN_NEEDED` inside. Assert: `state.steps()` does not include it; only real step folders produce `StepStatus` instances.
   - `it("works correctly for higher step numbers (S05, S10)")` — Arrange: create goal tree with S05 containing the marker. Act: verify `state.steps()[0].revisionNeeded()` is `true` and the step number resolves to 5.

## Programmatic Verification

- **TypeScript type check:** Run `npm run check` (or `npx tsc --noEmit`). Expected result: exit code 0, no errors. The new `revisionNeeded` member on `StepStatus` must be type-correct.
- **Existing test suite:** Run `npm test`. Expected result: all existing tests pass with exit code 0 (no regressions from the additive change).
- **New tests pass:** Run `npm test -- src/goal-state.test.ts`. Expected result: new `revisionNeeded()` tests pass alongside existing tests.

## Test Order

1. Unit tests — write and run `src/goal-state.test.ts` tests for `revisionNeeded()`
2. Programmatic verification — `npm run check` (type check), then `npm test` (full suite)
