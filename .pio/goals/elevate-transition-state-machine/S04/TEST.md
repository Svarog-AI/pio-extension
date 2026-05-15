# Tests: Decouple `validation.ts` from `session-capability.ts`

## Unit Tests

No new unit tests required. This step is a dependency removal — all existing tests should pass unchanged, which proves behavioral equivalence.

### Regression: `src/guards/validation.test.ts`

The existing test suites exercise the functions that consume the changed values:

- **`validateOutputs`** (6 tests): Pure function — unaffected by this change.
- **`parseReviewFrontmatter`** (8 tests) and **`validateReviewFrontmatter`** (6 tests): Pure functions — unaffected.
- **`applyReviewDecision`** (5 tests): Writes marker files based on frontmatter decision — unaffected.
- **`review-code markComplete automation`** (4 integration tests): Exercises the full review-code flow including `parseReviewFrontmatter` → `validateReviewFrontmatter` → `applyReviewDecision`. These verify that the review-code automation still works end-to-end after removing session-capability imports.

### Regression: `src/capabilities/session-capability.test.ts`

All existing tests (getSessionGoalName + handleNextTask) must pass unchanged. The change in validation.ts does not modify session-capability exports, so no new assertions needed — pure regression coverage.

## Programmatic Verification

- **TypeScript compilation clean:**
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no type errors

- **All tests pass (full suite):**
  - **How:** `npm test`
  - **Expected result:** All 264+ tests pass across all 11 files, exit code 0

- **`validation.ts` no longer imports from session-capability:**
  - **How:** `grep 'session-capability' src/guards/validation.ts`
  - **Expected result:** No output (exit code 1, meaning 0 matches)

- **`getSessionParams` and `getStepNumber` references removed from validation.ts:**
  - **How:** `grep -c 'getSessionParams\|getStepNumber' src/guards/validation.ts`
  - **Expected result:** Count is 0

## Test Order

1. `npm run check` — fails fast on compile errors
2. `npm test` — full regression suite (verifies behavioral equivalence)
3. grep commands — verify migration completeness
