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

  /** Branch-phase ID → routing data (arm first-phase IDs). Used by resolveNext for conditional branching */
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
   * @throws TypeError if a phase is missing a required `id` field,
   *   or if the `kind`/`run` pairing is invalid: a `kind: "code"` phase
   *   must carry a function `run`, and non-code phases must not.
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

        // Validate kind/run pairing — a code phase must carry a function run;
        // non-code phases (including omitted kind) must not carry run.
        if (phase.kind === "code" && typeof phase.run !== "function") {
          throw new TypeError(
            `Code phase "${phase.id}" at path: ${path} is missing required "run" function`,
          );
        }
        if (phase.kind !== "code" && phase.run !== undefined) {
          throw new TypeError(
            `Phase "${phase.id}" (kind: "${phase.kind ?? "standard"}") at path: ${path} must not define "run" — only "code" phases may`,
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
          // --- standard / variable-definition / code phase ---
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
   * For branch phases, evaluates the condition callback and consults
   * `_conditionalRouting` to determine the correct arm-first target.
   * For non-branch phases, uses the pre-built `_routing` map for O(1) lookups.
   *
   * @param currentId - The current phase ID to resolve the successor for.
   * @param state - Optional session state. Required for branch phases to
   *   evaluate conditions. Accepted but unused for non-branch phases.
   * @returns The next phase ID, or `undefined` if `currentId` is not
   *   found, is the last phase, or the branch condition routes nowhere.
   */
  resolveNext(currentId: string, state?: PioSessionState): string | undefined {
    const branchTarget = this._evaluateBranch(currentId, state);
    if (branchTarget === null) return this._routing.get(currentId);
    return branchTarget;
  }

  /**
   * Evaluate a branch phase condition and return the target arm-first ID.
   *
   * Three-way return semantics:
   * - `null` — not a branch phase → caller delegates to linear routing
   * - `string` — resolved arm first-phase ID (the destination to jump to)
   * - `undefined` — branch phase, but no destination (skip/end-of-workflow)
   */
  private _evaluateBranch(
    currentId: string,
    state?: PioSessionState,
  ): string | undefined | null {
    const routing = this._conditionalRouting.get(currentId);
    if (!routing) return null;

    const phase = this._registry.get(currentId);
    if (!phase) return null;

    if ("thenFirst" in routing) {
      // --- IfBranchRouting ---
      const condition = phase.condition;
      if (typeof condition !== "function") {
        console.warn(
          `Condition evaluation failed for branch phase "${currentId}": condition is not a function`,
        );
        return undefined;
      }
      if (!state) {
        console.warn(
          `Condition evaluation failed for branch phase "${currentId}": state is missing`,
        );
        return undefined;
      }
      try {
        const result = condition(state);
        const target = result ? routing.thenFirst : routing.elseFirst;
        return target;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `Condition evaluation failed for branch phase "${currentId}": ${msg}`,
        );
        return undefined;
      }
    } else {
      // --- SwitchBranchRouting ---
      const on = phase.on;
      if (typeof on === "function") {
        if (!state) {
          console.warn(
            `Condition evaluation failed for branch phase "${currentId}": state is missing`,
          );
          return undefined;
        }
        try {
          const discriminant = on(state);
          const key = String(discriminant);
          const target = routing.caseFirst[key];
          if (target !== undefined) return target;
          return routing.defaultFirst;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `Condition evaluation failed for branch phase "${currentId}": ${msg}`,
          );
          return undefined;
        }
      } else if (typeof on === "string" && on.startsWith("$")) {
        if (!state) {
          console.warn(
            `Condition evaluation failed for branch phase "${currentId}": state is missing`,
          );
          return routing.defaultFirst;
        }
        try {
          const varName = on.slice(1);
          const value = state.store?.get(varName);
          if (value == null) {
            return routing.defaultFirst;
          }
          const key = String(value);
          const target = routing.caseFirst[key];
          if (target !== undefined) return target;
          return routing.defaultFirst;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `Condition evaluation failed for branch phase "${currentId}": ${msg}`,
          );
          return undefined;
        }
      } else {
        console.warn(
          `Condition evaluation failed for branch phase "${currentId}": on is not a function or $varName string`,
        );
        return undefined;
      }
    }
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
