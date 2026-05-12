# Code Review: Read session pio-config to auto-resolve goal name in handleNextTask (Step 1)

## Decision
APPROVED

## Summary
The implementation cleanly adds session-scoped goal resolution to `/pio-next-task` with minimal, well-localized changes. `getSessionGoalName()` is a thin, well-documented getter that follows existing patterns in `session-capability.ts`. The new Case 2 in `handleNextTask` is correctly positioned between the explicit-arg and scan-all paths. All 139 tests pass (including 10 new ones), type checking is clean, and no circular dependencies were introduced.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- [MEDIUM] `handleNextTask` was exported for testability but this export wasn't mentioned in the original PLAN.md — it's a deviation from plan scope, though justified by TEST.md and standard practice. The function signature is stable, so this is a low-risk change. — `src/capabilities/next-task.ts` (line 10)

## Low Issues
- [LOW] The mock in `__tests__/next-task.test.ts` re-implements the `getSessionGoalName` type-guard logic inside the mock factory rather than importing the real function. This tests the guard logic correctly, but means any future changes to the guard (e.g., also accepting a number) would need updating in two places (real impl + mock). The trade-off is acceptable — it avoids circular mocks and keeps tests fast. — `__tests__/next-task.test.ts` (lines 43-47)

## Test Coverage Analysis
All four acceptance criteria from TASK.md are covered:

1. **Type check passes** — ✅ Verified: `npm run check` exits clean, no type errors.
2. **Session goalName auto-launch** — ✅ Covered by test "passes session goalName to launchAndCleanup when no explicit arg" — verifies the correct queue file is consumed and `launchCapability` is called without scanning.
3. **Fallback to scan when no goalName** — ✅ Covered by test "falls through to scan when getSessionGoalName returns undefined" — verifies single-goal auto-launch via scan path.
4. **Explicit arg priority preserved** — ✅ Covered by test "explicit arg takes priority over session goalName" — verifies explicit arg's queue file is consumed, not the session goalName's.

Additional coverage: `getSessionGoalName()` edge cases (non-string, null, missing key, undefined, empty) and notification-on-missing-task are all tested.

## Gaps Identified
- PLAN.md suggested using `getSessionParams()` directly inline in `handleNextTask`. TASK.md introduced a dedicated `getSessionGoalName()` helper instead. This is an improvement — it centralizes type-guard logic alongside `getStepNumber()`/`getSessionParams()`. Not a gap, but a deliberate and justified deviation.
- No other gaps between GOAL → PLAN → TASK → Implementation.

## Recommendations
N/A — approved as-is. The medium issue (exporting `handleNextTask`) is a testability improvement that doesn't affect production behavior.
