// The stateless predicate half of the per-phase variable permission clause:
// given one tool call plus a snapshot value, it answers whether the model's
// variable write is allowed. It intercepts only setVar; every other tool
// name passes through with no verdict. It stores nothing, reads no
// env/fs/SDK, and never consults snapshot.sources or snapshot.paths.
//
// Verdict order (one pass per call):
//   1. Self-filter + cast-free extraction of a string `name`; any other
//      shape yields no target (silent allow - input shape is the tool
//      layer's domain).
//   2. Governing phase (non-null phase, non-empty vars declaration): admit
//      names present in the declaration-order, first-occurrence-deduped
//      listing; otherwise refuse with the phase line.
//   3. Tail: every non-governing window (depth-0, span without a phase,
//      empty vars) refuses with the universal line - byte-identical across
//      span shapes.
//
// Refusal reasons are composed through VariableRejectionError's message form
// over one rendered line (the instance is read for its bytes, never thrown),
// so one family voice holds across the gate channel, containment capture,
// and tool-result rendering.

import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import { VariableRejectionError } from "../errors.ts";

/** Structural denial shape - assignable to the SDK's ToolCallEventResult
 * without importing it. `reason` is the only feedback the model gets. */
export interface VarWriteVerdict {
  block: true;
  reason: string;
}

/** One tool-call verdict: `undefined` = allowed; a verdict = the refusal.
 * Judges per call over the given raw snapshot; self-filters by tool name. */
export function decideVarWrite(
  snapshot: ExecutionSnapshot,
  toolName: string,
  input: unknown,
): VarWriteVerdict | undefined {
  const name = toolName === SET_VAR_TOOL_NAME ? extractName(input) : null;
  if (name === null) return undefined;
  const phase = snapshot.phase;
  if (phase !== null && phase.vars.length > 0) {
    // Declaration-order, first-occurrence dedupe; a fresh array per call.
    const listing = firstOccurrenceListing(phase.vars);
    if (listing.includes(name)) return undefined;
    return {
      block: true,
      reason: composeReason(renderPhaseLine(name, phase.id, listing)),
    };
  }
  // Universal verdict for every non-governing window; a vars-empty phase
  // falls through here on the same bytes.
  return {
    block: true,
    reason: composeReason(renderUniversalLine(name)),
  };
}

const SET_VAR_TOOL_NAME = "setVar";

// Family composition channel: one owner of the prefix bytes across every
// delivery channel of the variable concern. Read for its message, never
// thrown.
function composeReason(line: string): string {
  return new VariableRejectionError([line]).message;
}

// Phase-line shape: names the attempted variable and the moment's allowed
// set (deduplicated listing joined over ", "; the join-or-"none" form is
// kept for structural parity with the sibling gate's renderer - unreachable
// here since the governing branch guarantees a non-empty list).
function renderPhaseLine(
  name: string,
  phaseId: string,
  listing: readonly string[],
): string {
  return `variable '${name}' cannot be set during phase '${phaseId}'. Allowed variables: ${listing.length === 0 ? "none" : listing.join(", ")}.`;
}

// Universal-line shape: fixed wording naming the attempted variable only;
// nothing names a phase, so the bytes stay identical across span shapes.
// The U+2014 escape matches the pinned em-dash discipline of this package.
function renderUniversalLine(name: string): string {
  return `variable '${name}' cannot be set \u2014 no variable permission is declared by any active phase. Allowed variables: none.`;
}

// Declaration-order, first-occurrence dedupe; a fresh array per call.
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

// A non-null object carrying a string `name`, verbatim; any other shape
// yields null (no target, no consultation, no side effect). Cast-free:
// object-shape guard, `in` key check, then a typeof check on the narrowed
// member.
function extractName(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  if (!("name" in input)) return null;
  if (typeof input.name !== "string") return null;
  return input.name;
}
