# Tests: Eliminate `_private(state)` / `public(goalDir)` split in `execute-task.ts`

This step is a behavioral-equivalent refactoring. No new behavior is introduced — the public API (`isStepReady`) has the same signature and returns the same values. Existing tests verify correctness; programmatic checks verify the structural change.

## Unit Tests

No new test cases are required. The existing tests in `src/capabilities/execute-task.test.ts` already cover the behavior of `isStepReady` through filesystem-based integration:

- **File:** `src/capabilities/execute-task.test.ts`
- **Test runner:** Vitest (`npm test`)
- **Existing suite (`describe("isStepReady(goalDir, stepNumber)")`):** 6 tests covering all branch paths:
  - TASK.md + TEST.md present, no markers → `true`
  - Missing TASK.md → `false`
  - Missing TEST.md → `false`
  - Both specs + COMPLETED marker → `false`
  - Both specs + BLOCKED marker → `false`
  - Step folder does not exist → `false`

These tests exercise `isStepReady(goalDir, stepNumber)` against real directory trees (no mocks). They validate the public API contract — which is unchanged. If the inlined logic produces different results, these tests will fail.

**Run:** `npx vitest run src/capabilities/execute-task.test.ts`

## Programmatic Verification

- **No `_isStepReady` function exists**
  - **How:** `grep -c "_isStepReady" src/capabilities/execute-task.ts`
  - **Expected result:** `0` (no matches)

- **`isStepReady` is exported and accepts `(goalDir, stepNumber)`**
  - **How:** `grep "export function isStepReady" src/capabilities/execute-task.ts`
  - **Expected result:** One match containing `(goalDir: string, stepNumber: number)`

- **TypeScript compiles cleanly**
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no type errors

- **Full test suite passes with no regressions**
  - **How:** `npx vitest run`
  - **Expected result:** All tests pass (existing count + 0 failures)

## Test Order

1. `grep -c "_isStepReady" src/capabilities/execute-task.ts` — verify structural change (fast, no build needed)
2. `npx tsc --noEmit` — type check catches import errors from removed function
3. `npx vitest run src/capabilities/execute-task.test.ts` — targeted test for the affected module
4. `npx vitest run` — full suite to catch regressions elsewhere
