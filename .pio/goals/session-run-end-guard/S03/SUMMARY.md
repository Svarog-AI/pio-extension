# Summary: Add agent-end warning check

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/guards/session-guard.ts` — added `AGENT_END_WARNING` constant, imported `AgentEndEvent`, registered `agent_end` handler (5th handler) that warns via `pi.sendUserMessage()` with `{ deliverAs: "followUp" }` when `markCompleteCalled` is `false` and `isActivePioSession` is `true`
- `src/guards/session-guard.test.ts` — updated `sendUserMessageCalls` mock to capture `{ content, options }` objects, added `beforeEach` state reset, added 4 new tests for `agent_end` handler behavior and registration

## Files Deleted
- (none)

## Decisions Made
- `AGENT_END_WARNING` message text: "This session ended without calling pio_mark_complete. Output files were not validated against expected outputs."
- `sendUserMessageCalls` mock type changed from `string[]` to `{ content: string; options?: { deliverAs?: "steer" | "followUp" } }[]` to verify the `deliverAs: "followUp"` option
- `agent_end` handler guards on both `isActivePioSession` and `markCompleteCalled` before sending the warning
- Handler does not inspect `event.messages` — completion state is fully captured by the `markCompleteCalled` flag

## Test Coverage
- 4 new tests added (28 total in session-guard.test.ts):
  - `setupSessionGuard registers agent_end handler` — verifies handler registration
  - `sends warning when markCompleteCalled is false and isActivePioSession is true` — asserts `sendUserMessage` called with correct content and `{ deliverAs: "followUp" }`
  - `does NOT send warning when markCompleteCalled is true` — asserts no calls
  - `does NOT send warning when isActivePioSession is false` — asserts no calls
- All 650 tests pass across 23 test files
- `npx tsc --noEmit` reports no errors
