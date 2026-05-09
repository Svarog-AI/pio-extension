# Guard session run end: require pio_mark_complete or user question

When the agent's turn ends inside a session capability, one of two things should have happened during that turn:

1. `pio_mark_complete` was called and validation passed (session completed)
2. A user question was raised via the ask tool (`vscode_ask_user` or similar)

If **neither** happened, the agent naturally terminates with a generic ending message. We want to *prevent* that termination and instead guide it explicitly to either call `pio_mark_complete` (if it's done) or raise a user question (if it needs help).

After 3 consecutive turns where neither condition is met, hard-block the agent with a clear warning that it failed to recover.

Proposed implementation:
- Track `consecutiveNoProgressTurns` as a session-level counter (reset on successful completion or user question)
- On `turn_end` or similar event, check whether the current turn included either:
  - A successful `pio_mark_complete` call
  - An outgoing user question
- If neither: send guidance message, increment counter
- At 3 consecutive: block further turns with a terminal warning

## Category

improvement

## Context

Relevant file: src/capabilities/validation.ts (already has session-level counters like `warnedOnce`/`warningsThisSession` and event handlers for `turn_start`, `session_before_switch`, etc.)
Need to check what events are available — likely `turn_end`, `before_agent_start`, or similar from the pi ExtensionAPI. The guidance should be sent via `pi.sendUserMessage` like the existing exit-gate does.
