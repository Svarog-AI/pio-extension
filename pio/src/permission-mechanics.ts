// ── permission-mechanics.ts — SHARED EFFECTIVE-SET CONSTRUCTION (the
// decision-time RESOLUTION half of the write permission model: given the
// active window's raw declaration + running contract + anchors, the moment's
// effective writable set). Pure over plain values; type-only edge down to
// the guard vocabulary; one matcher-dialect value edge; no classes, no
// channels, no lifecycle. Placed at the PACKAGE TOP LEVEL beside
// session-execution-state.ts (consumed across capability/guards and tools).
// SOLE OWNER of the construction mechanics. ──

import type {
  CapabilitySources,
  PathAnchors,
  PhasePermission,
} from "./capability/guards/guard-vocabulary.ts";
import { matchesAnchoredGlob } from "./sandbox/string-match-helpers.ts";

/** THE MOMENT'S EFFECTIVE WRITABLE SET - WHAT THE SET IS, never WHETHER IT
 * GOVERNS (that predicate stays with every caller). `survivors`: the
 * declared paths surviving the contract coverage filter at this moment -
 * declaration order, first-occurrence dedupe, a FRESH array per call.
 * `projectWritesActive`: the project-files (workspace-cwd) SCOPE CLASS's
 * decision-time proposition - true only while BOTH the phase's own flag and
 * the running sources' contract flag agree (judged over the COALESCED
 * sources). `scratchActive`: the phase's OWN scratch flag (single-flag
 * doctrine - never clamped), admitting the /tmp/ exact prefix. */
export interface EffectiveSet {
  survivors: string[];
  projectWritesActive: boolean;
  scratchActive: boolean;
}

/** THE EFFECTIVE-SET CONSTRUCTION - pure over plain values: given the active
 * window's RAW declaration, the running contract (NULL coalesces onto the
 * empty-set base INSIDE this module - one code path, no special cases at any
 * call site), and the session's path anchors, the moment's effective
 * writable set. Survivor loop: declaration order, first-occurrence dedupe,
 * over the SINGLE coverage consult. Fresh record + fresh array per call; no
 * fault surface. Answers WHAT THE SET IS, never WHETHER IT GOVERNS - the
 * non-empty-or-class predicate stays with every caller. */
export function materializeEffectiveSet(
  phase: PhasePermission,
  sources: CapabilitySources | null,
  anchors: PathAnchors,
): EffectiveSet {
  const basis = sources ?? BASE_SOURCES;
  // Declaration order, first-occurrence dedupe: each declared path is
  // consulted ONCE against the contract coverage filter.
  const survivors: string[] = [];
  const seen = new Set<string>();
  for (const declared of phase.declared) {
    if (seen.has(declared)) continue;
    if (admittedBy(basis, declared, anchors)) {
      seen.add(declared);
      survivors.push(declared);
    }
  }
  // The project-files scope class is a CLASS, not a path-list entry:
  // projectWritesActive is the DISTINCT decision-time proposition judged
  // over the COALESCED sources (never folded into the survivor loop),
  // strictly-under-cwd by the standing prefix form at the call sites.
  const projectWritesActive =
    phase.allowProjectWrites && basis.allowProjectWrites;
  // The scratch class is the phase's OWN single flag - there is NO
  // contract-side counterpart (single-flag doctrine: there is no clamp to
  // speak of), /tmp/ exact prefix unchanged.
  const scratchActive = phase.tmpDirAllowed;
  return { survivors, projectWritesActive, scratchActive };
}

// THE single coverage check serving the effective-set filter ONLY - one
// definition, one call site, no drift possible. It consults the slot-root
// anchor ONLY when `writes` is non-empty; empty sources consult NOTHING.
// The project-files (workspace-cwd) scope is NOT consulted here - it exists
// only as the DISTINCT decision-time propositions at the phase-branch class
// sites. Pure over plain values - no channels exist here to fault.
function admittedBy(
  sources: CapabilitySources,
  target: string,
  anchors: PathAnchors,
): boolean {
  if (sources.writes.length > 0) {
    for (const pattern of sources.writes) {
      if (matchesAnchoredGlob(pattern, anchors.projectSlotRoot, target))
        return true;
    }
  }
  return false;
}

// The session-base pair — the EMPTY set: GENUINELY TOTAL default-deny (no
// implicit allowance anywhere), computed through the identical branch as an
// empty-contract span. Null sources coalesce onto this — one code path, no
// special cases.
const BASE_SOURCES: CapabilitySources = {
  name: "",
  writes: [],
  allowProjectWrites: false,
};
