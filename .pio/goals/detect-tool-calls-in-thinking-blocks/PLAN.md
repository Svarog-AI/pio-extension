# Plan: Detect tool calls in thinking blocks

Register a `turn_end` handler that detects agent turns producing only thinking content (no text, no tool calls) and automatically injects a recovery prompt to nudge the agent forward.

## Prerequisites

- pi framework version ^0.74.0 with `turn_end` event support (`TurnEndEvent` on `ExtensionAPI`).
- Existing `resources_discover` handlers in `session-capability.ts` and `validation.ts` already populate module-level state for Pio sessions — the new handler follows this pattern.

## Steps

### Step 1: Create dead-turn detection and recovery module

**Description:** Create a new capability file `src/capabilities/turn-guard.ts` that exports a `setupTurnGuard(pi: ExtensionAPI)` function. The module contains:

1. A module-level boolean flag (e.g., `let isActivePioSession = false`) set by a `resources_discover` handler. This handler checks for the `pio-config` custom entry — its presence indicates a Pio sub-session. Reset to `false` when no config is found (non-Pio session).

2. A `turn_end` event handler that:
   - Guards on the flag: only runs inside Pio sessions.
   - Reads `event.message` (type `AgentMessage`). Checks if it's an assistant message by inspecting `role === "assistant"`.
   - Inspects `message.content`: if every block has `type === "thinking"` (i.e., `ThinkingContent`), the turn produced no user-facing output.
   - Checks `event.toolResults`: if empty or absent, no tools executed during this turn.
   - When both conditions are true (thinking-only content + no tool results), calls `pi.sendUserMessage()` with a recovery prompt such as: *"Your last response contained only thinking blocks. Please provide a visible response or take an action."*

This covers both pure thinking turns and turns where tool-call syntax is trapped inside thinking blocks that never reached the parser.

**Acceptance criteria:**
- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] `setupTurnGuard` is exported from `src/capabilities/turn-guard.ts` and accepts an `ExtensionAPI` parameter
- [ ] The `resources_discover` handler correctly sets the active-session flag based on presence of `pio-config` custom entry
- [ ] The `turn_end` handler detects thinking-only turns: all content blocks are `type: "thinking"` AND `toolResults` is empty
- [ ] On detection, `pi.sendUserMessage()` is called with a non-empty recovery prompt string

**Files affected:**
- `src/capabilities/turn-guard.ts` — new file: dead-turn detection and recovery handler

### Step 2: Wire turn-guard into the extension entry point

**Description:** Import `setupTurnGuard` from `./capabilities/turn-guard` in `src/index.ts` and call `setupTurnGuard(pi)` alongside the existing `setupCapability(pi)` and `setupValidation(pi)` calls. This ensures the `turn_end` and `resources_discover` handlers are registered for every Pio session.

**Acceptance criteria:**
- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] `setupTurnGuard(pi)` is called in the default export function of `src/index.ts`
- [ ] No circular import dependencies introduced (verify no import cycle between `turn-guard.ts`, `validation.ts`, and `session-capability.ts`)

**Files affected:**
- `src/index.ts` — add import and call `setupTurnGuard(pi)`

## Notes

- **No shared mutable state risk:** The module-level flag (`isActivePioSession`) is per-extension-instance. Each sub-session gets its own extension runtime, so there's no cross-session contamination.
- **Handler ordering:** The `resources_discover` handler in `turn-guard.ts` must fire before any `turn_end` events. Since `resources_discover` fires at session startup (before the agent loop begins), this is guaranteed by the framework lifecycle.
- **Recovery message delivery:** `pi.sendUserMessage()` always triggers a new turn. This is intentional — the recovery prompt gives the agent a chance to self-correct and produce real output. The framework's built-in safeguards (max turns, context limits) prevent infinite loops at the platform level.
- **No configuration surface:** Per GOAL.md scope, this is always active for Pio sub-sessions with no toggle or customization needed.
