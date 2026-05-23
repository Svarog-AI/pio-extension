# Tests: Agent-end warning check

This verifies that the `agent_end` handler in `setupSessionGuard` sends a follow-up warning when a pio sub-session terminates without calling `pio_mark_complete`.

## Unit Tests

Given `markCompleteCalled` is false and `isActivePioSession` is true when `agent_end` fires then `pi.sendUserMessage()` is called with the warning and `{ deliverAs: "followUp" }`.
Given `markCompleteCalled` is true when `agent_end` fires then `pi.sendUserMessage()` is NOT called.
Given `isActivePioSession` is false when `agent_end` fires then `pi.sendUserMessage()` is NOT called.
Given `setupSessionGuard` is called then an `agent_end` handler is registered on the handlers map.
Given `AGENT_END_WARNING` is used as the warning message then it is a non-empty string.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
