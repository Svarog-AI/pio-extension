# Summary: Wire `postValidate` and `postExecute` through `capability-config.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — Added `{ errors?: boolean }` overload to `getReviewOutputs()`. When `errors: true`, returns `{ data?: ReviewOutputs; error?: string }` with detailed error messages instead of `null`. Suppresses `console.warn` in errors mode. Interface uses union return type for TypeScript compatibility.
- `src/capability-config.ts` — Pass through both `postValidate` and `postExecute` callbacks from `StaticCapabilityConfig` into resolved `CapabilityConfig`. Follows the existing `prepareSession` passthrough pattern.
- `src/capabilities/review-task.ts` — Added `postValidateReview` function to `CAPABILITY_CONFIG`. Uses single parsing path through `GoalState.getReviewOutputs(stepNumber, { errors: true })`. On validation failure, returns `{ success: false, message }` with detailed typebox errors. On success, calls `applyReviewDecision` to create markers and returns `{ success: true }`.
- `src/goal-state.test.ts` — Added tests for errors overload (5 tests), backward compatibility (2 tests), and console.warn suppression (1 test). Updated existing tests with type assertions for the union return type.
- `src/capability-config.test.ts` — Added passthrough tests: review-task postValidate is defined, non-review capabilities have undefined postValidate, postExecute is undefined for all capabilities.
- `src/capabilities/review-task.test.ts` — Added postValidate functional tests: valid APPROVED/REJECTED with marker creation, missing/invalid frontmatter with error messages, missing stepNumber throws.
- `src/state-machine.test.ts` — Updated mock `getReviewOutputs` signature to match new union return type.

## Files Deleted
- (none)

## Decisions Made
- **Union return type over function overloads:** TypeScript interfaces don't support function overloads on property-style members. Used a union return type (`ReviewOutputs | null | { data?: ReviewOutputs; error?: string }`) instead of conditional generic types. Callers using the errors mode need a type assertion to narrow the return type.
- **Single parsing path through GoalState:** `postValidateReview` delegates entirely to `GoalState.getReviewOutputs(stepNumber, { errors: true })` rather than calling `extractFrontmatter` + `validateAndCoerce` directly. This eliminates duplicated parsing logic.
- **Marker creation in postValidate:** `applyReviewDecision` is called inside `postValidate` (before transition routing) so that `resolveTransition` can read markers from disk via `GoalState.step.status()`.

## Test Coverage
- **18 new tests added** (all passing):
  - 5 tests for `getReviewOutputs` with `{ errors: true }` (valid data, missing file, no delimiters, invalid decision, negative count)
  - 2 tests for backward compatibility (null for missing file, data for valid frontmatter)
  - 1 test for console.warn suppression in errors mode
  - 3 tests for `resolveCapabilityConfig` passthrough (review-task defined, create-goal undefined, postExecute undefined) — focused on the wiring mechanism, not enumerating all capabilities
  - 7 tests for review-task postValidate functional behavior (APPROVED, REJECTED, missing file, no delimiters, invalid decision, negative count, missing stepNumber)
- **378 total tests pass** with no regressions (verified 10 consecutive clean runs)
- **`npx tsc --noEmit`** reports zero errors
