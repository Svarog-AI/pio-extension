// ── guards/write-gate.ts — STATELESS PREDICATE (value imports: node:path,
// ../../sandbox/string-match-helpers.ts — matchesAnchoredGlob re-exported;
// type-only: ./guard-vocabulary.ts, ../../session-execution-state.ts — the
// latter ERASED at compile time; COMPLETE surface: exactly THREE exports) ──
//
// Half of the two-component write gate — the stateless decision point (PDP):
// given ONE tool call plus the GIVEN inputs, it answers whether the write/edit
// is allowed. It stores nothing and owns no lifecycle; the interceptor runner
// (which tool_call reaches the agent) and the per-session execution state
// (which records what is executing right now and supplies the snapshot) are
// its siblings. This file consumes the snapshot GIVEN at call time — plain
// values, no closures — and judges per call.
//
// Purity: the snapshot carries the session's path anchors as RESOLVED STRINGS,
// so this module reads no env, touches no filesystem, and reaches no SDK
// (channel-free by construction). Coverage is EXACTLY `write`/`edit` via
// string `input.path` (bash stays ungated). The verdict order is pinned, one
// pass per target:
//   1. an active phase whose declaration confers governance governs
//      EXCLUSIVELY over its EFFECTIVE construction, materialized FRESH per
//      call: the surviving paths (declared intersect contract-covered at the
//      filter site) PLUS the project-files scope class - the class admits a
//      target only while BOTH the phase's own flag and the running sources'
//      contract flag agree (decision-time clamp; null sources coalesce onto
//      the empty base, where the class term stays inert - one code path) -
//      PLUS the scratch class - the phase's OWN single tmpDirAllowed flag
//      (there is NO contract-side counterpart to clamp against - single-flag
//      doctrine), admitting the /tmp/ exact prefix. An EMPTY effective
//      construction confers NO phase governance and falls through;
//   2. deny.
// Nothing else admits, EVER: the span site is NON-ADMITTING (it supplies the
// filter-site clamp ceiling and the scope-class second flag ONLY - its name
// renders in NO refusal; the layer's name rides the transcript's durable
// span-marker channel); depth-0 and no-phase windows admit NOTHING (total
// default-deny, genuinely total); scratch is phase-declared, not ambient;
// listings show the MOMENT'S set, never raw patterns.
//
// Every refusal RETURNS a house-style message — the ONLY feedback — and
// EXACTLY TWO line shapes exist system-wide: the PHASE line (named by the
// phase id, listing the moment's effective set - surviving paths in
// declaration order, then the scope element iff the class is active, then
// the scratch element iff the flag is active; over-declared, contract-
// uncovered entries simply absent - never granted, never listed) and the
// UNIVERSAL NO-PERMISSION BYTE - ONE parameter-free pinned constant emitted
// for EVERY non-governing window regardless of span presence (the
// capability-named and no-span shapes retired; no /tmp/ clause anywhere).
//
// Terminology: stack entries are LAYERS ("frame" is reserved for
// composed-execution units elsewhere in this package).

import { resolve } from "node:path";
import { matchesAnchoredGlob } from "../../sandbox/string-match-helpers.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import type { CapabilitySources, PathAnchors } from "./guard-vocabulary.ts";

/** Structural denial shape — assignable to the SDK's ToolCallEventResult
 * without importing it. `reason` is the ONLY feedback the model gets. */
export interface WriteGateVerdict {
  block: true;
  reason: string;
}

// Re-exported from the sandbox helper module (its documented dialect home)
// so the pinned THREE-NAME surface stays name-stable at this boundary.
export { matchesAnchoredGlob };

/** One tool-call verdict: `undefined` = allowed; a verdict = the refusal.
 * Judges PER CALL over the RAW snapshot — the phase branch's contract-
 * existence half runs HERE at decision time; there is no attach-time
 * confirmation anywhere. */
export function decideWrite(
  snapshot: ExecutionSnapshot,
  toolName: string,
  input: unknown,
): WriteGateVerdict | undefined {
  const target = WRITER_TOOLS.has(toolName) ? extractTarget(input) : null;
  if (target === null) return undefined;
  const sources = snapshot.sources ?? BASE_SOURCES;
  const phase = snapshot.phase;
  if (
    phase !== null &&
    (phase.declared.length > 0 ||
      phase.allowProjectWrites ||
      phase.tmpDirAllowed)
  ) {
    // Effective construction: declared ∩ contract-covered, materialized
    // FRESH per call — declaration order, first-occurrence dedupe; PLUS the
    // two CLASS terms, each judged at decision time. An EMPTY effective
    // construction confers NO phase governance: the lazy fall-through below
    // keeps one code path.
    const effective: string[] = [];
    const seen = new Set<string>();
    for (const declared of phase.declared) {
      if (seen.has(declared)) continue;
      if (admittedBy(sources, declared, snapshot.paths)) {
        seen.add(declared);
        effective.push(declared);
      }
    }
    // The project-files scope class is a CLASS, not a path-list entry:
    // projectWritesActive is the DISTINCT decision-time proposition at
    // this site (never folded into the single coverage disjunction
    // above), strictly-under-cwd by the standing prefix form.
    const projectWritesActive =
      phase.allowProjectWrites && sources.allowProjectWrites;
    // The scratch class is the phase's OWN single flag - there is NO
    // contract-side counterpart (single-flag doctrine: there is no clamp to
    // speak of), /tmp/ exact prefix unchanged.
    const scratchActive = phase.tmpDirAllowed;
    if (effective.length > 0 || projectWritesActive || scratchActive) {
      if (
        effective.includes(target) ||
        (projectWritesActive &&
          target.startsWith(`${snapshot.paths.workspaceCwd}/`)) ||
        (scratchActive && target.startsWith("/tmp/"))
      ) {
        return undefined;
      }
      return {
        block: true,
        reason: renderPhaseDenial(
          phase.id,
          effective,
          projectWritesActive ? snapshot.paths.workspaceCwd : null,
          scratchActive,
        ),
      };
    }
  }
  // THE tail consults NOTHING (span admission retires): ONE plain constant-
  // verdict return for every non-governing window - span present or absent
  // alike.
  return {
    block: true,
    reason: UNIVERSAL_NO_PERMISSION_DENIAL,
  };
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

// THE SOLE TAIL VERDICT - ONE parameter-free pinned constant (owner-pinned
// verbatim - zero rewording discretion) emitted for EVERY non-governing
// window regardless of span presence; \u2014 escaped so the em-dash bytes
// survive editor/toolkit glyph mangling. The capability-named and no-span
// line shapes RETIRED outright with the strict-confirmation ruling.
const UNIVERSAL_NO_PERMISSION_DENIAL =
  "Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.";

// SOLE DENIAL LINE SHAPES - the suite goldens mirror these byte-for-byte.
// The phase line carries the MOMENT'S effective listing: surviving paths in
// declaration order, the scope element APPENDED AFTER THEM when the class is
// active, the scratch element appended LAST when the phase's flag is active
// (pinned order: scope before scratch); the join-or-"none" constructor shape
// is kept for structural parity (structurally unreachable here - rendering
// is gated on a non-empty effective construction).
const renderPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
  scratchActive: boolean,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) {
    parts.push(`project files under ${workspaceCwd}`);
  }
  if (scratchActive) {
    parts.push("scratch files under /tmp/");
  }
  const allowlist = parts.length === 0 ? "none" : parts.join(", ");
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${allowlist}.`;
};

// The observed writer-tool set only (local const; the observer's
// FILE_TOOL_NAMES is deliberately not imported). Any other tool — including
// bash — yields no target: allowed by silence.
const WRITER_TOOLS = new Set(["edit", "write"]);

// The session-base pair — the EMPTY set: GENUINELY TOTAL default-deny (no
// implicit allowance anywhere), computed through the identical branch as an
// empty-contract span. Null sources coalesce onto this — one code path, no
// special cases.
const BASE_SOURCES: CapabilitySources = {
  name: "",
  writes: [],
  allowProjectWrites: false,
};

// A non-null object carrying a STRING `path`, normalized with path.resolve;
// any other shape yields `null` — no target, no consultation, no side
// effect. Cast-free by convention: an object-shape guard, an `in` key check,
// then a `typeof` check on the narrowed member — written validation branches
// where the former single assertion stood.
function extractTarget(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  if (!("path" in input)) return null;
  if (typeof input.path !== "string") return null;
  return resolve(input.path);
}
