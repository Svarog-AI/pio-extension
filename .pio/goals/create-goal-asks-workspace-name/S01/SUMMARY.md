# Summary: Update defaultInitialMessage to include goal name as a given fact

## Status
COMPLETED

## Files Created
- (none — all files already existed from previous attempt)

## Files Modified
- `src/capabilities/create-goal.ts` — Exported `prepareGoal` function (changed `async function` to `export async function`) to enable direct unit testing per TEST.md requirements
- `src/capabilities/create-goal.test.ts` — Rewrote tests to match TEST.md specification:
  - `prepareGoal` tests now call `prepareGoal` directly and assert `{ goalDir, ready }` return values (tests 6–7)
  - Added dedicated `goalExists` tests: existing directory, non-existing path, file-vs-directory edge case
  - Added dedicated `resolveGoalDir` tests: path joining, nested-like goal names
  - Preserved all 5 `defaultInitialMessage` tests (were already correct)

## Files Deleted
- (none)

## Decisions Made
- Exported `prepareGoal` as a public function to satisfy TEST.md's requirement of calling it directly. This is safe: the function has no side effects beyond what the tool handler already performs (mkdir + goalExists check).
- Added dedicated helper function tests (`goalExists`, `resolveGoalDir`) as recommended by the review. These provide isolation — if `prepareGoal` fails in production, you can immediately tell whether the bug is in the control flow or in a dependency.

## Test Coverage
- 5 `defaultInitialMessage` tests: all pass, match TEST.md exactly
- 2 `prepareGoal` tests: call `prepareGoal` directly, assert `{ goalDir, ready }` — match TEST.md exactly
- 3 `goalExists` tests: existing directory, non-existing path, file path edge case
- 2 `resolveGoalDir` tests: path joining, nested-like names
- Total: 322 tests pass (5 new tests added), 0 failures
- TypeScript type check (`npm run check`): passes with no errors
