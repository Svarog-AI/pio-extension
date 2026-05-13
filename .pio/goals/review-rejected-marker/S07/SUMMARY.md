# Summary: Implement automatic marker creation at `pio_mark_complete` (re-execution after rejection)

## Status
COMPLETED

## Files Modified
- `src/capabilities/validation.ts` — Renamed shadowed `const result` to `const nextTask` inside the `pio_mark_complete` execute handler's auto-enqueue block (line 374). Updated all 6 downstream references (`nextTask.capability`, `nextTask.params`, condition guards) within the `if (result.passed)` scope to use `nextTask` instead.

## Files Created
- (none — all files were created in the previous implementation pass)

## Files Deleted
- (none)

## What Changed From Previous Rejection
The review identified one HIGH issue: variable `result` was shadowed inside the `pio_mark_complete` execute handler — an outer `const result` (line 298, `ValidationResult`) and an inner `const result` (line 374, task-routing result from `resolveNextCapability()`) existed at adjacent scopes. Fixed by renaming the inner variable to `nextTask`, which clearly distinguishes the task-routing result from the validation result.

## Decisions Made
- No new tests were added for the rename — variable shadowing is a code-quality concern with no observable behavioral change. The existing 216 tests cover all functional paths and remain green after the rename.
- Chose `nextTask` as the new name (matching the review recommendation) to clearly describe the value: it's the resolved next-task routing result from `resolveNextCapability()`.

## Test Coverage
- All 216 existing tests pass (`npm run test`)
- Zero type errors (`npm run check`)
- All 8 acceptance criteria from TASK.md remain satisfied:
  1. `js-yaml` in `package.json` — ✓
  2. Frontmatter parsing — 8 unit tests ✓
  3. Validation failure on missing/malformed frontmatter — integration test ✓
  4. APPROVED creates marker, preserves COMPLETED — unit + integration tests ✓
  5. REJECTED creates marker, deletes COMPLETED — unit + integration tests ✓
  6. `validateReviewState` consistency — 5 unit tests ✓
  7. Non-review-code sessions unaffected — source-level gating verified ✓
  8. `npm run check` — zero errors ✓
