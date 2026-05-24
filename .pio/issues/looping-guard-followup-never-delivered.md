# Looping guard followUp message never delivered — agent must be interrupted instead

The refinement-loop guard (`src/guards/session-guard.ts`) sends a nudge via `pi.sendUserMessage(..., { deliverAs: "followUp" })` when the turn threshold is hit. A `followUp` message is queued to be delivered after the current agent run ends.

But a looping agent, by definition, doesn't end — it keeps running in a cycle. The followUp message sits in the queue forever and the nudge is never delivered. The guard fires but has no effect on the looping behavior it's trying to detect.

**Root cause:** `deliverAs: "followUp"` waits for `agent_end`. Looping agents don't reach `agent_end`.

**Likely fix:** The agent needs to be interrupted/stopped when the threshold is hit, and the nudge delivered as a fresh user message in a new turn. This may require a framework-level API for mid-run interruption.

## Category

bug

## Context

File: src/guards/session-guard.ts — `turn_end` handler, line ~130. Uses `pi.sendUserMessage(msg, { deliverAs: "followUp" })`. Same pattern used for the `agent_end` warning, which works because the agent has already ended. The loop nudge has the opposite requirement — it needs to reach a still-running agent.
