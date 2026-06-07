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

// ---------------------------------------------------------------------------
// Internal registry
// ---------------------------------------------------------------------------

/**
 * Module-level registry of all known state machines.
 *
 * Used by {@link dispatch} when no explicit machine is provided (`machine === undefined`).
 * Stores `StateMachine<unknown>` because different machines may use different context types;
 * the caller is responsible for providing the correct context type.
 */
const _registeredMachines: StateMachine<unknown>[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a state machine so it can be discovered by {@link dispatch} when
 * no explicit machine is provided.
 *
 * Idempotent: calling with an already-registered machine ID replaces the
 * existing entry silently.
 *
 * @param machine - The state machine to register
 */
export function registerMachine<C>(machine: StateMachine<C>): void {
  const existingIndex = _registeredMachines.findIndex((m) => m.id === machine.id);
  if (existingIndex >= 0) {
    _registeredMachines[existingIndex] = machine as StateMachine<unknown>;
  } else {
    _registeredMachines.push(machine as StateMachine<unknown>);
  }
}

/**
 * Remove a state machine from the registry by ID.
 *
 * Primarily intended for test cleanup. Returns `true` if the machine was found
 * and removed, `false` if it was not registered.
 *
 * @param machineId - The ID of the machine to remove
 * @returns `true` if the machine was removed, `false` if not found
 */
export function unregisterMachine(machineId: string): boolean {
  const index = _registeredMachines.findIndex((m) => m.id === machineId);
  if (index >= 0) {
    _registeredMachines.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Return all outgoing edges from a given node in a state machine.
 *
 * This is a structural lookup — it does NOT call resolve functions.
 * Used by interactive commands to list available transitions without evaluating them.
 *
 * @param machine - The state machine to query
 * @param from - The source node (capability name)
 * @returns Edges in array order (same order as in `machine.edges`)
 */
export function getOutgoingEdges<C>(
  machine: StateMachine<C>,
  from: string,
): TransitionEdge<C>[] {
  return machine.edges.filter((edge) => edge.from === from);
}

/**
 * Dispatch a transition by iterating over outgoing edges.
 *
 * When `machine` is provided, iterates over a single-element array `[machine]`.
 * When `machine` is `undefined`, iterates over all registered machines
 * (via {@link registerMachine}). Single loop — no branching between paths.
 *
 * For each machine, finds outgoing edges for `currentNode` (via {@link getOutgoingEdges}),
 * calls each edge's `resolve(context, params)` in array order, and collects
 * non-undefined results.
 *
 * Returns the aggregated array of matching transitions from all machines.
 * Empty array means no transitions match — either no outgoing edges exist
 * for that node, or none of the resolve functions returned a result.
 *
 * @typeParam C - Context type for the state machine
 * @param machine - Single machine to dispatch, or `undefined` to search all registered machines
 * @param currentNode - The current node (capability name) to find outgoing edges from
 * @param context - Context state passed to resolve functions
 * @param params - Optional session params passed to resolve functions
 * @returns Array of matching transitions (may be empty)
 */
export function dispatch<C>(
  machine: StateMachine<C> | undefined,
  currentNode: string,
  context: C,
  params?: Record<string, unknown>,
): TransitionResult[] {
  // Always iterate an array of machines — single element or all registered.
  const machines: StateMachine<unknown>[] =
    machine !== undefined ? [machine as StateMachine<unknown>] : _registeredMachines;

  const results: TransitionResult[] = [];
  for (const m of machines) {
    const edges = getOutgoingEdges(m as StateMachine<C>, currentNode);
    for (const edge of edges) {
      try {
        const result = edge.resolve(context, params);
        if (result !== undefined) {
          results.push(result);
        }
      } catch (err) {
        console.warn(`dispatch: resolve threw in machine "${m.id}", edge ${edge.from} → ${edge.to}`, err);
      }
    }
  }
  return results;
}
