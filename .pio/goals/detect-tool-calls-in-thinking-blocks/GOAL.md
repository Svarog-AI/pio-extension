# Detect agent turns ending with thinking blocks only

Detect when an agent turn produces only thinking/reasoning content with no user-facing communication or tool calls, and automatically prompt the agent to recover. This prevents dead turns where the agent appears silent or stuck, and catches tool-call syntax trapped inside thinking blocks that never reaches the parser.

## Current State

The pio extension registers event handlers via the pi Extension API in `src/capabilities/validation.ts` and `src/capabilities/session-capability.ts`. Currently used events:

- **`resources_discover`**: Reads capability config from the `pio-config` custom entry on session start.
- **`before_agent_start`**: Injects project context + capability prompts as conversation messages (every turn).
- **`turn_start`**: Resets the one-shot exit-gate warning counter (`validation.ts`).
- **`tool_call`**: Enforces file protections — read-only blocklist, write-allowlist, and default-deny for `.pio/` writes.

The pi framework exposes additional events that are not yet used by pio:

- **`turn_end`** (`TurnEndEvent`): Fired at the end of each turn. Payload: `{ type: "turn_end", turnIndex: number, message: AgentMessage, toolResults: ToolResultMessage[] }`. This gives access to the assistant's full response (content blocks) and any tool results for that turn.
- **`agent_end`** (`AgentEndEvent`): Fired once when the agent loop ends. Contains all accumulated messages — too late for per-turn detection.

An `AgentMessage` content array can include `ThinkingContent` blocks (`{ type: "thinking", thinking: string }`) alongside text, tool calls, and other content types. There is currently no logic to inspect turn output composition or detect when a turn consists exclusively of thinking content.

The issue also notes that tool-call syntax may get trapped inside thinking blocks, never reaching the actual tool-call parser for execution. This is a subset of the same problem — the turn appears to have "content" but no actionable output escaped the thinking blocks.

Related: `detect-agent-refinement-loops.md` addresses a different axis (repeated file writes without progress). Both target degenerate agent behavior but require distinct detection logic.

## To-Be State

A new event handler registers on `turn_end` in all pio sub-sessions. The handler inspects each turn's final response and detects the "thinking-only" condition:

1. **Detection:** At `turn_end`, check if the agent's `message` contains only `ThinkingContent` blocks (type: "thinking") with no accompanying user-facing text content and no tool calls executed (empty or absent `toolResults`). This covers both pure thinking turns and turns where tool-call syntax is trapped inside thinking blocks.

2. **Recovery:** When detected, automatically inject a follow-up message to the agent prompt it to produce output or take action. Example: *"Your last turn ended with thinking only. Please provide a response or take an action."* This gives the agent a chance to self-correct and continue the session.

**Scope:** Applies to all pio sub-sessions (create-plan, execute-task, evolve-plan, etc.) — registered globally in the extension, not per-capability. No configuration needed; always active for any session launched via pio.

**Implementation location:** Likely `src/capabilities/validation.ts` (already handles extension-wide events like `tool_call`, `turn_start`) or a new dedicated file (e.g., `src/capabilities/turn-guard.ts`). The handler needs access to `pi.sendUserMessage()` to inject the follow-up prompt.

**No dangerous side effects:** As stated in the issue, this is purely a recovery mechanism — it does not block execution, modify files, or terminate sessions. It nudges the agent forward when it stalls.
