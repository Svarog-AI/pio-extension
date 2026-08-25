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
 * Additionally, it registers the `/continue` command for ad-hoc resumption
 * and the `/goto` command for jumping to a specific phase by ID.
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getCompiledWorkflowPhases,
  getCurrentCapabilityConfig,
} from "../capability-session";
import { CapState } from "../capability-state";
import { getSessionConfig } from "../capability-utils";
import { readDebugDisplay, resolveMaxIterations } from "../model-config";
import type { ExitResult } from "./exit-lifecycle";
import { runExitLifecycle } from "./exit-lifecycle";
import { PhaseManager } from "./phase-manager";
import type { PioSessionState } from "./session-state";
import { getState, resetState, setState } from "./session-state";
import { SessionVariableStore, setupSessionVariables } from "./session-store";
import {
  extractPersistedState,
  loadLoopEngineState,
  saveLoopEngineState,
} from "./state-persistence";
import type {
  CodeStepContext,
  PhaseVariable,
  WorkflowPhase,
} from "./workflow-types";

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
 * Build CustomMessage content for the current phase with authority framing.
 *
 * Format:
 *   [optional: ## Programmatic activity since your last turn section]
 *
 *   ## Instructions for "phase-id"
 *
 *   Follow the instructions below. Do not do anything outside these instructions.
 *
 *   You are on "phase-id", iteration I.
 *
 *   ---
 *
 *   <phase instructions>
 *
 *   [optional: **Retry focus:** <loopMessage>]
 *
 * When `state.programmaticLog` is non-empty (code steps executed since the
 * last LLM turn), a "## Programmatic activity since your last turn" section
 * is prepended — one bullet per entry in execution order, with the error
 * detail after a colon when present. The log clears exactly when the section
 * is rendered, as a single unit via setState merge. An empty log leaves the
 * prompt unchanged; the no-phase early return leaves the log untouched.
 *
 * @internal — Used by both `before_agent_start` (first run) and `agent_end` (phase transitions).
 */
export function buildPhaseInstructions(state: PioSessionState): string {
  const phase = getState().phaseManager?.getPhase(state.currentPhaseId);
  if (!phase) return "";
  const store = getState().store ?? undefined;

  // Dispatch body building to the appropriate strategy based on phase kind
  const instructionBody =
    phase.kind === "variable-definition" && phase.variables?.length && store
      ? buildVariablePhaseInstructions(state, phase, store)
      : buildStandardPhaseInstructions(state, phase, store);

  const prompt =
    `## Instructions for "${phase.id}"\n\n` +
    `Follow the instructions below. Do not do anything outside these instructions.\n\n` +
    `You are on "${phase.id}", iteration ${state.currentIteration}.\n\n---\n\n` +
    instructionBody;

  // Surface programmatic activity (code steps) executed since the last LLM
  // turn, then clear the log as a single unit — exactly when rendered.
  const log = state.programmaticLog;
  if (log.length > 0) {
    const lines = log
      .map(
        (e) =>
          `• ${e.phaseId} (${e.kind})${
            e.detail.length > 0 ? `: ${e.detail.join(", ")}` : ""
          }`,
      )
      .join("\n");
    setState({ programmaticLog: [] });
    return `## Programmatic activity since your last turn\n\n${lines}\n\n${prompt}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Phase advancement helpers
// ---------------------------------------------------------------------------

/**
 * Check if a phase can execute without an agent turn.
 *
 * A programmatic phase is a phase where there's nothing for
 * the LLM to do: code phases (whose `run()` executes inline),
 * branch phases, loop containers (which execute nothing themselves —
 * no `run`, no variables — their body is traversed via `resolveNext`
 * links), and pure-variable-definition phases. Standard phases always
 * return `false`.
 *
 * @param phase - WorkflowPhase to check
 * @returns `true` if the phase is purely programmatic (no LLM involvement)
 */
export function isProgrammatic(phase: WorkflowPhase): boolean {
  // Code phases execute inline — no agent turn needed
  if (phase.kind === "code") return true;
  // Branch phases execute inline — no agent turn needed
  if (phase.kind?.startsWith("branch:")) return true;
  // Loop containers execute nothing themselves — body traversal happens via
  // resolveNext links; never an agent turn.
  if (phase.kind === "loop") return true;
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
 * Handle phase exhaustion — reset per-turn tracking and persist state.
 *
 * Called when all phases have been processed (no more phases to advance to).
 */
function _handleExhaustion(): void {
  setState({
    currentIteration: 1,
    filesWritten: [],
    askUserCalled: false,
  });
  _persistCurrentState();
}

/**
 * Execute the programmatic parts of a phase.
 *
 * For code phases (`kind: "code"`), builds the `CodeStepContext`
 * (`{ state }` — the single live state reference), awaits
 * `phase.run!(ctx)`, and appends one entry to `state.programmaticLog`
 * (`detail` holds the thrown error's message when `run()` throws,
 * empty otherwise) — synthetic phases (`synthetic: true`) skip the
 * append. A throwing `run()` never blocks traversal:
 * it is caught, warned via console, and traversal continues.
 *
 * For variable-definition phases, this sets static variables and runs
 * computed callbacks. For standard phases, `preparePhaseVariables()`
 * is a no-op internally (kind guard returns early) but is still called.
 * Always persists state after execution (single trailing persist for
 * all phase kinds — the log itself is in-memory only).
 *
 * @param phase - WorkflowPhase to execute
 * @param store - SessionVariableStore for variable operations
 */
export async function executePhase(
  phase: WorkflowPhase,
  store: SessionVariableStore,
): Promise<void> {
  if (phase.kind === "code") {
    // Single live state reference — no copies, no extra fields.
    const ctx: CodeStepContext = { state: getState() };

    let detail: string[] = [];
    try {
      // PhaseManager construction guarantees a code phase has a function run
      // (TypeError otherwise) — no code phase reaches traversal without one.
      // biome-ignore lint/style/noNonNullAssertion: invariant enforced by PhaseManager
      await phase.run!(ctx);
    } catch (err) {
      // Warn-and-continue — a throwing code step never blocks traversal.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[loop-engine] Code step "${phase.id}" threw: ${message}`);
      detail = [message];
    }

    // One log entry per executed code phase (append via setState merge —
    // never mutate the array in place). Synthetic merge nodes (the
    // engine-injected branch-end/loop-end phases) run their no-op `run`
    // but append nothing — no prompt noise per traversal.
    if (!phase.synthetic) {
      setState({
        programmaticLog: [
          ...getState().programmaticLog,
          { phaseId: phase.id, kind: "code", detail },
        ],
      });
    }
  } else if (phase.kind === "variable-definition" && phase.variables?.length) {
    preparePhaseVariables(phase, store);
  }
  _persistCurrentState();
}

/**
 * `__pio-exit` wrapper — the synthesized terminal code phase's run callback.
 *
 * Runs the capability exit lifecycle engine-side and is the single source of
 * truth for exit-time session state mutation (runExitLifecycle owns no session
 * state — it consumes only result.success / result.message).
 *
 * Branches, in order:
 * 1. No capability config → warn + `{ exitOutcome: "skipped" }` (NO
 *    markCompleteCalled — the session can't have validated anything).
 * 2. runExitLifecycle success → `{ exitOutcome: "success", markCompleteCalled,
 *    exitFailureMessage cleared }` + console.log(result.notification) when set
 *    (restores the "Next task enqueued" visibility the tool result used to give).
 * 3. Failure → warn + ad-hoc pause state pointed at lastLlmPhaseId (or the
 *    current phase when no LLM turn ever ran). NO markCompleteCalled, NO
 *    automatic retry — the session pauses for the user, who fixes the cause and
 *    resumes via /continue (or a restart into persisted ad-hoc mode).
 * 4. Throw → warn + `{ exitOutcome: "skipped", markCompleteCalled }` — never
 *    block session end.
 *
 * There is NO idempotency guard: re-traversal (/continue, /goto __pio-exit,
 * restart after done) re-runs the lifecycle, matching the removed tool's
 * re-invocation-tolerant behavior. Accepted worst case: a duplicate
 * transitions.json audit entry + postExecute re-run.
 */
async function exitLifecycleRun(ctx: CodeStepContext): Promise<void> {
  const config = getCurrentCapabilityConfig();
  if (!config) {
    console.warn(
      "[loop-engine] __pio-exit: no capability config available — skipping exit lifecycle.",
    );
    setState({ exitOutcome: "skipped" });
    return;
  }

  let result: ExitResult;
  try {
    result = await runExitLifecycle(config);
  } catch (err) {
    // A throwing lifecycle must never block session end — treat as skipped.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[loop-engine] __pio-exit: exit lifecycle threw — skipping exit lifecycle: ${message}`,
    );
    setState({ exitOutcome: "skipped", markCompleteCalled: true });
    return;
  }

  if (result.success) {
    setState({
      exitOutcome: "success",
      markCompleteCalled: true,
      // Explicitly clear any stale failure text — the ad-hoc pause render also
      // requires exitOutcome === "failed"; both guards are required.
      exitFailureMessage: undefined,
    });
    // Surface the enqueue notification (reserved by runExitLifecycle for here)
    if (result.notification) {
      console.log(result.notification);
    }
    return;
  }

  // Exit failed — pause in ad-hoc mode. No automatic retry is sent by design.
  const message = result.message ?? "Exit lifecycle failed.";
  console.warn(message);
  // ctx.state is the same live reference as getState() — read both fields from it.
  setState({
    exitOutcome: "failed",
    exitFailureMessage: message,
    currentPhaseId: ctx.state.lastLlmPhaseId ?? ctx.state.currentPhaseId,
    isAdHocInput: true,
    adHocPhaseNotified: false,
  });
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

  // 2. Reset per-turn tracking (always, regardless of mode).
  // lastLlmPhaseId captures the phase whose LLM turn is beginning — read from
  // live state (the caller advancePhase already set currentPhaseId before
  // invoking setupTurn). Programmatic phases never call setupTurn, so this is
  // only ever an LLM-phase id. __pio-exit uses it to point the ad-hoc pause
  // at the real work phase after an exit failure.
  setState({
    filesWritten: [],
    askUserCalled: false,
    lastLlmPhaseId: state.currentPhaseId,
  });

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
 * Async: each `executePhase` is awaited before the next phase is visited —
 * a code step's variable writes (including async ones) must be visible to
 * a later branch phase's condition within the same traversal.
 *
 * @param store - SessionVariableStore for variable operations
 * @param startPhaseId - Phase ID string to start from
 * @param mode - How to adjust the iteration counter ("reset", "increment", "preserve")
 * @returns Object with `triggered` flag and optional `payload` (CustomMessage data)
 */
export async function advancePhase(
  store: SessionVariableStore,
  startPhaseId: string,
  mode: "reset" | "increment" | "preserve",
): Promise<{
  triggered: boolean;
  payload?: { customType: string; content: string; display: boolean };
}> {
  const state = getState();
  const phaseManager = state.phaseManager;
  if (!phaseManager) return { triggered: false };

  let currentId = startPhaseId;

  while (true) {
    const phase = phaseManager.getPhase(currentId);
    if (!phase) {
      return { triggered: false };
    }

    setState({ currentPhaseId: currentId });

    await executePhase(phase, store);

    if (isProgrammatic(phase)) {
      const nextId = phaseManager.resolveNext(currentId, getState());
      if (!nextId) {
        return { triggered: false };
      }
      currentId = nextId;
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

    // Load declared workflow phases via typed getter.
    // Missing phases is not an error — empty list means single-pass execution.
    const declaredPhases = getCompiledWorkflowPhases() ?? [];

    // Synthesize the terminal exit phase: one appended code node so traversal
    // end ALWAYS runs the exit lifecycle, regardless of how the agent finished
    // its work (no agent tool call required).
    //
    // Zero-declared-phase capabilities skip synthesis — synthesizing would fire
    // exit on turn one before any work; they keep single-pass semantics.
    // NOTE: a capability declaring its own "__pio-exit" phase id is a degenerate
    // authoring error; PhaseManager last-wins means this synthesized node
    // prevails (no special handling).
    const phasesList =
      declaredPhases.length === 0
        ? declaredPhases
        : [
            ...declaredPhases,
            {
              id: "__pio-exit",
              title: "Exit lifecycle (automatic)",
              kind: "code" as const,
              run: exitLifecycleRun,
            },
          ];
    const totalPhases = phasesList.length;

    // Create PhaseManager for ID-based lookups
    const pm = new PhaseManager(phasesList);

    // Create CapState for on-demand output path resolution
    const capState = new CapState(
      config.contract,
      config.workspaceDir ?? ctx.cwd,
      config.sessionParams,
    );
    // Compute all contract output paths once (static data)
    const allContractOutputs = new Set(
      capState.getAllOutputPaths().map((p) => path.resolve(p)),
    );

    // Capture session ID for persistence
    const sessionId = ctx.sessionManager.getSessionId();

    // Attempt to restore state from disk
    const saved = loadLoopEngineState(sessionId);

    // Determine currentPhaseId: prefer saved value, fall back to first phase
    const currentPhaseId = saved?.currentPhaseId ?? pm.getFirstPhaseId() ?? "";

    // Initialize PioSessionState (single source of truth)
    setState({
      isActive: true,
      sessionId: sessionId,
      phasesList: phasesList,
      totalPhases: totalPhases,
      currentPhaseId: currentPhaseId,
      currentIteration: saved?.currentIteration ?? 1,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: saved?.isAdHocInput ?? false,
      capState: capState,
      allContractOutputs: allContractOutputs,
      phaseManager: pm,
      projectRoot: path.resolve(ctx.cwd ?? process.cwd()),
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

    // Ad-hoc mode: inject "Workflow Paused" only on first entry,
    // then return early on subsequent turns to prevent normal-mode fallthrough.
    if (state.isAdHocInput && !state.adHocPhaseNotified) {
      const phase = getState().phaseManager?.getPhase(state.currentPhaseId);
      if (!phase) return;

      // Mark as notified so subsequent turns skip injection
      setState({ adHocPhaseNotified: true });

      const baseContent =
        `## Workflow Paused (Ad-hoc Mode)\n\n` +
        `You were on "${phase.id}", iteration ${state.currentIteration}.\n\n` +
        `Workflow execution is paused. Any prior instructions are no longer active — you can answer questions or help the user freely.`;

      // Surface a LIVE exit failure (in-memory only — lost on restart by
      // design). Both conditions are required: the success path clears
      // exitFailureMessage, and a stale message must never render while
      // exitOutcome is not "failed".
      const content =
        state.exitOutcome === "failed" && state.exitFailureMessage
          ? `${baseContent}\n\nSession validation failed: ${state.exitFailureMessage}`
          : baseContent;

      return {
        message: {
          customType: "workflow-paused",
          content,
          display: readDebugDisplay(),
        },
      };
    }

    // Subsequent ad-hoc turns: already notified — return early
    // to prevent falling through to normal-mode logic (advancePhase, etc.)
    if (state.isAdHocInput) {
      return;
    }

    // Normal mode: advance through phases and inject instructions
    const phaseStore = getState().store;
    if (!phaseStore) return; // no store — skip injection

    const result = await advancePhase(
      phaseStore,
      state.currentPhaseId,
      "preserve",
    );

    if (!result.triggered) {
      // All phases exhausted — no injection needed
      return;
    }

    return { message: result.payload };
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

    // --- Phase-level write gate (lazy per-phase resolution) ---
    const state = getState();
    if (targetPaths.length > 0 && state.isActive) {
      const phase = state.phaseManager?.getPhase(state.currentPhaseId);
      if (!phase) {
        console.warn(
          `[loop-engine] Phase "${state.currentPhaseId}": no phase found for write gating.`,
        );
        return;
      }

      // Resolve allowlist on-demand from phase.write using CapState
      const capState = state.capState;
      const allOutputs = state.allContractOutputs ?? new Set();
      const allowedNames = phase.write ?? [];
      const allowedPaths = new Set<string>();
      if (capState) {
        for (const name of allowedNames) {
          const resolved = capState.tryResolveOutput(name);
          if (resolved) {
            allowedPaths.add(path.resolve(resolved.path));
          }
        }
      }

      const phaseTitle = phase.title ?? "unknown";

      for (const tp of targetPaths) {
        // Always allow /tmp/ writes (consistency with capability-level validation)
        if (tp.startsWith("/tmp/")) continue;

        // Contract outputs: block if not in allowedPaths, skip project gate if allowed
        if (allOutputs.has(tp)) {
          if (!allowedPaths.has(tp)) {
            const msg =
              allowedPaths.size === 0
                ? `Writing is not allowed during "${state.currentPhaseId}" (${phaseTitle}). This phase does not produce any contract outputs.`
                : `Writing is restricted during "${state.currentPhaseId}" (${phaseTitle}). Allowed outputs: [${allowedNames.join(", ")}]. Your target path '${tp}' is not in the allowed list.`;
            return { block: true, reason: msg };
          }
          continue; // allowed contract output — skip to next target
        }

        // Non-contract files only — contract outputs handled above (blocked or skipped)
        if (!state.projectRoot) {
          return {
            block: true,
            reason: `Cannot determine project root for write gating during "${state.currentPhaseId}" (${phaseTitle}). Write blocked.`,
          };
        }
        if (
          !phase.allowProjectWrites &&
          tp.startsWith(`${state.projectRoot}/`)
        ) {
          return {
            block: true,
            reason: `Writing project files is not allowed during "${state.currentPhaseId}" (${phaseTitle}). This phase does not have allowProjectWrites enabled.`,
          };
        }
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

    const currentPhase = getState().phaseManager?.getPhase(
      state.currentPhaseId,
    );
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
            `[loop-engine] Max iterations reached for "${state.currentPhaseId}" (${currentPhase.title ?? "unknown"}). Undefined variables: ${names}`,
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
      const payload = setupTurn("increment");
      await pi.sendMessage(payload, { deliverAs: "followUp" });
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
      const payload = setupTurn("increment");
      await pi.sendMessage(payload, { deliverAs: "followUp" });
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
      const payload = setupTurn("increment");
      await pi.sendMessage(payload, { deliverAs: "followUp" });
      return;
    }

    // ---------------------------------------------------------------------------
    // 6. Advance to next phase
    // ---------------------------------------------------------------------------

    const phaseStore = getState().store;
    if (!phaseStore) return; // no store — cannot advance

    const nextId = getState().phaseManager?.resolveNext(
      state.currentPhaseId,
      getState(),
    );
    if (!nextId) {
      // All phases exhausted — reset tracking and persist, let session end naturally
      _handleExhaustion();
      return;
    }
    const result = await advancePhase(phaseStore, nextId, "reset");

    if (!result.triggered) {
      // No more non-programmatic phases — same exhaustion handling
      _handleExhaustion();
      return;
    }

    // payload is guaranteed to exist when triggered is true
    await pi.sendMessage(
      result.payload as {
        customType: string;
        content: string;
        display: boolean;
      },
      { deliverAs: "followUp" },
    );
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
        adHocPhaseNotified: false,
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
      const currentPhaseObj = getState().phaseManager?.getPhase(
        state.currentPhaseId,
      );
      if (!currentPhaseObj) return;

      pi.sendUserMessage("", { deliverAs: "followUp" });
    },
  });

  // 8. /goto command — jump to a specific workflow phase by ID
  pi.registerCommand("goto", {
    description: "Jump to a specific workflow phase by ID",
    getArgumentCompletions: (argumentPrefix: string) => {
      const pm = getState().phaseManager;
      if (!pm) return null;

      const ids = pm.listIds();
      return ids
        .filter((id) =>
          id.toLowerCase().startsWith(argumentPrefix.toLowerCase()),
        )
        .map((id) => {
          const phase = pm.getPhase(id);
          return {
            value: id,
            label: id,
            description: phase?.title,
          };
        });
    },
    handler: async (args, ctx) => {
      // Block phase switching while agent is streaming
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Cannot switch phases while agent is running. Abort the current run first if you need to switch immediately.",
          "error",
        );
        return;
      }

      const state = getState();
      if (!state.isActive || !state.phaseManager) return;

      // Parse the phase ID from args (single string argument)
      const targetId = args.trim();
      if (!targetId) {
        ctx.ui.notify("Usage: /goto <phase-id>", "warning");
        return;
      }

      // Validate the phase exists
      const targetPhase = state.phaseManager.getPhase(targetId);
      if (!targetPhase) {
        const available = state.phaseManager.listIds().join(", ");
        ctx.ui.notify(
          `Unknown phase "${targetId}". Available phases: ${available}`,
          "error",
        );
        return;
      }

      // Set currentPhaseId, reset iteration to 1, clear tracking
      // Also clear ad-hoc mode flags so the follow-up triggers normal phase instructions
      setState({
        currentPhaseId: targetId,
        currentIteration: 1,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        adHocPhaseNotified: false,
      });

      // Persist state
      const updatedState = getState();
      if (updatedState.sessionId) {
        saveLoopEngineState(
          updatedState.sessionId,
          extractPersistedState(updatedState),
        );
      }

      // Trigger follow-up to inject phase instructions via before_agent_start
      pi.sendUserMessage("", { deliverAs: "followUp" });
    },
  });

  // Register session variable tools (setVar, getVar, listVars)
  setupSessionVariables(pi);
}
