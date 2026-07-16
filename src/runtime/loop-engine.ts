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
 * Step 6 registers four handlers: `resources_discover`, `input`,
 * `before_agent_start`, `tool_call`. Step 7 will add `agent_end`.
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSessionParams } from "../capability-session";
import { getSessionConfig } from "../capability-utils";
import { getState, resetState, setState } from "./session-state";
import type { WorkflowStep } from "./workflow-types";

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
 * Registers exactly four handlers in Step 6:
 * - `resources_discover`: detect pio sessions, load workflow steps
 * - `input`: detect ad-hoc interruption via InputEvent.source
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
  pi.on("input", async (event) => {
    // Check if this is an interactive user message
    const source = (event as { source?: string }).source;
    if (source === "interactive" && getState().isActive) {
      setState({ isAdHocInput: true });
    }
  });

  // 3. Iteration setup at the start of each agent run
  pi.on("before_agent_start", async (_event, _ctx) => {
    // Guard: only run inside pio sessions
    if (!getState().isActive) return;

    const state = getState();

    if (state.isAdHocInput) {
      // Ad-hoc mode: external user message arrived during active loop.
      // Engine pauses iteration tracking — do NOT increment or reset tracking.
      // Only consume the flag.
      setState({ isAdHocInput: false });
    } else {
      // Normal run: first run (0→1) or loop replay (N→N+1).
      // Increment iteration, reset tracking fields.
      setState({
        currentIteration: state.currentIteration + 1,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });
    }
  });

  // 4. Track file writes and ask_user calls per iteration
  pi.on("tool_call", async (event) => {
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
}
