# Tool calls should also have a validation step in any session

Currently, output validation (`ValidationRule` + `session_before_switch` gate) only applies to **session capability** sessions. Tool calls (non-session inline actions like `pio_init`, `pio_delete_goal`) run without any validation of their side effects.

The problem: tools execute in *any* session context — not just pio-managed ones — and currently have no guard that their declared effects actually occurred. If a tool claims to create a file but fails silently (permissions, disk full), the caller proceeds with incorrect assumptions.

**Proposal:** Every tool call should run through a validation step after execution, regardless of which session it's running in. This mirrors how `session_before_switch` validates capability sessions, but applies at the tool-call level so it works in any session context.

Open questions for planning:
- Should each tool declare its own validation rules (inline), or should there be a generic hook?
- Does this apply to *all* tools or only ones with observable side effects?
- How does this interact with the existing `ValidationRule` pattern?

## Category

improvement

## Context

Relevant files: src/capabilities/validation.ts (existing ValidationRule/validateOutputs, session_before_switch handler), all non-session tool capabilities (init, create-issue, delete-goal). Currently tools return success text but have no post-execution verification.
