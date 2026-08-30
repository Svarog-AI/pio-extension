/**
 * Session variable store for pio sub-sessions.
 *
 * Two-layer variable system:
 * - Read-only layer: session params frozen at construction time
 * - Writable layer: runtime variables with explicit declared types
 *
 * Supports pre-declaration, type enforcement, and template interpolation.
 *
 * Also exports agent-facing tools (setVar, getVar, listVars) and
 * setupSessionVariables() for registration.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getState } from "./session-state";

// ---------------------------------------------------------------------------
// SessionVariableStore class
// ---------------------------------------------------------------------------

export class SessionVariableStore {
  private static readonly PLACEHOLDER_REGEX =
    /\$\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g;

  private readonly _params: Readonly<Record<string, unknown>>;
  private readonly _writable: Map<string, { value: unknown; type: string }>;
  private readonly _declarations: Map<string, string>;

  constructor(params: Record<string, unknown>) {
    this._params = params;
    this._writable = new Map();
    this._declarations = new Map();
  }

  declare(name: string, type: string): void {
    // Read-only protection — params cannot be declared as writable vars
    if (name in this._params) {
      throw new Error(
        `Cannot declare variable '${name}': it is a read-only session parameter`,
      );
    }

    if (this._declarations.has(name)) {
      const existing = this._declarations.get(name);
      if (existing !== type) {
        throw new Error(
          `Type mismatch for variable '${name}': expected '${existing}', got '${type}'`,
        );
      }
      // Idempotent — same name and type is a no-op
      return;
    }
    this._declarations.set(name, type);
  }

  set(name: string, type: string, value: unknown): void {
    // Read-only protection — params cannot be modified via set()
    if (name in this._params) {
      throw new Error(
        `Cannot set variable '${name}': it is a read-only session parameter`,
      );
    }

    // Type enforcement — check against pre-declared type
    if (this._declarations.has(name)) {
      const declaredType = this._declarations.get(name);
      if (declaredType !== type) {
        throw new Error(
          `Type mismatch for variable '${name}': expected '${declaredType}', got '${type}'`,
        );
      }
    }

    // Type enforcement — check against existing stored type
    const existingWritable = this._writable.get(name);
    if (existingWritable !== undefined && existingWritable.type !== type) {
      throw new Error(
        `Type mismatch for variable '${name}': expected '${existingWritable.type}', got '${type}'`,
      );
    }

    // Value interpolation for strings
    const resolved = this._interpolateValue(value);

    this._writable.set(name, { value: resolved, type });
  }

  get(name: string): unknown | undefined {
    if (this._writable.has(name)) {
      return this._writable.get(name)?.value;
    }
    if (name in this._params) {
      return this._params[name];
    }
    return undefined;
  }

  getAll(): Record<string, unknown> {
    const result = { ...this._params };
    for (const [name, entry] of this._writable) {
      result[name] = entry.value;
    }
    return result;
  }

  isDefined(name: string): boolean {
    return this._writable.has(name);
  }

  interpolate(template: string): string {
    return this._resolvePlaceholders(template, this.getAll());
  }

  toSerializableVars(): { [name: string]: { value: unknown; type: string } } {
    const result: { [name: string]: { value: unknown; type: string } } = {};
    for (const [name, entry] of this._writable) {
      result[name] = { value: entry.value, type: entry.type };
    }
    return result;
  }

  private _interpolateValue(value: unknown): unknown {
    if (typeof value !== "string") {
      return value;
    }
    return this._resolvePlaceholders(value, this.getAll());
  }

  private _resolvePlaceholders(
    template: string,
    vars: Record<string, unknown>,
  ): string {
    return template.replace(
      SessionVariableStore.PLACEHOLDER_REGEX,
      (_match, varName) => {
        if (varName in vars) {
          return String(vars[varName]);
        }
        return _match; // Pass through unchanged
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Value coercion — converts tool parameter values to match declared types
// ---------------------------------------------------------------------------

export function coerceValue(value: unknown, declaredType: string): unknown {
  switch (declaredType) {
    case "boolean": {
      if (
        value === true ||
        value === "true" ||
        value === "1" ||
        value === "yes"
      ) {
        return true;
      }
      return false;
    }
    case "number": {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Cannot coerce '${String(value)}' to number`);
      }
      return num;
    }
    case "string": {
      return typeof value === "string" ? value : String(value);
    }
    case "array": {
      if (Array.isArray(value)) return value;
      // Structured values arrive from the setVar tool as JSON-encoded strings
      // (the tool's `value` param is a Type.Union including Type.String()).
      // Parse and accept iff the result is actually an array.
      if (typeof value === "string") {
        try {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // malformed JSON — fall through to throw
        }
      }
      throw new Error(`Cannot coerce '${typeof value}' to array`);
    }
    case "object": {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return value;
      }
      // Same JSON-string transport as the array case — parse and accept iff
      // the result is a non-array object.
      if (typeof value === "string") {
        try {
          const parsed: unknown = JSON.parse(value);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            return parsed;
          }
        } catch {
          // malformed JSON — fall through to throw
        }
      }
      throw new Error(`Cannot coerce '${typeof value}' to object`);
    }
    case "null": {
      if (value === null) return null;
      throw new Error(`Cannot coerce '${typeof value}' to null`);
    }
    default:
      throw new Error(`Unknown declared type: '${declaredType}'`);
  }
}

// ---------------------------------------------------------------------------
// Agent-facing tools: setVar, getVar, listVars
// ---------------------------------------------------------------------------

export const setVarTool = defineTool({
  name: "setVar",
  label: "Set Session Variable",
  description:
    "Set a writable session variable during a variable-defining phase. Use this to store values determined by the agent that will be used in later phases.",
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
          "Declared type of the value (must match PhaseVariable declaration)",
      },
    ),
    value: Type.Union(
      [
        Type.String(),
        Type.Number(),
        Type.Boolean(),
        Type.Null(),
        Type.Array(Type.String()),
        Type.Object({}),
      ],
      { description: "The value to store" },
    ),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1. Session active check
    if (!state.isActive) {
      return {
        content: [
          {
            type: "text",
            text: "setVar is only available inside a pio session.",
          },
        ],
        details: {},
      };
    }

    // 2. Phase kind check
    const currentPhase = state.phaseManager?.getPhase(state.currentPhaseId);
    if (currentPhase?.kind !== "variable-definition") {
      const phaseInfo = currentPhase
        ? `"${state.currentPhaseId}" (${currentPhase.title})`
        : `"${state.currentPhaseId}"`;
      return {
        content: [
          {
            type: "text",
            text: `setVar can only be used during variable-defining phases. Current phase: ${phaseInfo}.`,
          },
        ],
        details: {},
      };
    }

    // 3. Store check
    if (!state.store) {
      return {
        content: [{ type: "text", text: "Variable store not initialized." }],
        details: {},
      };
    }

    // 3b. Coerce value to match declared type
    let coercedValue: unknown;
    try {
      coercedValue = coerceValue(params.value, params.type);
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        details: {},
      };
    }

    // 4. Set the variable
    try {
      state.store.set(params.name, params.type, coercedValue);
      return {
        content: [
          {
            type: "text",
            text: `Variable '${params.name}' set to ${JSON.stringify(params.value)}.`,
          },
        ],
        details: {},
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        details: {},
      };
    }
  },
});

export const appendVarTool = defineTool({
  name: "appendVar",
  label: "Append to Session Variable",
  description:
    "Append one or more items to an existing array session variable during a variable-defining phase. Use this to accumulate values into an array variable (e.g. a growing list of discovered questions) instead of replacing it wholesale with setVar. Pass a single item or an array of items to append. If the variable has not been set yet, it is initialized as an array containing the appended item(s).",
  parameters: Type.Object({
    name: Type.String({
      description: "Variable name to append to (must be an array variable)",
    }),
    value: Type.Union(
      [
        Type.String(),
        Type.Number(),
        Type.Boolean(),
        Type.Null(),
        Type.Array(Type.String()),
      ],
      {
        description:
          "The item(s) to append — a single scalar or an array of items",
      },
    ),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1. Session active check
    if (!state.isActive) {
      return {
        content: [
          {
            type: "text",
            text: "appendVar is only available inside a pio session.",
          },
        ],
        details: {},
      };
    }

    // 2. Phase kind check
    const currentPhase = state.phaseManager?.getPhase(state.currentPhaseId);
    if (currentPhase?.kind !== "variable-definition") {
      const phaseInfo = currentPhase
        ? `"${state.currentPhaseId}" (${currentPhase.title})`
        : `"${state.currentPhaseId}"`;
      return {
        content: [
          {
            type: "text",
            text: `appendVar can only be used during variable-defining phases. Current phase: ${phaseInfo}.`,
          },
        ],
        details: {},
      };
    }

    // 3. Store check
    if (!state.store) {
      return {
        content: [{ type: "text", text: "Variable store not initialized." }],
        details: {},
      };
    }

    // 4. Append — normalize to a list of items; initialize absent vars to [].
    const items = Array.isArray(params.value) ? params.value : [params.value];
    const current = state.store.get(params.name);
    if (current !== undefined && !Array.isArray(current)) {
      return {
        content: [
          {
            type: "text",
            text: `Cannot append to variable '${params.name}': it is not an array variable.`,
          },
        ],
        details: {},
      };
    }
    const base = Array.isArray(current) ? current : [];
    try {
      state.store.set(params.name, "array", [...base, ...items]);
      return {
        content: [
          {
            type: "text",
            text: `Variable '${params.name}' appended; now has ${
              base.length + items.length
            } items.`,
          },
        ],
        details: {},
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        details: {},
      };
    }
  },
});

export const getVarTool = defineTool({
  name: "getVar",
  label: "Get Session Variable",
  description:
    "Retrieve the current value of a session variable. Returns the value of writable variables or read-only session parameters.",
  parameters: Type.Object({
    name: Type.String({ description: "Variable name to look up" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1. Session active check
    if (!state.isActive) {
      return {
        content: [
          {
            type: "text",
            text: "getVar is only available inside a pio session.",
          },
        ],
        details: {},
      };
    }

    // 2. Store check
    if (!state.store) {
      return {
        content: [{ type: "text", text: "Variable store not initialized." }],
        details: {},
      };
    }

    // 3. Get the variable
    const value = state.store.get(params.name);
    if (value === undefined) {
      return {
        content: [
          { type: "text", text: `Variable '${params.name}' is undefined.` },
        ],
        details: {},
      };
    }
    return {
      content: [
        {
          type: "text",
          text: typeof value === "string" ? value : JSON.stringify(value),
        },
      ],
      details: {},
    };
  },
});

export const listVarsTool = defineTool({
  name: "listVars",
  label: "List Session Variables",
  description:
    "List all session variables (params + writable vars) and their current values as formatted JSON.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1. Session active check
    if (!state.isActive) {
      return {
        content: [
          {
            type: "text",
            text: "listVars is only available inside a pio session.",
          },
        ],
        details: {},
      };
    }

    // 2. Store check
    if (!state.store) {
      return {
        content: [{ type: "text", text: "Variable store not initialized." }],
        details: {},
      };
    }

    // 3. List all variables
    const snapshot = state.store.getAll();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup — registers all session variable tools
// ---------------------------------------------------------------------------

export function setupSessionVariables(pi: ExtensionAPI): void {
  pi.registerTool(setVarTool);
  pi.registerTool(appendVarTool);
  pi.registerTool(getVarTool);
  pi.registerTool(listVarsTool);
}
