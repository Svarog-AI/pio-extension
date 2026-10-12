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
//   2. Governing phase (non-null phase whose stored bindings carry AT LEAST
//      ONE write grant): admit names present in the moment's write-grant
//      listing (binding order); otherwise refuse with the phase line.
//   3. Tail: every non-governing window (depth-0, span without a phase,
//      read-only bindings) refuses with the universal line - byte-identical
//      across span shapes. Its premise holds verbatim here: NO write
//      permission is declared by any active phase.
//
// Adjudication source: the substrate module's write-grant projection over
// the phase's STORED binding list (it runs the shared duplicate first-check
// defensively - a duplicate set propagates the substrate refusal instead of
// being judged; names are unique per phase by construction). The two line
// renderers below are EXPORTED so the tool lane settles the SAME family
// bytes from its own out-of-grant backstop - one voice across the gate
// channel and tool-result rendering (this module stays their SOLE owner).
//
// Refusal reasons are composed through VariableRejectionError's message form
// over one rendered line (the instance is read for its bytes, never thrown),
// so one family voice holds across the gate channel, containment capture,
// and tool-result rendering.

import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import { VariableRejectionError } from "../errors.ts";
import { listWriteGrants } from "../var-cell.ts";

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
  // The adjudication listing: write-granted names in binding order over the
  // stored bindings (runs the shared duplicate first-check defensively).
  const grants = phase === null ? [] : listWriteGrants(phase.vars);
  if (phase !== null && grants.length > 0) {
    if (grants.includes(name)) return undefined;
    return {
      block: true,
      reason: composeReason(renderVarGatePhaseLine(name, phase.id, grants)),
    };
  }
  // Universal verdict for every non-governing window: depth-0, span without
  // a phase, and read-only bindings alike fall through here on the same
  // bytes.
  return {
    block: true,
    reason: composeReason(renderVarGateUniversalLine(name)),
  };
}

const SET_VAR_TOOL_NAME = "setVar";

// Family composition channel: one owner of the prefix bytes across every
// delivery channel of the variable concern. Read for its message, never
// thrown.
function composeReason(line: string): string {
  return new VariableRejectionError([line]).message;
}

// Phase-line shape (SOLE BYTE OWNER; exported for the tool lane's
// out-of-grant backstop so ONE voice holds across both channels): names the
// attempted variable and the moment's write-grant listing (joined over ", ";
// the join-or-"none" form is kept for structural parity with the sibling
// gate's renderer - unreachable here since the governing branch guarantees
// a non-empty listing).
export function renderVarGatePhaseLine(
  name: string,
  phaseId: string,
  listing: readonly string[],
): string {
  return `variable '${name}' cannot be set during phase '${phaseId}'. Allowed variables: ${listing.length === 0 ? "none" : listing.join(", ")}.`;
}

// Universal-line shape (SOLE BYTE OWNER; exported alongside the phase line):
// fixed wording naming the attempted variable only; nothing names a phase,
// so the bytes stay identical across span shapes.
// The U+2014 escape matches the pinned em-dash discipline of this package.
export function renderVarGateUniversalLine(name: string): string {
  return `variable '${name}' cannot be set \u2014 no variable permission is declared by any active phase. Allowed variables: none.`;
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
