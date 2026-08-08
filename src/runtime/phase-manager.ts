/**
 * PhaseManager — in-memory phase registry and resolution.
 *
 * Owns the mapping from string phase IDs to `WorkflowPhase` objects
 * and provides next-phase resolution via routing maps built at
 * construction time. Created at session startup from `phasesList`
 * and lives only in memory — not persisted. On state reload, a new
 * instance is built from the same `phasesList`.
 *
 * Supports depth-first flattening of branch-phase trees (`branch:if`,
 * `branch:switch`) into linear routing maps. Flat arrays of phases
 * produce identical output to the previous sequential implementation.
 *
 * Matches the usage pattern of `SessionVariableStore` (reconstructed,
 * not serialized).
 */

import type { PioSessionState } from "./session-state";
import type { BranchRouting, WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// PhaseManager
// ---------------------------------------------------------------------------

/**
 * Manages the phase registry and provides ID-based lookups and traversal.
 */
export class PhaseManager {
  /** ID → phase mapping for O(1) lookups */
  private readonly _registry: Map<string, WorkflowPhase>;

  /** Linear successor links: phase ID → next phase ID */
  private readonly _routing: Map<string, string>;

  /** Branch-phase ID → routing data (arm first-phase IDs). Used by Step 3's resolveNext for conditional branching */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: populated here, consumed by Step 3 resolveNext
  private readonly _conditionalRouting: Map<string, BranchRouting>;

  /** First phase ID encountered during depth-first walk */
  private readonly _firstPhaseId: string | undefined;

  /**
   * Build the phase registry from the phases array.
   *
   * Performs a depth-first walk: nested branch arms (`then[]`, `else[]`,
   * `cases[key][]`, `defaultBranch[]`) are flattened into the registry
   * and wiring maps.
   *
   * @param phases - The workflow phases (from `WorkflowPhase[]`).
   * @throws TypeError if a phase is missing a required `id` field.
   */
  constructor(phases: WorkflowPhase[]) {
    const registry = new Map<string, WorkflowPhase>();
    const routing = new Map<string, string>();
    const conditionalRouting = new Map<string, BranchRouting>();
    let firstPhaseId: string | undefined;

    const _flatten = (
      segments: WorkflowPhase[],
      postBranch?: string,
      pathPrefix = "",
    ): string | undefined => {
      if (segments.length === 0) return undefined;

      let lastId: string | undefined;

      for (let i = 0; i < segments.length; i++) {
        const phase = segments[i];
        const path = pathPrefix
          ? `${pathPrefix}.${phase.id ?? `[${i}]`}`
          : String(i);

        // Validate ID
        if (!phase.id) {
          throw new TypeError(
            `Phase missing required "id" field at path: ${path}`,
          );
        }

        // Record first phase ID on first encounter
        if (firstPhaseId === undefined) {
          firstPhaseId = phase.id;
        }

        // Register in registry (last wins on duplicates)
        registry.set(phase.id, phase);

        // Compute successor for this position: next sibling or post-branch
        const successor = segments[i + 1]?.id ?? postBranch;

        const kind = phase.kind;

        if (kind === "branch:if") {
          // --- branch:if processing ---

          // Validate: then must be present and non-empty
          if (!phase.then || phase.then.length === 0) {
            throw new TypeError(
              `Branch phase "${phase.id}" at path: ${path} has no "then" arm`,
            );
          }

          // Walk arms, each receiving successor as postBranch
          const thenTail = _flatten(phase.then, successor, `${path}.then`);
          if (thenTail && successor) routing.set(thenTail, successor);

          const elseTail = phase.else
            ? _flatten(phase.else, successor, `${path}.else`)
            : undefined;
          if (elseTail && successor) routing.set(elseTail, successor);

          // Record conditional routing
          const thenFirst = phase.then[0].id;
          const elseFirst = phase.else?.[0]?.id ?? successor ?? undefined;

          conditionalRouting.set(phase.id, {
            thenFirst,
            elseFirst,
          });

          // Branch phase itself does NOT get a linear _routing entry
          lastId = elseTail ?? thenTail;
        } else if (kind === "branch:switch") {
          // --- branch:switch processing ---

          const caseFirst: Record<string, string> = {};
          let lastCaseTail: string | undefined;

          for (const [key, arm] of Object.entries(phase.cases ?? {})) {
            const tail = _flatten(arm, successor, `${path}.cases['${key}']`);
            if (tail && successor) routing.set(tail, successor);
            lastCaseTail = tail;
            caseFirst[key] = arm[0]?.id ?? successor;
          }

          let defaultTail: string | undefined;
          let defaultFirst: string | undefined;
          if (phase.defaultBranch !== undefined) {
            defaultTail = _flatten(
              phase.defaultBranch,
              successor,
              `${path}.defaultBranch`,
            );
            if (defaultTail && successor) routing.set(defaultTail, successor);
            defaultFirst = phase.defaultBranch[0]?.id ?? successor;
          }
          // Absent defaultBranch: defaultFirst stays undefined

          conditionalRouting.set(phase.id, { caseFirst, defaultFirst });

          // Return tail of last arm walked (default or last case)
          lastId = defaultTail ?? lastCaseTail;
        } else {
          // --- standard / variable-definition phase ---
          if (successor) {
            routing.set(phase.id, successor);
          }
          lastId = phase.id;
        }
      }

      return lastId;
    };

    _flatten(phases);

    this._registry = registry;
    this._routing = routing;
    this._conditionalRouting = conditionalRouting;
    this._firstPhaseId = firstPhaseId;
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
   * Resolve the ID of the next phase in routing order.
   *
   * Uses the pre-built `_routing` map for O(1) lookups.
   * Branch phases return `undefined` — the caller must check
   * `_conditionalRouting` to evaluate branch conditions.
   *
   * @returns The next phase ID, or `undefined` if `currentId` is not
   *   found, is the last phase, or is a branch phase.
   */
  resolveNext(
    _currentId: string,
    _state?: PioSessionState,
  ): string | undefined {
    return this._routing.get(_currentId);
  }

  /**
   * Return all phase IDs in construction order.
   *
   * For flat arrays, this matches the original array order.
   * For branched workflows, includes nested arm children in
   * depth-first visitation order.
   *
   * @returns A copy of the IDs — callers cannot mutate internal
   *   state through the returned reference.
   */
  listIds(): string[] {
    return Array.from(this._registry.keys());
  }

  /**
   * Return the first phase ID encountered during the depth-first walk.
   *
   * Used by the loop engine for startup — replaces `listIds()[0]`.
   *
   * @returns The first phase ID, or `undefined` if the phase list is empty.
   */
  getFirstPhaseId(): string | undefined {
    return this._firstPhaseId;
  }
}
