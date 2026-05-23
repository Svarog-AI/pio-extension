# Stale guard follow-up messages pile up after session ends

## Problem

Guard follow-up messages from `session-guard.ts` sometimes fire *after* the agent has already completed or switched sessions, appearing as stale noise in the conversation.

### Observed behavior

1. **`agent_end` warning fires too late:** After successfully calling `pio_mark_complete` and receiving "Validation passed", the message *"This session ended without calling pio_mark_complete..."* still appears — likely because `agent_end` fires after the session has already terminated, but the `markCompleteCalled` flag check or message delivery is racing with session shutdown.

2. **Thinking-only recovery prompt may fire post-session:** The `turn_end` handler sends a recovery prompt when it detects thinking-only turns. If this happens near session boundaries, the follow-up message can appear in a dead context.

### Impact

- User confusion: messages claim something went wrong when it actually succeeded.
- Message pileup: multiple stale warnings accumulate in the chat history.
- Erodes trust in the guard system — users start ignoring all warnings.

## Likely cause

The `sendUserMessage({ deliverAs: "followUp" })` calls from `agent_end` and `turn_end` handlers may race with session termination or session switching. The event fires, but the message is delivered into a context that's already transitioning away.

## Category

bug

## Context

Relevant file: `src/guards/session-guard.ts` — `agent_end` handler (line ~168) and `turn_end` handler (line ~138). Both use `pi.sendUserMessage(..., { deliverAs: "followUp" })`. The `tool_call` handler tracks `markCompleteCalled`, but if `agent_end` fires before the flag is set (async race), the warning fires incorrectly.
