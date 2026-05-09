# Add command to force-exit an incomplete session capability

The `session_before_switch` exit gate in `validation.ts` blocks the user/agent from leaving a capability session until validation passes (required output files exist). There's a fallback after 3 warnings, but it's implicit and confusing.

Users need an explicit way to abandon a session they don't want to complete anymore — e.g., wrong direction, scope changed, or just starting over.

Proposed approach: add a command `/pio-abandon-session` that sets a flag (module-level, like `warnedOnce`) which causes the `session_before_switch` handler to allow the switch regardless of validation state. Should show a clear warning/notification confirming the abandon.

Alternative approaches:
- A separate tool (`pio_abandon_session`) callable by agents too
- The command could optionally clean up partially-written files in the goal workspace
- Could integrate with `pio_delete_goal` if they want to nuke everything

## Category

improvement

## Context

Key file: src/capabilities/validation.ts — the session_before_switch handler at ~line 130 uses warnedOnce/warningsThisSession as gates. Adding an `abandoned` flag there that short-circuits the check is straightforward. Registration in src/index.ts follows the standard pattern.
