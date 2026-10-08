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

/** The active phase's raw resolved declaration, stored verbatim; judgment
 * runs at decision time in the predicates. Four dimensions: (i) concrete
 * absolute paths as declared; (ii) the project-files scope flag, clamped
 * against the running capability's contract flag when judged; (iii) the
 * scratch flag, never clamped (no contract-side counterpart); (iv) the
 * variable-name list - name space only, no clamping.
 *
 * The effective construction (declared intersect contract-covered, plus the
 * scope class when both flags agree, plus the scratch class when the flag is
 * set) is materialized by the predicate at decision time; an empty
 * construction confers no governance (lazy fall-through). */
export interface PhasePermission {
  id: string;
  declared: readonly string[];
  allowProjectWrites: boolean;
  // the phase's own scratch declaration - single-flag doctrine, never clamped
  tmpDirAllowed: boolean;
  // declared variable names: the model's setVar writes bind to these while
  // the phase is attached; an empty list confers no variable governance
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
