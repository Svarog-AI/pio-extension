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
 * Step 6 registers three handlers: `resources_discover`, `before_agent_start`,
 * `tool_call`. Steps 7 and 8 will add `agent_end` and `input` handlers.
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSessionParams } from "../capability-session";
import { getSessionConfig } from "../capability-utils";
import { getState, resetState, setState } from "./session-state";

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
 * Registers exactly three handlers in Step 6:
 * - `resources_discover`: detect pio sessions, load workflow steps
 * - `before_agent_start`: iteration setup and ad-hoc mode detection
 * - `tool_call`: track file writes and ask_user calls
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
    const rawSteps = sessionParams.workflowSteps as
      | import("./workflow-types").WorkflowStep[]
      | undefined;
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
      stepState: { filesWritten: [], askUserCalled: false },
      engineInitiatedRun: false,
    });
  });

  // 2. Iteration setup at the start of each agent run
  pi.on("before_agent_start", async (_event, _ctx) => {
    // Guard: only run inside pio sessions
    if (!getState().isActive) return;

    const state = getState();

    if (state.engineInitiatedRun) {
      // Case 1: Engine-initiated run (loop replay from Step 7's follow-up)
      // Increment iteration counter, reset StepState, consume flag
      setState({
        currentIteration: state.currentIteration + 1,
        stepState: { filesWritten: [], askUserCalled: false },
        engineInitiatedRun: false,
      });
    } else if (state.currentIteration === 0) {
      // Case 2: First run / session startup (launched by tool/command, not follow-up)
      // Start iteration tracking: set iteration to 1, initialize fresh StepState
      setState({
        currentIteration: 1,
        stepState: { filesWritten: [], askUserCalled: false },
      });
      // Do NOT set engineInitiatedRun — it stays false
    } else {
      // Case 3: Ad-hoc mode (external user message during active loop)
      // engineInitiatedRun === false AND currentIteration > 0
      // Engine pauses — do NOT increment counter or reset StepState
    }
  });

  // 3. Track file writes and ask_user calls per iteration
  pi.on("tool_call", async (event) => {
    // Guard: only track inside pio sessions
    if (!getState().isActive) return;

    const toolName = event.toolName as string;
    const input = event.input as Record<string, unknown> | undefined;

    if (!input) return;

    // Access stepState from PioSessionState (single source of truth)
    const stepState = getState().stepState;

    // Track file write tools
    if (toolName === "write" || toolName === "edit") {
      const filePath = input.path as string | undefined;
      if (typeof filePath === "string") {
        stepState.filesWritten.push(path.resolve(filePath));
      }
    } else if (toolName === "vscode_apply_workspace_edit") {
      const edits = input.edits as Array<{ filePath?: string }> | undefined;
      if (Array.isArray(edits)) {
        for (const edit of edits) {
          if (typeof edit.filePath === "string") {
            stepState.filesWritten.push(path.resolve(edit.filePath));
          }
        }
      }
    }

    // Track ask_user calls
    if (toolName === "ask_user") {
      stepState.askUserCalled = true;
    }
  });
}
