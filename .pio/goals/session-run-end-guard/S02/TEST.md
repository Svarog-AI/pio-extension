# Tests: Completion tracking in session-guard

This verifies that `markCompleteCalled` is tracked via `tool_call` and `before_agent_start` events, and that the `__testSetMarkCompleteCalled` accessor works correctly.

## Unit Tests

Given `__testSetMarkCompleteCalled()` with no args when the flag is at default then it returns `false`.
Given `__testSetMarkCompleteCalled(true)` when the flag is set then subsequent getter call returns `true`.
Given `__testSetMarkCompleteCalled(false)` when the flag is reset then subsequent getter call returns `false`.
Given a `tool_call` event with `toolName === "pio_mark_complete"` when the handler fires then `markCompleteCalled` is set to `true`.
Given a `tool_call` event with `toolName === "read"` when the handler fires then `markCompleteCalled` remains `false`.
Given a `tool_call` event with `toolName === "write"` when the handler fires then `markCompleteCalled` remains `false`.
Given a `tool_call` event for `pio_mark_complete` when `isActivePioSession` is `false` then `markCompleteCalled` is still set to `true` (no session guard).
Given a `before_agent_start` event when `isActivePioSession` is `true` then `markCompleteCalled` is reset to `false`.
Given a `before_agent_start` event when `isActivePioSession` is `false` then `markCompleteCalled` is NOT reset (remains `true` if previously set).
Given `setupSessionGuard` is called when it registers handlers then both `"tool_call"` and `"before_agent_start"` handlers are present.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
