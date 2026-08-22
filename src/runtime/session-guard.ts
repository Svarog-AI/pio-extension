import type {
  ExtensionAPI,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { getSessionConfig } from "../capability-utils";
import { readTurnThreshold } from "../model-config";
import { getState, setState } from "./session-state";

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
function getAssistantContent(
  event: TurnEndEvent,
): readonly ContentBlock[] | undefined {
  const msg = event.message as {
    role?: string;
    content?: readonly ContentBlock[];
  };
  return msg.role === "assistant" && Array.isArray(msg.content)
    ? msg.content
    : undefined;
}

// ---------------------------------------------------------------------------
// Setup — registers event handlers on the pi Extension API
// ---------------------------------------------------------------------------

/** Recovery prompt sent to nudge the agent when it produces only thinking. */
const RECOVERY_PROMPT =
  "Your last response contained only thinking blocks. If you need clarification to proceed, call `ask_user`. Otherwise, provide a visible response or take an action.";

/**
 * Register session guard handlers.
 *
 * When called, registers three event handlers on the pi Extension API:
 * 1. `resources_discover` — detects pio sub-sessions via `pio-config` custom entry.
 * 2. `turn_end` — inspects each turn; if thinking-only with no tool results,
 *    sends a recovery prompt to nudge the agent forward.
 * 3. `before_agent_start` — resets the completion flag at the start of each agent run.
 *
 * Note: `markCompleteCalled` is no longer set here via a `tool_call` handler.
 * The `__pio-exit` exit wrapper (`exitLifecycleRun` in `loop-engine.ts`) sets
 * this flag only after successful validation, avoiding the race condition where
 * validation failures still set the flag.
 */
export function setupSessionGuard(pi: ExtensionAPI) {
  // Read threshold once at setup time — config changes require extension reload
  const turnThreshold = readTurnThreshold();

  // 1. Detect pio sub-sessions at startup
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);
    setState({ isActive: !!config });
  });

  // 2. Detect dead turns at the end of each turn
  pi.on("turn_end", async (event: TurnEndEvent, _ctx) => {
    // Guard: only run inside pio sub-sessions
    if (!getState().isActive) return;

    // Skip all processing on aborted turns — agent is shutting down
    if ((event.message as { stopReason?: string }).stopReason === "aborted")
      return;

    // Turn-count tracking for refinement-loop detection
    // Increment on EVERY turn (not just thinking-only) — counts total session activity
    setState({ turnCount: getState().turnCount + 1 });
    if (getState().turnCount >= turnThreshold) {
      pi.sendUserMessage(
        `Are you in a loop? If you need clarification to proceed, call \`ask_user\`. Otherwise, continue.`,
        { deliverAs: "steer" },
      );
      setState({ turnCount: 0 });
    }

    // Extract typed content from assistant messages (returns undefined for non-assistant)
    const content = getAssistantContent(event);

    // Guard: skip non-assistant messages (undefined), empty, or missing content
    if (!content || content.length === 0) return;

    // Detect thinking-only turns and send recovery prompt
    if (isThinkingOnlyTurn(content, event.toolResults)) {
      pi.sendUserMessage(RECOVERY_PROMPT, { deliverAs: "steer" });
    }
  });

  // 3. Reset completion flag at the start of each agent run (pio sessions only)
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!getState().isActive) return;
    setState({ markCompleteCalled: false, turnCount: 0 });
  });
}
