# Task: Add agent-end warning check

Add the `agent_end` handler to `setupSessionGuard` that warns when a pio sub-session terminates without calling `pio_mark_complete`.

## Context

The turn guard (now session-guard) already detects dead turns and tracks `pio_mark_complete` calls. Steps 1 and 2 renamed the module and added completion tracking. The final piece is the `agent_end` handler: when an agent run ends, check if `pio_mark_complete` was ever called — if not, notify the user. This closes the gap where agents can terminate silently without proper output validation.

## What to Build

Register an `agent_end` event handler on the pi Extension API inside `setupSessionGuard`. When it fires:

1. Check `isActivePioSession` — if `false`, return early (not a pio session).
2. Check `markCompleteCalled` — if `true`, return early (normal completion, nothing to warn about).
3. If both guards pass (pio session + no `pio_mark_complete` call), send a warning message via `pi.sendUserMessage()` with `{ deliverAs: "followUp" }`.

The warning should be a constant string defined at module level (e.g., `AGENT_END_WARNING`). The message should inform the user that the agent completed without calling `pio_mark_complete`, meaning output files were not validated.

### Code Components

- **`AGENT_END_WARNING` constant** — module-level string, similar to `RECOVERY_PROMPT`. Should be clear and actionable, e.g., noting the session ended without proper completion validation.
- **`agent_end` handler** — registered via `pi.on("agent_end", ...)` inside `setupSessionGuard`. Receives an `AgentEndEvent` with `type: "agent_end"` and `messages: AgentMessage[]`. The handler does not need to inspect `event.messages` — the sole check is the `markCompleteCalled` flag set by the `tool_call` handler.
- **Handler ordering** — register as a 5th handler after the existing 4 (`resources_discover`, `turn_end`, `tool_call`, `before_agent_start`).

### Approach and Decisions

- Follow the existing pattern: module-level constant for the warning text, registered via `pi.on()` inside `setupSessionGuard`.
- Guard on `isActivePioSession` to avoid firing in non-pio sessions.
- Use `{ deliverAs: "followUp" }` per the accumulated decisions — the agent loop has exited at `agent_end`, and we need to defer the message to avoid injection into the current (already-exited) loop.
- The handler does not need to read `event.messages` — completion state is fully captured by the `markCompleteCalled` flag. Keep the handler minimal.
- Reference: `AgentEndEvent` type from `@earendil-works/pi-coding-agent` has shape `{ type: "agent_end"; messages: AgentMessage[] }`.

## Dependencies

- **Step 1 (rename-module-to-session-guard):** Module is `session-guard.ts` with `setupSessionGuard`.
- **Step 2 (add-completion-tracking):** `markCompleteCalled` flag and `__testSetMarkCompleteCalled()` accessor must exist. The `tool_call` handler sets the flag, and `before_agent_start` resets it.

## Files Affected

- `src/guards/session-guard.ts` — add `AGENT_END_WARNING` constant and `agent_end` handler (registered as 5th handler in `setupSessionGuard`)
- `src/guards/session-guard.test.ts` — add tests for `agent_end` handler behavior

## Acceptance Criteria

- `agent_end` handler sends a follow-up message via `pi.sendUserMessage()` when `markCompleteCalled` is `false` and `isActivePioSession` is `true`
- `agent_end` handler does nothing when `markCompleteCalled` is `true` (normal completion)
- `agent_end` handler does nothing when not in a pio session (`isActivePioSession` is `false`)
- Warning message uses `{ deliverAs: "followUp" }` delivery mode
- The warning constant string is defined at module level and is non-empty
- `setupSessionGuard` registers an `agent_end` handler (verifiable via the mock `handlers` map)
- Existing tests pass with no regressions
- `npx tsc --noEmit` reports no errors

### Additional test criteria (for programmatic verification)

- Test: `agent_end` sends warning when `markCompleteCalled` is `false` and `isActivePioSession` is `true` — assert `sendUserMessageCalls` has one entry, and that the call includes `{ deliverAs: "followUp" }`
- Test: `agent_end` does NOT send warning when `markCompleteCalled` is `true` — assert `sendUserMessageCalls` is empty
- Test: `agent_end` does NOT send warning when `isActivePioSession` is `false` — assert `sendUserMessageCalls` is empty
- Test: `setupSessionGuard` registers an `agent_end` handler — assert `handlers.get("agent_end")` is defined and non-empty

## Risks and Edge Cases

- **Mock limitations:** The test mock's `sendUserMessage` currently only captures the content string (`sendUserMessageCalls: string[]`). To verify `{ deliverAs: "followUp" }`, the mock may need to capture the options object as well (e.g., change to `sendUserMessageCalls: { content: string; options?: { deliverAs?: string } }[]` or assert via a spy).
- **Type import:** `AgentEndEvent` is available in `@earendil-works/pi-coding-agent` types. Verify it's importable alongside `ExtensionAPI` and `TurnEndEvent`. If the union type `ExtensionEvent` requires explicit narrowing, use `event.type === "agent_end"` guards.
- **Module-level state isolation:** Tests share module-level state (`markCompleteCalled`, `isActivePioSession`). Ensure each test resets state before assertions, following the existing pattern (set known state before invoking handlers).
