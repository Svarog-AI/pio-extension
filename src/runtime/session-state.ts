/**
 * Shared runtime session state.
 *
 * Manages session-level state across all phases during a capability
 * sub-session lifecycle. Replaces the scattered module-level globals
 * that previously lived in `step-nudging.ts` and `session-guard.ts`.
 *
 * This module is pure state storage — it does NOT register any event
 * handlers. Consumer modules (session-guard, loop engine) import and
 * mutate state through the accessor functions.
 */

import type { CapState } from "../capability-state";
import type { PhaseManager } from "./phase-manager";
import type { SessionVariableStore } from "./session-store";
import type { WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// PioSessionState interface
// ---------------------------------------------------------------------------

/**
 * Shared runtime state persisted across all phases during a PIO session.
 *
 * Stored between agent runs and turn boundaries but does not clear
 * between turns or iterations on its own — consumers handle resets.
 */
export interface PioSessionState {
  /** True when running inside a PIO capability sub-session. */
  isActive: boolean;

  /**
   * True once the `__pio-exit` terminal code phase has completed the run
   * (exit lifecycle succeeded, or threw-and-skipped); set by the engine-side
   * wrapper in `loop-engine.ts`, reset at `before_agent_start`.
   */
  markCompleteCalled: boolean;

  /** Turn counter for refinement-loop detection. Increments on every turn, resets at `before_agent_start`. */
  turnCount: number;

  /** Current iteration count within the current phase (1-based). 0 means inactive. */
  currentIteration: number;

  /** Total number of workflow phases. 0 means inactive. */
  totalPhases: number;

  /** Ordered list of all workflow phases (full objects with loop fields). */
  phasesList: WorkflowPhase[];

  /** File paths written during the current iteration (from write, edit, vscode_apply_workspace_edit tools) */
  filesWritten: string[];

  /** Whether ask_user was called during the current iteration */
  askUserCalled: boolean;

  /**
   * Set by the `input` handler when an interactive user message arrives.
   * Cleared by the `/continue` command.
   */
  isAdHocInput: boolean;

  /**
   * Tracks whether the "Workflow Paused" notification was already sent
   * during the current ad-hoc session. In-memory only — not persisted.
   * Set by `before_agent_start` after first injection, reset by `/continue`.
   */
  adHocPhaseNotified: boolean;

  /** CapState instance for on-demand output path resolution during write gating. Created during resources_discover, accessed lazily in tool_call. In-memory only — not persisted. */
  capState?: CapState | null;

  /** All contract output paths (resolved absolute paths). Computed once during resources_discover from CapState. Used by the write gate to determine which paths are contract outputs. */
  allContractOutputs?: Set<string> | null;

  /** Session ID captured during resources_discover. Used by persistence module to load/save state files. Optional for backward compat. */
  sessionId?: string;

  /** Session variable store instance. Created during resources_discover, accessed via getState().store in loop engine and tools. */
  store?: SessionVariableStore | null;

  /** Current phase ID (string, e.g. "create-goal"). Empty string means inactive. */
  currentPhaseId: string;

  /** PhaseManager instance created during resources_discover. In-memory only — not persisted. Reconstructed on state reload. */
  phaseManager?: PhaseManager | null;

  /** Resolved project root absolute path. In-memory only — not persisted. Set during resources_discover from ctx.cwd. */
  projectRoot?: string;

  /** Log of executed code phases (one entry per executed `kind: "code"` phase, appended at execution time). In-memory only — not persisted. `detail` carries error messages only: the thrown error's message when the phase's `run()` threw, an empty array otherwise. */
  programmaticLog: Array<{ phaseId: string; kind: string; detail: string[] }>;

  /** Id of the last LLM phase whose turn began (set by setupTurn — programmatic phases never call it). In-memory only — not persisted (lost on restart by design). Used to point the ad-hoc pause message and `/continue` resumption at the real work phase after an `__pio-exit` failure. */
  lastLlmPhaseId?: string;

  /** Outcome of the most recent `__pio-exit` run: "success" | "failed" | "skipped". In-memory only — not persisted (lost on restart by design). Set by the engine-side exit wrapper in loop-engine. */
  exitOutcome?: "success" | "failed" | "skipped";

  /** The `ExitResult.message` captured when `__pio-exit` failed; rendered in the ad-hoc pause message while the session is live (lost on restart by design). Cleared (explicit undefined) when a later exit run succeeds. */
  exitFailureMessage?: string;
}

// ---------------------------------------------------------------------------
// Singleton state instance
// ---------------------------------------------------------------------------

let _state: PioSessionState = createInitialState();

function createInitialState(): PioSessionState {
  return {
    isActive: false,
    markCompleteCalled: false,
    turnCount: 0,
    currentIteration: 0,
    totalPhases: 0,
    phasesList: [],
    filesWritten: [],
    askUserCalled: false,
    isAdHocInput: false,
    adHocPhaseNotified: false,
    capState: undefined,
    allContractOutputs: undefined,
    sessionId: undefined,
    store: undefined,
    currentPhaseId: "",
    phaseManager: undefined,
    projectRoot: undefined,
    programmaticLog: [],
    lastLlmPhaseId: undefined,
    exitOutcome: undefined,
    exitFailureMessage: undefined,
  };
}

// ---------------------------------------------------------------------------
// Accessor functions
// ---------------------------------------------------------------------------

/**
 * Return the current session state.
 *
 * Callers may read any field directly. For mutations, use `setState()`
 * with partial updates rather than mutating the returned object.
 */
export function getState(): PioSessionState {
  return _state;
}

/**
 * Merge partial updates into the existing state.
 *
 * Allows updating individual fields without passing all values:
 * `setState({ turnCount: 0 })` resets only the turn counter.
 */
export function setState(updates: Partial<PioSessionState>): void {
  Object.assign(_state, updates);
}

/**
 * Reset all fields to their default values.
 *
 * Used at session startup (non-PIO session) or when clearing
 * accumulated iteration data.
 */
export function resetState(): void {
  Object.assign(_state, createInitialState());
}

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

/**
 * Return the current session state (same as `getState()`).
 *
 * @internal — Exists solely for unit tests.
 */
export function __testGetState(): PioSessionState {
  return _state;
}

/**
 * Dual getter/setter for the entire state (test-only).
 *
 * When called with an argument, replaces the entire state.
 * When called without arguments, returns the current state.
 *
 * @internal — Exists solely for unit tests.
 */
export function __testSetState(state?: PioSessionState): PioSessionState {
  if (state !== undefined) {
    _state = { ...state };
  }
  return _state;
}
