# Summary: Read session pio-config to auto-resolve goal name in handleNextTask

## Status
COMPLETED

## Files Created
- `__tests__/next-task.test.ts` — 10 unit tests covering `getSessionGoalName()` (6 tests) and `handleNextTask` goal resolution flow (4 tests)

## Files Modified
- `src/capabilities/session-capability.ts` — Added `getSessionGoalName()` public getter alongside existing `getSessionParams()` and `getStepNumber()`. Returns `goalName` as a string when inside a capability sub-session, or `undefined` otherwise.
- `src/capabilities/next-task.ts` — Imported `getSessionGoalName`, exported `handleNextTask` for testability, and inserted new Case 2 (session goalName auto-resolution) between explicit arg (Case 1) and scan-all fallback (Case 3).

## Files Deleted
- (none)

## Decisions Made
- **Single top-level mock:** Used one `vi.hoisted()`/`vi.mock()` pair for both test describe blocks, configuring `getSessionParams` to control the behavior. This tests the real type-guard logic in all scenarios.
- **Export `handleNextTask`:** Made `handleNextTask` exported (was private) to enable unit testing of the decision flow. Standard practice — function signature is stable and internal behavior benefits from test coverage.
- **No new helper needed:** `getSessionGoalName()` is thin (3 lines) and delegates to the existing `getSessionParams()`. Keeps session-param readers centralized in `session-capability.ts`, following the established pattern used by `validation.ts`.

## Test Coverage
- **10 new tests** in `__tests__/next-task.test.ts`:
  - `getSessionGoalName`: 6 tests covering string return, non-string rejection (number, null), missing key, undefined params, empty object
  - `handleNextTask`: 4 tests covering session goalName auto-launch, fallback to scan when no session context, explicit arg priority over session goalName, and notification when no pending task exists
- **All 139 tests pass** (129 existing + 10 new)
- **Type check passes:** `npm run check` (`tsc --noEmit`) exits clean with no errors
