// ── session-execution-state.ts — THE PER-SESSION EXECUTION STATE (the
// dedicated companion to the stateless write gate) ──
//
// Records WHAT IS EXECUTING RIGHT NOW for a whole session: a LIFO stack of
// capability SPAN layers (the outer pair suspends, never destroys — only the
// innermost governs) plus the one executing phase in the TOP layer's SCALAR
// slot (both declared dimensions stored VERBATIM; there is no save/restore,
// ever). Owns the session's
// PATH CHANNELS exclusively: snapshot() resolves both closures FRESH on every
// call (NO caching anywhere — the first fault escapes verbatim, half-
// application impossible) and hands PLAIN VALUES downstream: nothing past this
// module ever sees a closure. Stores PLAIN DATA only (sources by reference,
// the phase's two declared dimensions verbatim - raw resolved paths plus the
// scope flag, zero-copy trust boundary; caller mutation is documented, not
// defended against). Bookkeeping corruption is deterministic
// and LOUD: the unexported ExecutionStateError carries the four fault forms;
// silent tolerance is forbidden.
//
// Placement: top level of the pio package, sibling of session.ts — it records
// the running execution rather than judging a tool call, so it sits beside
// the mechanism rather than inside the guards/ subpackage (which keeps the
// predicate and the shared decision vocabulary).

import type {
  CapabilitySources,
  PathAnchors,
  PhasePermission,
} from "./capability/guards/guard-vocabulary.ts";

/** THE ONE frozen per-call reading: WHAT IS EXECUTING RIGHT NOW plus the
 * session's invariant paths — the execution state's `snapshot()` output,
 * given as-is. Lives in ITS PRODUCER'S MODULE (any snapshot-consuming guard
 * depends on the state by construction — producer-side typing adds no consumer
 * edge). Shared by EVERY guard member (write gate today; the bash-command-guard
 * tomorrow consumes the SAME record — no per-guard snapshot fork, ever).
 * SINGLE SOURCE OF TRUTH — `write-gate.ts` takes the plain type-only import. */
export interface ExecutionSnapshot {
  /** NULL = no capability span active (renders the no-span denial line). A real
   * sources object with empty `writes` = an empty-contract span (capability-named
   * "none" line). Admission logic is IDENTICAL for both — one code path. */
  sources: CapabilitySources | null;
  // NULL = no phase active
  phase: PhasePermission | null;
  paths: PathAnchors;
}

/** The session's path CHANNELS — producer-supplied closures (the host
 * constructs them over the base's loud state-root channel + the launch cwd).
 * Each may throw the producer's typed no-silent-fallback error; the state
 * propagates the fault VERBATIM. Storage at construction only — no resolution
 * happens here or in any lifecycle method. */
export interface AnchorChannels {
  projectSlotRoot(): string;
  workspaceCwd(): string;
}

// One SPAN layer: the governing sources + the one executing phase (NULL = no
// phase attached). Stack entries are SPAN LAYERS — "frame" is reserved for
// composed-execution units elsewhere in this package.
interface SpanLayer {
  sources: CapabilitySources;
  phase: PhasePermission | null;
}

// Module-local (NOT exported — consumers observe `name` + message bytes; no
// import path exists). Bookkeeping corruption is deterministic and LOUD —
// silent tolerance is forbidden. Four fault forms, exhaustive; pure ASCII
// (developer-facing fault lines the model never sees).
class ExecutionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionStateError";
  }
}

/** WHAT IS EXECUTING RIGHT NOW for one session: the LIFO capability SPAN
 * layers + the one executing phase in the top layer's SCALAR slot, owned
 * path channels, and the loud bookkeeping faults. Dedicated companion —
 * payload-typed, zero speculative API. */
export class SessionExecutionState {
  private channels: AnchorChannels;
  private layers: SpanLayer[] = [];

  /** Channel storage ONLY — no resolution at construction. */
  constructor(channels: AnchorChannels) {
    this.channels = channels;
  }

  /** Push a SPAN layer (span start). The outer pair SUSPENDS — it is not
   * destroyed — and governs again once this layer pops. Stores the sources
   * BY REFERENCE (zero-copy plain data). */
  enterCapability(sources: CapabilitySources): void {
    this.layers.push({ sources, phase: null });
  }

  /** Pop the top SPAN layer (span settlement — success AND catch-all alike).
   * Loud on corruption: underflow OR an outstanding phase slot throws the
   * typed bookkeeping error; the stack stays intact either way. */
  exitCapability(): void {
    const top = this.layers.at(-1);
    if (top === undefined) {
      throw new ExecutionStateError(
        "execution state: exitCapability() called with no capability span active",
      );
    }
    if (top.phase !== null) {
      throw new ExecutionStateError(
        `execution state: exitCapability() called while phase '${top.phase.id}' is still attached`,
      );
    }
    this.layers.pop();
  }

  /** Store the CURRENT phase AS A RECORD: { id, declared,
   * allowProjectWrites } VERBATIM in the top layer's SCALAR slot - the TWO
   * declared permission dimensions exactly as passed (raw resolved paths
   * plus the raw scope flag: no filtering, validation, contract
   * consultation, channel consult, or copy-transformation). Attaching while
   * a phase is already attached OVERWRITES the slot (last-wins). An EMPTY
   * declaration with a FALSE flag is a valid no-op attachment (confers no
   * governance - the predicate's phase branch falls through lazily; keeps
   * detach symmetric). Sole fault: depth 0. */
  attachPhase(
    phaseId: string,
    declaredPaths: readonly string[],
    allowProjectWrites: boolean,
  ): void {
    const top = this.layers.at(-1);
    if (top === undefined) {
      throw new ExecutionStateError(
        `execution state: attachPhase('${phaseId}') called with no capability span active`,
      );
    }
    top.phase = {
      id: phaseId,
      declared: declaredPaths,
      allowProjectWrites,
    };
  }

  /** Clear the top layer's SCALAR phase slot. Loud when no phase is attached
   * — including at depth 0 (one form, no variant). */
  detachPhase(): void {
    const top = this.layers.at(-1);
    if (top === undefined || top.phase === null) {
      throw new ExecutionStateError(
        "execution state: detachPhase() called with no attached phase",
      );
    }
    top.phase = null;
  }

  /** Drain to depth-0 REGARDLESS of outstanding entries (spans with attached
   * phases included). Idempotent — the sanctioned non-mirrored path
   * (handle-reset hygiene). Afterwards the state is structurally fresh. */
  reset(): void {
    this.layers.length = 0;
  }

  /** Freeze WHAT IS EXECUTING RIGHT NOW — the interceptor's ONLY query
   * surface and the module's SOLE FAULT SURFACE: BOTH channels resolve FRESH
   * (no caching — a faulty channel throws on every call until healthy; the
   * first fault escapes verbatim, never caught/wrapped/fallen back). Top-
   * layer values, or null/null at depth 0 (the empty-set base — identical
   * code path downstream); a fresh wrapper record per call, always carrying
   * RESOLVED paths. */
  snapshot(): ExecutionSnapshot {
    const top = this.layers.at(-1);
    return {
      sources: top === undefined ? null : top.sources,
      phase: top === undefined ? null : top.phase,
      paths: {
        projectSlotRoot: this.channels.projectSlotRoot(),
        workspaceCwd: this.channels.workspaceCwd(),
      },
    };
  }
}
