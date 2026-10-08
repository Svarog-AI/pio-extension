// THE model-side access channel over the session variable store: one small
// factory mirroring the tools/bash/ layout - it receives the session's
// store BY REFERENCE and returns the three legacy-named tool definitions
// (setVar / getVar / listVars) registered ONCE on the host's UNCONDITIONAL
// customTools slot alongside the fenced bash entry. The division of labor
// per the owner's recorded split: THIS LANE OWNS TYPE HANDLING - every
// write routes through the store's single validated entry point (declare-
// then-set doctrine; claimed type must agree with the declaration), and
// every fault settles AS THE TOOL RESULT as readable text (the SDK result
// carries no error flag, so readability IS the failure contract); the
// per-phase guard owns PERMISSIONS pre-execution; the store owns SHAPE.
// The module reads no env/fs/SDK state, consults no snapshot/guard
// machinery, mutates nothing but (through the entry point) the given
// store, and never rejects from execute.
//
// Runtime graph note: the edge back to pio-session.ts is TYPE-ONLY - it
// erases under type stripping, keeping the runtime dependency acyclic
// (value direction runs host -> trio only).

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { VariableRejectionError } from "../../capability/errors.ts";
import type {
  SessionVariableStore,
  VarType,
} from "../../capability/pio-session.ts";

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
 * the fixed order setVar, getVar, listVars over the GIVEN store reference.
 * The identity defineTool seam keeps each instance assignable to bare
 * ToolDefinition consumption sites while preserving the concrete
 * generics downstream. */
export function createVarTools(store: SessionVariableStore): ToolDefinition[] {
  const setVar = defineTool({
    name: "setVar",
    label: "Set Session Variable",
    description:
      "Set a session variable. The variable MUST have been declared by the running capability first; the claimed type MUST match the declaration (mismatches are rejected readably). Values arrive as JSON and are coerced to the declared type before storage; the confirmation echoes the stored (converted) value.",
    parameters: Type.Object({
      name: Type.String({ description: "Variable name to set" }),
      type: Type.Union(
        [
          Type.Literal("string"),
          Type.Literal("number"),
          Type.Literal("boolean"),
          Type.Literal("array"),
          Type.Literal("object"),
          Type.Literal("null"),
        ],
        {
          description:
            "Declared type of the value (must match the capability's declaration)",
        },
      ),
      value: SET_VAR_VALUE_SCHEMA,
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        // ONE registry query per call. Absent name: skip the claim check
        // entirely (no type exists to compare) and route straight to the
        // entry point - the store's undeclared-write fault resolves as the
        // failed result verbatim (its bytes stay owned by the store).
        const declarations = store.declarations();
        if (
          params.name in declarations &&
          declarations[params.name] !== params.type
        ) {
          // Present name, claimed type disagrees: settle the module-owned
          // line WITHOUT touching the store (type-consistency adjudication
          // - NOT a permission re-check; permissions remain the guard's
          // exclusive pre-execution domain).
          return settleText(
            composeRejection(
              renderClaimMismatchLine(
                params.name,
                declarations[params.name],
                params.type,
              ),
            ),
          );
        }
        store.set(params.name, params.value);
        // Success echoes the STORED conversion result (safe read-back),
        // never the raw input.
        const stored = store.get(params.name);
        return settleText(renderSuccessLine(params.name, stored));
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
      "Read the current value of a session variable. Reads are unrestricted: every stored variable is readable regardless of the active phase. Strings come back bare; all other values come back as compact JSON. An absent or unset variable reports undefined.",
    parameters: Type.Object({
      name: Type.String({ description: "Variable name to look up" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Safe channel: reads are unrestricted (no guard handler exists for
      // reads; the body never consults permissions) and never throws.
      const value = store.get(params.name);
      if (value === undefined) {
        // Strictly the undefined test - the store can never hold
        // undefined itself.
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
      "List all session variables as formatted JSON: the 'variables' member holds every STORED variable (insertion order) with its current value, and the 'types' member lists EVERY declared variable with its declared base type (declaration order). A declared-but-unset variable appears only under 'types'.",
    parameters: Type.Object({}),
    async execute() {
      // Public query surfaces only: stored names via list() (insertion
      // order) with safe per-name reads; the full declaration table via
      // declarations() (declaration order). Declared-but-unset names stay
      // out of 'variables' - absence is the unset signal.
      const variables: Record<string, unknown> = {};
      for (const name of store.list()) {
        variables[name] = store.get(name);
      }
      const document = { variables, types: store.declarations() };
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
// Module-owned line shapes - SOLE byte owners (the store owns every OTHER
// variable-concern line). U+2014 arrives escaped per the house discipline.
// ---------------------------------------------------------------------------

/** ONE claim-mismatch line: names the attempted variable, the DECLARED
 * type (registry authority), and the DISAGREEING claimed type. Composed
 * through the family below for delivery. */
function renderClaimMismatchLine(
  name: string,
  declared: VarType,
  claimed: string,
): string {
  return `variable '${name}' is declared as type '${declared}' \u2014 claimed type '${claimed}' does not match the declaration`;
}

/** Family-composition helper (same inert-instance pattern as the gate
 * channel): read for its message bytes, never thrown. */
function composeRejection(line: string): string {
  return new VariableRejectionError([line]).message;
}

/** ONE success line echoing the STORED conversion result (never the raw
 * input) - compact JSON spelling of the settled value. */
function renderSuccessLine(name: string, stored: unknown): string {
  return `variable '${name}' set to ${JSON.stringify(stored)}.`;
}

/** ONE absent-value line (the strictly-undefined read outcome). */
function renderAbsentLine(name: string): string {
  return `variable '${name}' is undefined.`;
}
