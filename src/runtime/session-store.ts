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
import { getState, type PioSessionState } from "./session-state";

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
    // Declared-but-unset vars resolve to a type-appropriate empty default so
    // consumers (e.g. code phases) can read an array/string/number safely
    // without a wrapper helper. Truly unknown names still return undefined.
    const declaredType = this._declarations.get(name);
    if (declaredType !== undefined) {
      return emptyDefaultOf(declaredType);
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
// Type-appropriate empty defaults — returned by get() for declared-but-unset
// variables, so consumers get a usable value instead of undefined.
// ---------------------------------------------------------------------------

/**
 * Empty value for a declared type, returned by `get()` for declared-but-unset
 * vars. Unknown types fall back to `undefined` (no default known).
 */
export function emptyDefaultOf(type: string): unknown {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
    default:
      return undefined;
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
// Shared collection helpers — gating, value transport, path navigation
// ---------------------------------------------------------------------------

/**
 * Union of JSON values a collection tool can store as an element (object/
 * array values arrive as native deserialized values from the tool framework).
 */
const collectionValueUnion = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
  Type.Object({}),
  Type.Array(Type.Any()),
]);

/**
 * Shared gating for the session-variable tools — mirrors `setVar` exactly:
 * the tool is usable only when the session is active and the current phase's
 * kind is `variable-definition`. Returns an error text, or `null` to proceed.
 */
function gatingErrorText(
  toolName: string,
  state: PioSessionState,
): string | null {
  if (!state.isActive) {
    return `${toolName} is only available inside a pio session.`;
  }
  const currentPhase = state.phaseManager?.getPhase(state.currentPhaseId);
  if (currentPhase?.kind !== "variable-definition") {
    const phaseInfo = currentPhase
      ? `"${state.currentPhaseId}" (${currentPhase.title})`
      : `"${state.currentPhaseId}"`;
    return `${toolName} can only be used during variable-defining phases. Current phase: ${phaseInfo}.`;
  }
  if (!state.store) {
    return "Variable store not initialized.";
  }
  return null;
}

/** Build an error text result. */
function errorResult(text: string): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
} {
  return { content: [{ type: "text", text }], details: {} };
}

/** A single path segment — an array index (number) or an object key (string). */
type PathSegment = number | string;

/**
 * Parse a minimal dot/bracket path into segments. An integer segment addresses
 * an array index; any other segment addresses an object key. No general
 * expression language. Rejects malformed paths and empty segments.
 */
function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let rest = path;
  const firstSeg = /^(?:\[(\d+)\]|(\d+)|([a-zA-Z_$][a-zA-Z0-9_$]*))/;
  const first = firstSeg.exec(rest);
  if (!first) {
    throw new Error(
      `Invalid path '${path}': unexpected segment near '${rest}'`,
    );
  }
  if (first[1] !== undefined) segments.push(parseInt(first[1], 10));
  else if (first[2] !== undefined) segments.push(parseInt(first[2], 10));
  else segments.push(first[3]);
  rest = rest.slice(first[0].length);

  while (rest.length > 0) {
    const seg = /^(?:\[(\d+)\]|\.(\d+)|\.([a-zA-Z_$][a-zA-Z0-9_$]*))/.exec(
      rest,
    );
    if (!seg) {
      throw new Error(
        `Invalid path '${path}': unexpected segment near '${rest}'`,
      );
    }
    if (seg[1] !== undefined) segments.push(parseInt(seg[1], 10));
    else if (seg[2] !== undefined) segments.push(parseInt(seg[2], 10));
    else segments.push(seg[3]);
    rest = rest.slice(seg[0].length);
  }
  return segments;
}

/**
 * Deep-clone the root container, navigate into it along the segments, set the
 * leaf value, and return the new container. Missing/un-navigable intermediate
 * segments throw (no auto-creation). The leaf may be created/overwritten.
 */
function setNestedLeaf(
  root: unknown,
  segments: PathSegment[],
  leafValue: unknown,
): unknown {
  const clone = structuredClone(root);
  let current: unknown = clone;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (typeof seg === "number") {
      // Array index segment.
      if (!Array.isArray(current)) {
        throw new Error(
          `Path segment '${seg}' targets an array index but value is not an array.`,
        );
      }
      if (seg < 0 || seg >= current.length) {
        throw new Error(
          `Index ${seg} out of bounds for array of length ${current.length}.`,
        );
      }
      const arr = current as Array<unknown>;
      if (isLast) {
        arr[seg] = leafValue;
      } else {
        current = arr[seg];
      }
    } else {
      // Object key segment.
      if (
        current === null ||
        typeof current !== "object" ||
        Array.isArray(current)
      ) {
        throw new Error(
          `Path segment '${seg}' targets an object key but value is not an object.`,
        );
      }
      const obj = current as Record<string, unknown>;
      // Own-property check (not `in`, which also matches inherited keys) so a
      // pathological prototype-chain key yields a precise "missing" error.
      if (!isLast && !Object.hasOwn(obj, seg)) {
        throw new Error(
          `Missing object key '${seg}' — cannot auto-create intermediate segments.`,
        );
      }
      if (isLast) {
        obj[seg] = leafValue;
      } else {
        current = obj[seg];
      }
    }
  }
  return clone;
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
    path: Type.Optional(
      Type.String({
        description:
          "Optional dot/bracket path into an array/object variable to set a nested leaf field (e.g. '0.status' or '[0].status'). When omitted, the whole variable is replaced exactly as before.",
      }),
    ),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1-3. Gating (session active + variable-definition phase + store).
    // Mirrors the shared gatingErrorText helper exactly.
    const gateErr = gatingErrorText("setVar", state);
    if (gateErr !== null) return errorResult(gateErr);

    // 3a. Path mode — set a nested leaf field (e.g. tasks[0].status).
    // Reads the current value of `name`, mutates the leaf in place, then
    // writes the updated container back under the container's declared type
    // (NOT `params.type`, which describes the leaf and is used only to coerce
    // the leaf value). This avoids store.set's type-mismatch check firing
    // against the parent variable's declared type.
    if (params.path !== undefined) {
      if (!state.store.isDefined(params.name)) {
        return {
          content: [
            {
              type: "text",
              text: `Variable '${params.name}' is not set.`,
            },
          ],
          details: {},
        };
      }
      const rootContainer = state.store.get(params.name);
      if (
        !Array.isArray(rootContainer) &&
        (rootContainer === null || typeof rootContainer !== "object")
      ) {
        return {
          content: [
            {
              type: "text",
              text: `Variable '${params.name}' is not an array or object; cannot navigate a path into it.`,
            },
          ],
          details: {},
        };
      }
      let segments: PathSegment[];
      try {
        segments = parsePath(params.path);
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
      let leafValue: unknown;
      try {
        leafValue = coerceValue(params.value, params.type);
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
      if (typeof leafValue === "string") {
        leafValue = state.store.interpolate(leafValue);
      }
      const containerType = Array.isArray(rootContainer) ? "array" : "object";
      try {
        const updated = setNestedLeaf(rootContainer, segments, leafValue);
        state.store.set(params.name, containerType, updated);
        return {
          content: [
            {
              type: "text",
              text: `Variable '${params.name}' path '${params.path}' set to ${JSON.stringify(leafValue)}.`,
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

    // 1-3. Gating (session active + variable-definition phase + store).
    // Mirrors the shared gatingErrorText helper exactly.
    const gateErr = gatingErrorText("appendVar", state);
    if (gateErr !== null) return errorResult(gateErr);

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

    // 1. Session active check. getVar is readable in any phase, so it skips
    // the variable-definition phase gate used by the writing tools.
    if (!state.isActive) {
      return errorResult("getVar is only available inside a pio session.");
    }

    // 2. Store check
    if (!state.store) {
      return errorResult("Variable store not initialized.");
    }

    // 3. Get the variable
    const value = state.store.get(params.name);
    if (value === undefined) {
      return errorResult(`Variable '${params.name}' is undefined.`);
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

    // 1. Session active check. listVars is readable in any phase, so it skips
    // the variable-definition phase gate used by the writing tools.
    if (!state.isActive) {
      return errorResult("listVars is only available inside a pio session.");
    }

    // 2. Store check
    if (!state.store) {
      return errorResult("Variable store not initialized.");
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

export const setVarAtTool = defineTool({
  name: "setVarAt",
  label: "Set Array Element",
  description:
    "Replace the element at a given integer index of an array session variable during a variable-defining phase. Use this to set a specific element of an array (e.g. the object at tasks[0]) without replacing the whole array. Does not grow the array — appending is enqueue/appendVar's job.",
  parameters: Type.Object({
    name: Type.String({
      description:
        "Variable name to set an element of (must be an array variable)",
    }),
    index: Type.Number({
      description: "Zero-based integer index of the element to replace",
    }),
    value: collectionValueUnion,
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    // 1-3. Gating (session active + variable-definition phase + store)
    const gateErr = gatingErrorText("setVarAt", state);
    if (gateErr !== null) return errorResult(gateErr);

    // 4. Element-set — must be an already-set array, index in bounds.
    const current = state.store.get(params.name);
    if (current === undefined || !Array.isArray(current)) {
      return errorResult(`Variable '${params.name}' is not an array variable.`);
    }
    if (!Number.isInteger(params.index)) {
      return errorResult(
        `Index for '${params.name}' must be an integer, got ${params.index}.`,
      );
    }
    if (params.index < 0 || params.index >= current.length) {
      return errorResult(
        `Index ${params.index} out of bounds for array '${params.name}' of length ${current.length}.`,
      );
    }

    // Interpolate top-level string values like setVar; store objects/arrays as-is.
    let element = params.value;
    if (typeof element === "string") {
      element = state.store.interpolate(element);
    }
    const updated = [...current];
    updated[params.index] = element;
    try {
      state.store.set(params.name, "array", updated);
      return {
        content: [
          {
            type: "text",
            text: `Variable '${params.name}' element at index ${params.index} set to ${JSON.stringify(element)}.`,
          },
        ],
        details: {},
      };
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
});

export const enqueueTool = defineTool({
  name: "enqueue",
  label: "Enqueue",
  description:
    "Append an item to the back of an array session variable, treating it as a FIFO queue (front = index 0). If the variable is unset it is initialized to an empty array first. Returns the new queue size. Use this to accumulate pending work items for later dequeuing.",
  parameters: Type.Object({
    name: Type.String({
      description: "Variable name to enqueue to (must be an array variable)",
    }),
    value: collectionValueUnion,
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    const gateErr = gatingErrorText("enqueue", state);
    if (gateErr !== null) return errorResult(gateErr);

    const current = state.store.get(params.name);
    if (current !== undefined && !Array.isArray(current)) {
      return errorResult(
        `Cannot enqueue to variable '${params.name}': it is not an array variable.`,
      );
    }
    const base = Array.isArray(current) ? current : [];
    let item = params.value;
    if (typeof item === "string") {
      item = state.store.interpolate(item);
    }
    try {
      state.store.set(params.name, "array", [...base, item]);
      return {
        content: [
          {
            type: "text",
            text: `Variable '${params.name}' enqueued; queue size is ${base.length + 1}.`,
          },
        ],
        details: {},
      };
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
});

export const dequeueTool = defineTool({
  name: "dequeue",
  label: "Dequeue",
  description:
    "Remove and return the front (index-0) element of an array session variable, shifting the remainder left. Treats the array as a FIFO queue. Returns an error if the queue is empty or unset. Use this to consume the next pending work item.",
  parameters: Type.Object({
    name: Type.String({
      description: "Variable name to dequeue from (must be an array variable)",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    const gateErr = gatingErrorText("dequeue", state);
    if (gateErr !== null) return errorResult(gateErr);

    const current = state.store.get(params.name);
    if (current === undefined) {
      return errorResult(`Queue '${params.name}' is empty.`);
    }
    if (!Array.isArray(current)) {
      return errorResult(
        `Cannot dequeue from variable '${params.name}': it is not an array variable.`,
      );
    }
    if (current.length === 0) {
      return errorResult(`Queue '${params.name}' is empty.`);
    }
    const [front, ...rest] = current;
    try {
      state.store.set(params.name, "array", rest);
      const display = typeof front === "string" ? front : JSON.stringify(front);
      return {
        content: [
          {
            type: "text",
            text: `Dequeued '${params.name}': ${display}`,
          },
        ],
        details: {},
      };
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
});

export const peekTool = defineTool({
  name: "peek",
  label: "Peek Queue Front",
  description:
    "Return the front (index-0) element of an array session variable without removing it. Treats the array as a FIFO queue. Returns an error if the queue is empty or unset. Use this to inspect the next pending work item without consuming it.",
  parameters: Type.Object({
    name: Type.String({
      description: "Variable name to peek at (must be an array variable)",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    const gateErr = gatingErrorText("peek", state);
    if (gateErr !== null) return errorResult(gateErr);

    const current = state.store.get(params.name);
    if (current === undefined || !Array.isArray(current)) {
      return errorResult(`Queue '${params.name}' is empty.`);
    }
    if (current.length === 0) {
      return errorResult(`Queue '${params.name}' is empty.`);
    }
    const front = current[0];
    const display = typeof front === "string" ? front : JSON.stringify(front);
    return {
      content: [
        { type: "text", text: `Front of '${params.name}': ${display}` },
      ],
      details: {},
    };
  },
});

export const sizeTool = defineTool({
  name: "size",
  label: "Queue Size",
  description:
    "Return the current length of an array session variable (treating it as a FIFO queue). Returns 0 for an empty or unset queue. Use this to check whether any work items remain.",
  parameters: Type.Object({
    name: Type.String({
      description: "Variable name to measure (must be an array variable)",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const state = getState();

    const gateErr = gatingErrorText("size", state);
    if (gateErr !== null) return errorResult(gateErr);

    const current = state.store.get(params.name);
    const size = Array.isArray(current) ? current.length : 0;
    return {
      content: [{ type: "text", text: `Queue '${params.name}' size: ${size}` }],
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
  pi.registerTool(setVarAtTool);
  pi.registerTool(enqueueTool);
  pi.registerTool(dequeueTool);
  pi.registerTool(peekTool);
  pi.registerTool(sizeTool);
}
