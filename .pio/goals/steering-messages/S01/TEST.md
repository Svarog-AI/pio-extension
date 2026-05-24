# Tests: Swap deliverAs from "followUp" to "steer" and update turn threshold

This verifies that the two `turn_end` guards use `deliverAs: "steer"`, the `agent_end` guard remains `"followUp"`, and the default turn threshold is `15`.

## Unit Tests

Given the nudge test is renamed to include "steer" when it asserts deliverAs options then it expects `{ deliverAs: "steer" }`.
Given a thinking-only turn_end when the recovery message is sent then sendUserMessage is called with `{ deliverAs: "steer" }`.
Given the agent_end handler fires when pio_mark_complete was not called then it still uses `{ deliverAs: "followUp" }`.
Given DEFAULT_TURN_THRESHOLD is 15 when turn_count reaches 15 then the nudge message is sent.
Given DEFAULT_TURN_THRESHOLD is 15 when turn_count is 14 then no nudge message is sent.
Given DEFAULT_TURN_THRESHOLD is 15 when 30 turns are simulated then exactly 2 nudge messages are sent.
Given the nudge message embeds turnCount when threshold 15 is reached then the message content contains "15".

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npx vitest run src/guards/session-guard.test.ts` is run then all tests pass.
