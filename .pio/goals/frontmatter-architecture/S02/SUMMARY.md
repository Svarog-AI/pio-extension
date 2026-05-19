# Summary: Add types, output schema, and marker creation to `review-task.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/review-task.ts` — Added `REVIEW_OUTPUT_SCHEMA` (typebox-based), `ReviewOutputs` type (derived via `Static<typeof ...>`), and `applyReviewDecision(goalDir, stepNumber, outputs)` function. Eliminated `_private(state)` / `public(goalDir)` split: renamed `_isReviewable` to `isReviewable` (unexported helper), inlined `_findMostRecentCompletedStep` into `findMostRecentCompletedStep`.
- `src/guards/validation.ts` — Removed all frontmatter functions (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`), removed frontmatter types (`RawReviewFrontmatter`, `ReviewFrontmatter`), removed `js-yaml` import, removed `stepFolderName` import (no longer needed). Removed review automation block from `pio_mark_complete` tool (will be restored via `postValidate` hook in Step 6).

## Files Deleted
- (none)

## Decisions Made
- **typebox schema over custom OutputSchema:** `REVIEW_OUTPUT_SCHEMA` uses `Type.Object(...)` with `Type.Union`, `Type.Literal`, and `Type.Integer({ minimum: 0 })`. Type `ReviewOutputs` is derived via `Static<typeof REVIEW_OUTPUT_SCHEMA>` — single source of truth pattern.
- **`applyReviewDecision` parameter type:** Changed from `RawReviewFrontmatter` (validation.ts) to `ReviewOutputs` (review-task.ts). TypeScript guarantees correct types at compile time; no runtime type check needed inside the function.
- **`_isReviewable` → `isReviewable`:** Renamed to drop the underscore prefix. It's an unexported module-level utility used by both `isStepReviewable` and `findMostRecentCompletedStep`. No underscore needed since it's not exported.
- **`_findMostRecentCompletedStep` inlined:** The private helper taking `GoalState` was inlined into `findMostRecentCompletedStep` which creates state internally. No separate public/private wrapper pair.
- **Review automation in mark_complete:** Commented out with a note pointing to Step 6. The `postValidate` hook will restore this functionality through the proper lifecycle mechanism.

## Test Coverage
- **35 tests pass** in `src/capabilities/review-task.test.ts` (24 existing + 11 new):
  - `REVIEW_OUTPUT_SCHEMA` structure: schema type, required fields, decision union, integer fields with minimum 0
  - `ReviewOutputs` type: compile-time type derivation from schema
  - `applyReviewDecision`: APPROVED marker creation, REJECTED + COMPLETED deletion, zero-padded step folders (S05), missing directory creation
  - `REVIEW_OUTPUT_SCHEMA` runtime validation: `Value.Check` for valid/invalid data, negative count rejection, `Value.Errors` for error details
  - Existing `isStepReviewable` and `findMostRecentCompletedStep` tests: no regressions
- **320 tests pass** across 14 test files (excluding `validation.test.ts` which is expected to fail — migrated in Step 9)
- TypeScript compilation passes (excluding `validation.test.ts` orphaned imports)
