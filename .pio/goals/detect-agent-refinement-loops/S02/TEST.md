# Tests: Turn-count detection in session-guard

Verifies that `turnCount` increments on each `turn_end` in pio sessions, fires a nudge at the threshold, resets periodically for repeated nudges, and respects session scope.

## Unit Tests

Given `isActivePioSession` is true when `turn_end` fires then `turnCount` increments by 1.
Given `isActivePioSession` is false when `turn_end` fires then `turnCount` does not increment.
Given `turnCount` reaches the threshold on `turn_end` then `pi.sendUserMessage()` is called with a nudge message containing the turn count.
Given the nudge message is sent then `turnCount` resets to 0.
Given the nudge message uses `{ deliverAs: "followUp" }` when sent then the options object matches.
Given `turnCount` resets after a nudge and the agent continues past another N turns then the nudge fires again (periodic nudges).
Given `turnCount` is below threshold on `turn_end` then `pi.sendUserMessage()` is NOT called for the turn-count nudge.
Given `before_agent_start` fires when `isActivePioSession` is true then `turnCount` resets to 0.
Given `before_agent_start` fires when `isActivePioSession` is false then `turnCount` does NOT reset.
Given `turn_end` fires with a text-only (non-thinking) assistant message then `turnCount` still increments.
Given `__testSetTurnCount(5)` is called then the accessor returns 5.
Given `__testSetTurnCount()` is called with no argument then it returns the current `turnCount` value.
Given the threshold boundary is exactly met (turnCount equals threshold) then the nudge fires at that exact turn.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
