// ── guards/guard-vocabulary.ts — SHARED DECISION VOCABULARY (types only;
// imports NOTHING; exactly THREE members — mechanically asserted) ──

/** Plain data — the running capability's sources (contract values as-is; the
 * vocabulary deliberately does NOT import contract.ts, keeping it hermetic). */
export interface CapabilitySources {
  // the running capability's name - LAYER identity (the refusal names the
  // governing STATE; the layer's name rides the transcript's durable span-
  // marker channel)
  name: string;
  // slot-relative patterns (contract.writes verbatim) - the filter-site
  // clamp ceiling for a phase's declared paths
  writes: readonly string[];
  // the scope class's SECOND flag - the decision-time clamp consults BOTH
  // this and the phase's own flag; the span site itself confers NO
  // admission (it supplies this ceiling and nothing more)
  allowProjectWrites: boolean;
}

/** The active phase's RAW RESOLVED DECLARATION - FOUR declared permission
 * dimensions, exactly as the phase declared them (the execution state stores
 * all of them VERBATIM - no filtering/validation at attach; judgment runs at
 * DECISION TIME in the predicate). (i) concrete absolute PATHS as declared;
 * (ii) the project-files (workspace-cwd) SCOPE FLAG, clamped against the
 * running capability's contract flag when judged; (iii) the SCRATCH FLAG
 * (tmpDirAllowed), a SINGLE phase flag with NO contract-side counterpart
 * (judged unclamped at decision time); (iv) the VARIABLE NAME declaration,
 * a NAME-space-only list that the model's setVar writes bind to at the
 * var-gate PDP (no paths, no clamping - the gate consults the list alone).
 * The EFFECTIVE construction (declared
 * intersect contract-covered, plus the scope class when both flags agree,
 * plus the scratch class when the flag is set) is materialized by the
 * predicate at DECISION TIME; an EMPTY effective construction confers NO
 * phase governance (lazy fall-through). */
export interface PhasePermission {
  id: string;
  declared: readonly string[];
  allowProjectWrites: boolean;
  // the phase's own scratch declaration - single-flag doctrine, never clamped
  tmpDirAllowed: boolean;
  // the phase's declared VARIABLE NAME declaration - the model's setVar
  // writes bind to these names at the var-gate PDP (NAME space only: no
  // paths, no clamping - the gate consults the list alone). Stored
  // VERBATIM like the paths/flags; an empty list confers NO var governance
  // (the gate's phase branch falls through lazily, like the file gate's
  // empty effective construction).
  vars: readonly string[];
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
