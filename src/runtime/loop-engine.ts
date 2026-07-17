/**
 * Loop engine — bounded iteration control for pio workflow steps.
 *
 * Replaces prompt-based step nudging with a hard-coded event-driven loop.
 * Each workflow step executes as one or more agent runs (iterations).
 * The engine tracks per-iteration state (files written, ask_user calls)
 * and controls iteration advancement through event handlers.
 *
 * All loop state lives in PioSessionState (session-state.ts) —
 * there are no module-level variables. Access everything through
 * `getState()` / `setState()` from session-state.
 *
 * The engine registers five event handlers: `resources_discover`, `input`,
 * `before_agent_start`, `tool_call`, and `agent_end`.
 * Additionally, it registers the `/return` command for ad-hoc resumption.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Command name for resuming the loop engine after ad-hoc interruption */
export const RETURN_COMMAND = "/return";

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSessionParams } from "../capability-session";
import { getSessionConfig } from "../capability-utils";
import { resolveMaxIterations } from "../model-config";
import { getState, resetState, setState } from "./session-state";
import type { WorkflowStep } from "./workflow-types";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * Narrows an AgentMessage to access the `stopReason` field on AssistantMessage.
 *
 * `AgentMessage` is a union (`Message | CustomAgentMessages`). `stopReason`
 * lives on `AssistantMessage` (role: "assistant"). This helper safely extracts
 * the stop reason string when available.
 */
function getStopReason(msg: unknown): string | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const obj = msg as Record<string, unknown>;
  if (obj.role !== "assistant") return undefined;
  if (typeof obj.stopReason === "string") return obj.stopReason as string;
  return undefined;
}

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

/**
 * Delegates to `setState({ isActive: value })` from session-state.
 *
 * @internal — Exists solely for unit tests.
 */
export function __testSetActiveSession(value?: boolean): void {
  if (value !== undefined) {
    setState({ isActive: value });
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Main registration function — installs event handlers on the pi Extension API.
 *
 * Registers exactly five handlers:
 * - `resources_discover`: detect pio sessions, load workflow steps
 * - `input`: detect ad-hoc interruption via InputEvent.source
 * - `before_agent_start`: iteration setup and ad-hoc mode detection
 * - `tool_call`: track file writes and ask_user calls
 * - `agent_end`: termination evaluation and follow-up injection
 */
export function setupLoopEngine(pi: ExtensionAPI) {
  // 1. Detect pio sub-sessions and initialize loop engine state
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);
    const sessionParams = getSessionParams();

    if (!config || !sessionParams) {
      // Not a pio session — reset all state (including loop engine fields)
      resetState();
      return;
    }

    // Load workflow steps from enriched session params
    // Note: Currently returns {id, title} summaries; Step 10 will pass full objects.
    // WorkflowStep has all loop fields as optional, so this is safe.
    const rawSteps = sessionParams.workflowSteps as WorkflowStep[] | undefined;
    const stepsList = Array.isArray(rawSteps) ? rawSteps : [];

    const totalSteps =
      typeof sessionParams.totalWorkflowSteps === "number"
        ? sessionParams.totalWorkflowSteps
        : stepsList.length;

    // Initialize PioSessionState (single source of truth)
    setState({
      isActive: true,
      stepsList: stepsList,
      totalSteps: totalSteps,
      currentStep: 1,
      currentIteration: 0, // Not yet started — before_agent_start will set to 1
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });
  });

  // 2. Ad-hoc mode detection — fires before before_agent_start
  pi.on("input", async (event, _ctx) => {
    // Check if this is an interactive user message
    if (event.source === "interactive" && getState().isActive) {
      setState({ isAdHocInput: true });
    }
  });

  // 3. Iteration setup at the start of each agent run
  pi.on("before_agent_start", async (_event, _ctx) => {
    // Guard: only run inside pio sessions
    if (!getState().isActive) return;

    const state = getState();

    if (state.isAdHocInput) {
      // Ad-hoc mode: engine pauses iteration tracking.
      // Do NOT increment counter or reset tracking fields.
      // Flag persists — only /return clears it.
    } else {
      // Normal run: first run (0→1) or loop replay (N→N+1).
      // Increment iteration, reset tracking fields.
      setState({
        currentIteration: state.currentIteration + 1,
        filesWritten: [],
        askUserCalled: false,
      });
    }
  });

  // 4. Track file writes and ask_user calls per iteration
  pi.on("tool_call", async (event, _ctx) => {
    // Guard: only track inside pio sessions
    if (!getState().isActive) return;

    const toolName = event.toolName as string;
    const input = event.input as Record<string, unknown> | undefined;

    if (!input) return;

    // Track file write tools
    if (toolName === "write" || toolName === "edit") {
      const filePath = input.path as string | undefined;
      if (typeof filePath === "string") {
        setState({
          filesWritten: [...getState().filesWritten, path.resolve(filePath)],
        });
      }
    } else if (toolName === "vscode_apply_workspace_edit") {
      const edits = input.edits as Array<{ filePath?: string }> | undefined;
      if (Array.isArray(edits)) {
        const current = getState().filesWritten;
        const newPaths: string[] = [];
        for (const edit of edits) {
          if (typeof edit.filePath === "string") {
            newPaths.push(path.resolve(edit.filePath));
          }
        }
        setState({ filesWritten: [...current, ...newPaths] });
      }
    }

    // Track ask_user calls
    if (toolName === "ask_user") {
      setState({ askUserCalled: true });
    }
  });

  // 5. Termination evaluation and follow-up injection
  pi.on("agent_end", async (event, _ctx) => {
    // Guard: only run inside pio sessions
    if (!getState().isActive) return;

    const state = getState();
    const messages = event.messages;

    // Ad-hoc pause: user is in an interactive conversation.
    // Skip termination evaluation and follow-up injection.
    if (state.isAdHocInput) return;

    // ---------------------------------------------------------------------------
    // 1. Skip cases — no follow-up injected
    // ---------------------------------------------------------------------------

    // User abort: check last message for stopReason === "aborted"
    const lastMsg = messages[messages.length - 1];
    if (getStopReason(lastMsg) === "aborted") {
      return;
    }

    // Error: check last message for stopReason === "error"
    if (getStopReason(lastMsg) === "error") {
      return;
    }

    // Mark-complete termination: session is ending
    if (state.markCompleteCalled) {
      return;
    }

    // ---------------------------------------------------------------------------
    // 2. Iteration bounds enforcement
    // ---------------------------------------------------------------------------

    const currentStepIndex = state.currentStep - 1; // 1-based → 0-based
    const currentStep = state.stepsList[currentStepIndex];
    if (!currentStep) return;

    const resolvedMax = resolveMaxIterations(currentStep.maxIterations);
    if (state.currentIteration >= resolvedMax) {
      // Hard stop — max iterations reached
      return;
    }

    // ---------------------------------------------------------------------------
    // 3. Termination condition evaluation
    // ---------------------------------------------------------------------------

    const minIterations = currentStep.minIterations ?? 1;
    let conditionsMet = false;

    if (state.currentIteration < minIterations) {
      // Not yet reached min iterations — always loop
      conditionsMet = false;
    } else {
      // Min iterations reached — evaluate termination conditions
      if (
        !currentStep.terminateWhen ||
        currentStep.terminateWhen.length === 0
      ) {
        // No conditions defined — treat as "conditions met" (advance)
        conditionsMet = true;
      } else {
        // Evaluate callbacks with OR logic
        for (const condition of currentStep.terminateWhen) {
          try {
            if (condition.callback(state)) {
              conditionsMet = true;
              break;
            }
          } catch {
            // Callback threw — fail-safe: treat as NOT met (keep looping)
          }
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 4a / 4b. Loop replay vs step advancement
    // ---------------------------------------------------------------------------

    if (!conditionsMet) {
      // Loop replay: send follow-up to trigger another agent run for same step
      pi.sendUserMessage(currentStep.loopMessage ?? "", {
        deliverAs: "followUp",
      });
      return;
    }

    // Conditions met — advance to next step
    const nextStepNum = state.currentStep + 1;

    if (nextStepNum > state.totalSteps) {
      // Last step — let session end naturally
      return;
    }

    // Update current step in shared state
    setState({ currentStep: nextStepNum });

    // Send follow-up with next step's instructions
    const nextStep = state.stepsList[nextStepNum - 1];
    if (nextStep) {
      pi.sendUserMessage(nextStep.instructions, { deliverAs: "followUp" });
    }
  });

  // 6. /return command — resume loop engine after ad-hoc interruption
  pi.registerCommand("return", {
    description: "Resume loop engine after ad-hoc interruption",
    handler: async (_args, _ctx) => {
      const state = getState();

      // Guard: only execute when engine is active and a step is loaded
      if (!state.isActive || state.currentStep === 0) return;

      // Determine return target
      const currentStepObj = state.stepsList[state.currentStep - 1];
      const targetStepNum = currentStepObj?.returnTo ?? state.currentStep;

      // State reset: clear iteration counter and tracking fields
      setState({
        currentIteration: 0,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Advance to target step if different from current
      if (targetStepNum !== state.currentStep) {
        setState({ currentStep: targetStepNum });
      }

      // Queue follow-up with target step's instructions
      const targetStep = state.stepsList[targetStepNum - 1];
      if (!targetStep) return;

      pi.sendUserMessage(targetStep.instructions, { deliverAs: "followUp" });
    },
  });
}
