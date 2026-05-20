# Summary: Include goal name in defaultInitialMessage

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/finalize-goal.ts` — Updated `CAPABILITY_CONFIG.defaultInitialMessage` to extract `params.goalName` using the same defensive pattern as `goalDir`. When `goalName` is present, the message reads `"Finalize the completed "my-feature" at /path/to/goal."`. When absent, degrades gracefully to `"Finalize the completed goal workspace at /path/to/goal."`.
- `src/capabilities/finalize-goal.test.ts` — Added 4 new test cases to the `CAPABILITY_CONFIG.defaultInitialMessage` describe block:
  - `includes the goal name when params.goalName is provided`
  - `formats the goal name naturally in the message`
  - `gracefully handles missing goalName (backward compat)`
  - `gracefully handles undefined params`

## Files Deleted
- (none)

## Decisions Made
- Used quoted goal name (`"my-feature"`) in the message for visual clarity, matching the TASK.md example of `'my-feature'` but using double quotes for TypeScript template literal consistency.
- Fallback phrasing when `goalName` is absent: `"goal workspace"` (preserves original meaning without introducing empty artifacts like `"" at`).

## Test Coverage
- 4 new unit tests added, all passing
- 3 existing `defaultInitialMessage` tests still pass (no regressions)
- Full suite: 483 tests across 21 files, all passing
- `npm run check` (tsc --noEmit): 0 type errors
