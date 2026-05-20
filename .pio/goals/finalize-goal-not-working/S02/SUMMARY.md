# Summary: Fix state machine transition params for finalize-goal

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/state-machine.ts` — imported `resolveGoalDir` from `./fs-utils`, added `resolveGoalDir` to re-exports, and updated the `transitionEvolvePlan` completion guard to compute `goalDir` via `resolveGoalDir(process.cwd(), goalName)` and return explicit `workingDir: process.cwd()` alongside `goalName` and `goalDir` in params
- `src/state-machine.test.ts` — updated 2 existing completion detection tests to assert expanded params (`goalDir`, `workingDir`) with `process.cwd()` mocking; added 2 new tests: one verifying `goalDir` is computed from `resolveGoalDir`, and one verifying `workingDir` is set to `process.cwd()`

## Files Deleted
- (none)

## Decisions Made
- Used `process.cwd()` directly in `transitionEvolvePlan`, matching the existing pattern in `session-capability.ts`
- Used non-null assertion (`goalName!`) inside the completion guard with a comment — safe because `goalCompleted()` returning true implies a goal workspace exists
- Re-exported `resolveGoalDir` from `state-machine.ts` for backward compatibility alongside the existing `stepFolderName` re-export
- Used `vi.spyOn(process, "cwd").mockReturnValue(...)` pattern for mocking, matching the established convention from `mark-complete-integration.test.ts`

## Test Coverage
- 38 tests pass in `state-machine.test.ts` (up from 36 — 2 modified + 2 new)
- Modified test: "routes to finalize-goal when goal is completed" — asserts `goalDir` and `workingDir` with mocked `process.cwd()`
- Modified test: "propagates goalName in finalize-goal params" — additionally asserts `goalDir` and `workingDir`
- New test: "includes goalDir computed from resolveGoalDir" — verifies `goalDir` equals `resolveGoalDir(cwd, goalName)`
- New test: "includes workingDir set to process.cwd()" — verifies `workingDir` equals the mocked cwd
- All 485 tests across 21 test files pass (no regressions)
- `npm run check` (`tsc --noEmit`) reports no type errors
