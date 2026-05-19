# Summary: Add `getReviewOutputs(stepNumber)` to `GoalState`

## Status
COMPLETED

## Files Created
- `src/frontmatter-schemas.ts` — New leaf module exporting `REVIEW_OUTPUT_SCHEMA` (typebox) and `ReviewOutputs` type. Imports only from `typebox`, never from project source. Breaks circular dependency between `goal-state.ts` and `review-task.ts`.

## Files Modified
- `src/goal-state.ts` — Added `getReviewOutputs(stepNumber: number) => ReviewOutputs | null` method to `GoalState` interface and factory. Imports `extractFrontmatter`/`validateAndCoerce` from `./frontmatter` and `REVIEW_OUTPUT_SCHEMA`/`ReviewOutputs` from `./frontmatter-schemas`. Returns `null` for missing files, malformed YAML, or validation failures.
- `src/capabilities/review-task.ts` — Removed local `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` definitions. Now imports from `../frontmatter-schemas` and re-exports for backward compatibility.
- `src/goal-state.test.ts` — Added 10 test cases for `getReviewOutputs()` covering: valid APPROVED, valid REJECTED, missing step folder, missing REVIEW.md, no frontmatter, malformed YAML, invalid decision value, negative counts, missing fields, zero-padded step numbers. Updated "all methods" test to include `getReviewOutputs`.
- `src/capabilities/review-task.test.ts` — Updated imports to use `../frontmatter-schemas` instead of local definitions. Added `frontmatter-schemas exports` describe block verifying schema and type are accessible from the new location.
- `src/state-machine.test.ts` — Added `getReviewOutputs` to mock `GoalState` to satisfy the updated interface.
- `src/guards/validation.test.ts` — Removed orphaned imports and test blocks (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`) that were already removed from `validation.ts` in Step 2.

## Files Deleted
- (none)

## Decisions Made
- **Schema extraction into `frontmatter-schemas.ts`** was required to break the circular dependency. `goal-state.ts` → `review-task.ts` → `goal-state.ts` would be a direct cycle. The leaf module imports only from `typebox`.
- **Re-export from `review-task.ts`**: `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` are re-exported from `review-task.ts` for backward compatibility with any code that imports from there.
- **Error handling**: `getReviewOutputs` returns `null` (not throw) for all error cases — missing files, malformed YAML, validation failures — matching the existing `GoalState` lazy-evaluation pattern.
- **Removed orphaned tests from `validation.test.ts`**: Functions `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState` were already removed from `validation.ts` (Step 2) but test imports remained. Cleaned up to unblock the build.

## Test Coverage
- 10 new test cases in `src/goal-state.test.ts` for `getReviewOutputs()`:
  - Valid APPROVED frontmatter returns typed `ReviewOutputs`
  - Valid REJECTED frontmatter returns correct type with non-zero counts
  - Returns `null` for missing step folder
  - Returns `null` for missing REVIEW.md
  - Returns `null` for REVIEW.md without frontmatter delimiters
  - Returns `null` for malformed YAML
  - Returns `null` for invalid decision value (validation failure)
  - Returns `null` for negative issue counts (validation failure)
  - Returns `null` for missing required fields (validation failure)
  - Step number zero-padded correctly (step 5 → S05)
- 2 new test cases in `src/capabilities/review-task.test.ts` verifying schema exports from `frontmatter-schemas.ts`
- All 347 existing tests pass with no regressions
- `npx tsc --noEmit` reports zero errors (no circular dependency)
