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
 * `branch:switch`) into linear routing maps. Every branch additionally
 * synthesizes a no-op `synthetic` merge node (id `__branch-end-<id>`) that
 * all arms — including empty ones — converge on before the branch's
 * successor. `kind: "loop"` blocks flatten the same way: every loop
 * synthesizes a no-op `synthetic` loop-end merge node (id
 * `__loop-end-<id>`) that the body tail converges on, where repeat-vs-exit
 * is decided at runtime. Flat arrays of phases produce identical output to
 * the previous sequential implementation.
 *
 * Matches the usage pattern of `SessionVariableStore` (reconstructed,
 * not serialized).
 */

import { resolveMaxIterations } from "../model-config";
import type { PioSessionState } from "./session-state";
import { setState } from "./session-state";
import type {
  BranchRouting,
  LoopBackRouting,
  WorkflowPhase,
} from "./workflow-types";

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

    /**
     * Derive a unique id for the synthetic branch-end merge node from a
     * branch phase id. On collision with an existing registry entry, append
     * an incrementing numeric suffix (-1, -2, ...) until unique.
     */
    const _reserveBranchEndId = (branchId: string): string => {
      let candidate = `__branch-end-${branchId}`;
      let suffix = 1;
      while (registry.has(candidate)) {
        candidate = `__branch-end-${branchId}-${suffix}`;
        suffix += 1;
      }
      return candidate;
    };

    /**
     * Register the synthetic branch-end merge node: a no-op code phase that
     * every arm (including empty ones) converges on before routing to the
     * branch's successor. Marked `synthetic` so downstream consumers can
     * skip rendering/logging without special-casing ids.
     */
    const _registerBranchEnd = (id: string): void => {
      registry.set(id, {
        id,
        title: id,
        kind: "code",
        run: () => {},
        synthetic: true,
      });
    };

    /**
     * Derive a unique id for the synthetic loop-end merge node from a
     * loop block id. On collision with an existing registry entry, append
     * an incrementing numeric suffix (-1, -2, ...) until unique.
     */
    const _reserveLoopEndId = (loopId: string): string => {
      let candidate = `__loop-end-${loopId}`;
      let suffix = 1;
      while (registry.has(candidate)) {
        candidate = `__loop-end-${loopId}-${suffix}`;
        suffix += 1;
      }
      return candidate;
    };

    /**
     * Register the synthetic loop-end merge node: a no-op code phase that
     * the body tail converges on, where repeat-vs-exit is decided at
     * runtime. Marked `synthetic` so downstream consumers can skip
     * rendering/logging without special-casing ids.
     */
    const _registerLoopEnd = (id: string): void => {
      registry.set(id, {
        id,
        title: id,
        kind: "code",
        run: () => {},
        synthetic: true,
      });
    };

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

          // Synthesize the branch's single exit: a merge node all arms
          // converge on. The id is reserved before arm flattening;
          // registration happens after so DFS order places it after all arm
          // descendants and before the successor.
          const branchEndId = _reserveBranchEndId(phase.id);

          // Walk arms, each receiving the merge node as postBranch so their
          // terminal tails link through to the single branch exit.
          _flatten(phase.then, branchEndId, `${path}.then`);
          if (phase.else) {
            _flatten(phase.else, branchEndId, `${path}.else`);
          }

          _registerBranchEnd(branchEndId);

          // Record conditional routing; empty/absent else arms route to the merge node.
          const thenFirst = phase.then[0].id;
          const elseFirst = phase.else?.[0]?.id ?? branchEndId;

          conditionalRouting.set(phase.id, {
            thenFirst,
            elseFirst,
          });

          // Branch phase itself does NOT get a linear _routing entry; the
          // merge node carries the link to the successor.
          if (successor) routing.set(branchEndId, successor);
          lastId = branchEndId;
        } else if (kind === "branch:switch") {
          // --- branch:switch processing ---

          // Synthesize the branch's single exit (id reserved before arm
          // flattening, registered after — see branch:if case).
          const branchEndId = _reserveBranchEndId(phase.id);

          const caseFirst: Record<string, string> = {};
          for (const [key, arm] of Object.entries(phase.cases ?? {})) {
            _flatten(arm, branchEndId, `${path}.cases['${key}']`);
            caseFirst[key] = arm[0]?.id ?? branchEndId;
          }

          if (phase.defaultBranch !== undefined) {
            _flatten(phase.defaultBranch, branchEndId, `${path}.defaultBranch`);
          }
          // Empty/absent arms route to the merge node
          const defaultFirst = phase.defaultBranch?.[0]?.id ?? branchEndId;

          _registerBranchEnd(branchEndId);

          conditionalRouting.set(phase.id, { caseFirst, defaultFirst });

          // The merge node is the branch's single exit — links to the successor.
          if (successor) routing.set(branchEndId, successor);
          lastId = branchEndId;
        } else if (kind === "loop") {
          // --- loop (do-while block) processing ---

          // Validate: body must be present and non-empty
          if (!phase.body || phase.body.length === 0) {
            throw new TypeError(
              `Loop phase "${phase.id}" at path: ${path} has no "body"`,
            );
          }

          // Synthesize the loop's single decision node: a merge node the
          // body tail converges on, where repeat-vs-exit is decided. The id
          // is reserved before body flattening; registration happens after
          // so DFS order places it after all body descendants and before
          // the successor.
          const loopEndId = _reserveLoopEndId(phase.id);

          // Flatten the body with the loop-end as postBranch so every body
          // terminal — a plain last phase, a nested branch's branch-end, or
          // a nested loop's loop-end — links through to this loop's
          // decision node.
          const bodyTail = _flatten(phase.body, loopEndId, `${path}.body`);

          _registerLoopEnd(loopEndId);

          // Install the loop's conditional entry keyed on the loop-end id
          // (NOT the container, NOT the body tail): each loop decides on
          // its own distinct id, so the last-wins map can never let an
          // enclosing loop overwrite an inner loop's entry.
          const loopBack: LoopBackRouting = {
            loopTarget: phase.body[0].id,
            repeatWhile: phase.repeatWhile,
            maxPasses: phase.maxIterations,
            loopId: phase.id,
          };
          if (successor) loopBack.exitTarget = successor;
          conditionalRouting.set(loopEndId, loopBack);

          // Linear links: container → body[0] (do-while: the first pass
          // always runs, so the container never gets a conditional entry);
          // body tail → loop-end (the recursion already established this
          // link via postBranch — the explicit set is idempotent
          // redundancy kept for wiring clarity); loop-end → successor
          // (defensive fallback — the _evaluateBranch loop case always
          // returns an explicit target).
          routing.set(phase.id, phase.body[0].id);
          if (bodyTail) routing.set(bodyTail, loopEndId);
          if (successor) routing.set(loopEndId, successor);
          lastId = loopEndId;
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
    } else if ("caseFirst" in routing) {
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
    } else if ("loopTarget" in routing) {
      // --- LoopBackRouting ---
      // The loop-end merge node decides repeat-vs-exit. By do-while
      // definition the body has already run at least once when this is
      // evaluated, so the counter reads "repeats chosen so far".
      if (!state) {
        console.warn(
          `Loop evaluation failed for loop-end "${currentId}": state is missing`,
        );
        return routing.exitTarget;
      }

      // Counter for this loop block (0/absent = only the implicit first
      // pass has run). Counters accumulate across re-entries — no
      // per-entry reset.
      const passes = state.loopPasses?.[routing.loopId] ?? 0;

      // Resolve the cap per evaluation — never cached at construction.
      // Omitted maxPasses → global config → built-in default 15.
      const resolvedMax = resolveMaxIterations(routing.maxPasses);

      // Cap check first: repeat is allowed iff passes + 1 < resolvedMax.
      // A loop capped at N runs exactly N full passes (N-1 repeats chosen,
      // counter ends at N-1). The cap applies unconditionally — an
      // always-true/omitted condition exits at the cap without evaluating
      // repeatWhile on the capped evaluation. Cap exit is silent.
      if (passes + 1 >= resolvedMax) {
        return routing.exitTarget;
      }

      // Evaluate the repeat condition (only when the cap allows a repeat).
      // Omitted repeatWhile → always repeat (bounded by the cap above).
      if (routing.repeatWhile) {
        try {
          const result = routing.repeatWhile(state);
          if (!result) return routing.exitTarget;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `Loop evaluation failed for loop-end "${currentId}": ${msg}`,
          );
          // Fail-safe: never repeat on error.
          return routing.exitTarget;
        }
      }

      // Repeat: increment the counter (in-memory only) and jump back to
      // the body's first phase.
      setState({
        loopPasses: { ...state.loopPasses, [routing.loopId]: passes + 1 },
      });
      return routing.loopTarget;
    } else {
      // Defensive: no recognized routing shape — `null` is the "no
      // conditional routing" signal: resolveNext falls back to the linear
      // `_routing` map, keeping behavior neutral.
      return null;
    }
  }

  /**
   * Return all phase IDs in construction order.
   *
   * For flat arrays, this matches the original array order.
   * For branched workflows, includes nested arm children in
   * depth-first visitation order.
   *
   * The returned IDs include each control structure's engine-injected
   * synthetic merge node — branch-end (`__branch-end-<id>`) and loop-end
   * (`__loop-end-<id>`); user-facing enumerations should filter on
   * `synthetic`.
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
