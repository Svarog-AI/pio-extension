# Summary: Add completion tracking

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/guards/session-guard.ts` — added `markCompleteCalled` module-level boolean, `__testSetMarkCompleteCalled` accessor, `tool_call` handler to track `pio_mark_complete` calls, and `before_agent_start` handler to reset the flag per agent run
- `src/guards/session-guard.test.ts` — added 11 new test cases covering the accessor, `tool_call` handler behavior (for `pio_mark_complete` and other tools), `before_agent_start` reset logic, and handler registration

## Files Deleted
- (none)

## Decisions Made
- `tool_call` handler fires unconditionally (no `isActivePioSession` guard) — tracking `pio_mark_complete` in non-pio sessions is harmless and ensures accurate state at `agent_end`
- `before_agent_start` handler guards on `isActivePioSession` — only resets flags for pio sessions to avoid interfering with other extensions
- `__testSetMarkCompleteCalled` follows the exact same getter/setter pattern as `__testSetActiveSession`

## Test Coverage
- 11 new tests added, all passing:
  - 3 tests for `__testSetMarkCompleteCalled` accessor (default false, set true, set false)
  - 4 tests for `tool_call` handler (sets flag for `pio_mark_complete`, no-op for `read`/`write`, fires regardless of `isActivePioSession`)
  - 2 tests for `before_agent_start` handler (resets when pio session, no-reset when non-pio)
  - 2 tests for handler registration (`tool_call` and `before_agent_start` both registered)
- All 13 existing tests still pass (no regressions)
- Full test suite: 646 tests pass across 23 files
- `npx tsc --noEmit` reports no errors
