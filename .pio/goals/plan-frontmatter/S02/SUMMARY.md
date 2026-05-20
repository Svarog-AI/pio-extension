# Summary: Add planMetadata() to GoalState and replace totalPlanSteps()

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — Fixed `totalPlanSteps()` to delegate to `planMetadata()` instead of duplicating frontmatter extraction logic. Extracted `planMetadata` into a local `_planMetadata` variable before the `return { ... }` statement, allowing both `planMetadata` and `totalPlanSteps` to share the same implementation via closure over `goalDir`.

## Files Deleted
- (none)

## Decisions Made
- Used the `_planMetadata` local variable pattern (same approach used for `goalName` and `cwd`) to enable delegation in a plain object literal where `this` is not available.
- No changes to tests were needed — the existing test suite (420 tests) already covered all acceptance criteria from the previous implementation attempt.

## Test Coverage
- All 420 tests pass, including:
  - 11 `planMetadata()` tests (valid frontmatter, missing file, no delimiters, malformed YAML, missing totalSteps, zero, negative, float, extra fields stripping, no caching, boundary value)
  - 5 `planMetadata({ errors: true })` tests (valid data, missing file error, no delimiters error, typebox error details, extra fields stripping)
  - 2 `suppress console.warn` tests (errors=true suppresses, errors=false emits)
  - 4 `totalPlanSteps()` tests (frontmatter-based, missing file, no frontmatter, invalid frontmatter)
  - Construction smoke test includes `planMetadata()` call

## Review Issues Addressed
- **MEDIUM (DRY violation):** `totalPlanSteps()` previously duplicated the `extractFrontmatter` + `validateAndCoerce` pipeline inline. Now delegates to `_planMetadata()` — single source of truth for the frontmatter extraction logic.
