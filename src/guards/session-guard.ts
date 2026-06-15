import type { AgentEndEvent, ExtensionAPI, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { readTurnThreshold } from "../model-config";
import { getSessionConfig } from "../capability-utils";

// ---------------------------------------------------------------------------
// Minimal local interfaces for content blocks
//
// The pi framework (pi-coding-agent) uses AgentMessage internally but does not
// re-export it or its content block types (TextContent, ThinkingContent,
// ToolResultMessage). These are imported from private sub-packages that may
// change without notice. Defining minimal local interfaces here provides
// compile-time safety against typos in block-type discriminators while
// remaining stable across framework versions.
// ---------------------------------------------------------------------------

/** Minimal shape shared by all content blocks (text, thinking, toolCall, etc.). */
interface ContentBlock {
  type: string;
}

// ---------------------------------------------------------------------------
// Module-level state (per-extension-instance, populated by resources_discover)
// ---------------------------------------------------------------------------

let isActivePioSession = false;

/** True when any tool call during the current agent run was `pio_mark_complete`. */
let markCompleteCalled = false;

/** Turn counter for refinement-loop detection. Resets at before_agent_start and after each nudge. */
let turnCount = 0;

/**
 * Test-only accessor for the internal `isActivePioSession` flag.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate session state without mocking the full ExtensionAPI.
 */
export function __testSetActiveSession(value?: boolean): boolean {
  if (value !== undefined) {
    isActivePioSession = value;
  }
  return isActivePioSession;
}

/**
 * Test-only accessor for the internal `markCompleteCalled` flag.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate completion-tracking state without mocking the full ExtensionAPI.
 */
export function __testSetMarkCompleteCalled(value?: boolean): boolean {
  if (value !== undefined) {
    markCompleteCalled = value;
  }
  return markCompleteCalled;
}

/**
 * Test-only accessor for the internal `turnCount` variable.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate turn-count state without mocking the full ExtensionAPI.
 */
export function __testSetTurnCount(value?: number): number {
  if (value !== undefined) {
    turnCount = value;
  }
  return turnCount;
}



// ---------------------------------------------------------------------------
// Pure detection logic — extracted for unit testing
// ---------------------------------------------------------------------------

/**
 * Determine if a turn produced only thinking content with no tool executions.
 *
 * Returns true when:
 * - `content` is non-empty AND every block has `type === "thinking"`
 * - `toolResults` is empty or absent (no tools executed)
 *
 * Returns false for empty content, mixed content, or when tools executed.
 */
export function isThinkingOnlyTurn(
  content: readonly ContentBlock[],
  toolResults: readonly unknown[] | undefined,
): boolean {
  // Empty content is not a "thinking-only" dead turn
  if (content.length === 0) return false;

  // Check that ALL blocks are thinking type
  const allThinking = content.every((block) => block.type === "thinking");
  if (!allThinking) return false;

  // Check that no tools executed during this turn
  if (toolResults != null && toolResults.length > 0) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Assistant message accessor — bridges the gap with unexported framework types
// ---------------------------------------------------------------------------

/**
 * Extract content blocks from a `TurnEndEvent`'s assistant message.
 *
 * The framework types `event.message` as `AgentMessage`, which is not re-exported.
 * After narrowing via `role === "assistant"`, the message has a `content` array
 * of typed blocks, but TypeScript can't access it without a type assertion since
 * the underlying union members are private.
 */
function getAssistantContent(event: TurnEndEvent): readonly ContentBlock[] | undefined {
  const msg = event.message as { role?: string; content?: readonly ContentBlock[] };
  return msg.role === "assistant" && Array.isArray(msg.content) ? msg.content : undefined;
}

// ---------------------------------------------------------------------------
// Setup — registers event handlers on the pi Extension API
// ---------------------------------------------------------------------------

/** Recovery prompt sent to nudge the agent when it produces only thinking. */
const RECOVERY_PROMPT = "Your last response contained only thinking blocks. If you need clarification to proceed, call \`ask_user\`. Otherwise, provide a visible response or take an action.";

/** Warning sent when a pio sub-session ends without calling pio_mark_complete. */
const AGENT_END_WARNING = "This session ended without calling pio_mark_complete. If you need clarification before completing work, call \`ask_user\`. Otherwise, output files were not validated against expected outputs, and next task in the workflow may not be scheduled.";

/**
 * Register session guard handlers.
 *
 * When called, registers five event handlers on the pi Extension API:
 * 1. `resources_discover` — detects pio sub-sessions via `pio-config` custom entry.
 * 2. `turn_end` — inspects each turn; if thinking-only with no tool results,
 *    sends a recovery prompt to nudge the agent forward.
 * 3. `tool_call` — tracks whether `pio_mark_complete` was called during the run.
 * 4. `before_agent_start` — resets the completion flag at the start of each agent run.
 * 5. `agent_end` — warns if the session ended without calling `pio_mark_complete`.
 */
export function setupSessionGuard(pi: ExtensionAPI) {
  // Read threshold once at setup time — config changes require extension reload
  const turnThreshold = readTurnThreshold();

  // 1. Detect pio sub-sessions at startup
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);
    isActivePioSession = !!config;
  });

  // 2. Detect dead turns at the end of each turn
  pi.on("turn_end", async (event: TurnEndEvent, _ctx) => {
    // Guard: only run inside pio sub-sessions
    if (!isActivePioSession) return;

    // Skip all processing on aborted turns — agent is shutting down
    if ((event.message as { stopReason?: string }).stopReason === "aborted") return;

    // Turn-count tracking for refinement-loop detection
    // Increment on EVERY turn (not just thinking-only) — counts total session activity
    turnCount++;
    if (turnCount >= turnThreshold) {
      pi.sendUserMessage(
        `Are you in a loop? If you need clarification to proceed, call \`ask_user\`. Otherwise, continue.`,
        { deliverAs: "steer" },
      );
      turnCount = 0;
    }

    // Extract typed content from assistant messages (returns undefined for non-assistant)
    const content = getAssistantContent(event);

    // Guard: skip non-assistant messages (undefined), empty, or missing content
    if (!content || content.length === 0) return;

    // Detect thinking-only turns and send recovery prompt
    if (isThinkingOnlyTurn(content, event.toolResults)) {
      pi.sendUserMessage(RECOVERY_PROMPT, { deliverAs: "steer"});
    }
  });

  // 3. Track pio_mark_complete calls (fires regardless of session type)
  pi.on("tool_call", async (event) => {
    if (event.toolName === "pio_mark_complete") {
      markCompleteCalled = true;
    }
  });

  // 4. Reset completion flag at the start of each agent run (pio sessions only)
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!isActivePioSession) return;
    markCompleteCalled = false;
    turnCount = 0;
  });

  // 5. Warn at session end if pio_mark_complete was never called
  pi.on("agent_end", async (event: AgentEndEvent, _ctx) => {
    if (!isActivePioSession) return;
    if (markCompleteCalled) return;
    const lastMessage = event.messages[event.messages.length - 1] as { stopReason?: string } | undefined;
    if (lastMessage?.stopReason === "aborted") return;

    pi.sendUserMessage(AGENT_END_WARNING, { deliverAs: "followUp" });
  });
}
