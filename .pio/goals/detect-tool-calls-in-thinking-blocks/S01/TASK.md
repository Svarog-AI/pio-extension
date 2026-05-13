# Task: Create dead-turn detection and recovery module

Create `src/capabilities/turn-guard.ts` to detect agent turns producing only thinking content (no text, no tool calls) and automatically inject a recovery prompt.

## Context

Currently, pio sub-sessions have no mechanism to detect when an agent turn produces only internal reasoning (`ThinkingContent` blocks) with no user-facing output or tool executions. This results in "dead turns" where the agent appears silent — it may be thinking about what to do but never produces visible output. Additionally, tool-call syntax may get trapped inside thinking blocks, never reaching the actual parser.

The pi framework fires a `turn_end` event after each turn, giving access to the assistant's full response (`message: AgentMessage`) and any tool results (`toolResults: ToolResultMessage[]`). This is the ideal place to inspect turn composition and trigger recovery.

## What to Build

A new capability file `src/capabilities/turn-guard.ts` exporting a single function `setupTurnGuard(pi: ExtensionAPI)`. When called, it registers two event handlers on the pi Extension API:

### Code Components

#### 1. Module-level session flag

- A boolean variable (e.g., `isActivePioSession`) that tracks whether the current runtime is inside a pio sub-session.
- Set to `true` by the `resources_discover` handler when a `pio-config` custom entry is found.
- Set to `false` when no such config exists (non-pio session).
- Follows the same pattern as `validation.ts` module-level variables (`validationRules`, `baseDir`, etc.).

#### 2. `resources_discover` handler

- Registers via `pi.on("resources_discover", ...)`.
- Reads all custom entries from `ctx.sessionManager.getEntries()`.
- Searches for an entry where `entry.type === "custom" && entry.customType === "pio-config"`.
- If found → set session flag to `true` (this is a pio sub-session).
- If not found → set session flag to `false` (regular pi session, skip guard logic).
- Follows the exact same pattern used in `validation.ts` and `session-capability.ts` for reading `pio-config`.

#### 3. `turn_end` handler

- Registers via `pi.on("turn_end", ...)`.
- Receives a `TurnEndEvent` with fields: `{ type: "turn_end", turnIndex, message: AgentMessage, toolResults: ToolResultMessage[] }`.
- **Guard on session flag:** Return early if not inside a pio sub-session.
- **Check for assistant message:** Inspect `message.role === "assistant"`. If the message is not from the assistant (e.g., a custom message), skip detection.
- **Thinking-only detection:** Inspect every block in `message.content`. If every content block has `type === "thinking"` (i.e., all are `ThinkingContent`), the turn produced no user-facing text output.
  - Edge case: if `message.content` is empty or undefined, this is NOT a thinking-only turn — it's an empty response, which is handled differently by the framework. Only flag when content exists AND is exclusively thinking blocks.
- **No-tool-results check:** Inspect `event.toolResults`. If the array is empty or absent, no tools executed during this turn.
- **Recovery trigger:** When BOTH conditions are true (thinking-only content AND no tool results), call `pi.sendUserMessage()` with a recovery prompt. Example message: `"Your last response contained only thinking blocks. Please provide a visible response or take an action."`

### Approach and Decisions

- **Follow the pattern in `validation.ts`:** Module-level state + `resources_discover` for config detection + event handlers registered inside a `setup*` function called from `index.ts`.
- **No imports from other pio modules:** This module should be self-contained — it only imports from `@earendil-works/pi-coding-agent` (for types and the `pi` API). No imports from `validation.ts`, `session-capability.ts`, or `utils.ts` to avoid circular dependencies.
- **Detection is pure logic, no side effects beyond `sendUserMessage`:** The handler does not modify files, block execution, or terminate sessions. It only injects a follow-up prompt.
- **Type safety:** Import `ExtensionAPI`, `TurnEndEvent`, `AgentMessage`, and `ToolResultMessage` from `@earendil-works/pi-coding-agent`. Use type guards (checking `role === "assistant"`) to narrow the `AgentMessage` union before accessing `content`.
- **Content inspection:** Since `AgentMessage` is a union type (`Message | CustomAgentMessages[...]`), and only `AssistantMessage` has `role: "assistant"` with `content: (TextContent | ThinkingContent | ToolCall)[]`, the role check narrows correctly. Check each block's `type` field — `ThinkingContent` has `type: "thinking"`.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/capabilities/turn-guard.ts` — created: dead-turn detection and recovery handler module

## Acceptance Criteria

- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] `setupTurnGuard` is exported from `src/capabilities/turn-guard.ts` and accepts an `ExtensionAPI` parameter
- [ ] The `resources_discover` handler correctly sets the active-session flag based on presence of `pio-config` custom entry
- [ ] The `turn_end` handler detects thinking-only turns: all content blocks are `type: "thinking"` AND `toolResults` is empty
- [ ] On detection, `pi.sendUserMessage()` is called with a non-empty recovery prompt string
- [ ] The module does not import from other pio capability files (self-contained, no circular dependencies)

## Risks and Edge Cases

- **`message.content` might be empty or undefined:** Guard against this — only flag when content exists AND all blocks are thinking. An empty response is not a "thinking-only" dead turn.
- **Custom messages in `AgentMessage` union:** The role check (`role === "assistant"`) correctly filters to `AssistantMessage`. Custom messages have their own structure and should be skipped.
- **Mixed content (thinking + text):** If a turn has both thinking blocks AND text blocks, it's NOT a dead turn — the agent produced visible output. Only flag when ALL blocks are thinking.
- **Timing:** `resources_discover` fires before any `turn_end` events in the framework lifecycle, so the session flag will always be set before detection runs.
- **`sendUserMessage` always triggers a new turn:** This is intentional — the recovery prompt gives the agent a chance to self-correct. The framework's max-turn limit prevents infinite loops.
