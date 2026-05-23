# Task: Add completion tracking

Add per-run completion tracking to `setupSessionGuard` so the guard can detect whether `pio_mark_complete` was called during an agent run.

## Context

The session guard (`src/guards/session-guard.ts`) currently detects thinking-only dead turns at `turn_end`. Step 3 will add an `agent_end` handler that warns when a session ends without calling `pio_mark_complete`. This step (Step 2) provides the prerequisite tracking infrastructure: a boolean flag set by a `tool_call` event listener and reset by a `before_agent_start` listener.

## What to Build

Add three new pieces of state/behavior to `setupSessionGuard` in `src/guards/session-guard.ts`:

1. **Module-level boolean** `markCompleteCalled`, initialized to `false`. Tracks whether any tool call during the current agent run was `pio_mark_complete`.

2. **Test accessor function** `__testSetMarkCompleteCalled(value?: boolean): boolean`. Following the existing `__testSetActiveSession` pattern — getter when called with no args, setter-getter when called with a boolean argument. Exported for unit tests only.

3. **`tool_call` event handler**: Sets `markCompleteCalled = true` when `event.toolName === "pio_mark_complete"`. This handler fires regardless of `isActivePioSession` — tracking is harmless and enables accurate state at `agent_end`. For all other tool names, the handler does nothing (no-op).

4. **`before_agent_start` event handler**: Resets `markCompleteCalled = false` so each agent run starts with a clean slate. This handler should guard on `isActivePioSession` — only reset when in a pio session. Non-pio sessions should not have their flags touched.

### Code Components

#### `markCompleteCalled` flag

- Type: `boolean`
- Default: `false`
- Scope: module-level (same level as `isActivePioSession`)
- Set to `true` by the `tool_call` handler when `pio_mark_complete` is called
- Reset to `false` by the `before_agent_start` handler at the start of each new agent run

#### `__testSetMarkCompleteCalled(value?: boolean): boolean`

```typescript
export function __testSetMarkCompleteCalled(value?: boolean): boolean
```

Identical pattern to `__testSetActiveSession`: if `value` is provided, assign it; always return the current value. This enables tests to read the flag and set it for specific scenarios.

#### `tool_call` handler inside `setupSessionGuard`

Register via `pi.on("tool_call", async (event) => { ... })`. The event shape (from `validation.ts`) has:
- `event.toolName: string` — name of the tool being called
- `event.input: Record<string, unknown> | undefined` — tool arguments

The handler checks `event.toolName === "pio_mark_complete"` and sets the flag. No conditional on `isActivePioSession`.

#### `before_agent_start` handler inside `setupSessionGuard`

Register via `pi.on("before_agent_start", async (_event, ctx) => { ... })`. Reset `markCompleteCalled = false` but only when `isActivePioSession` is `true`.

### Approach and Decisions

- **Follow existing patterns:** The `__testSetMarkCompleteCalled` accessor should mirror `__testSetActiveSession` exactly. The `tool_call` handler pattern is established in `validation.ts` — use `pi.on("tool_call", ...)` with `event.toolName` access.
- **No `isActivePioSession` guard on `tool_call`:** Per PLAN.md, the `tool_call` handler fires unconditionally. Tracking `pio_mark_complete` calls in non-pio sessions is harmless and ensures the flag is accurate regardless of session type detection timing.
- **`isActivePioSession` guard on `before_agent_start`:** Only reset flags for pio sessions to avoid interfering with other extensions' state.
- **No behavioral changes to existing handlers:** The `resources_discover` and `turn_end` handlers must remain unchanged. This step is purely additive.

## Dependencies

- **Step 1 (rename turn-guard to session-guard):** Must be completed first. All code references `session-guard.ts` and `setupSessionGuard`, not the old names.

## Files Affected

- `src/guards/session-guard.ts` — add `markCompleteCalled` flag, `__testSetMarkCompleteCalled` accessor, `tool_call` handler, and `before_agent_start` handler
- `src/guards/session-guard.test.ts` — add tests for completion tracking (new test cases for the new handlers and accessor)

## Acceptance Criteria

- `__testSetMarkCompleteCalled()` returns `false` by default (initial state)
- `__testSetMarkCompleteCalled(true)` sets the flag to `true`, subsequent call with no args returns `true`
- `__testSetMarkCompleteCalled(false)` resets the flag, subsequent call with no args returns `false`
- The `tool_call` handler sets `markCompleteCalled` to `true` when `event.toolName === "pio_mark_complete"`
- The `tool_call` handler does NOT set `markCompleteCalled` for other tool names (e.g., `"read"`, `"write"`)
- The `before_agent_start` handler resets `markCompleteCalled` to `false` when `isActivePioSession` is `true`
- The `before_agent_start` handler does NOT reset `markCompleteCalled` when `isActivePioSession` is `false`
- The `tool_call` handler fires regardless of `isActivePioSession` (sets flag even in non-pio sessions)
- `setupSessionGuard` registers handlers for both `"tool_call"` and `"before_agent_start"` events (verifiable via mock `pi.on`)
- Existing tests pass with no regressions (all 13 existing tests still pass)
- `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Multiple `pio_mark_complete` calls:** The flag is a boolean — calling it multiple times is idempotent. No special handling needed.
- **Timing of `before_agent_start` vs `tool_call`:** If `before_agent_start` fires after some `tool_call` events from a previous run, the reset could overwrite a `true` value. This is by design — each agent run gets a clean slate.
- **Non-pio session interference:** The `tool_call` handler intentionally tracks in all sessions (no guard). If a non-pio session calls `pio_mark_complete`, the flag will be set, but the `before_agent_start` reset won't fire for non-pio sessions. This is acceptable — Step 3's `agent_end` handler guards on `isActivePioSession` anyway.
- **Event handler ordering:** The `tool_call` and `before_agent_start` handlers should be registered inside `setupSessionGuard` alongside existing handlers. No specific ordering guarantee is needed within the same setup function.
