import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhaseManager } from "./phase-manager";
import type { PioSessionState } from "./session-state";
import { __testSetState, getState, resetState } from "./session-state";
import {
  coerceValue,
  getVarTool,
  listVarsTool,
  SessionVariableStore,
  setupSessionVariables,
  setVarTool,
} from "./session-store";

describe("SessionVariableStore", () => {
  let store: SessionVariableStore;

  beforeEach(() => {
    store = new SessionVariableStore({});
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates a store with empty params", () => {
      const s = new SessionVariableStore({});
      expect(s.getAll()).toEqual({});
    });

    it("stores params in read-only layer; get returns param value", () => {
      const s = new SessionVariableStore({ key: "val" });
      expect(s.get("key")).toBe("val");
    });

    it("set on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ key: "val" });
      expect(() => s.set("key", "string", "other")).toThrow(
        "Cannot set variable 'key': it is a read-only session parameter",
      );
    });
  });

  // -----------------------------------------------------------------------
  // declare()
  // -----------------------------------------------------------------------

  describe("declare()", () => {
    it("registers type, allows subsequent matching set, and isDefined is false until set", () => {
      store.declare("foo", "number");
      expect(store.isDefined("foo")).toBe(false);
      store.set("foo", "number", 42);
      expect(store.isDefined("foo")).toBe(true);
      expect(store.get("foo")).toBe(42);
    });

    it("get returns undefined for declared but not set", () => {
      store.declare("foo", "number");
      expect(store.get("foo")).toBe(undefined);
    });

    it("calling declare() twice with same name and type is a no-op (idempotent)", () => {
      store.declare("foo", "number");
      expect(() => store.declare("foo", "number")).not.toThrow();
    });

    it("calling declare() with a different type for the same name throws", () => {
      store.declare("foo", "number");
      expect(() => store.declare("foo", "string")).toThrow(
        /Type mismatch for variable 'foo'/,
      );
    });

    it("declare on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ readOnlyKey: "val" });
      expect(() => s.declare("readOnlyKey", "string")).toThrow(
        "Cannot declare variable 'readOnlyKey': it is a read-only session parameter",
      );
    });
  });

  // -----------------------------------------------------------------------
  // set() — type enforcement
  // -----------------------------------------------------------------------

  describe("set() — type enforcement", () => {
    it("stores value with declared type on first set", () => {
      store.set("x", "string", "hello");
      expect(store.get("x")).toBe("hello");
      expect(store.isDefined("x")).toBe(true);
    });

    it("subsequent set with matching type succeeds and overwrites value", () => {
      store.set("x", "string", "hello");
      store.set("x", "string", "world");
      expect(store.get("x")).toBe("world");
    });

    it("set with mismatched type after prior set throws", () => {
      store.set("x", "string", "hello");
      expect(() => store.set("x", "number", 42)).toThrow(
        /Type mismatch for variable 'x': expected 'string', got 'number'/,
      );
    });

    it("after declare(), set with mismatched type throws", () => {
      store.declare("foo", "number");
      expect(() => store.set("foo", "string", "bad")).toThrow(
        /Type mismatch for variable 'foo': expected 'number', got 'string'/,
      );
    });

    it("after declare(), set with matching type succeeds", () => {
      store.declare("foo", "number");
      store.set("foo", "number", 42);
      expect(store.get("foo")).toBe(42);
    });

    it("set on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ readOnlyKey: "val" });
      expect(() => s.set("readOnlyKey", "string", "other")).toThrow(
        "Cannot set variable 'readOnlyKey': it is a read-only session parameter",
      );
    });

    it("stores and retrieves falsy values (0, false, null) correctly", () => {
      store.set("zero", "number", 0);
      store.set("flag", "boolean", false);
      store.set("nothing", "string", null);
      expect(store.get("zero")).toBe(0);
      expect(store.get("flag")).toBe(false);
      expect(store.get("nothing")).toBe(null);
      expect(store.isDefined("zero")).toBe(true);
      expect(store.isDefined("flag")).toBe(true);
      expect(store.isDefined("nothing")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // set() — interpolation
  // -----------------------------------------------------------------------

  describe("set() — interpolation", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: test description mentions interpolation syntax
    it("resolves ${...} placeholders from writable vars", () => {
      store.set("name", "string", "World");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      store.set("greeting", "string", "Hello, ${name}!");
      expect(store.get("greeting")).toBe("Hello, World!");
    });

    it("interpolation resolves from writable layer (writable takes precedence over params)", () => {
      const s = new SessionVariableStore({ p: "B" });
      s.set("x", "string", "A");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      s.set("msg", "string", "${x} and ${p}");
      expect(s.get("msg")).toBe("A and B");
    });

    it("unresolved placeholders pass through unchanged", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      store.set("msg", "string", "Hi ${unknown}");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.get("msg")).toBe("Hi ${unknown}");
    });

    it("non-string values bypass interpolation", () => {
      store.set("count", "number", 42);
      expect(store.get("count")).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("returns writable value when set", () => {
      store.set("x", "string", "A");
      expect(store.get("x")).toBe("A");
    });

    it("falls back to params when not in writable layer", () => {
      const s = new SessionVariableStore({ y: "B" });
      expect(s.get("y")).toBe("B");
    });

    it("returns undefined for declared-but-unset vars", () => {
      store.declare("foo", "number");
      expect(store.get("foo")).toBe(undefined);
    });

    it("returns undefined for unknown names", () => {
      expect(store.get("nonexistent")).toBe(undefined);
    });
  });

  // -----------------------------------------------------------------------
  // getAll()
  // -----------------------------------------------------------------------

  describe("getAll()", () => {
    it("returns merged snapshot with writable values and params", () => {
      const s = new SessionVariableStore({ p: "param" });
      s.set("w", "string", "writable");
      expect(s.getAll()).toEqual({ p: "param", w: "writable" });
    });

    it("does not include declared-but-unset vars in result", () => {
      store.declare("foo", "number");
      expect(store.getAll()).not.toHaveProperty("foo");
    });

    it("returned object is a shallow copy (mutations don't affect store)", () => {
      store.set("a", "string", "val");
      const snapshot = store.getAll();
      snapshot.a = "mutated";
      expect(store.get("a")).toBe("val");
    });

    it("includes all read-only params when no writable vars exist", () => {
      const s = new SessionVariableStore({ a: 1, b: "two" });
      expect(s.getAll()).toEqual({ a: 1, b: "two" });
    });
  });

  // -----------------------------------------------------------------------
  // isDefined()
  // -----------------------------------------------------------------------

  describe("isDefined()", () => {
    it("returns true after set()", () => {
      store.set("x", "string", "val");
      expect(store.isDefined("x")).toBe(true);
    });

    it("returns false for declared-but-unset vars", () => {
      store.declare("x", "number");
      expect(store.isDefined("x")).toBe(false);
    });

    it("returns false for read-only params", () => {
      const s = new SessionVariableStore({ param: "val" });
      expect(s.isDefined("param")).toBe(false);
    });

    it("returns false for unknown names", () => {
      expect(store.isDefined("unknown")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // toSerializableVars()
  // -----------------------------------------------------------------------

  describe("toSerializableVars()", () => {
    it("returns a plain object mapping variable names to { value, type } pairs", () => {
      store.set("count", "number", 42);
      store.set("name", "string", "hello");
      expect(store.toSerializableVars()).toEqual({
        count: { value: 42, type: "number" },
        name: { value: "hello", type: "string" },
      });
    });

    it("returns an empty object when no writable vars exist", () => {
      expect(store.toSerializableVars()).toEqual({});
    });

    it("does not include read-only params", () => {
      const s = new SessionVariableStore({ param: "val" });
      s.set("w", "string", "writable");
      const result = s.toSerializableVars();
      expect(result).toHaveProperty("w");
      expect(result).not.toHaveProperty("param");
    });

    it("does not include declared-but-unset vars", () => {
      store.declare("foo", "number");
      expect(store.toSerializableVars()).toEqual({});
    });

    it("preserves type information for different types", () => {
      store.set("a", "boolean", true);
      store.set("b", "array", [1, 2]);
      store.set("c", "null", null);
      const result = store.toSerializableVars();
      expect(result.a.type).toBe("boolean");
      expect(result.b.type).toBe("array");
      expect(result.c.type).toBe("null");
    });
  });

  // -----------------------------------------------------------------------
  // interpolate()
  // -----------------------------------------------------------------------

  describe("interpolate()", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: test description mentions interpolation syntax
    it("resolves ${name} placeholders using merged vars", () => {
      store.set("name", "string", "World");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("Hello, ${name}!")).toBe("Hello, World!");
    });

    it("resolves multiple placeholders in one string", () => {
      store.set("a", "string", "one");
      store.set("b", "string", "two");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("${a} and ${b}")).toBe("one and two");
    });

    it("unresolved placeholders pass through unchanged", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("Hi ${nonExistent}")).toBe("Hi ${nonExistent}");
    });

    it("empty template returns empty string", () => {
      expect(store.interpolate("")).toBe("");
    });

    it("resolves from params layer", () => {
      const s = new SessionVariableStore({ p: "fromParam" });
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(s.interpolate("val=${p}")).toBe("val=fromParam");
    });

    it("writable layer takes precedence over params in interpolation", () => {
      const s = new SessionVariableStore({ p: "param" });
      s.set("x", "string", "writable");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(s.interpolate("${x} and ${p}")).toBe("writable and param");
    });
  });
});

// ---------------------------------------------------------------------------
// coerceValue
// ---------------------------------------------------------------------------

describe("coerceValue", () => {
  // --- boolean ---

  describe("boolean", () => {
    it("returns true for boolean true", () => {
      expect(coerceValue(true, "boolean")).toBe(true);
    });

    it("returns true for string 'true'", () => {
      expect(coerceValue("true", "boolean")).toBe(true);
    });

    it("returns true for string '1'", () => {
      expect(coerceValue("1", "boolean")).toBe(true);
    });

    it("returns true for string 'yes'", () => {
      expect(coerceValue("yes", "boolean")).toBe(true);
    });

    it("returns false for boolean false", () => {
      expect(coerceValue(false, "boolean")).toBe(false);
    });

    it("returns false for string 'false'", () => {
      expect(coerceValue("false", "boolean")).toBe(false);
    });

    it("returns false for string '0'", () => {
      expect(coerceValue("0", "boolean")).toBe(false);
    });

    it("returns false for string 'no'", () => {
      expect(coerceValue("no", "boolean")).toBe(false);
    });

    it("returns false for null", () => {
      expect(coerceValue(null, "boolean")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(coerceValue(undefined, "boolean")).toBe(false);
    });

    it("returns false for number 0", () => {
      expect(coerceValue(0, "boolean")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(coerceValue("", "boolean")).toBe(false);
    });

    it("returns false for unrecognized string 'True'", () => {
      expect(coerceValue("True", "boolean")).toBe(false);
    });

    it("returns false for unrecognized string 'maybe'", () => {
      expect(coerceValue("maybe", "boolean")).toBe(false);
    });
  });

  // --- number ---

  describe("number", () => {
    it("converts string '42' to number 42", () => {
      expect(coerceValue("42", "number")).toBe(42);
    });

    it("returns native number unchanged", () => {
      expect(coerceValue(42, "number")).toBe(42);
    });

    it("converts native boolean true to 1", () => {
      expect(coerceValue(true, "number")).toBe(1);
    });

    it("converts native boolean false to 0", () => {
      expect(coerceValue(false, "number")).toBe(0);
    });

    it("throws for non-numeric string 'abc' with message containing input", () => {
      expect(() => coerceValue("abc", "number")).toThrow(
        /Cannot coerce.*abc.*to number/,
      );
    });

    it("throws for string 'true' (NaN) with message containing input", () => {
      expect(() => coerceValue("true", "number")).toThrow(
        /Cannot coerce.*true.*to number/,
      );
    });
  });

  // --- string ---

  describe("string", () => {
    it("converts number 42 to '42'", () => {
      expect(coerceValue(42, "string")).toBe("42");
    });

    it("converts boolean true to 'true'", () => {
      expect(coerceValue(true, "string")).toBe("true");
    });

    it("returns native string unchanged", () => {
      expect(coerceValue("hello", "string")).toBe("hello");
    });
  });

  // --- array ---

  describe("array", () => {
    it("returns array unchanged", () => {
      const arr = [1, 2];
      expect(coerceValue(arr, "array")).toBe(arr);
    });

    it("throws for non-array input with type info", () => {
      expect(() => coerceValue("a", "array")).toThrow(
        /Cannot coerce.*string.*to array/,
      );
    });

    it("parses a JSON-encoded array string into a real array", () => {
      expect(coerceValue('["a","b"]', "array")).toEqual(["a", "b"]);
      expect(coerceValue("[]", "array")).toEqual([]);
    });

    it("throws when a JSON string does not decode to an array", () => {
      // JSON object decodes but is not an array
      expect(() => coerceValue('{"a":1}', "array")).toThrow(
        /Cannot coerce.*string.*to array/,
      );
      // JSON string decodes but is not an array
      expect(() => coerceValue('"just a string"', "array")).toThrow(
        /Cannot coerce.*string.*to array/,
      );
      // malformed JSON string
      expect(() => coerceValue("not json", "array")).toThrow(
        /Cannot coerce.*string.*to array/,
      );
    });
  });

  // --- object ---

  describe("object", () => {
    it("returns plain object unchanged", () => {
      const obj = { a: 1 };
      expect(coerceValue(obj, "object")).toBe(obj);
    });

    it("throws for string input", () => {
      expect(() => coerceValue("x", "object")).toThrow(
        /Cannot coerce.*string.*to object/,
      );
    });

    it("parses a JSON-encoded object string into a plain object", () => {
      expect(coerceValue('{"a":1}', "object")).toEqual({ a: 1 });
    });

    it("throws when a JSON string does not decode to a plain object", () => {
      // JSON array decodes but is not a plain object
      expect(() => coerceValue('["a"]', "object")).toThrow(
        /Cannot coerce.*string.*to object/,
      );
      // JSON string decodes but is not an object
      expect(() => coerceValue('"not an object"', "object")).toThrow(
        /Cannot coerce.*string.*to object/,
      );
      // JSON scalar decodes but is not an object
      expect(() => coerceValue("5", "object")).toThrow(
        /Cannot coerce.*string.*to object/,
      );
      // malformed JSON string
      expect(() => coerceValue("not json", "object")).toThrow(
        /Cannot coerce.*string.*to object/,
      );
    });

    it("throws for null input", () => {
      expect(() => coerceValue(null, "object")).toThrow(
        /Cannot coerce.*object.*to object/,
      );
    });

    it("throws for array input", () => {
      expect(() => coerceValue([1], "object")).toThrow(
        /Cannot coerce.*object.*to object/,
      );
    });
  });

  // --- null ---

  describe("null", () => {
    it("returns null unchanged", () => {
      expect(coerceValue(null, "null")).toBe(null);
    });

    it("throws for string 'null'", () => {
      expect(() => coerceValue("null", "null")).toThrow(
        /Cannot coerce.*string.*to null/,
      );
    });
  });

  // --- unknown type ---

  describe("unknown type", () => {
    it("throws with message containing the unknown type name", () => {
      expect(() => coerceValue("x", "unknownType")).toThrow(
        /Unknown declared type: 'unknownType'/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Session variable tools (setVar, getVar, listVars)
// ---------------------------------------------------------------------------

describe("session variable tools", () => {
  beforeEach(() => {
    resetState();
  });

  // Helper: merge partial updates into a full PioSessionState
  function setPartialState(partial: Partial<PioSessionState>): void {
    // When phasesList is provided, also set phaseManager and currentPhaseId
    // so that the setVar tool's phase kind check works correctly
    const extras: Partial<PioSessionState> = {};
    if (partial.phasesList && !partial.phaseManager) {
      extras.phaseManager = new PhaseManager(partial.phasesList);
      const cp = 1;
      extras.currentPhaseId = partial.phasesList[cp - 1]?.id ?? "";
    }
    __testSetState({ ...getState(), ...partial, ...extras } as PioSessionState);
  }

  // Helper: extract text from tool result content
  function resultText(result: { content: Array<{ type: string }> }): string {
    return (result.content[0] as unknown as { text: string }).text;
  }

  // -----------------------------------------------------------------------
  // Tool definitions
  // -----------------------------------------------------------------------

  describe("tool definitions", () => {
    it("setVarTool is defined with name, label, description, parameters, and execute", () => {
      expect(setVarTool).toBeDefined();
      expect(setVarTool.name).toBe("setVar");
      expect(setVarTool.label).toBeDefined();
      expect(typeof setVarTool.label).toBe("string");
      expect(setVarTool.description).toBeDefined();
      expect(typeof setVarTool.description).toBe("string");
      expect(setVarTool.parameters).toBeDefined();
      expect(typeof setVarTool.execute).toBe("function");
    });

    it("getVarTool is defined with name, label, description, parameters, and execute", () => {
      expect(getVarTool).toBeDefined();
      expect(getVarTool.name).toBe("getVar");
      expect(getVarTool.label).toBeDefined();
      expect(typeof getVarTool.label).toBe("string");
      expect(getVarTool.description).toBeDefined();
      expect(typeof getVarTool.description).toBe("string");
      expect(getVarTool.parameters).toBeDefined();
      expect(typeof getVarTool.execute).toBe("function");
    });

    it("listVarsTool is defined with name, label, description, parameters, and execute", () => {
      expect(listVarsTool).toBeDefined();
      expect(listVarsTool.name).toBe("listVars");
      expect(listVarsTool.label).toBeDefined();
      expect(typeof listVarsTool.label).toBe("string");
      expect(listVarsTool.description).toBeDefined();
      expect(typeof listVarsTool.description).toBe("string");
      expect(listVarsTool.parameters).toBeDefined();
      expect(typeof listVarsTool.execute).toBe("function");
    });
  });

  // -----------------------------------------------------------------------
  // Parameter schemas
  // -----------------------------------------------------------------------

  describe("parameter schemas", () => {
    it("setVar parameters include name (string), type (union of literals), and value (union of JSON types)", () => {
      const params = setVarTool.parameters;
      expect(params.type).toBe("object");
      expect(params.properties.name.type).toBe("string");
      // TypeBox uses anyOf for unions
      expect(params.properties.type.anyOf).toBeDefined();
      expect(Array.isArray(params.properties.type.anyOf)).toBe(true);
      expect(params.properties.value.anyOf).toBeDefined();
      expect(Array.isArray(params.properties.value.anyOf)).toBe(true);
    });

    it("getVar parameters include only name (string)", () => {
      const params = getVarTool.parameters;
      expect(params.type).toBe("object");
      expect(Object.keys(params.properties)).toEqual(["name"]);
      expect(params.properties.name.type).toBe("string");
    });

    it("listVars parameters are an empty object", () => {
      const params = listVarsTool.parameters;
      expect(params.type).toBe("object");
      expect(Object.keys(params.properties)).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // setupSessionVariables
  // -----------------------------------------------------------------------

  describe("setupSessionVariables", () => {
    it("registers exactly 3 tools via pi.registerTool", () => {
      const registeredTools: any[] = [];
      const mockPi = {
        registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      } as unknown as ExtensionAPI;

      setupSessionVariables(mockPi);

      expect(mockPi.registerTool).toHaveBeenCalledTimes(3);
      expect(registeredTools).toContain(setVarTool);
      expect(registeredTools).toContain(getVarTool);
      expect(registeredTools).toContain(listVarsTool);
    });
  });

  // -----------------------------------------------------------------------
  // Session gating (isActive check)
  // -----------------------------------------------------------------------

  describe("session gating", () => {
    it("setVar returns error when isActive is false", async () => {
      setPartialState({ isActive: false, store: null });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "string", value: "hello" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain(
        "only available inside a pio session",
      );
    });

    it("getVar returns error when isActive is false", async () => {
      setPartialState({ isActive: false, store: null });

      const result = await getVarTool.execute(
        "tc-1",
        { name: "x" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain(
        "only available inside a pio session",
      );
    });

    it("listVars returns error when isActive is false", async () => {
      setPartialState({ isActive: false, store: null });

      const result = await listVarsTool.execute(
        "tc-1",
        {},
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain(
        "only available inside a pio session",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Phase gating (setVar only during variable-definition phases)
  // -----------------------------------------------------------------------

  describe("phase gating", () => {
    it("setVar returns error when current phase kind is not variable-definition", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 3,
        phasesList: [
          {
            id: "p1",
            title: "Phase 1",
            instructions: "Do stuff",
            kind: "standard",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "string", value: "hello" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("variable-defining");
    });

    it("setVar proceeds past phase check when current phase kind is variable-definition", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 3,
        phasesList: [
          {
            id: "p1",
            title: "Define Variables",
            instructions: "Set vars",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "string", value: "hello" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // Should have reached the store call and succeeded
      expect(resultText(result)).not.toContain("variable-defining");
      expect(resultText(result)).toContain("x");
    });
  });

  // -----------------------------------------------------------------------
  // Store null safety
  // -----------------------------------------------------------------------

  describe("store null safety", () => {
    it("setVar returns error when store is undefined", async () => {
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store: undefined,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "string", value: "hello" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("Variable store not initialized");
    });

    it("getVar returns error when store is null", async () => {
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [],
        store: null,
      });

      const result = await getVarTool.execute(
        "tc-1",
        { name: "x" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("Variable store not initialized");
    });

    it("listVars returns error when store is undefined", async () => {
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [],
        store: undefined,
      });

      const result = await listVarsTool.execute(
        "tc-1",
        {},
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("Variable store not initialized");
    });
  });

  // -----------------------------------------------------------------------
  // Error conversion (setVar catches store errors)
  // -----------------------------------------------------------------------

  describe("error conversion", () => {
    it("setVar catches store Error for type mismatch and returns user-friendly message", async () => {
      const store = new SessionVariableStore({});
      // Pre-set with a type so next set with different type will throw
      store.set("x", "number", 42);

      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "string", value: "hello" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // Should contain the type mismatch error, not throw
      expect(resultText(result)).toContain("Type mismatch");
    });

    it("setVar catches store Error for param write and returns user-friendly message", async () => {
      const store = new SessionVariableStore({ readOnlyKey: "val" });

      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "readOnlyKey", type: "string", value: "new" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // Should contain the read-only param error, not throw
      expect(resultText(result)).toContain("read-only");
    });
  });

  // -----------------------------------------------------------------------
  // Coercion integration (setVar coerces value before store.set)
  // -----------------------------------------------------------------------

  describe("coercion integration", () => {
    it("setVar coerces string 'true' to boolean true when type is 'boolean'", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "flag", type: "boolean", value: "true" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // Tool should succeed
      expect(resultText(result)).toContain("flag");
      // Store should contain actual boolean true
      expect(store.get("flag")).toBe(true);
    });

    it("setVar coerces string '42' to number 42 when type is 'number'", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "count", type: "number", value: "42" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("count");
      expect(store.get("count")).toBe(42);
    });

    it("setVar returns coercion error message when value cannot be coerced", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "x", type: "number", value: "abc" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("Cannot coerce");
    });

    it("setVar stores an array variable from a JSON-encoded string as a real array", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "new_questions", type: "array", value: '["Q1","Q2"]' },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // Tool should succeed and store the value as a real array
      expect(resultText(result)).toContain("new_questions");
      expect(store.get("new_questions")).toEqual(["Q1", "Q2"]);
    });

    it("setVar stores an object variable from a JSON-encoded string as a real object", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "meta", type: "object", value: '{"a":1}' },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("meta");
      expect(store.get("meta")).toEqual({ a: 1 });
    });

    it("setVar success message references original params.value, not coerced value", async () => {
      const store = new SessionVariableStore({});
      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "i",
            kind: "variable-definition",
          },
        ],
        store,
      });

      const result = await setVarTool.execute(
        "tc-1",
        { name: "flag", type: "boolean", value: "true" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      // The success text should reference the original value "true" (string)
      expect(resultText(result)).toContain('"true"');
    });
  });

  // -----------------------------------------------------------------------
  // Successful getVar and listVars
  // -----------------------------------------------------------------------

  describe("successful operations", () => {
    it("getVar returns the stored value", async () => {
      const store = new SessionVariableStore({});
      store.set("x", "string", "hello");

      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [],
        store,
      });

      const result = await getVarTool.execute(
        "tc-1",
        { name: "x" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("hello");
    });

    it("getVar returns undefined message for unknown variable", async () => {
      const store = new SessionVariableStore({});

      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [],
        store,
      });

      const result = await getVarTool.execute(
        "tc-1",
        { name: "nonexistent" },
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("undefined");
    });

    it("listVars returns formatted JSON with all variables", async () => {
      const store = new SessionVariableStore({ param: "val" });
      store.set("w", "string", "writable");

      setPartialState({
        isActive: true,

        totalPhases: 1,
        phasesList: [],
        store,
      });

      const result = await listVarsTool.execute(
        "tc-1",
        {},
        undefined,
        undefined,
        { cwd: "/tmp" } as any,
      );

      expect(resultText(result)).toContain("param");
      expect(resultText(result)).toContain("val");
      expect(resultText(result)).toContain("w");
      expect(resultText(result)).toContain("writable");
    });
  });
});
