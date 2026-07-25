/**
 * Loop engine — bounded iteration control for pio workflow phases.
 *
 * Replaces prompt-based phase nudging with a hard-coded event-driven loop.
 * Each workflow phase executes as one or more agent runs (iterations).
 * The engine tracks per-iteration state (files written, ask_user calls)
 * and controls iteration advancement through event handlers.
 *
 * All loop state lives in PioSessionState (session-state.ts) —
 * there are no module-level variables. Access everything through
 * `getState()` / `setState()` from session-state.
 *
 * The engine registers six event handlers: `resources_discover`, `input`,
 * `before_agent_start`, `tool_call`, `agent_end`, and `session_shutdown`.
 * Additionally, it registers the `/continue` command for ad-hoc resumption.
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCompiledWorkflowPhases } from "../capability-session";
import { CapState } from "../capability-state";
import { getSessionConfig } from "../capability-utils";
import { readDebugDisplay, resolveMaxIterations } from "../model-config";
import type { PioSessionState } from "./session-state";
import { getState, resetState, setState } from "./session-state";
import {
  extractPersistedState,
  loadLoopEngineState,
  saveLoopEngineState,
} from "./state-persistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a one-line summary of completed phases for CustomMessage injection.
 *
 * Returns "No previous phases completed" on Phase 1, "Phases 1 completed" on
 * Phase 2, and "Phases 1\u2013N completed" on Phase N+1.
 */
function buildCompletedPhasesInfo(state: PioSessionState): string {
  return state.currentPhase > 1
    ? `Phases ${state.currentPhase > 2 ? `${1}\u2013${state.currentPhase - 1}` : "1"} completed.`
    : "No previous phases completed.";
}

/**
 * Build CustomMessage content for the current phase with authority framing.
 *
 * Format:
 *   ## Instructions for Phase N
 *
 *   Follow the instructions below. Do not do anything outside these instructions.
 *
 *   <completed phases info>
 *   You are on Phase N of M, iteration I.
 *
 *   ---
 *
 *   <phase instructions>
 *
 *   [optional: **Retry focus:** <loopMessage>]
 *
 * @internal — Used by both `before_agent_start` (first run) and `agent_end` (phase transitions).
 */
export function buildPhaseInstructions(state: PioSessionState): string {
  const phase = state.phasesList[state.currentPhase - 1];
  let prompt =
    `## Instructions for Phase ${state.currentPhase}\n\n` +
    `Follow the instructions below. Do not do anything outside these instructions.\n\n`;
  prompt +=
    `${buildCompletedPhasesInfo(state)}\n` +
    `You are on Phase ${state.currentPhase} of ${state.totalPhases}, iteration ${state.currentIteration}.\n\n---\n\n` +
    phase.instructions;
  // Loop replay: include loopMessage as additional per-retry context
  if (state.currentIteration > 1 && phase.loopMessage) {
    prompt += `\n\n**Retry focus:** ${phase.loopMessage}`;
  }
  return prompt;
}

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
 * Registers exactly six handlers:
 * - `resources_discover`: detect pio sessions, load workflow phases
 * - `input`: detect ad-hoc interruption via InputEvent.source
 * - `before_agent_start`: iteration setup and ad-hoc mode detection
 * - `tool_call`: track file writes and ask_user calls
 * - `agent_end`: termination evaluation and follow-up injection
 * - `session_shutdown`: flush persisted state on reload/quit
 */
export function setupLoopEngine(pi: ExtensionAPI) {
  // 1. Detect pio sub-sessions and initialize loop engine state
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);
    if (!config) {
      // Not a pio session — reset all state (including loop engine fields)
      resetState();
      return;
    }

    // Load workflow phases directly via typed getter.
    // Missing phases is not an error — empty list means single-pass execution.
    const phasesList = getCompiledWorkflowPhases() ?? [];
    const totalPhases = phasesList.length;

    // Resolve phase-level write allowlists
    const capState = new CapState(
      config.contract,
      config.workspaceDir ?? ctx.cwd,
      config.sessionParams,
    );
    const allContractOutputs = new Set(
      capState.getAllOutputPaths().map((p) => path.resolve(p)),
    );

    const phaseWriteAllowlist = new Map<
      number,
      {
        allowedPaths: Set<string>;
        allowedNames: string[];
        allContractOutputs: Set<string>;
      }
    >();
    for (let i = 0; i < phasesList.length; i++) {
      const phase = phasesList[i];
      const allowedPaths = new Set<string>();
      const allowedNames: string[] = [];
      if (phase.write) {
        for (const name of phase.write) {
          allowedNames.push(name);
          const resolved = capState.tryResolveOutput(name);
          if (resolved) {
            allowedPaths.add(path.resolve(resolved.path));
          } else {
            console.warn(
              `[loop-engine] Step ${i + 1} (${phase.title ?? "unknown"}): output name "${name}" in write[] could not be resolved — it will not be in the allowed list.`,
            );
          }
        }
      }
      // ALWAYS create entry, even when write is undefined or empty
      phaseWriteAllowlist.set(i + 1, {
        allowedPaths,
        allowedNames,
        allContractOutputs: new Set(allContractOutputs),
      });
    }

    // Capture session ID for persistence
    const sessionId = ctx.sessionManager.getSessionId();

    // Attempt to restore state from disk
    const saved = loadLoopEngineState(sessionId);

    // Initialize PioSessionState (single source of truth)
    setState({
      isActive: true,
      sessionId: sessionId,
      phasesList: phasesList,
      totalPhases: totalPhases,
      currentPhase: saved?.currentPhase ?? 1,
      currentIteration: saved?.currentIteration ?? 1,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: saved?.isAdHocInput ?? false,
      phaseWriteAllowlist: phaseWriteAllowlist,
    });
  });

  // 2. Ad-hoc mode detection — fires before before_agent_start
  pi.on("input", async (event, _ctx) => {
    // Check if this is an interactive user message
    if (event.source === "interactive" && getState().isActive) {
      setState({ isAdHocInput: true });
      // Persist ad-hoc mode flag
      const state = getState();
      if (state.sessionId) {
        saveLoopEngineState(state.sessionId, extractPersistedState(state));
      }
    }
  });

  // 3. CustomMessage injection via before_agent_start
  pi.on("before_agent_start", async (_event, _ctx) => {
    // Guard: only run inside pio sessions
    const state = getState();
    if (!state.isActive) return;

    // -----------------------------------------------------------------------
    // CustomMessage injection (replaces systemPrompt for prefix cache stability)
    // -----------------------------------------------------------------------

    // Ad-hoc mode: lighter context block (no phase instructions)
    if (state.isAdHocInput) {
      const phase = state.phasesList[state.currentPhase - 1];
      if (!phase) return;

      return {
        message: {
          customType: "workflow-paused",
          content:
            `## Workflow Paused (Ad-hoc Mode)\n\n` +
            `${buildCompletedPhasesInfo(state)}\n` +
            `You were on Phase ${state.currentPhase} of ${state.totalPhases}: "${phase.title}", iteration ${state.currentIteration}.\n\n` +
            `Workflow execution is paused. Any prior instructions are no longer active — you can answer questions or help the user freely.`,
          display: readDebugDisplay(),
        },
      };
    }

    // Normal mode: inject phase instructions via helper
    const phase = state.phasesList[state.currentPhase - 1];
    if (!phase) return; // no phase loaded — skip injection

    return {
      message: {
        customType: "workflow-phase-instructions",
        content: buildPhaseInstructions(state),
        display: readDebugDisplay(),
      },
    };
  });

  // 4. Track file writes and ask_user calls per iteration
  pi.on("tool_call", async (event, _ctx) => {
    // Guard: only track inside pio sessions
    if (!getState().isActive) return;

    const toolName = event.toolName as string;
    const input = event.input as Record<string, unknown> | undefined;

    if (!input) return;

    // Extract target paths (shared for tracking + gating)
    const targetPaths: string[] = [];
    if (toolName === "write" || toolName === "edit") {
      const filePath = input.path as string | undefined;
      if (typeof filePath === "string") {
        targetPaths.push(path.resolve(filePath));
      }
    } else if (toolName === "vscode_apply_workspace_edit") {
      const edits = input.edits as Array<{ filePath?: string }> | undefined;
      if (Array.isArray(edits)) {
        for (const edit of edits) {
          if (typeof edit.filePath === "string") {
            targetPaths.push(path.resolve(edit.filePath));
          }
        }
      }
    }

    // Track file writes
    if (targetPaths.length > 0) {
      setState({
        filesWritten: [...getState().filesWritten, ...targetPaths],
      });
    }

    // Track ask_user calls
    if (toolName === "ask_user") {
      setState({ askUserCalled: true });
    }

    // --- Phase-level write gate ---
    const state = getState();
    if (targetPaths.length > 0 && state.isActive) {
      const entry = state.phaseWriteAllowlist.get(state.currentPhase);
      if (entry !== undefined) {
        const currentPhaseObj = state.phasesList[state.currentPhase - 1];
        const phaseTitle = currentPhaseObj?.title ?? "unknown";

        for (const tp of targetPaths) {
          // Always allow /tmp/ writes (consistency with capability-level validation)
          if (tp.startsWith("/tmp/")) continue;

          if (entry.allowedPaths.size === 0) {
            // write: [] — block known contract output paths
            if (entry.allContractOutputs.has(tp)) {
              return {
                block: true,
                reason: `Writing is not allowed during Phase ${state.currentPhase} of ${state.totalPhases} (${phaseTitle}). This phase does not produce any contract outputs.`,
              };
            }
          } else {
            // Populated allowlist — block other contract output paths
            if (
              !entry.allowedPaths.has(tp) &&
              entry.allContractOutputs.has(tp)
            ) {
              return {
                block: true,
                reason: `Writing is restricted during Phase ${state.currentPhase} of ${state.totalPhases} (${phaseTitle}). Allowed outputs: [${entry.allowedNames.join(", ")}]. Your target path '${tp}' is not in the allowed list.`,
              };
            }
          }
        }
      } else {
        console.warn(
          `[loop-engine] Step ${state.currentPhase}: no write allowlist entry found — write gating skipped. This should not happen after resources_discover.`,
        );
      }
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

    const currentPhaseIndex = state.currentPhase - 1; // 1-based \u2192 0-based
    const currentPhase = state.phasesList[currentPhaseIndex];
    if (!currentPhase) return;

    const resolvedMax = resolveMaxIterations(currentPhase.maxIterations);
    if (state.currentIteration >= resolvedMax) {
      // Hard stop — max iterations reached
      return;
    }

    // ---------------------------------------------------------------------------
    // 3. Termination condition evaluation
    // ---------------------------------------------------------------------------

    const minIterations = currentPhase.minIterations ?? 1;
    let conditionsMet = false;

    if (state.currentIteration < minIterations) {
      // Not yet reached min iterations — always loop
      conditionsMet = false;
    } else {
      // Min iterations reached — evaluate termination conditions
      if (
        !currentPhase.terminateWhen ||
        currentPhase.terminateWhen.length === 0
      ) {
        // No conditions defined — treat as "conditions met" (advance)
        conditionsMet = true;
      } else {
        // Evaluate callbacks with OR logic
        for (const condition of currentPhase.terminateWhen) {
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
    // 4a / 4b. Loop replay vs phase advancement
    // ---------------------------------------------------------------------------

    if (!conditionsMet) {
      // Loop replay: increment iteration and reset tracking for next iteration
      setState({
        currentIteration: state.currentIteration + 1,
        filesWritten: [],
        askUserCalled: false,
      });

      // Persist incremented iteration
      const updatedState = getState();
      if (updatedState.sessionId) {
        saveLoopEngineState(
          updatedState.sessionId,
          extractPersistedState(updatedState),
        );
      }

      // Send CustomMessage with updated state (correct iteration number)
      await pi.sendMessage(
        {
          customType: "workflow-phase-instructions",
          content: buildPhaseInstructions(getState()),
          display: readDebugDisplay(),
        },
        { deliverAs: "followUp" },
      );
      return;
    }

    // Conditions met — advance to next phase
    const nextPhaseNum = state.currentPhase + 1;

    if (nextPhaseNum > state.totalPhases) {
      // Last phase — let session end naturally
      return;
    }

    // Advance to next phase — reset iteration and tracking fields
    setState({
      currentPhase: nextPhaseNum,
      currentIteration: 1,
      filesWritten: [],
      askUserCalled: false,
    });

    // Persist phase advancement
    const advancedState = getState();
    if (advancedState.sessionId) {
      saveLoopEngineState(
        advancedState.sessionId,
        extractPersistedState(advancedState),
      );
    }

    // Send CustomMessage with instructions for the next phase
    const nextPhase = state.phasesList[nextPhaseNum - 1];
    if (nextPhase) {
      await pi.sendMessage(
        {
          customType: "workflow-phase-instructions",
          content: buildPhaseInstructions(getState()),
          display: readDebugDisplay(),
        },
        { deliverAs: "followUp" },
      );
    }
  });

  // 6. Shutdown handler — flush state on reload/quit
  pi.on("session_shutdown", async (event, _ctx) => {
    const state = getState();
    if (!state.isActive || !state.sessionId) return;
    if (event.reason !== "reload" && event.reason !== "quit") return;
    saveLoopEngineState(state.sessionId, extractPersistedState(state));
  });

  // 7. /continue command — resume loop engine from current phase/iteration
  pi.registerCommand("continue", {
    description: "Continue workflow from current phase and iteration",
    handler: async (_args, _ctx) => {
      const state = getState();

      // Guard: only execute when engine is active
      if (!state.isActive) return;

      // Clear per-iteration tracking and ad-hoc mode — preserve phase/iteration
      setState({
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Persist AFTER all state mutations
      const updatedState = getState();
      if (updatedState.sessionId) {
        saveLoopEngineState(
          updatedState.sessionId,
          extractPersistedState(updatedState),
        );
      }

      // Queue follow-up to trigger current phase (content via CustomMessage injection)
      const currentPhaseObj = state.phasesList[state.currentPhase - 1];
      if (!currentPhaseObj) return;

      pi.sendUserMessage("", { deliverAs: "followUp" });
    },
  });
}
