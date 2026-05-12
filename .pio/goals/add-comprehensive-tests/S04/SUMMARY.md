# Summary: Export and test step discovery (`step-discovery.test.ts`)

## Status
COMPLETED

## Files Created
- `__tests__/step-discovery.test.ts` — 19 tests covering `isStepReady`, `isStepReviewable`, `findMostRecentCompletedStep`, and `stepFolderName` zero-padding. Uses temp directories for filesystem isolation, follows the DAMP naming pattern, and mirrors the established `createGoalTree` helper from `utils.test.ts`.

## Files Modified
- `src/capabilities/review-code.ts` — Added `export` keyword to `isStepReviewable` and `findMostRecentCompletedStep` functions (no logic changes)

## Files Deleted
- (none)

## Decisions Made
- Used a local `createGoalTree` helper in this test file rather than importing from utils tests — avoids cross-test-file coupling while maintaining consistency with the established pattern.
- Tests use real filesystem operations on temp directories (`fs.mkdtempSync`) rather than mocking `fs`, per project convention.
- Marker file names ("COMPLETED", "BLOCKED") are used as string literals directly in tests, matching internal usage in the capability modules.

## Test Coverage
- **`isStepReady` (6 tests):** TASK.md+TEST.md present → true; missing TASK.md → false; missing TEST.md → false; COMPLETED marker → false; BLOCKED marker → false; missing folder → false
- **`isStepReviewable` (5 tests):** COMPLETED+SUMMARY.md → true; missing COMPLETED → false; missing SUMMARY.md → false; BLOCKED present → false; missing folder → false
- **`findMostRecentCompletedStep` (6 tests):** no folders → undefined; one complete → 1; multiple sequential → highest; gap in middle → finds lower complete; blocked S01 + completed S02 → returns 2; specs-only S01 + reviewable S02 → returns 2
- **`stepFolderName` (2 tests):** zero-padding S01–S09 verified; no extra padding S10+ verified
- All verification commands pass: `npm run check` (exit 0), `npx vitest run __tests__/step-discovery.test.ts` (19/19 green), `npm test` (79/79 green across all 4 test files)
