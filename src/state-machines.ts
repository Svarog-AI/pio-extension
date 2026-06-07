/**
 * Declarative state machine framework types.
 *
 * Leaf module — imports only from built-in TypeScript types.
 * No internal pio imports (no `GoalState`, no `fs-utils`, etc.).
 * Concrete wiring (machines, resolvers, dispatch) comes in later steps.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * Result of resolving a transition: the next capability to run,
 * the state machine that produced this result, and optional adjusted params.
 *
 * The `stateMachineId` identifies which state machine produced the result
 * so downstream code knows which machine config to use for subsequent dispatch calls.
 * This enables multi-machine dispatch where transitions chain across the same machine.
 */
export interface TransitionResult {
  /** Next capability name (e.g. "evolve-plan") */
  capability: string;
  /** ID of the state machine that produced this result — identifies which machine to use for subsequent dispatch calls */
  stateMachineId: string;
  /** Adjusted params to propagate (e.g. incremented stepNumber). If omitted, downstream uses session params as-is. */
  params?: Record<string, unknown>;
}

/**
 * A single directed edge in the state machine graph.
 *
 * Each edge carries a `resolve` function that both checks whether the
 * transition applies AND computes result params in one call. Returns
 * `TransitionResult` when the edge fires, `undefined` when it doesn't apply.
 *
 * @typeParam C - Context type for condition evaluation (e.g. `GoalState` for the default pio workflow)
 */
export interface TransitionEdge<C> {
  /** Source node — capability name this edge originates from */
  from: string;
  /** Target node — capability name this edge transitions to */
  to: string;
  /**
   * Resolve function that evaluates whether this edge fires and computes the transition result.
   * Called during dispatch with context state and session params.
   * Returns `TransitionResult` when the edge applies, `undefined` when it doesn't.
   * This combines condition check + param computation in one call.
   */
  resolve: (context: C, params?: Record<string, unknown>) => TransitionResult | undefined;
}

/**
 * Named configuration describing a state machine.
 *
 * The generic `C` is the context type for condition evaluation — `GoalState`
 * for the default pio workflow, but any type for other machines (PR review
 * contexts, dependency audit contexts, etc.). This ensures the framework
 * is context-agnostic.
 *
 * @typeParam C - Context type passed to edge resolve functions
 */
export interface StateMachine<C> {
  /** Unique identifier (e.g. "goal-driven-development") */
  id: string;
  /** Human-readable name (e.g. "Goal-Driven Development") */
  name: string;
  /** One-line description of what this machine orchestrates */
  description: string;
  /** Ordered array of transition edges. Evaluated in array order during dispatch. */
  edges: TransitionEdge<C>[];
}
