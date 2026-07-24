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

  /** True when `pio_mark_complete` was called during the current agent run. */
  markCompleteCalled: boolean;

  /** Turn counter for refinement-loop detection. Increments on every turn, resets at `before_agent_start`. */
  turnCount: number;

  /** Current workflow phase number (1-based). 0 means inactive. */
  currentPhase: number;

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
   * Persists until cleared by the `/return` command.
   */
  isAdHocInput: boolean;

  /** Phase-level write allowlists: phase number (1-based) → { allowedPaths (resolved absolute paths), allowedNames (original output names for error messages), allContractOutputs (all known contract output paths, used by write: [] to block). Populated during resources_discover. */
  phaseWriteAllowlist: Map<
    number,
    {
      allowedPaths: Set<string>;
      allowedNames: string[];
      allContractOutputs: Set<string>;
    }
  >;

  /** Session ID captured during resources_discover. Used by persistence module to load/save state files. Optional for backward compat. */
  sessionId?: string;
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
    currentPhase: 0,
    currentIteration: 0,
    totalPhases: 0,
    phasesList: [],
    filesWritten: [],
    askUserCalled: false,
    isAdHocInput: false,
    phaseWriteAllowlist: new Map(),
    sessionId: undefined,
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
