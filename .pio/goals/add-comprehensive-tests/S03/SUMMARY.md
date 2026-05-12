# Summary: Export and test validation logic (`validation.test.ts`)

## Status
COMPLETED

## Files Created
- `__tests__/validation.test.ts` — 13 tests covering `validateOutputs` (6 tests) and `extractGoalName` (7 tests)

## Files Modified
- `src/capabilities/validation.ts` — added `export` to `extractGoalName` function and `ValidationResult` interface (no logic changes)

## Files Deleted
- (none)

## Decisions Made
- Followed the exact temp-directory pattern from `__tests__/utils.test.ts` (shared helpers per describe block, cleanup in `afterEach`)
- Used real filesystem operations on temp directories instead of mocking `fs` — matches established project convention for higher confidence
- Added two extra test cases beyond TEST.md minimum: "undefined rules.files" (verifies the `|| []` fallback) and "single file present" (minimal passing case)

## Test Coverage
- **validateOutputs:** 6 tests covering all-present, all-missing, partial-missing, empty rules, undefined files, and single-file scenarios
- **extractGoalName:** 7 tests covering standard paths, trailing slash variations, deeply nested paths, missing `/goals/` segment, root-level paths, empty input, and names with hyphens/underscores
- Total: 13 new tests (60 across full suite including smoke + utils)
