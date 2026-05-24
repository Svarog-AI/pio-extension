# Session guards fire on user abort

When a user aborts a pio sub-session run, the session guard handlers still execute:

- **`turn_end`** — may send recovery prompts or turn-threshold nudges after the user has already stopped the run
- **`agent_end`** — shows the "session ended without calling pio_mark_complete" warning even though the abort was intentional

The `agent_end` handler should detect that the run was user-aborted and skip the warning. The `turn_end` handler should similarly bail out early if the session is in an aborted state.


## Category

bug

## Context

File: `src/guards/session-guard.ts` — handlers at lines ~130 (`turn_end`) and ~158 (`agent_end`). Neither handler checks for an abort/stop condition before acting. The `AgentEndEvent` type may carry an abort reason or status field from the pi framework that can be used to detect user-initiated stops.
