# Summary: Move step folder deletion from prepareSession to postExecute

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/revise-plan.ts` — Extracted non-APPROVED step folder deletion and REVISE_PLAN_NEEDED marker cleanup from `prepareSession()` into a new exported `cleanupIncompleteSteps()` function. Wired as `postExecute` in `CAPABILITY_CONFIG`. `prepareSession()` now performs only PLAN.md archival.
- `src/capabilities/revise-plan.test.ts` — Updated existing `prepareSession` tests to assert folder preservation (8 tests updated). Added new `cleanupIncompleteSteps` test suite (7 tests). Added `postExecute` wiring test. Updated end-to-end test to cover the split lifecycle. Total: 31 tests (was 23).

## Files Deleted
- (none)

## Decisions Made
- `cleanupIncompleteSteps` scans disk using `STEP_FOLDER_RE` (`/^S(\d+)$/`) rather than relying on `createGoalState().steps()` frontmatter, since the revision agent may write a new PLAN.md with a different step list.
- The `STEP_FOLDER_RE` constant is defined locally in `revise-plan.ts` (same pattern as `goal-state.ts`) to avoid cross-module coupling for a simple regex.
- `REVISE_PLAN_NEEDED` marker cleanup in `cleanupIncompleteSteps` uses `fs.existsSync` + `fs.unlinkSync` (not `force: true` on `rmSync`) since we're deleting a single file, not a directory.

## Test Coverage
- 31 tests in `revise-plan.test.ts`, all passing:
  - `prepareSession` archiving tests: 4 (unchanged)
  - `prepareSession` folder preservation tests: 4 (updated from deletion assertions)
  - `prepareSession` marker preservation tests: 3 (updated from deletion assertions)
  - `CAPABILITY_CONFIG` tests: 5 (added postExecute wiring test)
  - `cleanupIncompleteSteps` tests: 7 (disk scanning, APPROVED preservation, marker cleanup, edge cases)
  - End-to-end lifecycle test: 1 (updated to cover prepareSession → cleanupIncompleteSteps split)
- Full suite: 694 tests across 23 files, all passing
- `npx tsc --noEmit`: no errors
