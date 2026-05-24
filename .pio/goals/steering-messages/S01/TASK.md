# Task: Swap deliverAs from "followUp" to "steer" for turn_end guards

Change two `turn_end` guard messages in `session-guard.ts` from `{ deliverAs: "followUp" }` to `{ deliverAs: "steer" }`, update the default turn threshold from 12 to 15, and update all corresponding test assertions.

## Context

In `src/guards/session-guard.ts`, there are three `pi.sendUserMessage()` calls. Two of them fire at `turn_end` and currently use `"followUp"`, which queues the message until the agent finishes all tool calls. Changing these to `"steer"` routes them through the steering message queue so they interrupt the agent after the current turn's tool calls — mid-run instead of post-run. The third call (at `agent_end`) remains unchanged since the agent has already stopped streaming by that point.

Additionally, the default turn threshold (`DEFAULT_TURN_THRESHOLD` in `src/model-config.ts`) is currently 12 and should be increased to 15.

## What to Build

### Source Code Changes

In `src/guards/session-guard.ts`, change exactly two lines inside the `turn_end` handler:

1. **Agent loop nudge** — line 139: Change `{ deliverAs: "followUp" }` to `{ deliverAs: "steer" }` on the `pi.sendUserMessage()` call that fires when `turnCount >= turnThreshold`.
2. **Thinking-only recovery** — line 150: Change `{ deliverAs: "followUp" }` to `{ deliverAs: "steer" }` on the `pi.sendUserMessage(RECOVERY_PROMPT, ...)` call inside the `isThinkingOnlyTurn()` branch.

Do **not** modify the `agent_end` handler at line 169 — it must remain `{ deliverAs: "followUp" }`.

In `src/model-config.ts`, change exactly one constant:

3. **Default turn threshold** — Change `DEFAULT_TURN_THRESHOLD` from `12` to `15`.

### Test Changes

In `src/guards/session-guard.test.ts`:

1. **Rename and update the nudge test:** The test currently named `"nudge message uses { deliverAs: \"followUp\" }"` (inside the `"turn_count — refinement loop nudge"` describe block) should be renamed to `"nudge message uses { deliverAs: \"steer\" }"` and its assertion should expect `{ deliverAs: "steer" }` instead of `{ deliverAs: "followUp" }`.

2. **Add deliverAs assertion to the recovery test:** The test `"turn_end sends recovery message on thinking-only turn"` (inside the `"setupSessionGuard"` describe block) currently asserts `sendUserMessageCalls.length === 1` and that content is non-empty. Add an assertion verifying `sendUserMessageCalls[0].options` equals `{ deliverAs: "steer" }`.

3. **Update all hardcoded threshold values in turn_count tests:** Since the default threshold changed from 12 to 15, update the `simulateTurns()` call counts and assertions:

   - `"sends nudge message when turnCount reaches the threshold"`: Change `simulateTurns(handlers, 12)` to `simulateTurns(handlers, 15)`. Update comment from "12 turns (DEFAULT_TURN_THRESHOLD)" to "15 turns (DEFAULT_TURN_THRESHOLD)". The content assertion `toContain("12")` should become `toContain("15")` (the nudge message embeds the turn count).
   - `"turnCount resets to 0 after the nudge fires"`: Change `simulateTurns(handlers, 12)` to `simulateTurns(handlers, 15)`. Update comment.
   - `"nudge message uses { deliverAs: \"steer\" }"` (the renamed test above): Change `simulateTurns(handlers, 12)` to `simulateTurns(handlers, 15)`. Update comment.
   - `"nudge fires again after reset (periodic nudges)"`: Change `simulateTurns(handlers, 24)` to `simulateTurns(handlers, 30)` (2 × threshold). Update comment from "24 turns (2 x threshold)" to "30 turns (2 x threshold)".
   - `"does NOT send nudge when turnCount is below threshold"`: Change `simulateTurns(handlers, 11)` to `simulateTurns(handlers, 14)`. Update comment from "below threshold of 12" to "below threshold of 15".
   - `"nudge fires at the exact threshold boundary (turn 12, not 13)"`: Rename to `"nudge fires at the exact threshold boundary (turn 15, not 16)"`. Change `simulateTurns(handlers, 12)` to `simulateTurns(handlers, 15)`. Update comment from "turnCount was 12, which is >= threshold 12" to reference 15.

## Dependencies

None.

## Files Affected

- `src/guards/session-guard.ts` — modified: change `deliverAs` from `"followUp"` to `"steer"` on two lines (139, 150)
- `src/model-config.ts` — modified: change `DEFAULT_TURN_THRESHOLD` from `12` to `15`
- `src/guards/session-guard.test.ts` — modified: update nudge test name and assertion, add deliverAs assertion to recovery test, update all hardcoded threshold values (12→15, 24→30, 11→14)

## Acceptance Criteria

- `npx tsc --noEmit` reports no type errors
- `npx vitest run src/guards/session-guard.test.ts` passes with no regressions (all existing tests still pass)
- The nudge test (renamed to include `"steer"`) asserts `deliverAs: "steer"` on the nudge message options
- The recovery message test (`"turn_end sends recovery message on thinking-only turn"`) asserts `sendUserMessageCalls[0].options` equals `{ deliverAs: "steer" }`
- The `agent_end` handler still uses `{ deliverAs: "followUp" }` — confirmed by the existing `agent_end` handler test which asserts this value
- `DEFAULT_TURN_THRESHOLD` in `src/model-config.ts` equals `15`
- Nudge fires at turn 15 (not 12) — verified by the boundary test
- Nudge message content embeds the correct turn count (`"15"`, not `"12"`) when threshold is reached
- Periodic nudges fire every 15 turns — verified by the periodic nudge test simulating 30 turns and expecting 2 nudges

## Risks and Edge Cases

- **Module-level state leakage:** Tests share module-level state (`turnCount`, `isActivePioSession`). The existing tests use `beforeEach` in some describe blocks to reset state. Ensure the test changes don't introduce cross-test pollution. The nudge tests already have a `beforeEach` that resets `__testSetActiveSession(false)`, `__testSetMarkCompleteCalled(false)`, and `__testSetTurnCount(0)`.
- **No type changes needed:** The mock `sendUserMessage` already types `deliverAs` as `"steer" | "followUp"` — no interface or type modifications are required.
- **Exact line matching:** The two lines to change are visually distinct — one is the nudge message with a template literal, the other passes `RECOVERY_PROMPT`. Be careful not to accidentally change the `agent_end` handler at line 169.
- **Config cache:** `readTurnThreshold()` caches results in `_cachedConfig`. Tests don't currently mock this, so they rely on the real default. Changing `DEFAULT_TURN_THRESHOLD` will affect all tests automatically — no test-level mocking needed.
- **Check for other references to 12:** Search for any other hardcoded references to `12` as a turn threshold in documentation or comments that might need updating.
