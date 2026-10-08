// ── guards/var-gate.ts — STATELESS PREDICATE (value import: ../errors.ts —
// the family-composed refusal bytes; type-only:
// ../../session-execution-state.ts — erased at compile time; COMPLETE
// surface: exactly ONE runtime export) ──
//
// Half of the per-phase variable permission clause - the stateless decision
// point (PDP): given ONE tool call plus the GIVEN inputs, it answers whether
// the model's variable write is allowed. It stores nothing and owns no
// lifecycle; the interceptor runner (which tool_call reaches the agent) and
// the per-session execution state (which records what is executing right now
// and supplies the snapshot) are its siblings. This file consumes the
// snapshot GIVEN at call time - plain values, no closures - and judges per
// call. Intercepts EXACTLY the model's setVar tool name: getVar/listVars and
// every other tool pass through with NO verdict (the sibling write gate
// stays untouched and unimported - loose coupling between gate siblings, its
// verdict shape deliberately re-declared here rather than shared).
//
// Purity: reads no env, touches no filesystem, reaches no SDK (channel-free
// by construction), and NEVER CONSULTS snapshot.sources or snapshot.paths -
// the variable clause has NO contract-side counterpart to clamp against and
// NO path semantics. The verdict order is pinned, one pass per call:
//   1. SELF-FILTER + EXTRACTION: only setVar yields a target - a cast-free
//      chain over the input (object-shape guard, `in` key check, `typeof`
//      member check) admitting a STRING name; ANY other shape yields no
//      target - silent allow (malformed input is SHAPE territory, policed
//      exclusively by the tool layer - one adjudication per concern);
//   2. GOVERNING PHASE: a non-null phase with a NON-EMPTY vars declaration
//      governs the var namespace EXCLUSIVELY over its declared names: the
//      moment's allowed listing is the declaration DEDUPED (declaration
//      order, first occurrence); an extracted name in the listing allows;
//      anything else denies with the PHASE line (names the variable AND the
//      allowed set);
//   3. TAIL: every non-governing window - depth-0 (null/null reading),
//      span-present-but-no-phase, and a vars-EMPTY phase (confers NO var
//      governance; the lazy fall-through keeps one code path, exactly like
//      the file gate's empty-effective-construction fall-through) - denies
//      with the UNIVERSAL line: NOTHING names the phase there and the
//      reading is byte-identical across span shapes.
//
// Every refusal RETURNS a house-style message - the ONLY feedback - and
// EXACTLY TWO line shapes exist system-wide for this predicate (OWNED HERE
// by the module-private renderers below, composed THROUGH the error home's
// variable rejection family so ONE voice holds across the gate channel, the
// containment capture, and the tool-result rendering): the reason equals
// the family's default-message form over the single rendered line; the
// family instance is constructed INERT (read for its message bytes, never
// thrown - the gate channel carries plain verdict strings).
//
// Terminology: stack entries are LAYERS ("frame" is reserved for
// composed-execution units elsewhere in this package).

import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import { VariableRejectionError } from "../errors.ts";

/** Structural denial shape - assignable to the SDK's ToolCallEventResult
 * without importing it. `reason` is the ONLY feedback the model gets. */
export interface VarWriteVerdict {
  block: true;
  reason: string;
}

/** One tool-call verdict: `undefined` = allowed; a verdict = the refusal.
 * Judges PER CALL over the GIVEN raw snapshot; self-filters by tool name. */
export function decideVarWrite(
  snapshot: ExecutionSnapshot,
  toolName: string,
  input: unknown,
): VarWriteVerdict | undefined {
  const name = toolName === SET_VAR_TOOL_NAME ? extractName(input) : null;
  if (name === null) return undefined;
  const phase = snapshot.phase;
  if (phase !== null && phase.vars.length > 0) {
    // Moment's allowed listing: declaration order, FIRST-OCCURRENCE dedupe
    // (parity with the file gate's survivor doctrine). A fresh array per
    // call - the module keeps no state.
    const listing = firstOccurrenceListing(phase.vars);
    if (listing.includes(name)) return undefined;
    return {
      block: true,
      reason: composeReason(renderPhaseLine(name, phase.id, listing)),
    };
  }
  // THE tail consults NOTHING (span admission retires): ONE universal
  // verdict for every non-governing window - span present or absent alike,
  // and a vars-empty phase falls through lazily on the SAME bytes.
  return {
    block: true,
    reason: composeReason(renderUniversalLine(name)),
  };
}

// The single intercepted tool name (pinned constant; any other name yields
// no target before any consultation happens).
const SET_VAR_TOOL_NAME = "setVar";

// Family composition channel: the verdict reason equals the family's
// DEFAULT-MESSAGE form over the single rendered line - ONE owner of the
// prefix bytes across every delivery channel of the variable concern. The
// instance is read inertly for its message and never thrown.
function composeReason(line: string): string {
  return new VariableRejectionError([line]).message;
}

// THE PHASE line: names the attempted variable AND the moment's allowed set
// (deduplicated listing joined over ", "; the join-or-"none" constructor is
// kept for structural parity with the sibling gate's renderer - structurally
// unreachable here since the governing branch guarantees a non-empty list).
function renderPhaseLine(
  name: string,
  phaseId: string,
  listing: readonly string[],
): string {
  return `variable '${name}' cannot be set during phase '${phaseId}'. Allowed variables: ${listing.length === 0 ? "none" : listing.join(", ")}.`;
}

// THE UNIVERSAL line: every non-governing window (depth-0, span-without-
// phase, vars-empty phase). Names the ATTEMPTED variable (the refusal is
// the model's ONLY feedback - naming the attempt is strictly better signal)
// and governs otherwise as a fixed shape; nothing names a phase, so the
// bytes stay identical across span shapes. U+2014 escaped like every other
// pinned em-dash byte in this package.
function renderUniversalLine(name: string): string {
  return `variable '${name}' cannot be set \u2014 no variable permission is declared by any active phase. Allowed variables: none.`;
}

// Declaration-order, FIRST-OCCURRENCE dedupe: a fresh array per call.
function firstOccurrenceListing(list: readonly string[]): string[] {
  const seen: Set<string> = new Set();
  const result: string[] = [];
  for (const entry of list) {
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  return result;
}

// A non-null object carrying a STRING `name`, verbatim; any other shape
// yields `null` - no target, no consultation, no side effect. Cast-free by
// convention: an object-shape guard, an `in` key check, then a `typeof`
// check on the narrowed member - written validation branches where a former
// assertion would have stood.
function extractName(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  if (!("name" in input)) return null;
  if (typeof input.name !== "string") return null;
  return input.name;
}
