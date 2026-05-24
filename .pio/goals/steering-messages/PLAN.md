---
totalSteps: 1
steps:
  - name: swap-followup-to-steer
    complexity: task
---

# Plan: Steering Messages

Change two `turn_end` guards in `session-guard.ts` from `deliverAs: "followUp"` to `deliverAs: "steer"`, and update existing tests to match.

## Prerequisites

None.

## Steps

### Step 1: Swap deliverAs from "followUp" to "steer" for turn_end guards

**Description**

In `src/guards/session-guard.ts`, change the `deliverAs` option on two `pi.sendUserMessage()` calls inside the `turn_end` handler:

1. **Agent loop nudge** (line ~132): When `turnCount >= turnThreshold`, the nudge message should use `{ deliverAs: "steer" }` instead of `{ deliverAs: "followUp" }`. This routes the refinement-loop warning through the steering queue so it interrupts the agent after the current turn's tool calls, rather than waiting for the full run to complete.

2. **Thinking-only recovery** (line ~142): The recovery prompt sent by `isThinkingOnlyTurn()` should use `{ deliverAs: "steer" }` instead of `{ deliverAs: "followUp" }`. Both fire at `turn_end` when the agent is idle, so timing difference is minimal, but semantically this is an immediate nudge — steering behavior.

The third `sendUserMessage` call (line ~170, `agent_end` handler for `pio_mark_complete` warning) remains `"followUp"` — no change required.

Update corresponding tests in `src/guards/session-guard.test.ts`:

- The existing test `"nudge message uses { deliverAs: 'followUp' }"` must update the expected value from `"followUp"` to `"steer"`.
- The recovery message test (`"turn_end sends recovery message on thinking-only turn"`) should gain an assertion verifying `{ deliverAs: "steer" }` on the `sendUserMessageCall`.

**Acceptance Criteria**

- `npx tsc --noEmit` reports no type errors
- `npx vitest run src/guards/session-guard.test.ts` passes with no regressions
- The test `"nudge message uses { deliverAs: 'steer' }"` (renamed from `'followUp'`) asserts `deliverAs: "steer"`
- The recovery message test asserts `sendUserMessageCalls[0].options` equals `{ deliverAs: "steer" }`
- The `agent_end` handler still uses `{ deliverAs: "followUp" }` (unchanged)

**Files Affected**

- `src/guards/session-guard.ts` — change `deliverAs` from `"followUp"` to `"steer"` on two lines (~132 and ~142)
- `src/guards/session-guard.test.ts` — update nudge test assertion from `"followUp"` to `"steer"`, add `deliverAs` assertion to recovery message test

## Notes

- The `deliverAs` parameter is already typed as `"steer" | "followUp"` in the mock and framework types. No type changes required.
- This is a behavioral change with no API surface impact — the pi framework handles both values. The change affects when messages are delivered during active streaming sessions.
- When `isStreaming` is false (agent idle), both `"steer"` and `"followUp"` behave identically. The difference matters only during active agent runs.
