// ── guards/session-execution-state.ts — TYPES-ONLY SKELETON (Step 1); completed
// in Step 2 (class + channels + lifecycle added AROUND this type) ──

import type {
  CapabilitySources,
  PathAnchors,
  PhasePermission,
} from "./guard-vocabulary.ts";

/** THE ONE frozen per-call reading: WHAT IS EXECUTING RIGHT NOW plus the
 * session's invariant paths — the execution state's `snapshot()` (Step 2),
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
