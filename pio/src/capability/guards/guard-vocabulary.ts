// ── guards/guard-vocabulary.ts — SHARED DECISION VOCABULARY (types only;
// imports NOTHING; exactly THREE members — mechanically asserted) ──

/** Plain data — the running capability's sources (contract values as-is; the
 * vocabulary deliberately does NOT import contract.ts, keeping it hermetic). */
export interface CapabilitySources {
  // governing source named in span denials
  name: string;
  // slot-relative patterns (contract.writes verbatim)
  writes: readonly string[];
  // legacy role: admits project-root files beyond the patterns
  allowProjectWrites: boolean;
}

/** The active phase's RAW RESOLVED DECLARATION - TWO declared permission
 * dimensions, exactly as the phase declared them (the execution state stores
 * both VERBATIM - no filtering/validation at attach; judgment runs at
 * DECISION TIME in the predicate). (i) concrete absolute PATHS as declared;
 * (ii) the project-files (workspace-cwd) SCOPE FLAG, clamped against the
 * running capability's contract flag when judged. The EFFECTIVE set (declared
 * intersect contract-covered, plus the scope class when both flags agree)
 * is materialized by the predicate at DECISION TIME; an EMPTY effective set
 * confers NO phase governance (lazy fall-through). */
export interface PhasePermission {
  id: string;
  declared: readonly string[];
  allowProjectWrites: boolean;
}

/** The session's path anchors — PLAIN RESOLVED STRINGS, session-invariant.
 * Resolved by the execution state (Step 2); every guard member only CONSUMES
 * them (channel-free by construction). */
export interface PathAnchors {
  // <stateRoot>/projects/<key>, normalized, no trailing separator
  readonly projectSlotRoot: string;
  // session launch cwd (the allowProjectWrites scope)
  readonly workspaceCwd: string;
}
