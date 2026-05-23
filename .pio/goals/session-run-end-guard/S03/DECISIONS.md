# Accumulated Decisions (through Step 2)

## File Placement

- **Guard module is `session-guard.ts`** (renamed from `turn-guard.ts` in Step 1). All new guard logic, including the `agent_end` handler, must go here. References to `turn-guard.ts` are invalid.
- **Test file is `session-guard.test.ts`**. New tests for `agent_end` behavior must be added here, importing from `"./session-guard"`.

## Event Handler Patterns

- **`tool_call` handler fires unconditionally** (no `isActivePioSession` guard) — tracking `pio_mark_complete` in non-pio sessions is harmless and ensures accurate state at `agent_end`. The `agent_end` handler itself should guard on `isActivePioSession`, so this design is intentional.
- **`before_agent_start` handler guards on `isActivePioSession`** — resets only for pio sessions to avoid interfering with other extensions.

## Naming and API Conventions

- Exported setup function is `setupSessionGuard(pi: ExtensionAPI)`.
- Module-level test accessors follow the `__test*` pattern (e.g., `__testSetActiveSession()`, `__testSetMarkCompleteCalled()`).
- Warning messages use module-level string constants (e.g., `RECOVERY_PROMPT`). The new warning should follow this convention.

## `sendUserMessage` Delivery Mode

- When sending from `agent_end`, the agent loop has already exited. Use `{ deliverAs: "followUp" }` to defer the message — it queues to `_followUpMessages` and becomes context for the next user prompt without triggering a new agent run.
