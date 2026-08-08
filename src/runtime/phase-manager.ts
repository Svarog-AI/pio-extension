/**
 * PhaseManager — in-memory phase registry and resolution.
 *
 * Owns the mapping from string phase IDs to `WorkflowPhase` objects
 * and provides next-phase resolution by string ID. Created at session
 * startup from `phasesList` and lives only in memory — not persisted.
 * On state reload, a new instance is built from the same `phasesList`.
 *
 * Matches the usage pattern of `SessionVariableStore` (reconstructed,
 * not serialized).
 */

import type { PioSessionState } from "./session-state";
import type { WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// PhaseManager
// ---------------------------------------------------------------------------

/**
 * Manages the phase registry and provides ID-based lookups and traversal.
 */
export class PhaseManager {
  /** ID → phase mapping for O(1) lookups */
  private readonly _registry: Map<string, WorkflowPhase>;

  /** Ordered list of unique phase IDs preserving original array order */
  private readonly _orderedIds: string[];

  /**
   * Build the phase registry from the phases array.
   *
   * @param phases - The workflow phases (from `WorkflowPhase[]`).
   *   Duplicate IDs are handled gracefully — last occurrence wins.
   */
  constructor(phases: WorkflowPhase[]) {
    const registry = new Map<string, WorkflowPhase>();
    const orderedIds: string[] = [];

    for (const phase of phases) {
      const isNew = !registry.has(phase.id);
      registry.set(phase.id, phase);
      if (isNew) {
        orderedIds.push(phase.id);
      }
    }

    this._registry = registry;
    this._orderedIds = orderedIds;
  }

  /**
   * Look up a phase by its ID.
   *
   * @returns The matching `WorkflowPhase`, or `undefined` if not found.
   */
  getPhase(id: string): WorkflowPhase | undefined {
    return this._registry.get(id);
  }

  /**
   * Resolve the ID of the next phase in array order.
   *
   * For the initial implementation, "next" means strictly sequential
   * position in the original phases array. The optional `state`
   * parameter is accepted but not used — reserved for future
   * conditional branching logic.
   *
   * @returns The next phase ID, or `undefined` if `currentId` is not
   *   found or is the last phase.
   */
  resolveNext(
    _currentId: string,
    _state?: PioSessionState,
  ): string | undefined {
    const index = this._orderedIds.indexOf(_currentId);
    if (index < 0 || index >= this._orderedIds.length - 1) {
      return undefined;
    }
    return this._orderedIds[index + 1];
  }

  /**
   * Return all phase IDs in construction order.
   *
   * @returns A copy of the ordered IDs array — callers cannot mutate
   *   internal state through the returned reference.
   */
  listIds(): string[] {
    return [...this._orderedIds];
  }
}
