// ── guards/write-gate.ts — STATELESS PREDICATE (value imports: node:path,
// ../../denial-vocabulary.ts, ../../permission-mechanics.ts,
// ../../sandbox/string-match-helpers.ts — matchesAnchoredGlob re-exported;
// type-only: ../../session-execution-state.ts — erased at compile time;
// COMPLETE surface: exactly THREE exports) ──
//
// Half of the two-component write gate — the stateless decision point (PDP):
// given ONE tool call plus the GIVEN inputs, it answers whether the write/edit
// is allowed. It stores nothing and owns no lifecycle; the interceptor runner
// (which tool_call reaches the agent) and the per-session execution state
// (which records what is executing right now and supplies the snapshot) are
// its siblings. This file consumes the snapshot GIVEN at call time — plain
// values, no closures — and judges per call.
//
// Shared cores imported here: the effective-set construction lives in
// ../../permission-mechanics.ts and the refusal byte family (the phase-line
// renderer plus the universal no-permission constant) in
// ../../denial-vocabulary.ts - both shared top-level leaves, imported here so
// a future reader finds the shared owners without archaeology. THIS module
// ADJUDICATES using both; it owns neither the construction nor the voice.
//
// Purity: the snapshot carries the session's path anchors as RESOLVED STRINGS,
// so this module reads no env, touches no filesystem, and reaches no SDK
// (channel-free by construction). Coverage is EXACTLY `write`/`edit` via
// string `input.path` (bash stays ungated). The verdict order is pinned, one
// pass per target:
//   1. an active phase whose declaration confers governance governs
//      EXCLUSIVELY over its EFFECTIVE construction, materialized FRESH per
//      call by the shared construction core: the surviving paths (declared
//      intersect contract-covered at the filter site) PLUS the project-files
//      scope class - the class admits a target only while BOTH the phase's
//      own flag and the running sources' contract flag agree (decision-time
//      clamp; null sources coalesce onto the empty base inside the
//      construction, where the class term stays inert - one code path) -
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
// EXACTLY TWO line shapes exist system-wide (OWNED by the shared byte leaf
// ../../denial-vocabulary.ts; this module renders through the imported
// binding): the PHASE line (named by the
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
import {
  renderPhaseDenial,
  UNIVERSAL_NO_PERMISSION_DENIAL,
} from "../../denial-vocabulary.ts";
import { materializeEffectiveSet } from "../../permission-mechanics.ts";
import { matchesAnchoredGlob } from "../../sandbox/string-match-helpers.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";

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
  const phase = snapshot.phase;
  if (
    phase !== null &&
    (phase.declared.length > 0 ||
      phase.allowProjectWrites ||
      phase.tmpDirAllowed)
  ) {
    // Effective construction via the shared core: declared intersect
    // contract-covered (declaration order, first-occurrence dedupe; null
    // sources coalesced onto the empty base INSIDE the construction), PLUS
    // the two CLASS terms, each judged at decision time. An EMPTY effective
    // construction confers NO phase governance: the lazy fall-through below
    // keeps one code path.
    const effective = materializeEffectiveSet(
      phase,
      snapshot.sources,
      snapshot.paths,
    );
    if (
      effective.survivors.length > 0 ||
      effective.projectWritesActive ||
      effective.scratchActive
    ) {
      if (
        effective.survivors.includes(target) ||
        (effective.projectWritesActive &&
          target.startsWith(`${snapshot.paths.workspaceCwd}/`)) ||
        (effective.scratchActive && target.startsWith("/tmp/"))
      ) {
        return undefined;
      }
      return {
        block: true,
        reason: renderPhaseDenial(
          phase.id,
          effective.survivors,
          effective.projectWritesActive ? snapshot.paths.workspaceCwd : null,
          effective.scratchActive,
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

// The observed writer-tool set only (local const; the observer's
// FILE_TOOL_NAMES is deliberately not imported). Any other tool — including
// bash — yields no target: allowed by silence.
const WRITER_TOOLS = new Set(["edit", "write"]);

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
