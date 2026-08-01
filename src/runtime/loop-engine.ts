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
import { SessionVariableStore, setupSessionVariables } from "./session-store";
import {
  extractPersistedState,
  loadLoopEngineState,
  saveLoopEngineState,
} from "./state-persistence";
import type { PhaseVariable, WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Initialize a SessionVariableStore from session params and optional persisted vars.
 *
 * Creates a new store with read-only params frozen from config, then restores
 * persisted writable vars on top. For each persisted var, `declare()` is called
 * before `set()` to preserve type enforcement across session reloads.
 *
 * @param sessionParams - Read-only params from config
 * @param persistedVars - Optional vars object from loadLoopEngineState()
 * @returns Initialized SessionVariableStore instance
 */
export function initializeStore(
  sessionParams: Record<string, unknown>,
  persistedVars?: { [name: string]: { value: unknown; type: string } },
): SessionVariableStore {
  const store = new SessionVariableStore(sessionParams);

  if (persistedVars) {
    for (const [name, entry] of Object.entries(persistedVars)) {
      store.declare(name, entry.type);
      store.set(name, entry.type, entry.value);
    }
  }

  return store;
}

/**
 * Pre-declare LLM-driven and computed variables for a variable-defining phase.
 *
 * Iterates over `phase.variables` and calls `store.declare(name, type)` for
 * each variable with `kind: "llm"` or `kind: "computed"`. Errors from
 * `store.declare()` are caught silently — same name+type is idempotent,
 * and type mismatches are capability author errors.
 *
 * Called internally by `preparePhaseVariables()` as step 0 — callers do NOT
 * call this function directly.
 *
 * @param phase - WorkflowPhase to pre-declare variables for
 * @param store - SessionVariableStore instance
 */
export function declarePhaseVariables(
  phase: WorkflowPhase,
  store: SessionVariableStore,
): void {
  if (phase.kind !== "variable-definition" || !phase.variables?.length) return;

  for (const pv of phase.variables) {
    if (pv.kind === "llm" || pv.kind === "computed") {
      try {
        store.declare(pv.name, pv.type);
      } catch {
        // Silently caught — idempotent for same name+type on loop replay.
        // Type mismatches are capability author errors.
      }
    }
  }
}

/**
 * Prepare static and computed variables for a variable-defining phase.
 *
 * Execution order:
 * 1. Pre-declare LLM/computed vars (so set() validates against types)
 * 2. Set static vars first (so computed callbacks can access them via store.getAll())
 * 3. Run computed callbacks in declaration order
 *
 * Computed callbacks read state.filesWritten and state.askUserCalled from
 * the previous phase's last agent turn.
 *
 * @param phase - WorkflowPhase to prepare variables for
 * @param store - SessionVariableStore instance
 */
export function preparePhaseVariables(
  phase: WorkflowPhase,
  store: SessionVariableStore,
): void {
  if (phase.kind !== "variable-definition" || !phase.variables?.length) return;

  // 0. Pre-declare LLM and computed variables (idempotent on replay)
  declarePhaseVariables(phase, store);

  // 1. Set static vars first (so computed callbacks can access them)
  for (const pv of phase.variables) {
    if (pv.kind === "static" && pv.value !== undefined) {
      store.set(pv.name, pv.type, pv.value);
    }
  }

  // 2. Run computed callbacks (use state.filesWritten, state.askUserCalled from last agent turn)
  for (const pv of phase.variables) {
    if (pv.kind === "computed" && pv.compute) {
      try {
        const result = pv.compute(getState());
        store.set(pv.name, pv.type, result);
      } catch (err) {
        console.warn(
          `[loop-engine] Computed variable '${pv.name}' callback threw: ${err}`,
        );
      }
    }
  }
}

/**
 * Build the instruction body for standard (non-variable-defining) phases.
 *
 * Returns interpolated phase.instructions, optionally appended with a
 * Retry focus block when iteration > 1 and loopMessage is defined.
 *
 * @param state - Current session state (for iteration count)
 * @param phase - Current WorkflowPhase (for instructions and loopMessage)
 * @param store - Optional SessionVariableStore instance for interpolation
 * @returns Markdown string with the instruction body
 */
export function buildStandardPhaseInstructions(
  state: PioSessionState,
  phase: WorkflowPhase,
  store?: SessionVariableStore,
): string {
  let body = phase.instructions ?? "";

  // Apply interpolation when store is available
  if (store) {
    body = store.interpolate(body);
  }

  // Loop replay: include loopMessage as additional per-retry context
  if (state.currentIteration > 1 && phase.loopMessage) {
    const loopMsg = store
      ? store.interpolate(phase.loopMessage)
      : phase.loopMessage;
    body += `\n\n**Retry focus:** ${loopMsg}`;
  }

  return body;
}

/**
 * Build the instruction body for variable-defining phases.
 *
 * Groups variables by kind (static, llm, computed) and generates markdown
 * tables/lists for each non-empty group. On loop replay (iteration > 1),
 * additionally lists undefined variables.
 *
 * @param state - Current session state (for iteration count)
 * @param phase - Current WorkflowPhase (for variables array)
 * @param store - SessionVariableStore instance (for isDefined checks and values)
 * @returns Markdown string with the structured variable listing
 */
export function buildVariablePhaseInstructions(
  state: PioSessionState,
  phase: WorkflowPhase,
  store: SessionVariableStore,
): string {
  if (phase.kind !== "variable-definition" || !phase.variables?.length) {
    return phase.instructions ?? "";
  }

  // Only LLM-driven vars are actionable — static vars are already pre-set
  // by the engine, and computed vars will be auto-computed after the turn.
  // Showing them to the agent wastes tokens and adds noise.
  const llmVars = phase.variables.filter(
    (pv) => pv.kind === "llm",
  ) as PhaseVariable[];

  let body =
    "This phase collects session variables. Use setVar to define the LLM-driven variables below.\n\n";

  // LLM-driven — bullets with prompt text
  if (llmVars.length > 0) {
    body += "### Variables\n\n";
    for (const pv of llmVars) {
      body += `- **${pv.name}** (\`${pv.type}\`): ${pv.description ?? "(no description)"}\n`;
    }
    body += "\n";
  }

  // On loop replay: list undefined variables (this IS the retry guidance
  // for variable-defining phases — no separate **Retry focus:** block needed)
  if (state.currentIteration > 1) {
    const undefinedVars = phase.variables.filter(
      (pv) => !store.isDefined(pv.name),
    );
    if (undefinedVars.length > 0) {
      body += "### Undefined Variables (from previous iteration)\n";
      body += "| Name | Type |\n";
      body += "|------|------|\n";
      for (const pv of undefinedVars) {
        body += `| ${pv.name} | ${pv.type} |\n`;
      }
      body += "\n";
    }
  }

  return body.trimEnd();
}

/**
 * Build a one-line summary of completed phases (by ID) for CustomMessage injection.
 *
 * Returns "No previous phases completed" on Phase 1, "Phases \"s1\" completed" on
 * Phase 2, and "Phases \"s1\", \"s2\", and \"s3\" completed" (Oxford comma) on Phase 4+.
 */
function buildCompletedPhasesIds(state: PioSessionState): string {
  if (state.currentPhase <= 1) return "No previous phases completed.";

  const ids: string[] = [];
  for (let i = 0; i < state.currentPhase - 1; i++) {
    const phase = state.phasesList[i];
    if (phase) ids.push(phase.id);
  }

  if (ids.length === 1) {
    return `Phases "${ids[0]}" completed.`;
  }
  if (ids.length === 2) {
    return `Phases "${ids[0]}" and "${ids[1]}" completed.`;
  }
  // 3+: Oxford comma
  const joined = ids
    .slice(0, -1)
    .map((id) => `"${id}"`)
    .join(", ");
  return `Phases ${joined}, and "${ids[ids.length - 1]}" completed.`;
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
  const store = getState().store ?? undefined;

  // Dispatch body building to the appropriate strategy based on phase kind
  const instructionBody =
    phase.kind === "variable-definition" && phase.variables?.length && store
      ? buildVariablePhaseInstructions(state, phase, store)
      : buildStandardPhaseInstructions(state, phase, store);

  let prompt =
    `## Instructions for "${phase.id}"\n\n` +
    `Follow the instructions below. Do not do anything outside these instructions.\n\n`;
  prompt +=
    `${buildCompletedPhasesIds(state)}\n` +
    `You are on "${phase.id}", iteration ${state.currentIteration}.\n\n---\n\n` +
    instructionBody;

  return prompt;
}

// ---------------------------------------------------------------------------
// Phase advancement helpers
// ---------------------------------------------------------------------------

/**
 * Check if a phase can execute without an agent turn.
 *
 * A programmatic phase is a variable-definition phase where all variables
 * have `kind` of `"static"` or `"computed"` — meaning there's nothing for
 * the LLM to do. Standard phases always return `false`.
 *
 * @param phase - WorkflowPhase to check
 * @returns `true` if the phase is purely programmatic (no LLM involvement)
 */
export function isProgrammatic(phase: WorkflowPhase): boolean {
  if (phase.kind !== "variable-definition" || !phase.variables?.length) {
    return false;
  }
  return !phase.variables.some((pv) => pv.kind === "llm");
}

/**
 * Persist the current loop engine state to disk.
 *
 * Internal helper — avoids duplicating the save pattern across multiple
 * phase advancement helpers. Guards against null `sessionId`.
 */
function _persistCurrentState(): void {
  const state = getState();
  if (state.sessionId) {
    saveLoopEngineState(state.sessionId, extractPersistedState(state));
  }
}

/**
 * Execute the programmatic parts of a phase.
 *
 * For variable-definition phases, this sets static variables and runs
 * computed callbacks. For standard phases, `preparePhaseVariables()`
 * is a no-op internally (kind guard returns early) but is still called.
 * Always persists state after execution.
 *
 * @param phase - WorkflowPhase to execute
 * @param store - SessionVariableStore for variable operations
 */
export function executePhase(
  phase: WorkflowPhase,
  store: SessionVariableStore,
): void {
  if (phase.kind === "variable-definition" && phase.variables?.length) {
    preparePhaseVariables(phase, store);
  }
  _persistCurrentState();
}

/**
 * Set up a new turn: adjust iteration, reset tracking, persist, and build payload.
 *
 * Modes:
 * - "increment" — increments currentIteration by 1 (loop replay paths)
 * - "reset" — sets currentIteration to 1 (phase advancement)
 * - "preserve" — leaves currentIteration unchanged (Phase 1 entry, /continue)
 *
 * All modes share: per-turn tracking reset, persistence, message building.
 * Does NOT call preparePhaseVariables() — that's the job of executePhase.
 *
 * @param mode - How to adjust the iteration counter
 * @returns CustomMessage payload for caller to deliver (return or sendMessage)
 */
export function setupTurn(mode: "reset" | "increment" | "preserve"): {
  customType: string;
  content: string;
  display: boolean;
} {
  // 1. Adjust iteration based on mode
  const state = getState();
  switch (mode) {
    case "reset":
      setState({ currentIteration: 1 });
      break;
    case "increment":
      setState({ currentIteration: state.currentIteration + 1 });
      break;
    case "preserve":
      // no iteration change
      break;
  }

  // 2. Reset per-turn tracking (always, regardless of mode)
  setState({ filesWritten: [], askUserCalled: false });

  // 3. Persist state
  _persistCurrentState();

  // 4. Build and return instruction payload
  const content = buildPhaseInstructions(getState());
  return {
    customType: "workflow-phase-instructions",
    content,
    display: readDebugDisplay(),
  };
}

/**
 * Advance through phases, skipping programmatic phases and stopping at the
 * first phase that requires an agent turn.
 *
 * Always executes programmatic parts of each phase via `executePhase()`.
 * Uses `isProgrammatic()` as a control-flow signal to decide whether to
 * keep looping or stop.
 *
 * When stopping at a turn-triggering phase, calls `setupTurn(mode)` to
 * manage iteration, reset tracking, persist, and build the message payload.
 *
 * @param store - SessionVariableStore for variable operations
 * @param startAt - 1-based phase number to start from
 * @param mode - How to adjust the iteration counter ("reset", "increment", "preserve")
 * @returns Object with `triggered` flag and optional `payload` (CustomMessage data)
 */
export function advancePhase(
  store: SessionVariableStore,
  startAt: number,
  mode: "reset" | "increment" | "preserve",
): {
  triggered: boolean;
  payload?: { customType: string; content: string; display: boolean };
} {
  let currentPhaseNum = startAt;

  while (true) {
    setState({ currentPhase: currentPhaseNum });

    const phase = getState().phasesList[currentPhaseNum - 1];
    if (!phase) {
      return { triggered: false };
    }

    executePhase(phase, store);

    if (isProgrammatic(phase)) {
      currentPhaseNum++;
      continue;
    }

    const payload = setupTurn(mode);
    return { triggered: true, payload };
  }
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
// Loop replay helper
// ---------------------------------------------------------------------------

/**
 * Shared loop replay logic — increments iteration, resets tracking,
 * persists state, and sends a follow-up CustomMessage.
 *
 * Used by loopWhile, minIterations, and terminateWhen paths.
 */
async function replayLoop(
  pi: ExtensionAPI,
  state: PioSessionState,
): Promise<void> {
  // Increment iteration and reset tracking
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

    // Initialize session variable store — reuse saved from loadLoopEngineState() call above
    const store = initializeStore(config.sessionParams ?? {}, saved?.vars);
    setState({ store });
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
            `${buildCompletedPhasesIds(state)}\n` +
            `You were on "${phase.id}", iteration ${state.currentIteration}.\n\n` +
            `Workflow execution is paused. Any prior instructions are no longer active — you can answer questions or help the user freely.`,
          display: readDebugDisplay(),
        },
      };
    }

    // Normal mode: inject phase instructions via helper
    const phase = state.phasesList[state.currentPhase - 1];
    if (!phase) return; // no phase loaded — skip injection

    // Prepare variables for variable-defining phases (Phase 1 entry or loop replay)
    const phaseStore = getState().store;
    if (
      phase.kind === "variable-definition" &&
      phase.variables &&
      phase.variables.length > 0 &&
      phaseStore
    ) {
      preparePhaseVariables(phase, phaseStore);
    }

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
      // Max iterations reached — emit var warning for variable-defining phases
      if (
        currentPhase.kind === "variable-definition" &&
        currentPhase.variables?.length &&
        state.store
      ) {
        const store = state.store;
        const missing = currentPhase.variables.filter(
          (pv) => !store.isDefined(pv.name),
        );
        if (missing.length > 0) {
          const names = missing
            .map((pv) => `${pv.name} (${pv.type})`)
            .join(", ");
          console.warn(
            `[loop-engine] Max iterations reached for Phase ${state.currentPhase} (${currentPhase.title ?? "unknown"}). Undefined variables: ${names}`,
          );
        }
      }
      return;
    }

    // ---------------------------------------------------------------------------
    // 3. Min iterations enforcement — HARD FLOOR before any conditions
    // ---------------------------------------------------------------------------

    const minIterations = currentPhase.minIterations ?? 1;
    if (state.currentIteration < minIterations) {
      await replayLoop(pi, state);
      return;
    }

    // ---------------------------------------------------------------------------
    // 4. loopWhile evaluation (unified callback pass — OR: any true → loop)
    // ---------------------------------------------------------------------------

    // Build unified callback list: auto var completeness + user-defined conditions
    const loopWhileCallbacks: Array<() => boolean> = [];

    // Auto var completeness callback for variable-defining phases
    if (
      currentPhase.kind === "variable-definition" &&
      currentPhase.variables?.length &&
      state.store
    ) {
      // Capture narrowed values for closure (avoids non-null assertions)
      const phaseVars = currentPhase.variables;
      const phaseStore = state.store;
      loopWhileCallbacks.push(() =>
        phaseVars.some((pv) => !phaseStore.isDefined(pv.name)),
      );
    }

    // User-defined loopWhile conditions
    if (currentPhase.loopWhile?.length) {
      for (const condition of currentPhase.loopWhile) {
        loopWhileCallbacks.push(() => condition.callback(state));
      }
    }

    // Evaluate all callbacks in one pass — first true wins
    let shouldLoop = false;
    for (const cb of loopWhileCallbacks) {
      try {
        if (cb()) {
          shouldLoop = true;
          break;
        }
      } catch {
        // Callback threw — treat as "not passing" (don't loop for this condition)
      }
    }

    if (shouldLoop) {
      await replayLoop(pi, state);
      return;
    }

    // ---------------------------------------------------------------------------
    // 5. terminateWhen evaluation (AND: all must pass → advance)
    // ---------------------------------------------------------------------------

    let shouldReplay = false;

    if (currentPhase.terminateWhen && currentPhase.terminateWhen.length > 0) {
      for (const condition of currentPhase.terminateWhen) {
        try {
          if (!condition.callback(state)) {
            shouldReplay = true;
            break;
          }
        } catch {
          // Callback threw — fail-safe: treat as not met (keep looping)
          shouldReplay = true;
          break;
        }
      }
    }
    // No conditions defined (or empty array) → shouldReplay stays false (advance)

    if (shouldReplay) {
      await replayLoop(pi, state);
      return;
    }

    // ---------------------------------------------------------------------------
    // 6. Advance to next phase
    // ---------------------------------------------------------------------------

    const nextPhaseNum = state.currentPhase + 1;

    if (nextPhaseNum > state.totalPhases) {
      // Last phase — let session end naturally
      return;
    }

    // Advance to next phase — but keep iteration data alive for computed callbacks first
    setState({ currentPhase: nextPhaseNum });

    const nextPhaseObj = getState().phasesList[nextPhaseNum - 1];
    const phaseStore = getState().store;

    // Prepare static and computed vars for next variable-defining phase (uses current state filesWritten/askUserCalled)
    if (phaseStore && nextPhaseObj?.kind === "variable-definition") {
      preparePhaseVariables(nextPhaseObj, phaseStore);
    }

    // Now reset iteration tracking
    setState({
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
    if (nextPhaseObj) {
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

  // Register session variable tools (setVar, getVar, listVars)
  setupSessionVariables(pi);
}
