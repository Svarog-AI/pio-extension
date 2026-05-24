# Steering Messages

Change the two `turn_end` guards in `src/guards/session-guard.ts` to use `{ deliverAs: "steer" }` instead of `{ deliverAs: "followUp" }`. This routes both the agent-loop nudge and the thinking-only recovery through the steering message queue so they interrupt the agent mid-run instead of waiting for it to finish.

## Current State

In `src/guards/session-guard.ts`, there are three `pi.sendUserMessage()` calls, all using `{ deliverAs: "followUp" }`:

1. **Agent loop guard** — in the `turn_end` handler, fires when `turnCount >= turnThreshold`. Sends a nudge asking the agent to recap progress, check for refinement loops, and ship if ready. Currently uses `"followUp"` which queues the message until the agent finishes all tool calls.
2. **Thinking-only recovery** — also in the `turn_end` handler, fires when `isThinkingOnlyTurn()` detects a dead turn (only thinking blocks, no tool results). Sends a recovery prompt asking the agent to take action. Currently uses `"followUp"`.
3. **`pio_mark_complete` guard** — in the `agent_end` handler, fires when a pio sub-session ends without calling `pio_mark_complete`. Warns that output files were not validated and next workflow task may not be scheduled. Currently uses `"followUp"`.

Per the pi framework types (`sendUserMessageHandler`), the valid `deliverAs` values are `"steer"` and `"followUp"`. The value `"steering"` does not exist — TypeScript would reject it.

**How `deliverAs` works:**
- `"steer"` — queues the message for delivery after the current assistant turn finishes its tool calls, before the next LLM call. Used to redirect the agent mid-run.
- `"followUp"` — waits for agent to finish all tools. Delivered only when agent stops processing.
- When `isStreaming` is false (agent is idle), both values behave identically — they start a new turn directly. The `deliverAs` parameter is consulted only during active streaming.

## To-Be State

Both `turn_end` guards change: `deliverAs` goes from `"followUp"` to `"steer"`.

1. **Agent loop guard** — changed to `"steer"`. Ensures the refinement-loop nudge is delivered after the current turn's tool calls rather than waiting for the agent to fully finish its run.
2. **Thinking-only recovery** — changed to `"steer"`. Both fire at `turn_end` when the agent is idle, so delivery timing difference is minimal. But semantically it's an immediate "you're stuck, move on" nudge — which aligns with steering behavior. Using `"steer"` here ensures consistency: all `turn_end` guard nudges are steering messages.
3. **`pio_mark_complete` guard** — remains `"followUp"`. At `agent_end`, the agent has already stopped streaming (`isStreaming` is false), so both `"steer"` and `"followUp"` behave identically (start a new turn). Changing it would have no runtime effect but could mislead readers into thinking steering applies at session end.

The only file that changes is `src/guards/session-guard.ts`. Two-line change: swap `"followUp"` to `"steer"` on the agent loop guard and thinking-only recovery `sendUserMessage` calls (lines ~132 and ~142 respectively).
