// THE model-side access channel over the phase-frame variable bindings: one
// small factory mirroring the tools/bash/ layout - it receives the host's
// execution state BY REFERENCE and returns the three legacy-named tool
// definitions (setVar / getVar / listVars) registered ONCE on the host's
// UNCONDITIONAL customTools slot alongside the fenced bash entry. EVERY body
// resolves the moment's world from a FRESH snapshot() per call (the house
// late-binding idiom the gates and disclosure already trust): setVar routes
// into the ACTIVE PHASE'S write-grant cells; getVar and listVars expose the
// active phase's READ SET (every bound cell - read is granted by default).
// A STATELESS reading (an undefined state) short-circuits to an EMPTY view
// (silence-is-not-fault, mirroring the disclosure's depth-0 form): every
// read settles the absent line, every write settles the universal-line
// refusal.
//
// Division of labor per the recorded split: THIS LANE OWNS TYPE HANDLING over
// the CELLS it reaches through the snapshot - every conforming write routes
// through the cell's single validated settle entry and every fault settles AS
// THE TOOL RESULT as readable text (the SDK result carries no error flag, so
// readability IS the failure contract); the per-phase guard owns PERMISSIONS
// pre-execution over the SAME grant listing; the cell owns SHAPE. Out-of-
// grant writes settle the GATE-FAMILY refusal (phase line or universal line)
// composed over the gate's exported renderers - byte-identical to what the
// pre-execution gate settles when it fires first in real wiring.
// The module reads no env/fs/SDK state, mutates nothing but the reached
// cells, and never rejects from execute.
//
// Dependency note: there is NO back-edge to the session host - the graph
// stays acyclic (edges: the SDK seam, the typebox lane, the error home, the
// substrate module, the gate module, and the state's type-only surface).

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { VariableRejectionError } from "../../capability/errors.ts";
import {
  renderVarGatePhaseLine,
  renderVarGateUniversalLine,
} from "../../capability/guards/var-gate.ts";
import type { PhaseVarBinding } from "../../capability/var-cell.ts";
import { listWriteGrants, projectReadSet } from "../../capability/var-cell.ts";
import type { SessionExecutionState } from "../../session-execution-state.ts";

/** Legacy value union mirrored EXACTLY (documented v1 limit: array
 * elements are string-restricted at this lane; object properties stay
 * open - the TS lane carries mixed arrays without that limit). */
const SET_VAR_VALUE_SCHEMA = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
  Type.Array(Type.String()),
  Type.Object({}),
]);

/** THE factory: builds a fresh array of the three definition instances in
 * the fixed order setVar, getVar, listVars over the GIVEN state reference.
 * The identity defineTool seam keeps each instance assignable to bare
 * ToolDefinition consumption sites while preserving the concrete
 * generics downstream. */
export function createVarTools(
  state: SessionExecutionState | undefined,
): ToolDefinition[] {
  const setVar = defineTool({
    name: "setVar",
    label: "Set Session Variable",
    description:
      "Set a variable during the active phase by name alone. The write settles against the active phase's write-grant bindings and the variable's own declaration; a name outside the grants settles a readable refusal mid-turn. Values arrive as JSON and are checked against the declaration before storage; the confirmation echoes the stored value.",
    parameters: Type.Object({
      name: Type.String({ description: "Variable name to set" }),
      value: SET_VAR_VALUE_SCHEMA,
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        // Late resolution: the moment's world comes from a FRESH snapshot
        // (undefined state degrades to the empty view - silence-is-not-
        // fault). Adjudication rides the gate's own write-grant projection.
        const snapshot = state?.snapshot();
        const phase = snapshot === undefined ? null : snapshot.phase;
        const bindings = phase === null ? [] : phase.vars;
        // Adjudication rides the gate's own write-grant projection (it runs
        // the duplicate first-check FIRST and yields the names of the
        // write === true entries in BINDING ORDER).
        const grants = listWriteGrants(bindings);
        const granted = bindings.find(
          (binding: PhaseVarBinding) =>
            binding.write === true && binding.cell.name === params.name,
        );
        if (granted === undefined) {
          // OUT-OF-GRANT OR UNRESOLVED (incl. null phase / no write
          // grants): settle MID-TURN as the GATE-FAMILY refusal - the
          // phase line naming the attempted variable + the moment's
          // write-grant listing, or the universal line - composed from the
          // gate's exported renderers (ONE voice across both channels).
          const line =
            phase === null || grants.length === 0
              ? renderVarGateUniversalLine(params.name)
              : renderVarGatePhaseLine(params.name, phase.id, grants);
          return settleText(new VariableRejectionError([line]).message);
        }
        // GRANTED HIT: route into the cell's single validated settle entry
        // behind the carried containment: the cell's rejection voice
        // (coercion reject / spec defect / spec fault lines) composes
        // VERBATIM into the result.
        granted.cell.set(params.value);
        // Success echoes the SETTLED STORED value (cell read-back; spec
        // lanes hold the parse output), never the raw input.
        return settleText(renderSuccessLine(params.name, granted.cell.read()));
      } catch (err) {
        // Every lane resolves: containment mirrors the legacy idiom.
        return settleText(err instanceof Error ? err.message : String(err));
      }
    },
  });

  const getVar = defineTool({
    name: "getVar",
    label: "Get Session Variable",
    description:
      "Read the current value of a variable bound to the active phase. Every bound variable is readable by default; names outside the active phase report undefined. Strings come back bare; all other values come back as compact JSON.",
    parameters: Type.Object({
      name: Type.String({ description: "Variable name to look up" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // View-scoped safe read over the FRESH snapshot's read set (ALL bound
      // cells - default-read grant); out-of-view AND unset ALIKE report
      // the absent line (strict undefined test; the cell can never hold
      // undefined itself except the flag-authority corner, which reads as
      // undefined and therefore reports absent).
      const snapshot = state?.snapshot();
      const phase = snapshot === undefined ? null : snapshot.phase;
      const readSet = phase === null ? null : projectReadSet(phase.vars);
      const cell = readSet === null ? undefined : readSet.get(params.name);
      const value = cell === undefined ? undefined : cell.read();
      if (value === undefined) {
        return settleText(renderAbsentLine(params.name));
      }
      // Mirrored rendering split: strings BARE, everything else compact
      // JSON (a stored null spells null).
      return settleText(
        typeof value === "string" ? value : JSON.stringify(value),
      );
    },
  });

  const listVars = defineTool({
    name: "listVars",
    label: "List Session Variables",
    description:
      "List the variables of the active phase as formatted JSON: the 'variables' member holds every bound-and-set variable (binding order) with its current value, and the 'types' member lists every bound variable with its derived display name (binding order). A bound-but-unset variable appears only under 'types'.",
    parameters: Type.Object({}),
    async execute() {
      // View-scoped document members over the FRESH snapshot's read set:
      // membership under 'variables' by the presence FLAG (not value
      // identity - a spec cell parsed to undefined is PRESENT yet drops
      // out of the pretty-print mechanically, legacy-parallel); 'types'
      // renders every bound cell's derived display (literal self or spec
      // label). An empty or staleless window yields both members empty.
      const snapshot = state?.snapshot();
      const phase = snapshot === undefined ? null : snapshot.phase;
      const readSet = phase === null ? null : projectReadSet(phase.vars);
      const variables: Record<string, unknown> = {};
      const types: Record<string, string> = {};
      for (const [name, cell] of readSet ?? new Map()) {
        types[name] = cell.displayName;
        if (!cell.isEmpty()) {
          variables[name] = cell.read();
        }
      }
      const document = { variables, types };
      return settleText(JSON.stringify(document, null, 2));
    },
  });

  return [setVar, getVar, listVars];
}

/** THE pinned result shape on every lane (success AND failure): one text
 * block plus the empty details bag. Readability is the whole failure
 * contract - the SDK result carries no error flag. */
interface SettledTextResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
}

function settleText(text: string): SettledTextResult {
  return { content: [{ type: "text", text }], details: {} };
}

// ---------------------------------------------------------------------------
// Module-owned line shapes - SOLE byte owners (the gate module owns the
// permission-family lines, imported above; the cell owns the settle faults).
// U+2014 arrives escaped per the house discipline.
// ---------------------------------------------------------------------------

/** ONE success line echoing the SETTLED STORED conversion result (never
 * the raw input) - compact JSON spelling of the settled value. */
function renderSuccessLine(name: string, stored: unknown): string {
  return `variable '${name}' set to ${JSON.stringify(stored)}.`;
}

/** ONE absent-value line (the strictly-undefined read outcome). */
function renderAbsentLine(name: string): string {
  return `variable '${name}' is undefined.`;
}
